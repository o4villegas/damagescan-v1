/**
 * DamageScan Main API Worker
 * 
 * Primary Hono application for DamageScan water damage cost calculator.
 * Handles authentication, database operations, file processing, and exports.
 * 
 * @fileoverview Cloudflare Workers API with comprehensive error handling
 * @version 1.0.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Import our custom modules
import { createDatabaseClient, type DatabaseClient } from '../lib/database';
import { createAuthService, type AuthService } from '../lib/auth';

import type {
  CloudflareEnv,
  ApiResponse,
  UserConfiguration,
  ConfigUpdateRequest,
  CSVProcessRequest,
  CSVProcessResponse,
  PDFExportRequest,
  HealthResponse,
  ValidationError,
  CSVRowData,
  ProcessedCSVData,
  CalculationResults,
  DEFAULT_CONFIGURATION
} from '../lib/types';

// ===================================================================
// ENVIRONMENT VALIDATION AND CONFIGURATION
// ===================================================================

/**
 * Required environment variables for application startup.
 */
const REQUIRED_ENV_VARS = [
  'DB',           // D1 Database binding
  'AUTH_DOMAIN',  // Cloudflare Access domain
  'AUTH_AUDIENCE' // Cloudflare Access audience
] as const;

/**
 * Optional environment variables with defaults.
 */
const OPTIONAL_ENV_VARS = {
  APP_VERSION: '1.0.0',
  LOG_LEVEL: 'error',
  MAX_FILE_SIZE: '10485760', // 10MB in bytes
  CORS_ORIGINS: 'http://localhost:5173,https://localhost:5173'
} as const;

/**
 * Application configuration derived from environment.
 */
interface AppConfig {
  version: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxFileSize: number;
  corsOrigins: string[];
  isDevelopment: boolean;
}

/**
 * Validate environment variables and extract configuration.
 * 
 * @param env - Cloudflare Workers environment
 * @returns Application configuration or throws error
 */
function validateEnvironment(env: CloudflareEnv): AppConfig {
  const errors: string[] = [];

  // Check required environment variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.join(', ')}`);
  }

  // Extract configuration with defaults
  const config: AppConfig = {
    version: env.APP_VERSION || OPTIONAL_ENV_VARS.APP_VERSION,
    logLevel: (env.LOG_LEVEL as AppConfig['logLevel']) || OPTIONAL_ENV_VARS.LOG_LEVEL as AppConfig['logLevel'],
    maxFileSize: parseInt(env.MAX_FILE_SIZE || OPTIONAL_ENV_VARS.MAX_FILE_SIZE, 10),
    corsOrigins: (env.CORS_ORIGINS || OPTIONAL_ENV_VARS.CORS_ORIGINS).split(',').map(origin => origin.trim()),
    isDevelopment: env.AUTH_DOMAIN?.includes('localhost') || env.AUTH_DOMAIN?.includes('dev') || false
  };

  // Validate parsed configuration
  if (isNaN(config.maxFileSize) || config.maxFileSize <= 0) {
    throw new Error('MAX_FILE_SIZE must be a positive number');
  }

  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    throw new Error('LOG_LEVEL must be one of: debug, info, warn, error');
  }

  return config;
}

// ===================================================================
// GLOBAL ERROR HANDLING
// ===================================================================

/**
 * Global error handler middleware.
 * Catches all unhandled errors and formats them consistently.
 */
function createErrorHandler(config: AppConfig) {
  return async (err: Error, c: any) => {
    console.error('Unhandled error:', {
      message: err.message,
      stack: config.isDevelopment ? err.stack : undefined,
      path: c.req.path,
      method: c.req.method,
      timestamp: new Date().toISOString()
    });

    // Create consistent error response
    const response: ApiResponse = {
      success: false,
      error: config.isDevelopment 
        ? `Internal server error: ${err.message}`
        : 'Internal server error',
      timestamp: new Date().toISOString(),
      data: config.isDevelopment ? {
        stack: err.stack,
        path: c.req.path,
        method: c.req.method
      } : undefined
    };

    return c.json(response, 500);
  };
}

/**
 * Create consistent API response.
 * 
 * @param success - Operation success status
 * @param data - Response data (if success)
 * @param error - Error message (if failure)
 * @param statusCode - HTTP status code
 * @returns Formatted API response
 */
function createApiResponse<T = any>(
  success: boolean,
  data?: T,
  error?: string,
  statusCode: number = 200
): { response: ApiResponse<T>; status: number } {
  return {
    response: {
      success,
      data,
      error,
      timestamp: new Date().toISOString()
    },
    status: statusCode
  };
}

// ===================================================================
// SECURITY MIDDLEWARE
// ===================================================================

/**
 * Security headers middleware.
 * Adds essential security headers for API responses.
 */
function createSecurityMiddleware() {
  return async (c: any, next: any) => {
    // Add security headers
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    await next();
  };
}

/**
 * Request logging middleware with configurable levels.
 */
function createLoggingMiddleware(config: AppConfig) {
  if (config.logLevel === 'error') {
    // Only log errors in production
    return async (c: any, next: any) => {
      await next();
    };
  }

  return logger((message, ...rest) => {
    if (config.isDevelopment) {
      console.log(message, ...rest);
    }
  });
}

// ===================================================================
// FILE VALIDATION UTILITIES
// ===================================================================

/**
 * Validate uploaded CSV file.
 * 
 * @param file - Uploaded file
 * @param maxSize - Maximum file size in bytes
 * @returns Validation result
 */
function validateCSVFile(file: File, maxSize: number): { valid: boolean; error?: string } {
  // Check file presence
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file size
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(2)}MB` 
    };
  }

  // Check file type
  const allowedTypes = ['.csv', '.txt'];
  const fileName = file.name?.toLowerCase() || '';
  const hasValidExtension = allowedTypes.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
    };
  }

  return { valid: true };
}

/**
 * Parse and validate CSV content.
 * 
 * @param csvContent - Raw CSV file content
 * @returns Parsed and validated CSV data
 */
function parseCSVContent(csvContent: string): { 
  valid: CSVRowData[]; 
  invalid: any[]; 
  errors: ValidationError[] 
} {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const errors: ValidationError[] = [];
  const valid: CSVRowData[] = [];
  const invalid: any[] = [];

  if (lines.length < 2) {
    errors.push({
      row: 0,
      field: 'file',
      message: 'CSV file must contain at least a header row and one data row'
    });
    return { valid, invalid, errors };
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Required CSV columns (from types.ts CSVRowData interface)
  const requiredColumns = [
    'claim_id', 'site_name', 'address', 'city', 'state', 'structure',
    'damage_date', 'assessment_date', 'damage_description', 'generator_needed',
    'outdoor_temp_f', 'outdoor_humidity', 'outdoor_gpp', 'loss_source',
    'water_category', 'water_class', 'room_id', 'room_name',
    'room_temp_f', 'room_humidity', 'room_gpp', 'dew_point_f', 'wet_bulb_f',
    'ceiling_damage', 'ceiling_materials', 'ceiling_damage_moisture',
    'wall_damage', 'wall_materials', 'wall_damage_moisture_bottom',
    'wall_damage_moisture_middle', 'wall_damage_moisture_top', 'wall_damage_sf',
    'floor_materials', 'floor_materials_moisture', 'floor_damage_sf',
    'room_sf', 'length_ft', 'width_ft', 'height_ft', 'volume_ft', 'room_damage'
  ];

  // Validate headers
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    errors.push({
      row: 0,
      field: 'headers',
      message: `Missing required columns: ${missingColumns.join(', ')}`
    });
    return { valid, invalid, errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};

      // Map values to headers
      headers.forEach((header, index) => {
        const value = values[index] || '';
        
        // Type conversion based on field type
        if (header.includes('_sf') || header.includes('_ft') || 
            header.includes('temp') || header.includes('humidity') || 
            header.includes('gpp') || header.includes('volume') ||
            header.includes('moisture')) {
          row[header] = parseFloat(value) || 0;
        } else if (header.includes('category') || header.includes('class')) {
          row[header] = parseInt(value) || 2;
        } else {
          row[header] = value;
        }
      });

      // Basic validation
      const rowErrors = validateCSVRow(row, i + 1);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        invalid.push(row);
      } else {
        valid.push(row as CSVRowData);
      }
    } catch (error) {
      errors.push({
        row: i + 1,
        field: 'parsing',
        message: `Failed to parse row: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      invalid.push({ row: i + 1, data: lines[i] });
    }
  }

  return { valid, invalid, errors };
}

/**
 * Validate individual CSV row data.
 * 
 * @param row - CSV row data
 * @param rowNumber - Row number for error reporting
 * @returns Array of validation errors
 */
function validateCSVRow(row: any, rowNumber: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required string fields
  const requiredFields = ['claim_id', 'room_id', 'room_name'];
  for (const field of requiredFields) {
    if (!row[field]?.trim()) {
      errors.push({
        row: rowNumber,
        field,
        message: `${field} is required and cannot be empty`
      });
    }
  }

  // Validate water category (1-3)
  if (row.water_category < 1 || row.water_category > 3) {
    errors.push({
      row: rowNumber,
      field: 'water_category',
      message: 'water_category must be between 1-3 (Clean, Grey, Black)',
      value: row.water_category
    });
  }

  // Validate water class (1-4)
  if (row.water_class < 1 || row.water_class > 4) {
    errors.push({
      row: rowNumber,
      field: 'water_class',
      message: 'water_class must be between 1-4 (Minimal, Significant, Major, Specialty)',
      value: row.water_class
    });
  }

  // Validate room size
  if (row.room_sf < 50 || row.room_sf > 5000) {
    errors.push({
      row: rowNumber,
      field: 'room_sf',
      message: 'room_sf must be between 50-5000 square feet',
      value: row.room_sf
    });
  }

  // Validate temperature range
  if (row.room_temp_f < 60 || row.room_temp_f > 100) {
    errors.push({
      row: rowNumber,
      field: 'room_temp_f',
      message: 'room_temp_f must be between 60-100°F',
      value: row.room_temp_f
    });
  }

  // Validate humidity range
  if (row.room_humidity < 20 || row.room_humidity > 90) {
    errors.push({
      row: rowNumber,
      field: 'room_humidity',
      message: 'room_humidity must be between 20-90%',
      value: row.room_humidity
    });
  }

  // Validate moisture content ranges (0.05-0.95 for 5%-95%)
  const moistureFields = ['ceiling_damage_moisture', 'wall_damage_moisture_bottom', 
                         'wall_damage_moisture_middle', 'wall_damage_moisture_top', 
                         'floor_materials_moisture'];
  
  for (const field of moistureFields) {
    if (row[field] && (row[field] < 0.05 || row[field] > 0.95)) {
      errors.push({
        row: rowNumber,
        field,
        message: `${field} must be between 0.05-0.95 (5%-95%)`,
        value: row[field]
      });
    }
  }

  return errors;
}

// ===================================================================
// MAIN APPLICATION SETUP
// ===================================================================

/**
 * Create and configure the main Hono application.
 * 
 * @param env - Cloudflare Workers environment
 * @returns Configured Hono application
 */
function createApp(env: CloudflareEnv) {
  // Validate environment and get configuration
  const config = validateEnvironment(env);
  
  // Initialize services
  const dbClient = createDatabaseClient(env);
  const authService = createAuthService(env);
  
  console.log(`Starting DamageScan API v${config.version} (${config.isDevelopment ? 'development' : 'production'})`);

  // Create Hono app
  const app = new Hono();

  // Global error handling
  app.onError(createErrorHandler(config));

  // Security middleware
  app.use('*', createSecurityMiddleware());

  // CORS configuration
  app.use('*', cors({
    origin: config.corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));

  // Logging middleware
  app.use('*', createLoggingMiddleware(config));

  // ===================================================================
  // PUBLIC ENDPOINTS (No Authentication Required)
  // ===================================================================

  /**
   * Health check endpoint.
   * Provides system status and database connectivity.
   */
  app.get('/api/health', async (c) => {
    try {
      // Check database connectivity
      const dbHealth = await dbClient.healthCheck();
      
      const healthData: HealthResponse = {
        status: dbHealth.success ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: config.version,
        database: dbHealth.success ? 'connected' : 'disconnected'
      };

      const { response, status } = createApiResponse(
        true,
        healthData,
        undefined,
        dbHealth.success ? 200 : 503
      );

      return c.json(response, status);
    } catch (error) {
      console.error('Health check failed:', error);
      
      const { response, status } = createApiResponse(
        false,
        undefined,
        'Health check failed',
        503
      );

      return c.json(response, status);
    }
  });

  // Development-only debug endpoint
  if (config.isDevelopment) {
    /**
     * Debug authentication endpoint (development only).
     * Tests authentication without requiring database operations.
     */
    app.get('/api/debug/auth', authService.createMiddleware(), async (c) => {
      const user = authService.getUserContext(c);
      const userId = authService.getUserId(c);

      const { response, status } = createApiResponse(true, {
        message: 'Authentication successful',
        user_context: user,
        user_id: userId,
        environment: 'development'
      });

      return c.json(response, status);
    });
  }

  // ===================================================================
  // PROTECTED ENDPOINTS (Authentication Required)
  // ===================================================================

  // Apply authentication middleware to all /api routes except health and debug
  app.use('/api/*', async (c, next) => {
    // Skip auth for health check and development debug routes
    if (c.req.path === '/api/health' || 
        (config.isDevelopment && c.req.path.startsWith('/api/debug'))) {
      await next();
      return;
    }

    // Apply authentication
    const authMiddleware = authService.createMiddleware();
    await authMiddleware(c, next);
  });

  /**
   * Get user configuration.
   * Returns current configuration or creates default if none exists.
   */
  app.get('/api/config', async (c) => {
    try {
      const userId = authService.getUserId(c);
      if (!userId) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'User ID not found in request context',
          401
        );
        return c.json(response, status);
      }

      // Get configuration from database
      const result = await dbClient.getConfiguration(userId);
      
      if (!result.success) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          result.error?.message || 'Failed to retrieve configuration',
          500
        );
        return c.json(response, status);
      }

      const { response, status } = createApiResponse(true, result.data);
      return c.json(response, status);
    } catch (error) {
      console.error('Get configuration failed:', error);
      
      const { response, status } = createApiResponse(
        false,
        undefined,
        'Internal server error',
        500
      );
      return c.json(response, status);
    }
  });

  /**
   * Save user configuration.
   * Updates existing configuration or creates new one.
   */
  app.put('/api/config', async (c) => {
    try {
      const userId = authService.getUserId(c);
      if (!userId) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'User ID not found in request context',
          401
        );
        return c.json(response, status);
      }

      // Parse request body
      let configData: ConfigUpdateRequest;
      try {
        configData = await c.req.json();
      } catch (error) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'Invalid JSON in request body',
          400
        );
        return c.json(response, status);
      }

      // Save configuration to database
      const result = await dbClient.saveConfiguration(userId, configData);
      
      if (!result.success) {
        const statusCode = result.error?.code === 'VALIDATION_FAILED' ? 400 : 500;
        const { response, status } = createApiResponse(
          false,
          undefined,
          result.error?.message || 'Failed to save configuration',
          statusCode
        );
        return c.json(response, status);
      }

      const { response, status } = createApiResponse(true, result.data);
      return c.json(response, status);
    } catch (error) {
      console.error('Save configuration failed:', error);
      
      const { response, status } = createApiResponse(
        false,
        undefined,
        'Internal server error',
        500
      );
      return c.json(response, status);
    }
  });

  /**
   * Process uploaded CSV file.
   * Parses, validates, and performs basic calculation structure.
   */
  app.post('/api/csv/process', async (c) => {
    try {
      const userId = authService.getUserId(c);
      if (!userId) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'User ID not found in request context',
          401
        );
        return c.json(response, status);
      }

      // Parse form data
      const formData = await c.req.formData();
      const csvFile = formData.get('csv') as File;

      // Validate file
      const fileValidation = validateCSVFile(csvFile, config.maxFileSize);
      if (!fileValidation.valid) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          fileValidation.error,
          400
        );
        return c.json(response, status);
      }

      // Read file content
      const csvContent = await csvFile.text();
      
      // Parse and validate CSV
      const { valid, invalid, errors } = parseCSVContent(csvContent);

      if (valid.length === 0) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          `No valid rows found. Errors: ${errors.map(e => e.message).join('; ')}`,
          400
        );
        return c.json(response, status);
      }

      // Get user configuration for calculations
      const configResult = await dbClient.getConfiguration(userId);
      if (!configResult.success) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'Failed to retrieve user configuration',
          500
        );
        return c.json(response, status);
      }

      // TODO: Implement full CDMv23 calculation engine
      // For now, return structured placeholder response with calculated totals
      const mockResults: CalculationResults = {
        rooms: valid.map((row, index) => {
          // Calculate equipment totals
          const largeUnits = row.room_sf > 1500 ? Math.ceil(row.room_sf / 2500) : 0;
          const standardUnits = row.room_sf <= 1500 ? Math.ceil(row.room_sf / 1200) : 0;
          const airMovers = Math.ceil(row.room_sf / 400);
          const heaters = row.water_category >= 3 ? 1 : 0;
          const airScrubbers = row.water_category >= 3 ? 1 : 0;
          const injectionSystems = row.floor_materials?.toLowerCase().includes('hardwood') ? 1 : 0;
          const generatorRequired = row.generator_needed.toLowerCase() === 'yes' ? 1 : 0;
          const totalUnits = largeUnits + standardUnits + airMovers + heaters + airScrubbers + injectionSystems;

          // Calculate labor costs
          const techHours = totalUnits * 1.25; // Setup, breakdown, monitoring
          const techCost = techHours * configResult.data!.tech_base;
          const supervisorHours = 2 * (3 + (row.water_class - 1)); // Daily supervision * days
          const supervisorCost = supervisorHours * configResult.data!.supervisor_base;
          const specialistHours = row.water_category >= 3 ? 4 : 0;
          const specialistCost = specialistHours * configResult.data!.specialist_base;
          const projectManagement = configResult.data!.project_management_base;
          const totalLabor = techCost + supervisorCost + specialistCost + projectManagement;

          // Calculate equipment costs
          const dailyEquipmentCost = 
            (largeUnits * configResult.data!.large_dehumidifier_daily) +
            (standardUnits * configResult.data!.standard_dehumidifier_daily) +
            (airMovers * configResult.data!.air_mover_daily) +
            (heaters * configResult.data!.heater_daily) +
            (airScrubbers * configResult.data!.air_scrubber_daily) +
            (injectionSystems * configResult.data!.injection_system_daily) +
            (generatorRequired * configResult.data!.generator_daily);
          const totalDays = 3 + (row.water_class - 1);
          const totalEquipment = dailyEquipmentCost * totalDays;

          // Calculate material costs
          const floorTreatment = row.floor_damage_sf * 2.5;
          const wallTreatment = row.wall_damage_sf * 2.0;
          const ceilingTreatment = 0; // No ceiling damage in placeholder
          const disposal = 100;
          const antimicrobial = row.water_category >= 3 ? 200 : 0;
          const totalMaterials = floorTreatment + wallTreatment + ceilingTreatment + disposal + antimicrobial;

          // Calculate final costs
          const subtotal = totalLabor + totalEquipment + totalMaterials;
          const commercialMarkup = subtotal * 0.15;
          const totalRoomCost = subtotal + commercialMarkup;
          const costPerSqft = totalRoomCost / row.room_sf;

          return {
            room_id: row.room_id,
            room_name: row.room_name,
            room_sf: row.room_sf,
            equipment: {
              large_units: largeUnits,
              standard_units: standardUnits,
              air_movers: airMovers,
              heaters: heaters,
              air_scrubbers: airScrubbers,
              injection_systems: injectionSystems,
              generator_required: generatorRequired,
              total_units: totalUnits,
              recommended_dehumidifier_type: 'Standard' as const
            },
            costs: {
              labor: {
                tech_hours: techHours,
                tech_cost: techCost,
                supervisor_hours: supervisorHours,
                supervisor_cost: supervisorCost,
                specialist_hours: specialistHours,
                specialist_cost: specialistCost,
                project_management: projectManagement,
                total_labor: totalLabor
              },
              equipment: {
                daily_cost: dailyEquipmentCost,
                total_days: totalDays,
                total_equipment: totalEquipment
              },
              materials: {
                floor_treatment: floorTreatment,
                wall_treatment: wallTreatment,
                ceiling_treatment: ceilingTreatment,
                disposal: disposal,
                antimicrobial: antimicrobial,
                total_materials: totalMaterials
              },
              subtotal: subtotal,
              commercial_markup: commercialMarkup,
              total_room_cost: totalRoomCost,
              cost_per_sqft: costPerSqft
            },
          timeline: {
            estimated_days: 3 + (row.water_class - 1),
            daily_monitoring_hours: 2,
            base_days: 3,
            class_multiplier: 1.0 + (row.water_class - 1) * 0.3,
            complexity_factors: {
              category: row.water_category,
              class: row.water_class
            }
          },
          electrical: {
            total_amperage: 45,
            circuits_20a_required: 1,
            circuits_15a_required: 2,
            daily_kwh: 24,
            voltage: '120V' as const,
            generator_needed: row.generator_needed.toLowerCase() === 'yes' ? 1 : 0
          },
          materials: {
            floor: {
              material_type: row.floor_materials,
              material_specs: { thickness: 0.75, cost: 2.5, target_mc: 8 },
              affected_sqft: row.floor_damage_sf,
              moisture_content: row.floor_materials_moisture,
              volume_cuft: row.floor_damage_sf * 0.75 / 12,
              length_ft: row.length_ft,
              width_ft: row.width_ft
            },
            wall: {
              material_type: row.wall_materials,
              material_specs: { thickness: 0.5, cost: 2.25, target_mc: 12 },
              affected_sqft: row.wall_damage_sf,
              moisture_weighted: (row.wall_damage_moisture_bottom * 0.5 + 
                                row.wall_damage_moisture_middle * 0.3 + 
                                row.wall_damage_moisture_top * 0.2),
              removal_factor: 1.0,
              volume_cuft: row.wall_damage_sf * 0.5 / 12
            },
            ceiling: {
              material_type: row.ceiling_materials || '',
              material_specs: { thickness: 0.5, cost: 2.25, target_mc: 12 },
              affected_sqft: 0,
              moisture_content: row.ceiling_damage_moisture || 0,
              volume_cuft: 0
            },
            total_volume: 0,
            disposal_volume: 0
          }
        });
      }));

      // Calculate project-level aggregations
      const projectTotalCost = mockResults.rooms.reduce((sum, room) => sum + room.costs.total_room_cost, 0);
      const projectTotalUnits = mockResults.rooms.reduce((sum, room) => sum + room.equipment.total_units, 0);
      const projectTotalAmperage = mockResults.rooms.reduce((sum, room) => sum + 45, 0); // Placeholder amperage
      const longestTimeline = Math.max(...mockResults.rooms.map(room => room.timeline.estimated_days));
      const averageCostPerSf = projectTotalCost / mockResults.rooms.reduce((sum, room) => sum + room.room_sf, 0);

      mockResults.project = {
        room_count: valid.length,
        total_cost: projectTotalCost,
        optimized_total_cost: projectTotalCost * 0.95, // 5% optimization savings
        total_affected_sf: valid.reduce((sum, row) => sum + row.room_sf, 0),
        total_equipment_units: projectTotalUnits,
        total_amperage: projectTotalAmperage,
        longest_timeline: longestTimeline,
        average_cost_per_sf: averageCostPerSf,
        fleet_requirements: {
          large_dehumidifiers: mockResults.rooms.reduce((sum, room) => sum + room.equipment.large_units, 0),
          standard_dehumidifiers: mockResults.rooms.reduce((sum, room) => sum + room.equipment.standard_units, 0),
          air_movers: mockResults.rooms.reduce((sum, room) => sum + room.equipment.air_movers, 0),
          heaters: mockResults.rooms.reduce((sum, room) => sum + room.equipment.heaters, 0),
          air_scrubbers: mockResults.rooms.reduce((sum, room) => sum + room.equipment.air_scrubbers, 0),
          injection_systems: mockResults.rooms.reduce((sum, room) => sum + room.equipment.injection_systems, 0),
          generators: mockResults.rooms.reduce((sum, room) => sum + room.equipment.generator_required, 0),
          total_equipment_units: projectTotalUnits
        },
        electrical_summary: {
          total_circuits_20a: mockResults.rooms.reduce((sum, room) => sum + room.electrical.circuits_20a_required, 0),
          total_circuits_15a: mockResults.rooms.reduce((sum, room) => sum + room.electrical.circuits_15a_required, 0),
          daily_kwh: mockResults.rooms.reduce((sum, room) => sum + room.electrical.daily_kwh, 0),
          total_kwh_project: mockResults.rooms.reduce((sum, room) => sum + (room.electrical.daily_kwh * room.timeline.estimated_days), 0),
          peak_amperage: projectTotalAmperage,
          voltage_standard: '120V' as const
        },
        labor_optimization: {
          savings: projectTotalCost * 0.05, // 5% savings
          supervision_savings: projectTotalCost * 0.03,
          setup_breakdown_savings: projectTotalCost * 0.02,
          details: []
        }
      };

      const processResponse: CSVProcessResponse = {
        success: true,
        results: mockResults,
        errors: errors,
        skipped: invalid.length
      };

      const { response, status } = createApiResponse(true, processResponse);
      return c.json(response, status);
    } catch (error) {
      console.error('CSV processing failed:', error);
      
      const { response, status } = createApiResponse(
        false,
        undefined,
        'CSV processing failed',
        500
      );
      return c.json(response, status);
    }
  });

  /**
   * Export PDF report.
   * Placeholder implementation for PDF generation.
   */
  app.post('/api/export/pdf', async (c) => {
    try {
      const userId = authService.getUserId(c);
      if (!userId) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'User ID not found in request context',
          401
        );
        return c.json(response, status);
      }

      // Parse request body
      let pdfRequest: PDFExportRequest;
      try {
        pdfRequest = await c.req.json();
      } catch (error) {
        const { response, status } = createApiResponse(
          false,
          undefined,
          'Invalid JSON in request body',
          400
        );
        return c.json(response, status);
      }

      // TODO: Implement actual PDF generation
      // For now, return placeholder response
      const pdfMetadata = {
        message: 'PDF generation placeholder',
        project_summary: {
          room_count: pdfRequest.project_data.rooms.length,
          total_cost: pdfRequest.project_data.project.total_cost,
          generated_at: new Date().toISOString()
        },
        options: pdfRequest.options,
        note: 'This is a placeholder response. PDF generation will be implemented in future version.'
      };

      const { response, status } = createApiResponse(true, pdfMetadata);
      return c.json(response, status);
    } catch (error) {
      console.error('PDF export failed:', error);
      
      const { response, status } = createApiResponse(
        false,
        undefined,
        'PDF export failed',
        500
      );
      return c.json(response, status);
    }
  });

  // ===================================================================
  // CATCH-ALL ROUTE
  // ===================================================================

  /**
   * Catch-all route for undefined endpoints.
   */
  app.all('*', (c) => {
    const { response, status } = createApiResponse(
      false,
      undefined,
      `Endpoint not found: ${c.req.method} ${c.req.path}`,
      404
    );
    return c.json(response, status);
  });

  return app;
}

// ===================================================================
// WORKER EXPORT
// ===================================================================

/**
 * Main worker export for Cloudflare Workers.
 * Creates and configures the application with environment validation.
 */
export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      // Create application with environment validation
      const app = createApp(env);
      
      // Handle request
      return await app.fetch(request, env, ctx);
    } catch (error) {
      console.error('Worker initialization failed:', error);
      
      // Return error response if app creation fails
      const errorResponse: ApiResponse = {
        success: false,
        error: error instanceof Error ? 
          `Worker initialization failed: ${error.message}` : 
          'Worker initialization failed',
        timestamp: new Date().toISOString()
      };

      return Response.json(errorResponse, { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
  }
};
