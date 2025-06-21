# DamageScan
## Water Damage Restoration Cost Estimation System

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-org/damagescan)

DamageScan is a professional-grade water damage restoration cost estimation system built on CDMv23 (Complete Drying Methodology v23) industry standards. The application processes water damage assessment data and generates comprehensive cost estimates, equipment placement plans, and professional reports.

![DamageScan Architecture](https://imagedelivery.net/example/damagescan-preview.png)

---

## ✨ Features

- **📊 CDMv23 Methodology**: Industry-standard Applied Structural Drying calculations
- **🗂️ Batch Processing**: Handle multiple rooms via CSV upload
- **⚙️ Configurable Rates**: 16 customizable parameters for labor and equipment
- **📍 Equipment Placement**: Visual room layouts with collision detection
- **🌪️ Airflow Visualization**: Directional air movement patterns
- **📄 PDF Reports**: Professional documentation with diagrams
- **🌙 Dark Mode**: Modern, responsive interface
- **🔐 Secure**: Cloudflare Access authentication
- **⚡ Edge Computing**: Global deployment on Cloudflare Workers

---

## 🏗️ Architecture Overview

```
Frontend (React + Vite)          Backend (Hono + Workers)          Database (D1)
├── Dark Mode Interface          ├── CSV Processing API            ├── User Configurations
├── Equipment Visualizations     ├── CDMv23 Calculation Engine     └── Rate Settings
├── Airflow Diagrams            ├── PDF Generation API            
├── Configuration Management     └── Auth Middleware               
└── File Upload Interface                                          
```

**Tech Stack:**
- [**React**](https://react.dev/) - Modern UI library with TypeScript
- [**Vite**](https://vite.dev/) - Lightning-fast development and build
- [**Hono**](https://hono.dev/) - Lightweight backend framework
- [**Cloudflare Workers**](https://developers.cloudflare.com/workers/) - Edge computing platform
- [**Cloudflare D1**](https://developers.cloudflare.com/d1/) - Serverless SQLite database
- [**Cloudflare Access**](https://developers.cloudflare.com/cloudflare-one/applications/) - Zero Trust authentication

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/damagescan.git
cd damagescan

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Configure your Cloudflare credentials

# Initialize database
npm run db:migrate

# Start development server
npm run dev
```

Your application will be available at [http://localhost:5173](http://localhost:5173).

---

## 🗄️ Database Schema

### User Configurations Table
```sql
CREATE TABLE user_configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    config_name TEXT NOT NULL DEFAULT 'default',
    
    -- Labor Rates (4 parameters - Hourly USD)
    tech_base REAL DEFAULT 55,                    -- Technician base rate
    supervisor_base REAL DEFAULT 75,              -- Supervisor base rate  
    specialist_base REAL DEFAULT 120,             -- Specialist base rate
    project_management_base REAL DEFAULT 200,     -- PM flat fee
    
    -- Equipment Daily Rates (7 parameters - Daily USD)
    large_dehumidifier_daily REAL DEFAULT 25,     -- LGR dehumidifier
    standard_dehumidifier_daily REAL DEFAULT 15,  -- Standard dehumidifier
    air_mover_daily REAL DEFAULT 8,               -- Air mover
    heater_daily REAL DEFAULT 12,                 -- Heater
    air_scrubber_daily REAL DEFAULT 35,           -- Air scrubber
    injection_system_daily REAL DEFAULT 25,       -- Injection system
    generator_daily REAL DEFAULT 45,              -- Generator
    
    -- Target Moisture Content (5 parameters - Percentage)
    hardwood_target_mc REAL DEFAULT 8,            -- Hardwood target %
    paneling_target_mc REAL DEFAULT 10,           -- Paneling target %
    vinyl_target_mc REAL DEFAULT 2,               -- Vinyl target %
    drywall_target_mc REAL DEFAULT 12,            -- Drywall target %
    carpet_target_mc REAL DEFAULT 5,              -- Carpet target %
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔌 API Documentation

### Authentication
All API endpoints require Cloudflare Access authentication via JWT tokens.

### Endpoints

#### `POST /api/csv/process`
Process uploaded CSV file with water damage assessment data.

**Request:**
```typescript
Content-Type: multipart/form-data
{
  csv: File // CSV file with assessment data
}
```

**Response:**
```typescript
{
  success: boolean,
  results: {
    rooms: RoomResult[],
    project: ProjectSummary
  },
  errors: ValidationError[],
  skipped: number
}
```

#### `GET /api/config`
Retrieve user configuration settings.

**Response:**
```typescript
{
  id: number,
  user_id: string,
  config_name: string,
  // All 16 configuration parameters
  tech_base: number,
  supervisor_base: number,
  // ... remaining parameters
}
```

#### `PUT /api/config`
Save user configuration settings.

**Request:**
```typescript
{
  config_name?: string,
  tech_base?: number,
  supervisor_base?: number,
  // ... any configuration parameters to update
}
```

#### `POST /api/export/pdf`
Generate PDF report for calculated results.

**Request:**
```typescript
{
  project_data: ProjectResults,
  options: {
    include_diagrams: boolean,
    company_logo?: string,
    report_title?: string
  }
}
```

**Response:**
```typescript
Content-Type: application/pdf
// PDF file stream
```

#### `GET /api/health`
Health check endpoint.

**Response:**
```typescript
{
  status: "healthy",
  timestamp: string,
  version: string
}
```

---

## 📄 CSV Format Requirements

### Required Columns (41 total)
```csv
claim_id,site_name,address,city,state,structure,damage_date,assessment_date,damage_description,generator_needed,outdoor_temp_f,outdoor_humidity,outdoor_gpp,loss_source,water_category,water_class,room_id,room_name,room_temp_f,room_humidity,room_gpp,dew_point_f,wet_bulb_f,ceiling_damage,ceiling_materials,ceiling_damage_moisture,wall_damage,wall_materials,wall_damage_moisture_bottom,wall_damage_moisture_middle,wall_damage_moisture_top,wall_damage_sf,floor_materials,floor_materials_moisture,floor_damage_sf,room_sf,length_ft,width_ft,height_ft,volume_ft,room_damage
```

### Sample Data
```csv
claim_id,site_name,address,city,state,structure,damage_date,assessment_date,damage_description,generator_needed,outdoor_temp_f,outdoor_humidity,outdoor_gpp,loss_source,water_category,water_class,room_id,room_name,room_temp_f,room_humidity,room_gpp,dew_point_f,wet_bulb_f,ceiling_damage,ceiling_materials,ceiling_damage_moisture,wall_damage,wall_materials,wall_damage_moisture_bottom,wall_damage_moisture_middle,wall_damage_moisture_top,wall_damage_sf,floor_materials,floor_materials_moisture,floor_damage_sf,room_sf,length_ft,width_ft,height_ft,volume_ft,room_damage
CLM001,Municipal Building,123 Main St,Anytown,FL,Commercial,2024-01-15,2024-01-16,Pipe burst flooding,No,78,65,89,Supply line,2,2,R001,Main Office,72,55,76,58,62,No,,0,Yes,drywall,0.45,0.25,0.15,120,hardwood,0.35,200,400,20,20,10,4000,Significant
```

### Data Validation Rules
- **Water Category**: 1-3 (1=Clean, 2=Grey, 3=Black)
- **Water Class**: 1-4 (1=Minimal, 2=Significant, 3=Major, 4=Specialty)
- **Room SF**: Minimum 50, Maximum 5000
- **Temperature**: 60-100°F range
- **Humidity**: 20-90% range
- **Moisture Content**: 0.05-0.95 (5%-95%)

---

## ⚙️ Configuration Parameters

### Labor Rates (Hourly USD)
| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `tech_base` | $55 | $25-150 | Technician hourly rate |
| `supervisor_base` | $75 | $35-200 | Supervisor hourly rate |
| `specialist_base` | $120 | $75-300 | Specialist hourly rate |
| `project_management_base` | $200 | $100-500 | Project management flat fee |

### Equipment Daily Rates (USD)
| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `large_dehumidifier_daily` | $25 | $15-50 | LGR dehumidifier daily rate |
| `standard_dehumidifier_daily` | $15 | $8-30 | Standard dehumidifier daily rate |
| `air_mover_daily` | $8 | $4-15 | Air mover daily rate |
| `heater_daily` | $12 | $6-25 | Heater daily rate |
| `air_scrubber_daily` | $35 | $20-75 | Air scrubber daily rate |
| `injection_system_daily` | $25 | $15-50 | Injection system daily rate |
| `generator_daily` | $45 | $25-100 | Generator daily rate |

### Target Moisture Content (%)
| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `hardwood_target_mc` | 8% | 6-12% | Hardwood target moisture |
| `paneling_target_mc` | 10% | 8-15% | Paneling target moisture |
| `vinyl_target_mc` | 2% | 1-5% | Vinyl target moisture |
| `drywall_target_mc` | 12% | 10-18% | Drywall target moisture |
| `carpet_target_mc` | 5% | 3-8% | Carpet target moisture |

---

## 🧱 Material Library (39 Materials)

### Material Categories
```typescript
// Drywall Family (5 materials)
"drywall", "gypsum", "gypsum board", "gypsum wallboard", "wallboard"

// Hardwood Family (3 materials)  
"hardwood", "hardwood floors", "wood"

// Paneling Family (2 materials)
"paneling", "wood paneling"

// Vinyl Family (3 materials)
"vinyl", "vinyl sheet", "vct"

// Carpet Family (3 materials)
"carpet", "carpet cushion", "carpet pad"

// Engineered Materials (7 materials)
"engineered", "engineered wood", "engineered floors", "laminate", 
"bamboo", "cork", "parquet"

// Stone/Tile Family (5 materials)
"tile", "stone", "granite", "slate", "engineered marble"

// Concrete (1 material)
"concrete"

// Insulation Family (4 materials)
"insulation", "fiberglass", "mineral wool", "cellulose"

// Engineered Wood Products (4 materials)
"plywood", "osb", "particleboard", "mdf"

// Other Materials (2 materials)
"brick", "wallpaper"
```

### Material Properties
Each material includes:
- **Thickness** (inches): Material depth for volume calculations
- **Cost** ($/sq ft): Treatment cost per square foot
- **Target MC** (%): Target moisture content for drying

---

## 🏗️ Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account with Workers and D1 enabled
- Git

### Environment Configuration
Create `.env.local`:
```bash
# Cloudflare Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
DATABASE_ID=your_d1_database_id

# Authentication
AUTH_DOMAIN=your-app.cloudflareaccess.com
AUTH_AUDIENCE=your-audience-tag

# Application
APP_NAME=DamageScan
APP_VERSION=1.0.0
```

### Database Setup
```bash
# Create D1 database
npx wrangler d1 create damagescan-db

# Run migrations
npm run db:migrate

# Verify setup
npm run db:info
```

### Development Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint
```

---

## 📦 Deployment Guide

### Production Build
```bash
# Build application
npm run build

# Preview build locally
npm run preview
```

### Cloudflare Deployment
```bash
# Deploy to Cloudflare Workers
npm run deploy

# Deploy with environment
npm run deploy:production
```

### Environment Variables Setup
Configure in Cloudflare Dashboard or via Wrangler:
```bash
# Set production variables
npx wrangler secret put DATABASE_ID
npx wrangler secret put AUTH_DOMAIN
npx wrangler secret put AUTH_AUDIENCE
```

### Database Migration
```bash
# Production database setup
npx wrangler d1 execute damagescan-db --file=./migrations/001_initial.sql --env=production
```

---

## 🔧 Development Workflow

### File Structure
```
src/
├── components/           # React components
│   ├── Calculator/       # Core calculation components
│   ├── Visualizations/   # Equipment and airflow diagrams
│   ├── Export/          # PDF generation
│   └── Auth/            # Authentication components
├── api/                 # Backend API routes
│   ├── csv-processor.ts # CSV parsing and validation
│   ├── calculations.ts  # CDMv23 calculation engine
│   ├── configurations.ts# User settings management
│   └── pdf-generator.ts # PDF report generation
├── lib/                 # Shared utilities
│   ├── database.ts      # D1 database client
│   ├── auth.ts          # Authentication helpers
│   └── types.ts         # TypeScript definitions
└── workers/             # Cloudflare Workers entry point
    └── api.ts           # Main API handler
```

### Scripts
```bash
npm run dev              # Development server
npm run build            # Production build
npm run preview          # Preview production build
npm run deploy           # Deploy to Cloudflare
npm run type-check       # TypeScript validation
npm run lint             # ESLint checking
npm run db:migrate       # Run database migrations
npm run db:info          # Database information
npm run test             # Run test suite
```

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with React hooks
- **Prettier**: Automatic code formatting
- **Comments**: JSDoc for functions, inline for complex logic
- **Naming**: PascalCase for components, camelCase for functions/variables

---

## 📊 Performance Considerations

### Optimization Strategies
- **CSV Processing**: Streaming with progress indicators (max 100 rooms)
- **Calculations**: Real-time with 300ms debouncing
- **Visualizations**: Canvas-based rendering with spatial indexing
- **PDF Generation**: Server-side using Workers for consistency
- **Authentication**: JWT tokens cached in Workers KV
- **Rate Limiting**: 5 requests/minute per user

### Monitoring
- Built-in Cloudflare Analytics
- Custom metrics for calculation performance
- Error tracking for CSV processing failures
- User configuration usage patterns

---

## 🔐 Security Features

### Authentication & Authorization
- **Cloudflare Access**: Zero Trust authentication
- **JWT Validation**: Server-side token verification
- **Single User**: No multi-tenant data isolation needed
- **Rate Limiting**: API endpoint protection

### Data Protection
- **Input Validation**: Comprehensive CSV sanitization
- **SQL Injection Prevention**: Prepared statements only
- **XSS Protection**: React built-in escaping
- **CORS**: Cloudflare-managed cross-origin policies

---

## 🆘 Troubleshooting

### Common Issues

#### CSV Upload Fails
```bash
# Check file format and size
- Ensure CSV headers match exactly
- Verify file size < 10MB
- Check for special characters in data
```

#### Configuration Not Saving
```bash
# Verify database connection
npm run db:info

# Check authentication token
npx wrangler auth whoami
```

#### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npm run type-check
```

### Support Resources
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Framework Guide](https://hono.dev/getting-started/basic)
- [React + Vite Setup](https://vitejs.dev/guide/)

---

## 📝 License

This project builds upon the Cloudflare Workers React Template and includes proprietary CDMv23 methodology implementation.

### Template Attribution
Original template: [Cloudflare Workers React Template](https://github.com/cloudflare/templates/tree/main/vite-react-template)
- Licensed under Apache License 2.0
- Copyright (c) 2024 Cloudflare, Inc.

### Application License
DamageScan application code and CDMv23 implementation:
- Proprietary software
- All rights reserved

---

## 🤝 Contributing

### Development Guidelines
1. **One file at a time**: Complete implementation before moving to next component
2. **Comprehensive testing**: Validate all functionality before approval
3. **Clear documentation**: JSDoc comments for all functions
4. **Type safety**: Strict TypeScript compliance
5. **Performance first**: Optimize for edge computing environment

### Code Review Process
1. Implement single component/file
2. Test functionality thoroughly
3. Document all features and edge cases
4. Request approval before proceeding
5. Iterate based on feedback

---

**Ready to build professional water damage restoration estimates with DamageScan!** 🚀