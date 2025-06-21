/**
 * DamageScan Configuration Panel Component
 * 
 * Manages user configuration settings for labor rates, equipment costs, and moisture targets.
 * Provides real-time validation, save functionality, and reset to defaults.
 * 
 * @fileoverview Production-ready configuration management with API integration
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, CheckCircle, Loader2, DollarSign } from 'lucide-react';

import type {
  ThemeConfig,
  UserConfiguration,
  ConfigUpdateRequest,
  ApiResponse,
  DEFAULT_CONFIGURATION
} from '../../lib/types';

// ===================================================================
// COMPONENT TYPES AND INTERFACES
// ===================================================================

/**
 * Configuration panel component props.
 */
interface ConfigurationPanelProps {
  /** Current configuration data */
  config: UserConfiguration;
  /** Callback when configuration changes */
  onConfigChange: (config: Partial<UserConfiguration>) => void;
  /** Callback to save configuration */
  onSave: () => void;
  /** Loading state during save operations */
  isLoading: boolean;
  /** Theme configuration for styling */
  theme: ThemeConfig;
}

/**
 * Configuration field definition for form generation.
 */
interface ConfigField {
  key: keyof UserConfiguration;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  description: string;
  placeholder: string;
}

/**
 * Configuration section grouping related fields.
 */
interface ConfigSection {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: ConfigField[];
}

/**
 * Form validation state.
 */
interface ValidationState {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

/**
 * Save operation state.
 */
type SaveState = 'idle' | 'saving' | 'success' | 'error';

// ===================================================================
// CONFIGURATION DEFINITIONS
// ===================================================================

/**
 * Complete configuration schema with validation rules.
 * Matches the validation ranges from README.md exactly.
 */
const CONFIG_SECTIONS: ConfigSection[] = [
  {
    title: 'Labor Rates',
    description: 'Hourly rates for different types of labor (USD per hour)',
    icon: DollarSign,
    fields: [
      {
        key: 'tech_base',
        label: 'Technician Base Rate',
        min: 25,
        max: 150,
        step: 1,
        unit: '$/hour',
        description: 'Hourly rate for technicians handling equipment setup, monitoring, and breakdown',
        placeholder: '55'
      },
      {
        key: 'supervisor_base',
        label: 'Supervisor Base Rate',
        min: 35,
        max: 200,
        step: 1,
        unit: '$/hour',
        description: 'Hourly rate for supervisors overseeing project operations',
        placeholder: '75'
      },
      {
        key: 'specialist_base',
        label: 'Specialist Base Rate',
        min: 75,
        max: 300,
        step: 1,
        unit: '$/hour',
        description: 'Hourly rate for specialists handling contamination or complex materials',
        placeholder: '120'
      },
      {
        key: 'project_management_base',
        label: 'Project Management Fee',
        min: 100,
        max: 500,
        step: 10,
        unit: '$ flat fee',
        description: 'Flat fee for project management and coordination',
        placeholder: '200'
      }
    ]
  },
  {
    title: 'Equipment Daily Rates',
    description: 'Daily rental rates for restoration equipment (USD per day)',
    icon: Settings,
    fields: [
      {
        key: 'large_dehumidifier_daily',
        label: 'Large Dehumidifier (LGR)',
        min: 15,
        max: 50,
        step: 1,
        unit: '$/day',
        description: 'Daily rate for large/LGR dehumidifiers (2500+ sq ft coverage)',
        placeholder: '25'
      },
      {
        key: 'standard_dehumidifier_daily',
        label: 'Standard Dehumidifier',
        min: 8,
        max: 30,
        step: 1,
        unit: '$/day',
        description: 'Daily rate for standard dehumidifiers (1200 sq ft coverage)',
        placeholder: '15'
      },
      {
        key: 'air_mover_daily',
        label: 'Air Mover',
        min: 4,
        max: 15,
        step: 0.5,
        unit: '$/day',
        description: 'Daily rate for air movers and circulation fans',
        placeholder: '8'
      },
      {
        key: 'heater_daily',
        label: 'Heater',
        min: 6,
        max: 25,
        step: 1,
        unit: '$/day',
        description: 'Daily rate for heating equipment (contamination/specialty drying)',
        placeholder: '12'
      },
      {
        key: 'air_scrubber_daily',
        label: 'Air Scrubber',
        min: 20,
        max: 75,
        step: 1,
        unit: '$/day',
        description: 'Daily rate for air scrubbers and filtration systems',
        placeholder: '35'
      },
      {
        key: 'injection_system_daily',
        label: 'Injection System',
        min: 15,
        max: 50,
        step: 1,
        unit: '$/day',
        description: 'Daily rate for hardwood floor injection systems',
        placeholder: '25'
      },
      {
        key: 'generator_daily',
        label: 'Generator',
        min: 25,
        max: 100,
        step: 5,
        unit: '$/day',
        description: 'Daily rate for backup power generation',
        placeholder: '45'
      }
    ]
  },
  {
    title: 'Target Moisture Content',
    description: 'Target moisture levels for different materials (percentage)',
    icon: AlertCircle,
    fields: [
      {
        key: 'hardwood_target_mc',
        label: 'Hardwood Target',
        min: 6,
        max: 12,
        step: 0.5,
        unit: '%',
        description: 'Target moisture content for hardwood flooring',
        placeholder: '8'
      },
      {
        key: 'paneling_target_mc',
        label: 'Paneling Target',
        min: 8,
        max: 15,
        step: 0.5,
        unit: '%',
        description: 'Target moisture content for wood paneling',
        placeholder: '10'
      },
      {
        key: 'vinyl_target_mc',
        label: 'Vinyl Target',
        min: 1,
        max: 5,
        step: 0.5,
        unit: '%',
        description: 'Target moisture content for vinyl flooring',
        placeholder: '2'
      },
      {
        key: 'drywall_target_mc',
        label: 'Drywall Target',
        min: 10,
        max: 18,
        step: 0.5,
        unit: '%',
        description: 'Target moisture content for drywall materials',
        placeholder: '12'
      },
      {
        key: 'carpet_target_mc',
        label: 'Carpet Target',
        min: 3,
        max: 8,
        step: 0.5,
        unit: '%',
        description: 'Target moisture content for carpet materials',
        placeholder: '5'
      }
    ]
  }
];

/**
 * Get authentication token from localStorage.
 * TODO: Replace with actual auth context implementation.
 */
function getAuthToken(): string | null {
  // For now, return null and handle auth errors gracefully
  return null;
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Validate configuration field value against defined constraints.
 * 
 * @param field - Field definition
 * @param value - Value to validate
 * @returns Validation result
 */
function validateField(field: ConfigField, value: number): { error?: string; warning?: string } {
  if (isNaN(value) || value === null || value === undefined) {
    return { error: `${field.label} is required` };
  }

  if (value < field.min || value > field.max) {
    return { error: `${field.label} must be between ${field.min} and ${field.max} ${field.unit}` };
  }

  // Warning thresholds (within 10% of limits)
  const range = field.max - field.min;
  const warningThreshold = range * 0.1;

  if (value <= field.min + warningThreshold) {
    return { warning: `${field.label} is near the minimum recommended value` };
  }

  if (value >= field.max - warningThreshold) {
    return { warning: `${field.label} is near the maximum recommended value` };
  }

  return {};
}

/**
 * Validate entire configuration object.
 * 
 * @param config - Configuration to validate
 * @returns Validation state
 */
function validateConfiguration(config: UserConfiguration): ValidationState {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  CONFIG_SECTIONS.forEach(section => {
    section.fields.forEach(field => {
      const value = config[field.key] as number;
      const validation = validateField(field, value);
      
      if (validation.error) {
        errors[field.key] = validation.error;
      }
      
      if (validation.warning) {
        warnings[field.key] = validation.warning;
      }
    });
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

/**
 * Configuration panel component for managing user settings.
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  config,
  onConfigChange,
  onSave,
  isLoading,
  theme
}) => {
  // ===================================================================
  // STATE MANAGEMENT
  // ===================================================================

  const [localConfig, setLocalConfig] = useState<UserConfiguration>(config);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Sync local config with props
  useEffect(() => {
    setLocalConfig(config);
    setHasChanges(false);
  }, [config]);

  // Validation state (memoized for performance)
  const validation = useMemo(() => validateConfiguration(localConfig), [localConfig]);

  // ===================================================================
  // API INTEGRATION
  // ===================================================================

  /**
   * Save configuration to API.
   */
  const saveConfiguration = useCallback(async () => {
    if (!validation.isValid) {
      setSaveState('error');
      return;
    }

    try {
      setSaveState('saving');

      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/api/config', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          config_name: localConfig.config_name || 'default',
          ...Object.fromEntries(
            CONFIG_SECTIONS.flatMap(section => 
              section.fields.map(field => [field.key, localConfig[field.key]])
            )
          )
        } as ConfigUpdateRequest)
      });

      const result = await response.json() as ApiResponse<UserConfiguration>;

      if (result.success && result.data) {
        setSaveState('success');
        setLastSaved(new Date());
        setHasChanges(false);
        onConfigChange(result.data);
        
        // Reset success state after 3 seconds
        setTimeout(() => {
          setSaveState('idle');
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Save configuration failed:', error);
      setSaveState('error');
      
      // Reset error state after 5 seconds
      setTimeout(() => {
        setSaveState('idle');
      }, 5000);
    }
  }, [localConfig, validation.isValid, onConfigChange]);

  /**
   * Reset configuration to defaults.
   */
  const resetToDefaults = useCallback(() => {
    const defaultConfig = {
      ...localConfig,
      ...DEFAULT_CONFIGURATION
    };
    
    setLocalConfig(defaultConfig);
    onConfigChange(defaultConfig);
    setHasChanges(true);
    setShowResetConfirm(false);
  }, [localConfig, onConfigChange]);

  // ===================================================================
  // EVENT HANDLERS
  // ===================================================================

  /**
   * Handle field value change.
   * 
   * @param fieldKey - Configuration field key
   * @param value - New value
   */
  const handleFieldChange = useCallback((fieldKey: keyof UserConfiguration, value: number) => {
    const updatedConfig = {
      ...localConfig,
      [fieldKey]: value
    };
    
    setLocalConfig(updatedConfig);
    onConfigChange(updatedConfig);
    setHasChanges(true);
    
    // Reset save state when user makes changes
    if (saveState !== 'idle') {
      setSaveState('idle');
    }
  }, [localConfig, onConfigChange, saveState]);

  /**
   * Handle save button click.
   */
  const handleSave = useCallback(() => {
    if (validation.isValid && hasChanges) {
      saveConfiguration();
    }
  }, [validation.isValid, hasChanges, saveConfiguration]);

  /**
   * Handle reset confirmation.
   */
  const handleResetConfirm = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  // ===================================================================
  // RENDER HELPERS
  // ===================================================================

  /**
   * Render configuration field input.
   * 
   * @param section - Section containing the field
   * @param field - Field definition
   */
  const renderField = (section: ConfigSection, field: ConfigField) => {
    const value = localConfig[field.key] as number;
    const fieldValidation = validateField(field, value);
    const hasError = !!fieldValidation.error;
    const hasWarning = !!fieldValidation.warning;

    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center justify-between">
          <label 
            htmlFor={field.key}
            className={`text-sm font-medium ${theme.text}`}
          >
            {field.label}
          </label>
          <span className={`text-xs ${theme.textSecondary}`}>
            {field.unit}
          </span>
        </div>
        
        <div className="relative">
          <input
            id={field.key}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            className={`
              w-full px-3 py-2 rounded-md border transition-colors
              ${theme.input}
              ${hasError 
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                : hasWarning
                ? 'border-yellow-500 focus:border-yellow-500 focus:ring-yellow-500'
                : 'focus:border-orange-500 focus:ring-orange-500'
              }
              focus:outline-none focus:ring-2 focus:ring-opacity-50
            `}
          />
          
          {(hasError || hasWarning) && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <AlertCircle 
                className={`h-4 w-4 ${hasError ? 'text-red-500' : 'text-yellow-500'}`}
              />
            </div>
          )}
        </div>
        
        <p className={`text-xs ${theme.textSecondary}`}>
          {field.description}
        </p>
        
        {hasError && (
          <p className="text-xs text-red-500 flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>{fieldValidation.error}</span>
          </p>
        )}
        
        {hasWarning && !hasError && (
          <p className="text-xs text-yellow-500 flex items-center space-x-1">
            <AlertCircle className="h-3 w-3" />
            <span>{fieldValidation.warning}</span>
          </p>
        )}
      </div>
    );
  };

  /**
   * Render configuration section.
   * 
   * @param section - Section to render
   */
  const renderSection = (section: ConfigSection) => {
    const SectionIcon = section.icon;
    
    return (
      <div key={section.title} className={`${theme.cardBg} rounded-lg border ${theme.border} p-6`}>
        <div className="flex items-center space-x-3 mb-4">
          <SectionIcon className="h-6 w-6 text-orange-400" />
          <div>
            <h3 className={`text-lg font-semibold ${theme.text}`}>
              {section.title}
            </h3>
            <p className={`text-sm ${theme.textSecondary}`}>
              {section.description}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {section.fields.map(field => renderField(section, field))}
        </div>
      </div>
    );
  };

  /**
   * Render save status indicator.
   */
  const renderSaveStatus = () => {
    switch (saveState) {
      case 'saving':
        return (
          <div className="flex items-center space-x-2 text-orange-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Saving...</span>
          </div>
        );
      case 'success':
        return (
          <div className="flex items-center space-x-2 text-green-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">
              Saved {lastSaved && new Date(lastSaved).toLocaleTimeString()}
            </span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center space-x-2 text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Save failed</span>
          </div>
        );
      default:
        return lastSaved ? (
          <span className={`text-sm ${theme.textSecondary}`}>
            Last saved: {new Date(lastSaved).toLocaleTimeString()}
          </span>
        ) : null;
    }
  };

  /**
   * Render reset confirmation dialog.
   */
  const renderResetConfirm = () => {
    if (!showResetConfirm) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${theme.cardBg} rounded-lg border ${theme.border} p-6 max-w-md mx-4`}>
          <h3 className={`text-lg font-semibold ${theme.text} mb-4`}>
            Reset to Defaults
          </h3>
          <p className={`text-sm ${theme.textSecondary} mb-6`}>
            This will reset all configuration values to their default settings. Any unsaved changes will be lost.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={resetToDefaults}
              className={`flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors`}
            >
              Reset to Defaults
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className={`flex-1 px-4 py-2 ${theme.button} rounded-lg transition-colors`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===================================================================
  // MAIN RENDER
  // ===================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-orange-400" />
            <div>
              <h2 className={`text-xl font-bold ${theme.text}`}>
                Configuration Settings
              </h2>
              <p className={`text-sm ${theme.textSecondary}`}>
                Customize labor rates, equipment costs, and moisture targets
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {renderSaveStatus()}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={handleResetConfirm}
            disabled={isLoading}
            className={`
              flex items-center space-x-2 px-4 py-2 border border-red-500 text-red-500 
              hover:bg-red-500 hover:text-white rounded-lg transition-colors
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset to Defaults</span>
          </button>
          
          <button
            onClick={handleSave}
            disabled={!hasChanges || !validation.isValid || isLoading || saveState === 'saving'}
            className={`
              flex items-center space-x-2 px-6 py-2 rounded-lg transition-colors
              ${hasChanges && validation.isValid && !isLoading
                ? `${theme.accentBg} ${theme.accentHover} text-white`
                : `${theme.button} opacity-50 cursor-not-allowed`
              }
            `}
          >
            <Save className="h-4 w-4" />
            <span>
              {saveState === 'saving' ? 'Saving...' : 'Save Configuration'}
            </span>
          </button>
        </div>
      </div>

      {/* Validation Summary */}
      {!validation.isValid && (
        <div className={`p-4 bg-red-900/20 border border-red-800 rounded-lg`}>
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-red-400 font-medium">Configuration Errors</h4>
              <p className={`text-sm ${theme.textSecondary} mt-1`}>
                Please correct the following errors before saving:
              </p>
              <ul className={`text-sm ${theme.textSecondary} mt-2 space-y-1`}>
                {Object.values(validation.errors).map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Sections */}
      <div className="space-y-6">
        {CONFIG_SECTIONS.map(renderSection)}
      </div>

      {/* Reset Confirmation Dialog */}
      {renderResetConfirm()}
    </div>
  );
};

export default ConfigurationPanel;
