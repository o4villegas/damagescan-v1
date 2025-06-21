/**
 * DamageScan Database Client
 * 
 * Cloudflare D1 database client for user configuration management.
 * Provides type-safe CRUD operations for the user_configurations table.
 * 
 * @fileoverview D1 database client with comprehensive error handling
 * @version 1.0.0
 */

import {
  type UserConfiguration,
  type ConfigUpdateRequest,
  type CloudflareEnv,
  DEFAULT_CONFIGURATION
} from './types';

// ===================================================================
// DATABASE ERROR HANDLING
// ===================================================================

/**
 * Custom database error class for better error handling.
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Database operation result wrapper for consistent error handling.
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    operation: string;
  };
}

// ===================================================================
// SQL QUERIES - PREPARED STATEMENTS FOR SECURITY
// ===================================================================

/**
 * Pre-defined SQL queries for all database operations.
 * Using prepared statements to prevent SQL injection.
 */
const SQL_QUERIES = {
  // Table creation and migration
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS user_configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      config_name TEXT NOT NULL DEFAULT 'default',
      
      -- Labor Rates (4 parameters - Hourly USD)
      tech_base REAL DEFAULT 55,
      supervisor_base REAL DEFAULT 75,
      specialist_base REAL DEFAULT 120,
      project_management_base REAL DEFAULT 200,
      
      -- Equipment Daily Rates (7 parameters - Daily USD)
      large_dehumidifier_daily REAL DEFAULT 25,
      standard_dehumidifier_daily REAL DEFAULT 15,
      air_mover_daily REAL DEFAULT 8,
      heater_daily REAL DEFAULT 12,
      air_scrubber_daily REAL DEFAULT 35,
      injection_system_daily REAL DEFAULT 25,
      generator_daily REAL DEFAULT 45,
      
      -- Target Moisture Content (5 parameters - Percentage)
      hardwood_target_mc REAL DEFAULT 8,
      paneling_target_mc REAL DEFAULT 10,
      vinyl_target_mc REAL DEFAULT 2,
      drywall_target_mc REAL DEFAULT 12,
      carpet_target_mc REAL DEFAULT 5,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Ensure unique configuration per user
      UNIQUE(user_id, config_name)
    )
  `,

  // Index creation for performance
  CREATE_INDEXES: [
    'CREATE INDEX IF NOT EXISTS idx_user_configurations_user_id ON user_configurations(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_configurations_config_name ON user_configurations(user_id, config_name)',
    'CREATE INDEX IF NOT EXISTS idx_user_configurations_updated_at ON user_configurations(updated_at)'
  ],

  // Configuration CRUD operations
  SELECT_CONFIG: `
    SELECT * FROM user_configurations 
    WHERE user_id = ? AND config_name = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `,

  SELECT_CONFIG_BY_ID: `
    SELECT * FROM user_configurations 
    WHERE id = ? AND user_id = ?
  `,

  SELECT_ALL_CONFIGS: `
    SELECT * FROM user_configurations 
    WHERE user_id = ?
    ORDER BY config_name ASC, updated_at DESC
  `,

  INSERT_CONFIG: `
    INSERT INTO user_configurations (
      user_id, config_name,
      tech_base, supervisor_base, specialist_base, project_management_base,
      large_dehumidifier_daily, standard_dehumidifier_daily, air_mover_daily,
      heater_daily, air_scrubber_daily, injection_system_daily, generator_daily,
      hardwood_target_mc, paneling_target_mc, vinyl_target_mc, drywall_target_mc, carpet_target_mc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,

  UPDATE_CONFIG: `
    UPDATE user_configurations 
    SET 
      config_name = ?,
      tech_base = ?, supervisor_base = ?, specialist_base = ?, project_management_base = ?,
      large_dehumidifier_daily = ?, standard_dehumidifier_daily = ?, air_mover_daily = ?,
      heater_daily = ?, air_scrubber_daily = ?, injection_system_daily = ?, generator_daily = ?,
      hardwood_target_mc = ?, paneling_target_mc = ?, vinyl_target_mc = ?, drywall_target_mc = ?, carpet_target_mc = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `,

  DELETE_CONFIG: `
    DELETE FROM user_configurations 
    WHERE id = ? AND user_id = ?
  `,

  // Utility queries
  COUNT_CONFIGS: `
    SELECT COUNT(*) as count FROM user_configurations 
    WHERE user_id = ?
  `,

  HEALTH_CHECK: `
    SELECT 1 as status, datetime('now') as timestamp
  `
} as const;

// ===================================================================
// DATABASE CLIENT CLASS
// ===================================================================

/**
 * D1 Database client for DamageScan user configurations.
 * Provides type-safe operations with comprehensive error handling.
 */
export class DatabaseClient {
  private db: D1Database;

  /**
   * Initialize database client with D1 binding.
   * @param database - D1 database binding from Cloudflare Workers environment
   */
  constructor(database: D1Database) {
    this.db = database;
  }

  /**
   * Initialize database schema and indexes.
   * Should be called during application startup or deployment.
   * 
   * @returns Promise resolving to operation result
   */
  async initialize(): Promise<DatabaseResult<boolean>> {
    try {
      // Create main table
      await this.db.prepare(SQL_QUERIES.CREATE_TABLE).run();

      // Create performance indexes
      for (const indexQuery of SQL_QUERIES.CREATE_INDEXES) {
        await this.db.prepare(indexQuery).run();
      }

      return {
        success: true,
        data: true
      };
    } catch (error) {
      console.error('Database initialization failed:', error);
      return {
        success: false,
        error: {
          code: 'INIT_FAILED',
          message: 'Failed to initialize database schema',
          operation: 'initialize'
        }
      };
    }
  }

  /**
   * Health check for database connectivity.
   * 
   * @returns Promise resolving to health status
   */
  async healthCheck(): Promise<DatabaseResult<{ status: string; timestamp: string }>> {
    try {
      const result = await this.db.prepare(SQL_QUERIES.HEALTH_CHECK).first() as { status: number; timestamp: string };
      
      return {
        success: true,
        data: {
          status: result.status === 1 ? 'healthy' : 'unhealthy',
          timestamp: result.timestamp
        }
      };
    } catch (error) {
      console.error('Database health check failed:', error);
      return {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Database health check failed',
          operation: 'healthCheck'
        }
      };
    }
  }

  /**
   * Get user configuration by name, with fallback to default.
   * Creates default configuration if none exists.
   * 
   * @param userId - User identifier from authentication
   * @param configName - Configuration name (defaults to 'default')
   * @returns Promise resolving to user configuration
   */
  async getConfiguration(
    userId: string, 
    configName: string = 'default'
  ): Promise<DatabaseResult<UserConfiguration>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'getConfiguration'
        }
      };
    }

    try {
      // Try to fetch existing configuration
      const result = await this.db.prepare(SQL_QUERIES.SELECT_CONFIG)
        .bind(userId, configName)
        .first() as UserConfiguration | null;

      if (result) {
        return {
          success: true,
          data: result
        };
      }

      // Configuration doesn't exist, create default
      console.log(`Creating default configuration for user: ${userId}`);
      const defaultConfig = await this.createDefaultConfiguration(userId, configName);
      
      return defaultConfig;
    } catch (error) {
      console.error('Failed to get configuration:', error);
      return {
        success: false,
        error: {
          code: 'GET_CONFIG_FAILED',
          message: `Failed to retrieve configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'getConfiguration'
        }
      };
    }
  }

  /**
   * Get configuration by ID with user validation.
   * 
   * @param configId - Configuration ID
   * @param userId - User identifier for security validation
   * @returns Promise resolving to user configuration
   */
  async getConfigurationById(
    configId: number, 
    userId: string
  ): Promise<DatabaseResult<UserConfiguration>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'getConfigurationById'
        }
      };
    }

    if (!configId || configId <= 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONFIG_ID',
          message: 'Valid configuration ID is required',
          operation: 'getConfigurationById'
        }
      };
    }

    try {
      const result = await this.db.prepare(SQL_QUERIES.SELECT_CONFIG_BY_ID)
        .bind(configId, userId)
        .first() as UserConfiguration | null;

      if (!result) {
        return {
          success: false,
          error: {
            code: 'CONFIG_NOT_FOUND',
            message: `Configuration with ID ${configId} not found for user`,
            operation: 'getConfigurationById'
          }
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Failed to get configuration by ID:', error);
      return {
        success: false,
        error: {
          code: 'GET_CONFIG_BY_ID_FAILED',
          message: `Failed to retrieve configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'getConfigurationById'
        }
      };
    }
  }

  /**
   * Get all configurations for a user.
   * 
   * @param userId - User identifier
   * @returns Promise resolving to array of user configurations
   */
  async getAllConfigurations(userId: string): Promise<DatabaseResult<UserConfiguration[]>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'getAllConfigurations'
        }
      };
    }

    try {
      const results = await this.db.prepare(SQL_QUERIES.SELECT_ALL_CONFIGS)
        .bind(userId)
        .all();

      return {
        success: true,
        data: results.results as UserConfiguration[]
      };
    } catch (error) {
      console.error('Failed to get all configurations:', error);
      return {
        success: false,
        error: {
          code: 'GET_ALL_CONFIGS_FAILED',
          message: `Failed to retrieve configurations: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'getAllConfigurations'
        }
      };
    }
  }

  /**
   * Save or update user configuration.
   * Updates existing configuration if ID provided, creates new one otherwise.
   * 
   * @param userId - User identifier
   * @param configData - Configuration data to save
   * @returns Promise resolving to saved configuration
   */
  async saveConfiguration(
    userId: string, 
    configData: ConfigUpdateRequest & { id?: number }
  ): Promise<DatabaseResult<UserConfiguration>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'saveConfiguration'
        }
      };
    }

    // Validate configuration data
    const validationResult = this.validateConfigurationData(configData);
    if (!validationResult.success) {
      return validationResult as DatabaseResult<UserConfiguration>;
    }

    try {
      if (configData.id) {
        // Update existing configuration
        return await this.updateConfiguration(userId, configData.id, configData);
      } else {
        // Create new configuration
        return await this.createConfiguration(userId, configData);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      return {
        success: false,
        error: {
          code: 'SAVE_CONFIG_FAILED',
          message: `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'saveConfiguration'
        }
      };
    }
  }

  /**
   * Delete user configuration by ID.
   * 
   * @param configId - Configuration ID to delete
   * @param userId - User identifier for security validation
   * @returns Promise resolving to deletion result
   */
  async deleteConfiguration(
    configId: number, 
    userId: string
  ): Promise<DatabaseResult<boolean>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'deleteConfiguration'
        }
      };
    }

    if (!configId || configId <= 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONFIG_ID',
          message: 'Valid configuration ID is required',
          operation: 'deleteConfiguration'
        }
      };
    }

    try {
      const result = await this.db.prepare(SQL_QUERIES.DELETE_CONFIG)
        .bind(configId, userId)
        .run();

      if (result.changes === 0) {
        return {
          success: false,
          error: {
            code: 'CONFIG_NOT_FOUND',
            message: `Configuration with ID ${configId} not found for user`,
            operation: 'deleteConfiguration'
          }
        };
      }

      return {
        success: true,
        data: true
      };
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      return {
        success: false,
        error: {
          code: 'DELETE_CONFIG_FAILED',
          message: `Failed to delete configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'deleteConfiguration'
        }
      };
    }
  }

  /**
   * Get count of configurations for a user.
   * Useful for quota enforcement or analytics.
   * 
   * @param userId - User identifier
   * @returns Promise resolving to configuration count
   */
  async getConfigurationCount(userId: string): Promise<DatabaseResult<number>> {
    if (!userId?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and cannot be empty',
          operation: 'getConfigurationCount'
        }
      };
    }

    try {
      const result = await this.db.prepare(SQL_QUERIES.COUNT_CONFIGS)
        .bind(userId)
        .first() as { count: number } | null;

      return {
        success: true,
        data: result?.count || 0
      };
    } catch (error) {
      console.error('Failed to get configuration count:', error);
      return {
        success: false,
        error: {
          code: 'COUNT_CONFIGS_FAILED',
          message: `Failed to count configurations: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'getConfigurationCount'
        }
      };
    }
  }

  // ===================================================================
  // PRIVATE HELPER METHODS
  // ===================================================================

  /**
   * Create default configuration for new user.
   * 
   * @param userId - User identifier
   * @param configName - Configuration name
   * @returns Promise resolving to created configuration
   */
  private async createDefaultConfiguration(
    userId: string, 
    configName: string
  ): Promise<DatabaseResult<UserConfiguration>> {
    const defaultData = {
      config_name: configName,
      ...DEFAULT_CONFIGURATION
    };

    return await this.createConfiguration(userId, defaultData);
  }

  /**
   * Create new configuration record.
   * 
   * @param userId - User identifier
   * @param configData - Configuration data
   * @returns Promise resolving to created configuration
   */
  private async createConfiguration(
    userId: string, 
    configData: ConfigUpdateRequest
  ): Promise<DatabaseResult<UserConfiguration>> {
    // Merge with defaults to ensure all fields are present
    const fullConfig = {
      ...DEFAULT_CONFIGURATION,
      ...configData,
      config_name: configData.config_name || 'default'
    };

    try {
      const result = await this.db.prepare(SQL_QUERIES.INSERT_CONFIG)
        .bind(
          userId,
          fullConfig.config_name,
          fullConfig.tech_base,
          fullConfig.supervisor_base,
          fullConfig.specialist_base,
          fullConfig.project_management_base,
          fullConfig.large_dehumidifier_daily,
          fullConfig.standard_dehumidifier_daily,
          fullConfig.air_mover_daily,
          fullConfig.heater_daily,
          fullConfig.air_scrubber_daily,
          fullConfig.injection_system_daily,
          fullConfig.generator_daily,
          fullConfig.hardwood_target_mc,
          fullConfig.paneling_target_mc,
          fullConfig.vinyl_target_mc,
          fullConfig.drywall_target_mc,
          fullConfig.carpet_target_mc
        )
        .run();

      if (!result.success) {
        throw new Error(`Insert failed: ${result.error}`);
      }

      // Fetch the created configuration
      return await this.getConfigurationById(result.meta.last_row_id as number, userId);
    } catch (error) {
      console.error('Failed to create configuration:', error);
      
      // Handle unique constraint violation
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return {
          success: false,
          error: {
            code: 'CONFIG_EXISTS',
            message: `Configuration '${fullConfig.config_name}' already exists for user`,
            operation: 'createConfiguration'
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'CREATE_CONFIG_FAILED',
          message: `Failed to create configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'createConfiguration'
        }
      };
    }
  }

  /**
   * Update existing configuration record.
   * 
   * @param userId - User identifier
   * @param configId - Configuration ID
   * @param configData - Updated configuration data
   * @returns Promise resolving to updated configuration
   */
  private async updateConfiguration(
    userId: string, 
    configId: number, 
    configData: ConfigUpdateRequest
  ): Promise<DatabaseResult<UserConfiguration>> {
    // First, get existing configuration to merge with updates
    const existingResult = await this.getConfigurationById(configId, userId);
    if (!existingResult.success || !existingResult.data) {
      return existingResult;
    }

    const existing = existingResult.data;
    const updated = {
      ...existing,
      ...configData,
      id: configId, // Ensure ID doesn't change
      user_id: userId, // Ensure user_id doesn't change
    };

    try {
      const result = await this.db.prepare(SQL_QUERIES.UPDATE_CONFIG)
        .bind(
          updated.config_name,
          updated.tech_base,
          updated.supervisor_base,
          updated.specialist_base,
          updated.project_management_base,
          updated.large_dehumidifier_daily,
          updated.standard_dehumidifier_daily,
          updated.air_mover_daily,
          updated.heater_daily,
          updated.air_scrubber_daily,
          updated.injection_system_daily,
          updated.generator_daily,
          updated.hardwood_target_mc,
          updated.paneling_target_mc,
          updated.vinyl_target_mc,
          updated.drywall_target_mc,
          updated.carpet_target_mc,
          configId,
          userId
        )
        .run();

      if (result.changes === 0) {
        return {
          success: false,
          error: {
            code: 'CONFIG_NOT_FOUND',
            message: `Configuration with ID ${configId} not found for user`,
            operation: 'updateConfiguration'
          }
        };
      }

      // Fetch the updated configuration
      return await this.getConfigurationById(configId, userId);
    } catch (error) {
      console.error('Failed to update configuration:', error);
      
      // Handle unique constraint violation
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return {
          success: false,
          error: {
            code: 'CONFIG_NAME_EXISTS',
            message: `Configuration name '${updated.config_name}' already exists for user`,
            operation: 'updateConfiguration'
          }
        };
      }

      return {
        success: false,
        error: {
          code: 'UPDATE_CONFIG_FAILED',
          message: `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
          operation: 'updateConfiguration'
        }
      };
    }
  }

  /**
   * Validate configuration data against business rules.
   * 
   * @param configData - Configuration data to validate
   * @returns Validation result
   */
  private validateConfigurationData(configData: ConfigUpdateRequest): DatabaseResult<boolean> {
    const errors: string[] = [];

    // Validate labor rates (if provided)
    if (configData.tech_base !== undefined) {
      if (configData.tech_base < 25 || configData.tech_base > 150) {
        errors.push('tech_base must be between $25-150');
      }
    }

    if (configData.supervisor_base !== undefined) {
      if (configData.supervisor_base < 35 || configData.supervisor_base > 200) {
        errors.push('supervisor_base must be between $35-200');
      }
    }

    if (configData.specialist_base !== undefined) {
      if (configData.specialist_base < 75 || configData.specialist_base > 300) {
        errors.push('specialist_base must be between $75-300');
      }
    }

    if (configData.project_management_base !== undefined) {
      if (configData.project_management_base < 100 || configData.project_management_base > 500) {
        errors.push('project_management_base must be between $100-500');
      }
    }

    // Validate equipment rates (if provided)
    const equipmentFields = [
      { field: 'large_dehumidifier_daily', min: 15, max: 50 },
      { field: 'standard_dehumidifier_daily', min: 8, max: 30 },
      { field: 'air_mover_daily', min: 4, max: 15 },
      { field: 'heater_daily', min: 6, max: 25 },
      { field: 'air_scrubber_daily', min: 20, max: 75 },
      { field: 'injection_system_daily', min: 15, max: 50 },
      { field: 'generator_daily', min: 25, max: 100 }
    ];

    for (const { field, min, max } of equipmentFields) {
      const value = configData[field as keyof ConfigUpdateRequest] as number | undefined;
      if (value !== undefined && (value < min || value > max)) {
        errors.push(`${field} must be between $${min}-${max}`);
      }
    }

    // Validate moisture content targets (if provided)
    const moistureFields = [
      { field: 'hardwood_target_mc', min: 6, max: 12 },
      { field: 'paneling_target_mc', min: 8, max: 15 },
      { field: 'vinyl_target_mc', min: 1, max: 5 },
      { field: 'drywall_target_mc', min: 10, max: 18 },
      { field: 'carpet_target_mc', min: 3, max: 8 }
    ];

    for (const { field, min, max } of moistureFields) {
      const value = configData[field as keyof ConfigUpdateRequest] as number | undefined;
      if (value !== undefined && (value < min || value > max)) {
        errors.push(`${field} must be between ${min}-${max}%`);
      }
    }

    // Validate config name (if provided)
    if (configData.config_name !== undefined) {
      if (!configData.config_name?.trim()) {
        errors.push('config_name cannot be empty');
      } else if (configData.config_name.length > 50) {
        errors.push('config_name must be 50 characters or less');
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `Configuration validation failed: ${errors.join(', ')}`,
          operation: 'validateConfigurationData'
        }
      };
    }

    return {
      success: true,
      data: true
    };
  }
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Create database client instance from Cloudflare environment.
 * 
 * @param env - Cloudflare Workers environment
 * @returns Configured database client
 */
export function createDatabaseClient(env: CloudflareEnv): DatabaseClient {
  if (!env.DB) {
    throw new DatabaseError(
      'D1 database binding not found in environment',
      'DB_BINDING_MISSING',
      'createDatabaseClient'
    );
  }

  return new DatabaseClient(env.DB);
}

/**
 * Perform database migration and initialization.
 * Should be called during deployment or first run.
 * 
 * @param client - Database client instance
 * @returns Promise resolving to migration result
 */
export async function runMigrations(client: DatabaseClient): Promise<DatabaseResult<boolean>> {
  console.log('Running database migrations...');
  
  const result = await client.initialize();
  
  if (result.success) {
    console.log('Database migrations completed successfully');
  } else {
    console.error('Database migrations failed:', result.error);
  }
  
  return result;
}

/**
 * Export types and client for use in other modules.
 */
export type { DatabaseResult, DatabaseError };
export { DatabaseClient };
