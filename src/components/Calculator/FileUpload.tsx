/**
 * DamageScan File Upload Component
 * 
 * Handles CSV file upload with drag & drop, validation, and API integration.
 * Provides comprehensive error handling and progress feedback.
 * 
 * @fileoverview Production-ready file upload with real-time validation
 * @version 1.0.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, AlertCircle, CheckCircle, X, RotateCcw, Loader2 } from 'lucide-react';

import type {
  ThemeConfig,
  CalculationResults,
  CSVProcessResponse,
  ValidationError,
  UploadProgress,
  ApiResponse
} from '../../lib/types';

// ===================================================================
// COMPONENT TYPES AND INTERFACES
// ===================================================================

/**
 * File upload component props.
 */
interface FileUploadProps {
  /** Callback when calculation results are available */
  onResults: (results: CalculationResults) => void;
  /** Callback when an error occurs */
  onError: (error: string) => void;
  /** Whether the component is disabled */
  isDisabled?: boolean;
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Theme configuration for styling */
  theme: ThemeConfig;
}

/**
 * Upload state enumeration for clear state management.
 */
type UploadState = 
  | 'idle'           // No file selected
  | 'validating'     // Client-side validation in progress
  | 'uploading'      // File upload in progress
  | 'processing'     // Server-side processing in progress
  | 'success'        // Upload and processing completed successfully
  | 'error';         // Error occurred during upload or processing

/**
 * File validation result.
 */
interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Upload error details for comprehensive error handling.
 */
interface UploadError {
  type: 'file' | 'network' | 'validation' | 'processing';
  message: string;
  details?: ValidationError[];
  canRetry: boolean;
}

// ===================================================================
// CONSTANTS AND CONFIGURATION
// ===================================================================

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB in bytes
  ALLOWED_EXTENSIONS: ['.csv', '.txt'],
  ALLOWED_MIME_TYPES: ['text/csv', 'text/plain', 'application/csv'],
  CHUNK_SIZE: 1024 * 1024, // 1MB chunks for progress tracking
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
} as const;

/**
 * Required CSV headers for validation.
 */
const REQUIRED_CSV_HEADERS = [
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
] as const;

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Format file size for display.
 * 
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get authentication token from localStorage.
 * In a real implementation, this would come from auth context.
 * 
 * @returns Bearer token or null if not available
 */
function getAuthToken(): string | null {
  // TODO: Replace with actual auth context implementation
  // For now, return null and handle auth errors gracefully
  return null;
}

/**
 * Validate file before upload.
 * 
 * @param file - File to validate
 * @param maxSize - Maximum allowed file size
 * @returns Validation result
 */
function validateFile(file: File, maxSize: number): FileValidationResult {
  const warnings: string[] = [];

  // Check if file exists
  if (!file) {
    return {
      isValid: false,
      error: 'No file selected'
    };
  }

  // Check file size
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File size ${formatFileSize(file.size)} exceeds maximum allowed size of ${formatFileSize(maxSize)}`
    };
  }

  // Check file size warning threshold (80% of max)
  if (file.size > maxSize * 0.8) {
    warnings.push(`Large file detected (${formatFileSize(file.size)}). Processing may take longer.`);
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = DEFAULT_CONFIG.ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    return {
      isValid: false,
      error: `Invalid file type. Allowed types: ${DEFAULT_CONFIG.ALLOWED_EXTENSIONS.join(', ')}`
    };
  }

  // Check MIME type if available
  if (file.type && !DEFAULT_CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
    warnings.push('File MIME type not recognized as CSV. Proceeding with content validation.');
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Perform basic CSV structure validation.
 * 
 * @param content - CSV file content
 * @returns Validation result with header check
 */
function validateCSVStructure(content: string): FileValidationResult {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return {
      isValid: false,
      error: 'CSV file must contain at least a header row and one data row'
    };
  }

  // Parse header row
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  
  // Check for required headers
  const missingHeaders = REQUIRED_CSV_HEADERS.filter(required => 
    !headers.includes(required.toLowerCase())
  );

  if (missingHeaders.length > 0) {
    return {
      isValid: false,
      error: `Missing required columns: ${missingHeaders.slice(0, 5).join(', ')}${missingHeaders.length > 5 ? ` and ${missingHeaders.length - 5} more` : ''}`
    };
  }

  const warnings: string[] = [];
  
  // Check data row count
  const dataRows = lines.length - 1;
  if (dataRows > 100) {
    warnings.push(`Large dataset detected (${dataRows} rooms). Processing may take several minutes.`);
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

/**
 * File upload component for CSV processing.
 */
export const FileUpload: React.FC<FileUploadProps> = ({
  onResults,
  onError,
  isDisabled = false,
  maxFileSize = DEFAULT_CONFIG.MAX_FILE_SIZE,
  theme
}) => {
  // ===================================================================
  // STATE MANAGEMENT
  // ===================================================================

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
    status: 'uploading'
  });
  const [error, setError] = useState<UploadError | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  // Refs for DOM elements
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ===================================================================
  // FILE UPLOAD LOGIC
  // ===================================================================

  /**
   * Upload file to API with progress tracking.
   * 
   * @param file - File to upload
   * @returns Promise resolving to API response
   */
  const uploadFile = useCallback(async (file: File): Promise<CSVProcessResponse> => {
    const formData = new FormData();
    formData.append('csv', file);

    // Get authentication token
    const token = getAuthToken();
    const headers: HeadersInit = {
      // Don't set Content-Type - let browser set it with boundary for FormData
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Create XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100);
          setUploadProgress({
            loaded: event.loaded,
            total: event.total,
            percentage,
            status: 'uploading'
          });
        }
      });

      // Handle response
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText) as ApiResponse<CSVProcessResponse>;
            if (response.success && response.data) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Upload failed'));
            }
          } catch (error) {
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            const errorResponse = JSON.parse(xhr.responseText) as ApiResponse;
            reject(new Error(errorResponse.error || `HTTP ${xhr.status}: ${xhr.statusText}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        }
      });

      // Handle network errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error occurred during upload'));
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });

      // Configure and send request
      xhr.open('POST', '/api/csv/process');
      
      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.timeout = 300000; // 5 minute timeout
      xhr.send(formData);
    });
  }, []);

  /**
   * Process uploaded file with comprehensive error handling.
   * 
   * @param file - File to process
   */
  const processFile = useCallback(async (file: File) => {
    try {
      setError(null);
      setWarnings([]);

      // Client-side validation
      setUploadState('validating');
      const fileValidation = validateFile(file, maxFileSize);
      
      if (!fileValidation.isValid) {
        setError({
          type: 'file',
          message: fileValidation.error!,
          canRetry: false
        });
        setUploadState('error');
        return;
      }

      // Set warnings if any
      if (fileValidation.warnings) {
        setWarnings(fileValidation.warnings);
      }

      // Read file for structure validation
      const content = await file.text();
      const structureValidation = validateCSVStructure(content);
      
      if (!structureValidation.isValid) {
        setError({
          type: 'validation',
          message: structureValidation.error!,
          canRetry: false
        });
        setUploadState('error');
        return;
      }

      // Add structure warnings
      if (structureValidation.warnings) {
        setWarnings(prev => [...prev, ...structureValidation.warnings!]);
      }

      // Upload file
      setUploadState('uploading');
      setUploadProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'uploading'
      });

      const response = await uploadFile(file);

      // Switch to processing state
      setUploadState('processing');
      setUploadProgress(prev => ({
        ...prev,
        status: 'processing',
        percentage: 100
      }));

      // Handle API response
      if (response.success && response.results) {
        setUploadState('success');
        onResults(response.results);

        // Show processing warnings/errors if any
        if (response.errors && response.errors.length > 0) {
          setWarnings(prev => [
            ...prev,
            `${response.errors.length} row validation ${response.errors.length === 1 ? 'error' : 'errors'} detected`,
            ...(response.skipped > 0 ? [`${response.skipped} rows skipped due to validation errors`] : [])
          ]);
        }
      } else {
        throw new Error('Invalid response structure');
      }

    } catch (err) {
      console.error('File processing failed:', err);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      
      // Categorize error types
      let errorType: UploadError['type'] = 'processing';
      let canRetry = true;

      if (errorMessage.includes('Network') || errorMessage.includes('timeout')) {
        errorType = 'network';
      } else if (errorMessage.includes('validation') || errorMessage.includes('column')) {
        errorType = 'validation';
        canRetry = false;
      } else if (errorMessage.includes('HTTP 4')) {
        errorType = 'validation';
        canRetry = false;
      }

      setError({
        type: errorType,
        message: errorMessage,
        canRetry
      });
      setUploadState('error');
      onError(errorMessage);
    }
  }, [maxFileSize, uploadFile, onResults, onError]);

  // ===================================================================
  // EVENT HANDLERS
  // ===================================================================

  /**
   * Handle file selection from input or drag & drop.
   * 
   * @param file - Selected file
   */
  const handleFileSelect = useCallback((file: File) => {
    if (isDisabled || uploadState === 'uploading' || uploadState === 'processing') {
      return;
    }

    setSelectedFile(file);
    setRetryCount(0);
    processFile(file);
  }, [isDisabled, uploadState, processFile]);

  /**
   * Handle file input change.
   * 
   * @param event - Input change event
   */
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  /**
   * Handle drag over event.
   * 
   * @param event - Drag event
   */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (isDisabled || uploadState === 'uploading' || uploadState === 'processing') {
      return;
    }

    event.dataTransfer.dropEffect = 'copy';
  }, [isDisabled, uploadState]);

  /**
   * Handle file drop.
   * 
   * @param event - Drop event
   */
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (isDisabled || uploadState === 'uploading' || uploadState === 'processing') {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    const file = files[0];
    
    if (file) {
      handleFileSelect(file);
    }
  }, [isDisabled, uploadState, handleFileSelect]);

  /**
   * Handle retry button click.
   */
  const handleRetry = useCallback(() => {
    if (selectedFile && retryCount < DEFAULT_CONFIG.RETRY_ATTEMPTS) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        processFile(selectedFile);
      }, DEFAULT_CONFIG.RETRY_DELAY);
    }
  }, [selectedFile, retryCount, processFile]);

  /**
   * Handle file replacement.
   */
  const handleReplace = useCallback(() => {
    setSelectedFile(null);
    setUploadState('idle');
    setError(null);
    setWarnings([]);
    setRetryCount(0);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Handle click to open file dialog.
   */
  const handleClick = useCallback(() => {
    if (isDisabled || uploadState === 'uploading' || uploadState === 'processing') {
      return;
    }
    
    fileInputRef.current?.click();
  }, [isDisabled, uploadState]);

  // ===================================================================
  // RENDER HELPERS
  // ===================================================================

  /**
   * Render upload status icon based on current state.
   */
  const renderStatusIcon = () => {
    switch (uploadState) {
      case 'validating':
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-8 w-8 text-orange-400 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-400" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-400" />;
      default:
        return <Upload className="h-8 w-8 text-orange-400" />;
    }
  };

  /**
   * Render status message based on current state.
   */
  const renderStatusMessage = () => {
    switch (uploadState) {
      case 'validating':
        return (
          <div>
            <p className={`text-lg font-semibold ${theme.text}`}>Validating File...</p>
            <p className={`text-sm ${theme.textSecondary}`}>Checking file format and structure</p>
          </div>
        );
      case 'uploading':
        return (
          <div>
            <p className={`text-lg font-semibold ${theme.text}`}>Uploading File...</p>
            <p className={`text-sm ${theme.textSecondary}`}>
              {uploadProgress.percentage}% complete ({formatFileSize(uploadProgress.loaded)} of {formatFileSize(uploadProgress.total)})
            </p>
          </div>
        );
      case 'processing':
        return (
          <div>
            <p className={`text-lg font-semibold ${theme.text}`}>Processing Data...</p>
            <p className={`text-sm ${theme.textSecondary}`}>Calculating water damage restoration costs</p>
          </div>
        );
      case 'success':
        return (
          <div>
            <p className={`text-lg font-semibold text-green-400`}>Processing Complete!</p>
            <p className={`text-sm ${theme.textSecondary}`}>
              {selectedFile && `${selectedFile.name} (${formatFileSize(selectedFile.size)})`}
            </p>
          </div>
        );
      case 'error':
        return (
          <div>
            <p className={`text-lg font-semibold text-red-400`}>Upload Failed</p>
            <p className={`text-sm ${theme.textSecondary}`}>
              {selectedFile && `${selectedFile.name} (${formatFileSize(selectedFile.size)})`}
            </p>
          </div>
        );
      default:
        return (
          <div>
            <p className={`text-lg font-semibold ${theme.text}`}>Upload CSV Assessment Data</p>
            <p className={`text-sm ${theme.textSecondary}`}>
              Drop your CSV file here or click to browse (max {formatFileSize(maxFileSize)})
            </p>
          </div>
        );
    }
  };

  /**
   * Render progress bar for upload and processing states.
   */
  const renderProgressBar = () => {
    if (!['uploading', 'processing'].includes(uploadState)) {
      return null;
    }

    return (
      <div className="w-full mt-4">
        <div className={`w-full bg-gray-200 rounded-full h-2 ${theme.border}`}>
          <div 
            className="bg-orange-400 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress.percentage}%` }}
          />
        </div>
      </div>
    );
  };

  /**
   * Render error message with retry option.
   */
  const renderError = () => {
    if (!error) return null;

    return (
      <div className={`mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg`}>
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-red-400 font-medium">Upload Error</h4>
            <p className={`text-sm ${theme.textSecondary} mt-1`}>{error.message}</p>
            
            {error.canRetry && retryCount < DEFAULT_CONFIG.RETRY_ATTEMPTS && (
              <button
                onClick={handleRetry}
                className="mt-2 inline-flex items-center space-x-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Retry ({DEFAULT_CONFIG.RETRY_ATTEMPTS - retryCount} attempts remaining)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render warnings if any.
   */
  const renderWarnings = () => {
    if (warnings.length === 0) return null;

    return (
      <div className={`mt-4 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg`}>
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-yellow-400 font-medium">Processing Warnings</h4>
            <ul className={`text-sm ${theme.textSecondary} mt-1 space-y-1`}>
              {warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render action buttons based on current state.
   */
  const renderActionButtons = () => {
    if (uploadState === 'success' || uploadState === 'error') {
      return (
        <div className="mt-6 flex space-x-3">
          <button
            onClick={handleReplace}
            className={`flex items-center space-x-2 px-4 py-2 ${theme.button} rounded-lg transition-colors`}
          >
            <Upload className="h-4 w-4" />
            <span>Upload Different File</span>
          </button>
          
          {uploadState === 'error' && error?.canRetry && retryCount < DEFAULT_CONFIG.RETRY_ATTEMPTS && (
            <button
              onClick={handleRetry}
              className={`flex items-center space-x-2 px-4 py-2 ${theme.accentBg} ${theme.accentHover} text-white rounded-lg transition-colors`}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Upload</span>
            </button>
          )}
        </div>
      );
    }

    return null;
  };

  // ===================================================================
  // MAIN RENDER
  // ===================================================================

  return (
    <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-xl font-bold ${theme.text} flex items-center`}>
          <File className="h-6 w-6 mr-2 text-orange-400" />
          CSV Data Upload
        </h2>
        
        {selectedFile && uploadState !== 'idle' && (
          <button
            onClick={handleReplace}
            className={`p-2 ${theme.button} rounded-lg transition-colors`}
            title="Clear and upload new file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer
          ${uploadState === 'idle' ? `${theme.border} hover:border-orange-400 hover:bg-orange-400/5` : theme.border}
          ${isDisabled || ['uploading', 'processing'].includes(uploadState) ? 'cursor-not-allowed opacity-50' : ''}
        `}
      >
        {/* Status Icon */}
        <div className="flex justify-center mb-4">
          {renderStatusIcon()}
        </div>

        {/* Status Message */}
        {renderStatusMessage()}

        {/* Progress Bar */}
        {renderProgressBar()}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileInputChange}
          disabled={isDisabled || ['uploading', 'processing'].includes(uploadState)}
          className="hidden"
        />
      </div>

      {/* Error Display */}
      {renderError()}

      {/* Warnings Display */}
      {renderWarnings()}

      {/* Action Buttons */}
      {renderActionButtons()}

      {/* File Requirements */}
      <div className={`mt-6 p-4 ${theme.bg} rounded-lg border ${theme.border}`}>
        <h4 className={`text-sm font-medium ${theme.text} mb-2`}>File Requirements:</h4>
        <ul className={`text-xs ${theme.textSecondary} space-y-1`}>
          <li>• CSV format with all 41 required columns</li>
          <li>• Maximum file size: {formatFileSize(maxFileSize)}</li>
          <li>• Each row must represent a single room assessment</li>
          <li>• Required fields: claim_id, room_id, room_name, room_sf, water_category, water_class</li>
        </ul>
      </div>
    </div>
  );
};

export default FileUpload;
