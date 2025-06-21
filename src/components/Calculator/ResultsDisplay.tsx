/**
 * DamageScan Results Display Component
 * 
 * Displays calculation results with room navigation, project summaries, and detailed breakdowns.
 * Includes charts, equipment lists, cost analysis, and export functionality.
 * 
 * @fileoverview Production-ready results display with comprehensive data visualization
 * @version 1.0.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  FileText, Calculator, DollarSign, Clock, Zap, MapPin, Download, 
  ChevronDown, Building, Users, Wrench, AlertTriangle, TrendingUp,
  BarChart3, PieChart as PieChartIcon, Grid, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line
} from 'recharts';

import type {
  ThemeConfig,
  CalculationResults,
  RoomResult,
  ProjectSummary,
  FleetRequirements,
  LaborOptimization
} from '../../lib/types';

// ===================================================================
// COMPONENT TYPES AND INTERFACES
// ===================================================================

/**
 * Results display component props.
 */
interface ResultsDisplayProps {
  /** Calculation results to display */
  results: CalculationResults;
  /** Currently selected room index (-1 for site summary) */
  selectedRoom: number;
  /** Callback when room selection changes */
  onRoomSelect: (roomIndex: number) => void;
  /** Callback to export results to CSV */
  onExportCSV: () => void;
  /** Callback to export results to PDF */
  onPrintPDF: () => void;
  /** Theme configuration for styling */
  theme: ThemeConfig;
}

/**
 * Chart data point interface.
 */
interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
  [key: string]: any;
}

/**
 * Summary card data interface.
 */
interface SummaryCard {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

// ===================================================================
// CONSTANTS AND CONFIGURATION
// ===================================================================

/**
 * Colors for charts and visualizations.
 */
const CHART_COLORS = [
  '#FF6B35', // Orange (primary)
  '#3B82F6', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#6B7280', // Gray
  '#14B8A6'  // Teal
] as const;

/**
 * Default chart configuration.
 */
const CHART_CONFIG = {
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
  fontSize: 12
} as const;

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Format currency values for display.
 * 
 * @param value - Numeric value to format
 * @param includeSymbol - Whether to include dollar sign
 * @returns Formatted currency string
 */
function formatCurrency(value: number, includeSymbol: boolean = true): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: includeSymbol ? 'currency' : 'decimal',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
  
  return formatted;
}

/**
 * Format percentage values for display.
 * 
 * @param value - Decimal value (0.15 = 15%)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Generate chart data for cost breakdown.
 * 
 * @param room - Room result data
 * @returns Chart data points
 */
function generateCostBreakdownData(room: RoomResult): ChartDataPoint[] {
  return [
    {
      name: 'Labor',
      value: room.costs.labor.total_labor,
      color: CHART_COLORS[0]
    },
    {
      name: 'Equipment',
      value: room.costs.equipment.total_equipment,
      color: CHART_COLORS[1]
    },
    {
      name: 'Materials',
      value: room.costs.materials.total_materials,
      color: CHART_COLORS[2]
    }
  ];
}

/**
 * Generate chart data for equipment distribution.
 * 
 * @param fleet - Fleet requirements data
 * @returns Chart data points
 */
function generateEquipmentDistributionData(fleet: FleetRequirements): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  
  if (fleet.large_dehumidifiers > 0) {
    data.push({
      name: 'Large Dehumidifiers',
      value: fleet.large_dehumidifiers,
      color: CHART_COLORS[0]
    });
  }
  
  if (fleet.standard_dehumidifiers > 0) {
    data.push({
      name: 'Standard Dehumidifiers',
      value: fleet.standard_dehumidifiers,
      color: CHART_COLORS[1]
    });
  }
  
  if (fleet.air_movers > 0) {
    data.push({
      name: 'Air Movers',
      value: fleet.air_movers,
      color: CHART_COLORS[2]
    });
  }
  
  if (fleet.heaters > 0) {
    data.push({
      name: 'Heaters',
      value: fleet.heaters,
      color: CHART_COLORS[3]
    });
  }
  
  if (fleet.air_scrubbers > 0) {
    data.push({
      name: 'Air Scrubbers',
      value: fleet.air_scrubbers,
      color: CHART_COLORS[4]
    });
  }
  
  if (fleet.injection_systems > 0) {
    data.push({
      name: 'Injection Systems',
      value: fleet.injection_systems,
      color: CHART_COLORS[5]
    });
  }
  
  if (fleet.generators > 0) {
    data.push({
      name: 'Generators',
      value: fleet.generators,
      color: CHART_COLORS[6]
    });
  }
  
  return data;
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

/**
 * Results display component for calculation results.
 */
export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  selectedRoom,
  onRoomSelect,
  onExportCSV,
  onPrintPDF,
  theme
}) => {
  // ===================================================================
  // STATE MANAGEMENT
  // ===================================================================

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  // ===================================================================
  // COMPUTED VALUES
  // ===================================================================

  /**
   * Current room data (null for site summary).
   */
  const currentRoom = useMemo(() => {
    return selectedRoom >= 0 ? results.rooms[selectedRoom] : null;
  }, [results.rooms, selectedRoom]);

  /**
   * Summary cards data for project overview.
   */
  const summaryCards = useMemo((): SummaryCard[] => {
    const project = results.project;
    
    return [
      {
        title: 'Total Project Cost',
        value: formatCurrency(project.total_cost),
        subtitle: `${formatCurrency(project.average_cost_per_sf)}/sq ft`,
        icon: DollarSign,
        color: 'text-blue-400',
        trend: {
          value: formatCurrency(project.total_cost - project.optimized_total_cost) + ' saved',
          isPositive: true
        }
      },
      {
        title: 'Project Timeline',
        value: `${project.longest_timeline} days`,
        subtitle: `${project.room_count} rooms`,
        icon: Clock,
        color: 'text-green-400'
      },
      {
        title: 'Total Equipment',
        value: `${project.total_equipment_units} units`,
        subtitle: `${project.total_amperage}A total load`,
        icon: Zap,
        color: 'text-purple-400'
      },
      {
        title: 'Project Area',
        value: `${project.total_affected_sf.toLocaleString()} sq ft`,
        subtitle: `${project.room_count} rooms affected`,
        icon: Building,
        color: 'text-orange-400'
      }
    ];
  }, [results.project]);

  /**
   * Room comparison data for charts.
   */
  const roomComparisonData = useMemo(() => {
    return results.rooms.map((room, index) => ({
      name: room.room_name || `Room ${room.room_id}`,
      cost: room.costs.total_room_cost,
      equipment: room.equipment.total_units,
      timeline: room.timeline.estimated_days,
      area: room.room_sf
    }));
  }, [results.rooms]);

  // ===================================================================
  // EVENT HANDLERS
  // ===================================================================

  /**
   * Toggle expanded section state.
   * 
   * @param sectionId - Section identifier
   */
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // ===================================================================
  // RENDER HELPERS
  // ===================================================================

  /**
   * Render navigation header with room selection.
   */
  const renderNavigation = () => {
    return (
      <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 mb-6 border ${theme.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Calculator className="h-6 w-6 text-orange-400" />
            <h1 className={`text-2xl font-bold ${theme.text}`}>
              Calculation Results
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Room Selection */}
            <div className="relative">
              <label className={`block text-sm font-medium ${theme.textSecondary} mb-1`}>
                View:
              </label>
              <select
                value={selectedRoom}
                onChange={(e) => onRoomSelect(parseInt(e.target.value))}
                className={`
                  px-4 py-2 pr-8 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500
                  ${theme.input} appearance-none cursor-pointer
                `}
              >
                <option value={-1}>Site Summary</option>
                {results.rooms.map((room, index) => (
                  <option key={index} value={index}>
                    {room.room_name || `Room ${room.room_id}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-9 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            
            {/* Export Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={onExportCSV}
                className={`
                  flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                  text-white rounded-lg transition-colors
                `}
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={onPrintPDF}
                className={`
                  flex items-center space-x-2 px-4 py-2 ${theme.accentBg} ${theme.accentHover} 
                  text-white rounded-lg transition-colors
                `}
              >
                <FileText className="h-4 w-4" />
                <span>Print Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render summary cards for project overview.
   */
  const renderSummaryCards = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {summaryCards.map((card, index) => {
          const IconComponent = card.icon;
          return (
            <div key={index} className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <IconComponent className={`h-8 w-8 ${card.color}`} />
                  <div>
                    <p className={`text-sm font-medium ${theme.textSecondary}`}>
                      {card.title}
                    </p>
                    <p className={`text-2xl font-bold ${theme.text}`}>
                      {card.value}
                    </p>
                    <p className={`text-sm ${theme.textSecondary}`}>
                      {card.subtitle}
                    </p>
                  </div>
                </div>
              </div>
              
              {card.trend && (
                <div className="mt-4 flex items-center space-x-2">
                  <TrendingUp className={`h-4 w-4 ${card.trend.isPositive ? 'text-green-400' : 'text-red-400'}`} />
                  <span className={`text-sm ${card.trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {card.trend.value}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * Render project-level charts and summaries.
   */
  const renderProjectSummary = () => {
    const equipmentData = generateEquipmentDistributionData(results.project.fleet_requirements);
    
    return (
      <div className="space-y-6">
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost by Room Chart */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h3 className={`text-lg font-semibold ${theme.text} mb-4 flex items-center`}>
              <BarChart3 className="h-5 w-5 mr-2 text-orange-400" />
              Cost by Room
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={roomComparisonData} margin={CHART_CONFIG.margin}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border.includes('gray-700') ? '#374151' : '#E5E7EB'} />
                <XAxis 
                  dataKey="name" 
                  stroke={theme.textSecondary.includes('gray-300') ? '#9CA3AF' : '#6B7280'}
                  fontSize={CHART_CONFIG.fontSize}
                />
                <YAxis 
                  stroke={theme.textSecondary.includes('gray-300') ? '#9CA3AF' : '#6B7280'}
                  fontSize={CHART_CONFIG.fontSize}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Cost']}
                  contentStyle={{
                    backgroundColor: theme.cardBg.includes('gray-800') ? '#1F2937' : '#FFFFFF',
                    border: `1px solid ${theme.border.includes('gray-700') ? '#374151' : '#E5E7EB'}`,
                    color: theme.text.includes('gray-100') ? '#F3F4F6' : '#1F2937'
                  }}
                />
                <Bar dataKey="cost" fill={CHART_COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Equipment Distribution Chart */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h3 className={`text-lg font-semibold ${theme.text} mb-4 flex items-center`}>
              <PieChartIcon className="h-5 w-5 mr-2 text-orange-400" />
              Equipment Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={equipmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {equipmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [value, 'Units']}
                  contentStyle={{
                    backgroundColor: theme.cardBg.includes('gray-800') ? '#1F2937' : '#FFFFFF',
                    border: `1px solid ${theme.border.includes('gray-700') ? '#374151' : '#E5E7EB'}`,
                    color: theme.text.includes('gray-100') ? '#F3F4F6' : '#1F2937'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fleet Requirements */}
        <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
          <h3 className={`text-lg font-semibold ${theme.text} mb-4 flex items-center`}>
            <Wrench className="h-5 w-5 mr-2 text-orange-400" />
            Fleet Requirements
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(results.project.fleet_requirements).map(([equipment, count]) => {
              if (equipment === 'total_equipment_units' || count === 0) return null;
              
              const displayName = equipment.replace(/_/g, ' ').replace(/s$/, '');
              return (
                <div key={equipment} className={`text-center p-4 ${theme.bg} rounded-lg border ${theme.border}`}>
                  <p className={`text-2xl font-bold text-orange-400`}>{count}</p>
                  <p className={`text-sm ${theme.textSecondary} capitalize`}>
                    {displayName}{count !== 1 ? 's' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Labor Optimization */}
        {results.project.labor_optimization.savings > 0 && (
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h3 className={`text-lg font-semibold ${theme.text} mb-4 flex items-center`}>
              <Users className="h-5 w-5 mr-2 text-orange-400" />
              Labor Optimization
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className={`text-3xl font-bold text-green-400`}>
                  {formatCurrency(results.project.labor_optimization.savings)}
                </p>
                <p className={`text-sm ${theme.textSecondary}`}>Total Savings</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${theme.text}`}>
                  {formatCurrency(results.project.labor_optimization.supervision_savings)}
                </p>
                <p className={`text-sm ${theme.textSecondary}`}>Supervision Savings</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${theme.text}`}>
                  {formatCurrency(results.project.labor_optimization.setup_breakdown_savings)}
                </p>
                <p className={`text-sm ${theme.textSecondary}`}>Setup/Breakdown Savings</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /**
   * Render individual room details.
   */
  const renderRoomDetails = () => {
    if (!currentRoom) return null;

    const costBreakdownData = generateCostBreakdownData(currentRoom);

    return (
      <div className="space-y-6">
        {/* Room Header */}
        <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold ${theme.text}`}>
                {currentRoom.room_name || `Room ${currentRoom.room_id}`}
              </h2>
              <p className={`text-lg ${theme.textSecondary}`}>
                {currentRoom.room_sf} sq ft
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-orange-400">
                {formatCurrency(currentRoom.costs.total_room_cost)}
              </p>
              <p className={`${theme.textSecondary}`}>
                {formatCurrency(currentRoom.costs.cost_per_sqft)}/sq ft
              </p>
            </div>
          </div>
        </div>

        {/* Room Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost Breakdown Chart */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h3 className={`text-lg font-semibold ${theme.text} mb-4`}>Cost Breakdown</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Cost']}
                  contentStyle={{
                    backgroundColor: theme.cardBg.includes('gray-800') ? '#1F2937' : '#FFFFFF',
                    border: `1px solid ${theme.border.includes('gray-700') ? '#374151' : '#E5E7EB'}`,
                    color: theme.text.includes('gray-100') ? '#F3F4F6' : '#1F2937'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Equipment List */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h3 className={`text-lg font-semibold ${theme.text} mb-4`}>Equipment Required</h3>
            <div className="space-y-3">
              {currentRoom.equipment.large_units > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Large Dehumidifiers</span>
                  <span className="font-semibold text-orange-400">{currentRoom.equipment.large_units}</span>
                </div>
              )}
              {currentRoom.equipment.standard_units > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Standard Dehumidifiers</span>
                  <span className="font-semibold text-orange-400">{currentRoom.equipment.standard_units}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Air Movers</span>
                <span className="font-semibold text-orange-400">{currentRoom.equipment.air_movers}</span>
              </div>
              {currentRoom.equipment.heaters > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Heaters</span>
                  <span className="font-semibold text-orange-400">{currentRoom.equipment.heaters}</span>
                </div>
              )}
              {currentRoom.equipment.air_scrubbers > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Air Scrubbers</span>
                  <span className="font-semibold text-orange-400">{currentRoom.equipment.air_scrubbers}</span>
                </div>
              )}
              {currentRoom.equipment.injection_systems > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Injection Systems</span>
                  <span className="font-semibold text-orange-400">{currentRoom.equipment.injection_systems}</span>
                </div>
              )}
              <div className={`pt-3 border-t ${theme.border}`}>
                <div className="flex justify-between">
                  <span className={`font-semibold ${theme.text}`}>Total Equipment</span>
                  <span className="font-bold text-orange-400">{currentRoom.equipment.total_units}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Labor Breakdown */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h4 className={`font-semibold ${theme.text} mb-3`}>Labor Costs</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Technician ({currentRoom.costs.labor.tech_hours}h)</span>
                <span>{formatCurrency(currentRoom.costs.labor.tech_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Supervisor ({currentRoom.costs.labor.supervisor_hours}h)</span>
                <span>{formatCurrency(currentRoom.costs.labor.supervisor_cost)}</span>
              </div>
              {currentRoom.costs.labor.specialist_hours > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Specialist ({currentRoom.costs.labor.specialist_hours}h)</span>
                  <span>{formatCurrency(currentRoom.costs.labor.specialist_cost)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Project Management</span>
                <span>{formatCurrency(currentRoom.costs.labor.project_management)}</span>
              </div>
              <div className={`pt-2 border-t ${theme.border}`}>
                <div className="flex justify-between font-semibold">
                  <span className={theme.text}>Total Labor</span>
                  <span className="text-orange-400">{formatCurrency(currentRoom.costs.labor.total_labor)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline & Electrical */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h4 className={`font-semibold ${theme.text} mb-3`}>Timeline & Electrical</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Estimated Timeline</span>
                <span className="font-semibold text-orange-400">{currentRoom.timeline.estimated_days} days</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Daily Monitoring</span>
                <span>{currentRoom.timeline.daily_monitoring_hours}h/day</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Total Amperage</span>
                <span>{currentRoom.electrical.total_amperage}A</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>20A Circuits</span>
                <span>{currentRoom.electrical.circuits_20a_required}</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>15A Circuits</span>
                <span>{currentRoom.electrical.circuits_15a_required}</span>
              </div>
              <div className="flex justify-between">
                <span className={theme.textSecondary}>Daily kWh</span>
                <span>{currentRoom.electrical.daily_kwh.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Materials */}
          <div className={`${theme.cardBg} rounded-lg shadow-lg p-6 border ${theme.border}`}>
            <h4 className={`font-semibold ${theme.text} mb-3`}>Materials</h4>
            <div className="space-y-2 text-sm">
              {currentRoom.materials.floor.affected_sqft > 0 && (
                <div>
                  <div className="flex justify-between">
                    <span className={theme.textSecondary}>Floor Treatment</span>
                    <span>{formatCurrency(currentRoom.costs.materials.floor_treatment)}</span>
                  </div>
                  <p className={`text-xs ${theme.textSecondary} mt-1`}>
                    {currentRoom.materials.floor.material_type} ({currentRoom.materials.floor.affected_sqft} sq ft)
                  </p>
                </div>
              )}
              {currentRoom.materials.wall.affected_sqft > 0 && (
                <div>
                  <div className="flex justify-between">
                    <span className={theme.textSecondary}>Wall Treatment</span>
                    <span>{formatCurrency(currentRoom.costs.materials.wall_treatment)}</span>
                  </div>
                  <p className={`text-xs ${theme.textSecondary} mt-1`}>
                    {currentRoom.materials.wall.material_type} ({currentRoom.materials.wall.affected_sqft} sq ft)
                  </p>
                </div>
              )}
              {currentRoom.costs.materials.disposal > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Disposal</span>
                  <span>{formatCurrency(currentRoom.costs.materials.disposal)}</span>
                </div>
              )}
              {currentRoom.costs.materials.antimicrobial > 0 && (
                <div className="flex justify-between">
                  <span className={theme.textSecondary}>Antimicrobial</span>
                  <span>{formatCurrency(currentRoom.costs.materials.antimicrobial)}</span>
                </div>
              )}
            </div>
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
      {/* Navigation */}
      {renderNavigation()}

      {/* Content based on selection */}
      {selectedRoom === -1 ? (
        <>
          {/* Site Summary */}
          {renderSummaryCards()}
          {renderProjectSummary()}
        </>
      ) : (
        <>
          {/* Individual Room Details */}
          {renderRoomDetails()}
        </>
      )}
    </div>
  );
};

export default ResultsDisplay;
