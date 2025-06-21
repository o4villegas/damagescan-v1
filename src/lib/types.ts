/**
 * DamageScan TypeScript Type Definitions
 * 
 * Core type definitions for the CDMv23 Water Damage Calculator.
 * This file establishes type safety across the entire application.
 * 
 * @fileoverview Foundation types for DamageScan application
 * @version 1.0.0
 */

// ===================================================================
// CSV DATA STRUCTURES (41 columns as per README specification)
// ===================================================================

/**
 * Raw CSV row data structure matching the 41-column format.
 * Represents a single row from uploaded CSV assessment data.
 */
export interface CSVRowData {
  // Site Information (7 fields)
  claim_id: string;
  site_name: string;
  address: string;
  city: string;
  state: string;
  structure: string;
  damage_date: string;
  
  // Assessment Details (7 fields)
  assessment_date: string;
  damage_description: string;
  generator_needed: string; // "Yes" | "No"
  outdoor_temp_f: number;
  outdoor_humidity: number;
  outdoor_gpp: number;
  loss_source: string;
  
  // Water Classification (2 fields)
  water_category: number; // 1-3 (Clean, Grey, Black)
  water_class: number;    // 1-4 (Minimal, Significant, Major, Specialty)
  
  // Room Identification (2 fields)
  room_id: string;
  room_name: string;
  
  // Room Environmental (5 fields)
  room_temp_f: number;
  room_humidity: number;
  room_gpp: number;
  dew_point_f: number;
  wet_bulb_f: number;
  
  // Ceiling Damage (3 fields)
  ceiling_damage: string; // "Yes" | "No"
  ceiling_materials: string;
  ceiling_damage_moisture: number; // 0.0-1.0 decimal percentage
  
  // Wall Damage (6 fields)
  wall_damage: string; // "Yes" | "No"
  wall_materials: string;
  wall_damage_moisture_bottom: number; // 0.0-1.0 decimal percentage
  wall_damage_moisture_middle: number; // 0.0-1.0 decimal percentage
  wall_damage_moisture_top: number;    // 0.0-1.0 decimal percentage
  wall_damage_sf: number; // Square footage affected
  
  // Floor Damage (3 fields)
  floor_materials: string;
  floor_materials_moisture: number; // 0.0-1.0 decimal percentage
  floor_damage_sf: number; // Square footage affected
  
  // Room Dimensions (5 fields)
  room_sf: number;    // Total square footage
  length_ft: number;  // Room length in feet
  width_ft: number;   // Room width in feet
  height_ft: number;  // Room height in feet
  volume_ft: number;  // Total cubic footage
  
  // Overall Assessment (1 field)
  room_damage: string; // Overall damage description
}

/**
 * Validated and processed CSV data with type safety and defaults applied.
 * Used after CSV parsing and validation.
 */
export interface ProcessedCSVData extends Omit<CSVRowData, 'generator_needed' | 'ceiling_damage' | 'wall_damage'> {
  generator_needed: boolean;
  ceiling_damage: boolean;
  wall_damage: boolean;
  
  // Additional computed fields
  ceiling_damage_sf?: number; // Computed from ceiling_damage boolean and room dimensions
}

// ===================================================================
// CONFIGURATION PARAMETERS (16 total as per README)
// ===================================================================

/**
 * User configuration parameters for cost calculations.
 * All 16 configurable values with their data types and constraints.
 */
export interface UserConfiguration {
  // Database fields
  id?: number;
  user_id: string;
  config_name: string;
  created_at?: string;
  updated_at?: string;
  
  // Labor Rates (4 parameters - Hourly USD)
  tech_base: number;              // Technician hourly rate ($25-150)
  supervisor_base: number;        // Supervisor hourly rate ($35-200)
  specialist_base: number;        // Specialist hourly rate ($75-300)
  project_management_base: number; // Project management flat fee ($100-500)
  
  // Equipment Daily Rates (7 parameters - Daily USD)
  large_dehumidifier_daily: number;    // LGR dehumidifier ($15-50)
  standard_dehumidifier_daily: number; // Standard dehumidifier ($8-30)
  air_mover_daily: number;             // Air mover ($4-15)
  heater_daily: number;                // Heater ($6-25)
  air_scrubber_daily: number;          // Air scrubber ($20-75)
  injection_system_daily: number;      // Injection system ($15-50)
  generator_daily: number;             // Generator ($25-100)
  
  // Target Moisture Content (5 parameters - Percentage)
  hardwood_target_mc: number;     // Hardwood target moisture (6-12%)
  paneling_target_mc: number;     // Paneling target moisture (8-15%)
  vinyl_target_mc: number;        // Vinyl target moisture (1-5%)
  drywall_target_mc: number;      // Drywall target moisture (10-18%)
  carpet_target_mc: number;       // Carpet target moisture (3-8%)
}

/**
 * Default configuration values matching README specifications.
 */
export const DEFAULT_CONFIGURATION: Omit<UserConfiguration, 'id' | 'user_id' | 'config_name' | 'created_at' | 'updated_at'> = {
  // Labor Rates
  tech_base: 55,
  supervisor_base: 75,
  specialist_base: 120,
  project_management_base: 200,
  
  // Equipment Daily Rates
  large_dehumidifier_daily: 25,
  standard_dehumidifier_daily: 15,
  air_mover_daily: 8,
  heater_daily: 12,
  air_scrubber_daily: 35,
  injection_system_daily: 25,
  generator_daily: 45,
  
  // Target Moisture Content
  hardwood_target_mc: 8,
  paneling_target_mc: 10,
  vinyl_target_mc: 2,
  drywall_target_mc: 12,
  carpet_target_mc: 5,
} as const;

// ===================================================================
// MATERIAL LIBRARY (39 materials as per README)
// ===================================================================

/**
 * Material specification for calculations.
 * Each material has thickness, cost, and target moisture content.
 */
export interface MaterialSpecification {
  thickness: number;    // Material thickness in inches
  cost: number;         // Treatment cost per square foot (USD)
  target_mc: number;    // Target moisture content percentage
}

/**
 * Material lookup key type for type safety.
 * Represents all 39 supported materials.
 */
export type MaterialType = 
  // Drywall family (5 materials)
  | "drywall" | "gypsum" | "gypsum board" | "gypsum wallboard" | "wallboard"
  // Hardwood family (3 materials)
  | "hardwood" | "hardwood floors" | "wood"
  // Paneling family (2 materials)
  | "paneling" | "wood paneling"
  // Vinyl family (3 materials)
  | "vinyl" | "vinyl sheet" | "vct"
  // Carpet family (3 materials)
  | "carpet" | "carpet cushion" | "carpet pad"
  // Engineered materials (7 materials)
  | "engineered" | "engineered wood" | "engineered floors" | "laminate"
  | "bamboo" | "cork" | "parquet"
  // Stone/Tile family (5 materials)
  | "tile" | "stone" | "granite" | "slate" | "engineered marble"
  // Concrete (1 material)
  | "concrete"
  // Insulation family (4 materials)
  | "insulation" | "fiberglass" | "mineral wool" | "cellulose"
  // Engineered wood products (4 materials)
  | "plywood" | "osb" | "particleboard" | "mdf"
  // Other materials (2 materials)
  | "brick" | "wallpaper";

/**
 * Complete material library type with all 39 materials.
 */
export type MaterialLibrary = Record<MaterialType, MaterialSpecification>;

// ===================================================================
// CALCULATION RESULTS
// ===================================================================

/**
 * Equipment requirements for a single room.
 */
export interface EquipmentRequirements {
  large_units: number;              // Large dehumidifiers count
  standard_units: number;           // Standard dehumidifiers count
  air_movers: number;               // Air movers count
  heaters: number;                  // Heaters count
  air_scrubbers: number;            // Air scrubbers count
  injection_systems: number;        // Injection systems count
  generator_required: number;       // Generator required (0 or 1)
  total_units: number;              // Total equipment count
  recommended_dehumidifier_type: "Standard" | "LGR" | "Desiccant";
}

/**
 * Labor cost breakdown for a room.
 */
export interface LaborCosts {
  tech_hours: number;               // Total technician hours
  tech_cost: number;                // Technician labor cost
  supervisor_hours: number;         // Daily supervision hours
  supervisor_cost: number;          // Supervisor labor cost
  specialist_hours: number;         // Specialist hours required
  specialist_cost: number;          // Specialist labor cost
  project_management: number;       // Project management flat fee
  total_labor: number;              // Total labor cost
}

/**
 * Equipment cost breakdown for a room.
 */
export interface EquipmentCosts {
  daily_cost: number;               // Daily equipment rental cost
  total_days: number;               // Number of days equipment needed
  total_equipment: number;          // Total equipment cost
}

/**
 * Material treatment cost breakdown for a room.
 */
export interface MaterialCosts {
  floor_treatment: number;          // Floor treatment cost
  wall_treatment: number;           // Wall treatment cost
  ceiling_treatment: number;        // Ceiling treatment cost
  disposal: number;                 // Disposal cost
  antimicrobial: number;            // Antimicrobial treatment cost
  total_materials: number;          // Total material costs
}

/**
 * Complete cost breakdown for a room.
 */
export interface RoomCosts {
  labor: LaborCosts;
  equipment: EquipmentCosts;
  materials: MaterialCosts;
  subtotal: number;                 // Subtotal before markup
  commercial_markup: number;        // 15% commercial markup
  total_room_cost: number;          // Final room cost
  cost_per_sqft: number;            // Cost per square foot
}

/**
 * Timeline and monitoring requirements for a room.
 */
export interface RoomTimeline {
  estimated_days: number;           // Total project timeline
  daily_monitoring_hours: number;  // Hours of daily monitoring needed
  base_days: number;                // Base timeline before adjustments
  class_multiplier: number;         // Water class multiplier applied
  complexity_factors: {
    category: number;               // Water category (1-3)
    class: number;                  // Water class (1-4)
  };
}

/**
 * Electrical requirements for a room.
 */
export interface ElectricalRequirements {
  total_amperage: number;           // Total electrical load in amps
  circuits_20a_required: number;   // Number of 20A circuits needed
  circuits_15a_required: number;   // Number of 15A circuits needed
  daily_kwh: number;                // Daily kilowatt-hour consumption
  voltage: "120V";                  // Voltage standard (always 120V)
  generator_needed: number;         // Generator requirement (0 or 1)
}

/**
 * Material analysis for a room (floor, wall, ceiling).
 */
export interface RoomMaterials {
  floor: {
    material_type: string;
    material_specs: MaterialSpecification;
    affected_sqft: number;
    moisture_content: number;
    volume_cuft: number;
    length_ft: number;
    width_ft: number;
  };
  wall: {
    material_type: string;
    material_specs: MaterialSpecification;
    affected_sqft: number;
    moisture_weighted: number;      // Weighted average moisture
    removal_factor: number;         // Partial removal factor (0.6-1.0)
    volume_cuft: number;
  };
  ceiling: {
    material_type: string;
    material_specs: MaterialSpecification;
    affected_sqft: number;
    moisture_content: number;
    volume_cuft: number;
  };
  total_volume: number;             // Total material volume
  disposal_volume: number;          // Volume including waste factor
}

/**
 * Complete calculation result for a single room.
 */
export interface RoomResult {
  room_id: string;
  room_name: string;
  room_sf: number;
  equipment: EquipmentRequirements;
  costs: RoomCosts;
  timeline: RoomTimeline;
  electrical: ElectricalRequirements;
  materials: RoomMaterials;
}

// ===================================================================
// PROJECT-LEVEL AGGREGATION
// ===================================================================

/**
 * Fleet requirements for entire project.
 */
export interface FleetRequirements {
  large_dehumidifiers: number;
  standard_dehumidifiers: number;
  air_movers: number;
  heaters: number;
  air_scrubbers: number;
  injection_systems: number;
  generators: number;
  total_equipment_units: number;
}

/**
 * Project-level electrical summary.
 */
export interface ElectricalSummary {
  total_circuits_20a: number;
  total_circuits_15a: number;
  daily_kwh: number;
  total_kwh_project: number;
  peak_amperage: number;
  voltage_standard: "120V";
}

/**
 * Labor optimization details for concurrent scheduling.
 */
export interface LaborOptimization {
  savings: number;                  // Total labor savings
  supervision_savings: number;      // Supervision cost savings
  setup_breakdown_savings: number; // Setup/breakdown savings
  details: Array<{
    timeline: number;               // Timeline in days
    room_count: number;             // Number of rooms
    original_cost: number;          // Original supervision cost
    optimized_cost: number;         // Optimized supervision cost
    savings: number;                // Savings for this timeline group
    room_names: string;             // Comma-separated room names
  }>;
}

/**
 * Complete project summary.
 */
export interface ProjectSummary {
  room_count: number;
  total_cost: number;
  optimized_total_cost: number;
  total_affected_sf: number;
  total_equipment_units: number;
  total_amperage: number;
  longest_timeline: number;
  average_cost_per_sf: number;
  fleet_requirements: FleetRequirements;
  electrical_summary: ElectricalSummary;
  labor_optimization: LaborOptimization;
}

/**
 * Complete calculation results for entire project.
 */
export interface CalculationResults {
  rooms: RoomResult[];
  project: ProjectSummary;
}

// ===================================================================
// EQUIPMENT PLACEMENT & VISUALIZATION
// ===================================================================

/**
 * Equipment placement coordinates and properties.
 */
export interface EquipmentPlacement {
  id: string;                       // Unique equipment identifier
  type: 'large_dehumidifier' | 'standard_dehumidifier' | 'air_mover' | 
        'air_scrubber' | 'heater' | 'injection_system';
  x: number;                        // X coordinate in scaled space
  y: number;                        // Y coordinate in scaled space
  label: string;                    // Display label (e.g., "LGR 1")
  amperage: number;                 // Electrical draw in amps
  circuit: string;                  // Circuit assignment
  coverage?: number;                // Coverage area in sq ft (for dehumidifiers)
  size: number;                     // Visual size for rendering
  rotation?: number;                // Rotation angle for air movers
}

/**
 * Room dimensions and placement calculations.
 */
export interface PlacementCalculation {
  placements: EquipmentPlacement[];
  dimensions: {
    length: number;                 // Scaled length for display
    width: number;                  // Scaled width for display
    scale: number;                  // Scale factor applied
  };
  real_dimensions: {
    length: number;                 // Actual room length in feet
    width: number;                  // Actual room width in feet
  };
  circuit_assignments: {
    circuit_20a: string[];          // 20A circuit assignments
    circuit_15a: string[][];        // 15A circuit assignments (nested arrays)
  };
  total_amperage: number;
  aspect_ratio: number;
  room_area: number;
}

/**
 * Airflow pattern for visualization.
 */
export interface AirflowPattern {
  from: { x: number; y: number };   // Starting point
  to: { x: number; y: number };     // Ending point
  intensity: number;                // Flow intensity (0-1)
  equipment_id: string;             // Source equipment ID
}

// ===================================================================
// API REQUEST/RESPONSE TYPES
// ===================================================================

/**
 * CSV processing API request.
 */
export interface CSVProcessRequest {
  csv: File;                        // Uploaded CSV file
}

/**
 * CSV processing API response.
 */
export interface CSVProcessResponse {
  success: boolean;
  results?: CalculationResults;
  errors: ValidationError[];
  skipped: number;                  // Number of invalid rows skipped
}

/**
 * Validation error details.
 */
export interface ValidationError {
  row: number;                      // Row number in CSV
  field: string;                    // Field name with error
  message: string;                  // Error description
  value?: any;                      // Invalid value
}

/**
 * Configuration API request (partial update).
 */
export interface ConfigUpdateRequest {
  config_name?: string;
  [K in keyof Omit<UserConfiguration, 'id' | 'user_id' | 'created_at' | 'updated_at'>]?: UserConfiguration[K];
}

/**
 * Configuration API response.
 */
export interface ConfigResponse {
  success: boolean;
  config?: UserConfiguration;
  error?: string;
}

/**
 * PDF export request.
 */
export interface PDFExportRequest {
  project_data: CalculationResults;
  options: {
    include_diagrams: boolean;
    company_logo?: string;
    report_title?: string;
  };
}

/**
 * Health check response.
 */
export interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
  database: "connected" | "disconnected";
}

// ===================================================================
// COMPONENT PROPS TYPES
// ===================================================================

/**
 * Theme configuration for dark/light mode.
 */
export interface ThemeConfig {
  bg: string;
  cardBg: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentBg: string;
  accentHover: string;
  input: string;
  button: string;
}

/**
 * Calculator component props.
 */
export interface CalculatorProps {
  darkMode: boolean;
  onThemeToggle: () => void;
}

/**
 * Configuration panel props.
 */
export interface ConfigurationPanelProps {
  config: UserConfiguration;
  onConfigChange: (config: Partial<UserConfiguration>) => void;
  onSave: () => void;
  isLoading: boolean;
  theme: ThemeConfig;
}

/**
 * Equipment visualization props.
 */
export interface EquipmentVisualizationProps {
  room: RoomResult;
  onExportDiagram: () => void;
  onExportWorkOrder: () => void;
  theme: ThemeConfig;
}

/**
 * Results display props.
 */
export interface ResultsDisplayProps {
  results: CalculationResults;
  selectedRoom: number;
  onRoomSelect: (roomIndex: number) => void;
  onExportCSV: () => void;
  onPrintPDF: () => void;
  theme: ThemeConfig;
}

// ===================================================================
// CLOUDFLARE WORKERS ENVIRONMENT
// ===================================================================

/**
 * Cloudflare Workers environment bindings.
 */
export interface CloudflareEnv {
  DB: D1Database;                   // D1 database binding
  KV?: KVNamespace;                 // KV namespace (optional)
  AUTH_DOMAIN: string;              // Cloudflare Access domain
  AUTH_AUDIENCE: string;            // Cloudflare Access audience
  APP_VERSION: string;              // Application version
}

/**
 * Authentication context from Cloudflare Access.
 */
export interface AuthContext {
  user_id: string;                  // User identifier from JWT
  email?: string;                   // User email (if available)
  groups?: string[];                // User groups (if available)
}

// ===================================================================
// UTILITY TYPES
// ===================================================================

/**
 * Generic API response wrapper.
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Pagination parameters for list endpoints.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * File upload progress tracking.
 */
export interface UploadProgress {
  loaded: number;                   // Bytes uploaded
  total: number;                    // Total bytes
  percentage: number;               // Upload percentage (0-100)
  status: 'uploading' | 'processing' | 'complete' | 'error';
}

/**
 * Export utility types for re-use across modules.
 */
export type { MaterialType, MaterialSpecification, MaterialLibrary };
export { DEFAULT_CONFIGURATION };