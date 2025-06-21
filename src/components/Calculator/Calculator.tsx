/**
 * DamageScan Calculator Main Component
 * 
 * Primary orchestrator component that manages the complete calculation workflow.
 * Handles configuration, file upload, processing, and results display.
 * 
 * @fileoverview Production-ready calculator with comprehensive state management
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calculator as CalculatorIcon, Settings, Upload, FileText, Moon, Sun, AlertCircle } from 'lucide-react';

// Import child components
import FileUpload from './FileUpload';
import ConfigurationPanel from './ConfigurationPanel';
import ResultsDisplay from './ResultsDisplay';

import type {
  ThemeConfig,
  UserConfiguration,
  CalculationResults,
  ApiResponse,
  DEFAULT_CONFIGURATION
} from '../../lib/types';

// ===================================================================
// COMPONENT TYPES AND INTERFACES
// ===================================================================

/**
 * Calculator component props.
 */
interface CalculatorProps {
  /** Initial dark mode state */
  darkMode?: boolean;
  /** Callback when theme changes */
  onThemeToggle?: () => void;
}

/**
 * Application state enumeration.
 */
type AppState = 
  | 'loading'        // Initial loading of configuration
  | 'ready'          // Ready for file upload
  | 'configuring'    // Configuration panel open
  | 'processing'     // File processing in progress
  | 'results'        // Results available
  | 'error';         // Error state

/**
 * Error state interface.
 */
interface AppError {
  message: string;
  type: 'config' | 'upload' | 'processing' | 'network';
  canRetry: boolean;
}

// ===================================================================
// THEME CONFIGURATION
// ===================================================================

/**
 * Create theme configuration based on dark mode state.
 * 
 * @param darkMode - Whether dark mode is enabled
 * @returns Theme configuration object
 */
function createTheme(darkMode: boolean): ThemeConfig {
  return {
    bg: darkMode ? 'bg-gray-900' : 'bg-gray-50',
    cardBg: darkMode ? 'bg-gray-800' : 'bg-white',
    text: darkMode ? 'text-gray-100' : 'text-gray-900',
    textSecondary: darkMode ? 'text-gray-300' : 'text-gray-600',
    border: darkMode ? 'border-gray-700' : 'border-gray-200',
    accent: 'text-orange-400',
    accentBg: 'bg-orange-500',
    accentHover: 'hover:bg-orange-600',
    input: darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900',
    button: darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
  };
}

/**
 * Get authentication token from localStorage.
 * TODO: Replace with actual auth context implementation.
 */
function getAuthToken(): string | null {
  // For now, return null and handle auth errors gracefully
  return null;
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

/**
 * Main calculator component for DamageScan application.
 */
export const Calculator: React.FC<CalculatorProps> = ({
  darkMode = true,
  onThemeToggle
}) => {
  // ===================================================================
  // STATE MANAGEMENT
  // ===================================================================

  const [appState, setAppState] = useState<AppState>('loading');
  const [isDarkMode, setIsDarkMode] = useState(darkMode);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(-1); // -1 for site summary
  
  // Data state
  const [userConfig, setUserConfig] = useState<UserConfiguration | null>(null);
  const [calculationResults, setCalculationResults] = useState<CalculationResults | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  
  // Loading states
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Theme configuration (memoized for performance)
  const theme = useMemo(() => createTheme(isDarkMode), [isDarkMode]);

  // ===================================================================
  // API INTEGRATION
  // ===================================================================

  /**
   * Load user configuration from API.
   */
  const loadConfiguration = useCallback(async () => {
    try {
      setAppState('loading');
      setError(null);

      const token = getAuthToken();
      const headers: HeadersInit = {};
      
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/config', {
        method: 'GET',
        headers
      });

      const result = await response.json() as ApiResponse<UserConfiguration>;

      if (result.success && result.data) {
        setUserConfig(result.data);
        setAppState('ready');
      } else {
        // If config doesn't exist, create default
        const defaultConfig: UserConfiguration = {
          id: undefined,
          user_id: 'anonymous', // Will be set by auth
          config_name: 'default',
          created_at: undefined,
          updated_at: undefined,
          ...DEFAULT_CONFIGURATION
        };
        
        setUserConfig(defaultConfig);
        setAppState('ready');
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
      
      // Fallback to default configuration
      const defaultConfig: UserConfiguration = {
        id: undefined,
        user_id: 'anonymous',
        config_name: 'default',
        created_at: undefined,
        updated_at: undefined,
        ...DEFAULT_CONFIGURATION
      };
      
      setUserConfig(defaultConfig);
      setError({
        message: 'Failed to load configuration. Using defaults.',
        type: 'config',
        canRetry: true
      });
      setAppState('ready');
    }
  }, []);

  /**
   * Save configuration to API.
   */
  const saveConfiguration = useCallback(async () => {
    if (!userConfig) return;

    try {
      setIsConfigLoading(true);
      setError(null);

      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/config', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          config_name: userConfig.config_name,
          tech_base: userConfig.tech_base,
          supervisor_base: userConfig.supervisor_base,
          specialist_base: userConfig.specialist_base,
          project_management_base: userConfig.project_management_base,
          large_dehumidifier_daily: userConfig.large_dehumidifier_daily,
          standard_dehumidifier_daily: userConfig.standard_dehumidifier_daily,
          air_mover_daily: userConfig.air_mover_daily,
          heater_daily: userConfig.heater_daily,
          air_scrubber_daily: userConfig.air_scrubber_daily,
          injection_system_daily: userConfig.injection_system_daily,
          generator_daily: userConfig.generator_daily,
          hardwood_target_mc: userConfig.hardwood_target_mc,
          paneling_target_mc: userConfig.paneling_target_mc,
          vinyl_target_mc: userConfig.vinyl_target_mc,
          drywall_target_mc: userConfig.drywall_target_mc,
          carpet_target_mc: userConfig.carpet_target_mc
        })
      });

      const result = await response.json() as ApiResponse<UserConfiguration>;

      if (result.success && result.data) {
        setUserConfig(result.data);
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setError({
        message: err instanceof Error ? err.message : 'Failed to save configuration',
        type: 'config',
        canRetry: true
      });
    } finally {
      setIsConfigLoading(false);
    }
  }, [userConfig]);

  // ===================================================================
  // INITIALIZATION
  // ===================================================================

  /**
   * Load configuration on component mount.
   */
  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  /**
   * Sync dark mode state with props.
   */
  useEffect(() => {
    setIsDarkMode(darkMode);
  }, [darkMode]);

  // ===================================================================
  // EVENT HANDLERS
  // ===================================================================

  /**
   * Handle theme toggle.
   */
  const handleThemeToggle = useCallback(() => {
    setIsDarkMode(prev => !prev);
    onThemeToggle?.();
  }, [onThemeToggle]);

  /**
   * Handle configuration changes.
   * 
   * @param changes - Partial configuration changes
   */
  const handleConfigChange = useCallback((changes: Partial<UserConfiguration>) => {
    setUserConfig(prev => prev ? { ...prev, ...changes } : null);
  }, []);

  /**
   * Handle file upload results.
   * 
   * @param results - Calculation results from file processing
   */
  const handleFileResults = useCallback((results: CalculationResults) => {
    setCalculationResults(results);
    setSelectedRoom(-1); // Start with site summary
    setAppState('results');
    setShowConfig(false); // Close config panel if open
  }, []);

  /**
   * Handle file upload errors.
   * 
   * @param errorMessage - Error message from file upload
   */
  const handleFileError = useCallback((errorMessage: string) => {
    setError({
      message: errorMessage,
      type: 'upload',
      canRetry: true
    });
    setAppState('error');
  }, []);

  /**
   * Handle room selection changes.
   * 
   * @param roomIndex - Selected room index (-1 for site summary)
   */
  const handleRoomSelect = useCallback((roomIndex: number) => {
    setSelectedRoom(roomIndex);
  }, []);

  /**
   * Handle CSV export.
   */
  const handleExportCSV = useCallback(() => {
    if (!calculationResults) return;

    try {
      // Create CSV content
      const headers = [
        'room_id', 'room_name', 'room_sf', 'total_cost', 'cost_per_sqft', 'timeline_days',
        'large_dehumidifiers', 'standard_dehumidifiers', 'air_movers', 'heaters', 'air_scrubbers',
        'injection_systems', 'generator_required', 'total_equipment_units',
        'labor_cost', 'equipment_cost', 'materials_cost', 'total_amperage'
      ];

      const csvRows = calculationResults.rooms.map(room => [
        room.room_id,
        room.room_name || '',
        room.room_sf,
        room.costs.total_room_cost.toFixed(2),
        room.costs.cost_per_sqft.toFixed(2),
        room.timeline.estimated_days,
        room.equipment.large_units,
        room.equipment.standard_units,
        room.equipment.air_movers,
        room.equipment.heaters,
        room.equipment.air_scrubbers,
        room.equipment.injection_systems,
        room.equipment.generator_required,
        room.equipment.total_units,
        room.costs.labor.total_labor.toFixed(2),
        room.costs.equipment.total_equipment.toFixed(2),
        room.costs.materials.total_materials.toFixed(2),
        room.electrical.total_amperage
      ]);

      const csvContent = [headers, ...csvRows].map(row => row.join(',')).join('\n');
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `damagescan_results_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
      setError({
        message: 'Failed to export CSV file',
        type: 'processing',
        canRetry: true
      });
    }
  }, [calculationResults]);

  /**
   * Handle PDF export.
   */
  const handlePrintPDF = useCallback(() => {
    // Use browser's print functionality
    window.print();
  }, []);

  /**
   * Handle error retry.
   */
  const handleRetry = useCallback(() => {
    setError(null);
    
    switch (appState) {
      case 'loading':
      case 'error':
        loadConfiguration();
        break;
      default:
        setAppState('ready');
        break;
    }
  }, [appState, loadConfiguration]);

  /**
   * Handle new file upload (reset state).
   */
  const handleNewUpload = useCallback(() => {
    setCalculationResults(null);
    setSelectedRoom(-1);
    setError(null);
    setAppState('ready');
  }, []);

  // ===================================================================
  // RENDER HELPERS
  // ===================================================================

  /**
   * Render loading state.
   */
  const renderLoading = () => (
    <div className="flex items-center justify-center min-h-96">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className={`text-lg ${theme.text}`}>Loading DamageScan...</p>
        <p className={`text-sm ${theme.textSecondary}`}>Initializing calculator and loading configuration</p>
      </div>
    </div>
  );

  /**
   * Render error state.
   */
  const renderError = () => (
    <div className={`${theme.cardBg} rounded-lg shadow-lg p-8 border ${theme.border} text-center`}>
      <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
      <h3 className={`text-lg font-semibold ${theme.text} mb-2`}>Something went wrong</h3>
      <p className={`${theme.textSecondary} mb-6`}>{error?.message}</p>
      
      {error?.canRetry && (
        <button
          onClick={handleRetry}
          className={`px-6 py-2 ${theme.accentBg} ${theme.accentHover} text-white rounded-lg transition-colors`}
        >
          Try Again
        </button>
      )}
    </div>
  );

  /**
   * Render main header.
   */
  const renderHeader = () => (
    <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 mb-6 border ${theme.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalculatorIcon className="h-8 w-8 text-orange-400" />
          <div>
            <h1 className={`text-3xl font-bold ${theme.text}`}>DamageScan</h1>
            <p className={`text-sm ${theme.textSecondary}`}>
              Water Damage Restoration Cost Calculator
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Theme Toggle */}
          <button
            onClick={handleThemeToggle}
            className={`p-2 rounded-lg ${theme.button} transition-colors`}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          
          {/* Configuration Toggle */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors
              ${showConfig ? `${theme.accentBg} text-white` : theme.button}
            `}
          >
            <Settings className="h-5 w-5" />
            <span>Configuration</span>
          </button>
          
          {/* New Upload Button (only show in results state) */}
          {appState === 'results' && (
            <button
              onClick={handleNewUpload}
              className={`flex items-center space-x-2 px-4 py-2 ${theme.button} rounded-lg transition-colors`}
            >
              <Upload className="h-5 w-5" />
              <span>New Upload</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ===================================================================
  // MAIN RENDER
  // ===================================================================

  return (
    <div className={`min-h-screen ${theme.bg} p-6 transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        {appState !== 'loading' && renderHeader()}

        {/* Error State */}
        {error && appState === 'error' && renderError()}

        {/* Loading State */}
        {appState === 'loading' && renderLoading()}

        {/* Configuration Panel */}
        {showConfig && userConfig && appState !== 'loading' && (
          <div className="mb-6">
            <ConfigurationPanel
              config={userConfig}
              onConfigChange={handleConfigChange}
              onSave={saveConfiguration}
              isLoading={isConfigLoading}
              theme={theme}
            />
          </div>
        )}

        {/* Main Content */}
        {appState !== 'loading' && appState !== 'error' && (
          <>
            {/* File Upload (show when ready or when no results) */}
            {(appState === 'ready' || !calculationResults) && !showConfig && (
              <FileUpload
                onResults={handleFileResults}
                onError={handleFileError}
                isDisabled={isProcessing}
                maxFileSize={10 * 1024 * 1024} // 10MB
                theme={theme}
              />
            )}

            {/* Results Display */}
            {appState === 'results' && calculationResults && !showConfig && (
              <ResultsDisplay
                results={calculationResults}
                selectedRoom={selectedRoom}
                onRoomSelect={handleRoomSelect}
                onExportCSV={handleExportCSV}
                onPrintPDF={handlePrintPDF}
                theme={theme}
              />
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className={`text-sm ${theme.textSecondary}`}>
            DamageScan v1.0.0 | CDMv23 Methodology | 
            <span className="ml-2">
              Built with React + Cloudflare Workers
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
