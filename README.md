# AI Disaster Rescue Coordinator Platform (RESCUE AI)

[![License: ISC](https://img.shields.io/badge/License-ISC-purple.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Build Status](https://img.shields.io/badge/tests-26%2F26%20passed-emerald)](https://github.com)
[![E2E Flow](https://img.shields.io/badge/e2e%20flow-verified%20live-emerald)](https://github.com)
[![Deployment](https://img.shields.io/badge/Render-Deployment--Ready-blue)](https://disaster-rescuecoordinator.onrender.com)

**AI Disaster Rescue Coordinator** is an end-to-end, full-stack emergency response and tactical situational awareness platform built for Smart India Hackathon (SIH) and emergency coordination demonstrations. It bridges distressed citizens on the ground with first responders, disaster authorities (NDRF, SDRF, Fire, EMS), and triage command centers in real time.

---

> [!IMPORTANT]
> **Demo Emergency Coordination System Notice:**
> This platform is an educational, prototype-tested emergency coordination platform. It does **not** possess an official authorization integration with national 112 / 911 / NDRF dispatch mainframes. For real life-threatening emergencies, dial **112** directly. All simulated features, mock fleets, and synthetic data are visibly tagged as **DEMO DATA**.

---

## 1. Core End-to-End Workflow

Every single step in this sequence connects directly to the persistent backend, database, and Socket.IO real-time event pipeline:

```
CITIZEN (Browser / Mobile)
    │
    ▼ (1. Captures GPS, emergency type, victim count, details, optional photo/audio)
POST /api/incidents (JWT or guest with client validation)
    │
    ▼ (2. Stores incident in SQLite/PostgreSQL with collision-proof SOS-YYYY-XXXXXX ID)
DATABASE (Relational Persistence)
    │
    ▼ (3. Evaluates multi-factor risk, environmental factors, victim count, terrain)
AI / RISK ENGINE (Multi-Disaster Risk Engine: 0-100 Score & Transparent Heuristics)
    │
    ▼ (4. Computes Priority: CRITICAL [76-100], HIGH [51-75], MODERATE [26-50], LOW [0-25])
REAL-TIME SOCKET.IO MESH (incident:new event dispatched to authority channel)
    │
    ▼ (5. Renders incident card, audio chime, tactical map beacon)
AUTHORITY COMMAND DASHBOARD (AISTER23 / NDRF Commander)
    │
    ▼ (6. Commander acknowledges beacon: PATCH /api/incidents/:id/status -> ACKNOWLEDGED)
DATABASE AUDIT TIMELINE (Recorded in incident_updates & audit_logs)
    │
    ▼ (7. Commander assigns available rescue fleet: POST /api/incidents/:id/assign)
TACTICAL RESCUE SQUAD (Status set to BUSY; coordinates tracked)
    │
    ▼ (8. Safe Route Engine calculates hazard-free vector avoiding floods and blocked roads)
GIS SAFE ROUTING (Distance, ETA, Route Risk Score)
    │
    ▼ (9. Status progressions: TEAM_DISPATCHED -> TEAM_APPROACHING -> ON_SCENE)
CITIZEN LIVE TRACKING (7-Step real-time visual timeline checklist updates live)
    │
    ▼ (10. Authority enters resolution notes and marks RESOLVED)
INCIDENT RESOLVED & ANALYTICS UPDATED (Resolved timestamp populated, analytics aggregated)
```

---

## 2. Features Overview

### 2.1 Citizen Portal (`/index.html`)
- **14 Dedicated Sections**:
  1. `Home`: Hero view with rapid SOS trigger, active stats, and system status badge.
  2. `Emergency SOS`: Fast 1-click panic trigger with automatic GPS acquisition.
  3. `Report Disaster`: Comprehensive reporting form supporting multi-disaster types.
  4. `Live Risk`: Interactive multi-disaster risk calculator and explainability breakdown.
  5. `Weather`: Live atmospheric telemetry (temperature, wind, precipitation, barometric pressure).
  6. `Tactical Map`: Leaflet / Mapbox interactive GIS map with 5 toggleable layers.
  7. `Shelters`: Real-time relief shelter locator with occupancy and capacity stats.
  8. `Hospitals`: Emergency hospital directory with ICU beds, trauma status, and ambulances.
  9. `Emergency Contacts`: Quick-dial directory for police, ambulance, fire, disaster helpline.
  10. `My Reports`: Authenticated citizen personal incident tracker and progress checklist.
  11. `About`: Mission statement, technical architecture, and SIH demonstration goals.
  12. `Help`: Emergency preparedness protocols, survival guidelines, and triage tips.
  13. `Language`: Instant client-side English & Hindi (`EN` / `HI`) translation switch.
  14. `Profile`: Citizen profile management with blood group, emergency contact, and phone.

- **Offline / Poor Network Queue**:
  - Automatically caches submitted SOS reports in `localStorage` (`rescue_offline_sos_queue`) when offline.
  - Displays a persistent red offline banner (`Network unavailable. Retrying...`).
  - Automatically synchronizes queued incidents to the backend as soon as connectivity resumes.

- **Voice SOS Intake**:
  - Native `MediaRecorder` audio recording with start, stop, duration timer, preview player, and multipart upload.
  - Automatic fallback to Web Speech API speech-to-text recognition.

- **Photo & Video Evidence with Assistive AI Vision**:
  - Secure Multer upload pipeline with MIME filtering and file-size constraints.
  - Transparent heuristic AI vision analysis evaluating flood, fire, debris, and crowd conditions with confidence scores.

### 2.2 Authority Command Center (`/authority.html`)
- **6 Integrated Command Subviews**:
  1. `Tactical Grid`: Live incident queue, filter controls, map view, and triage drawer.
  2. `Rescue Fleets`: Management of rescue squads, availability toggles, equipment, and current targets.
  3. `Logistics Inventory`: Resource tracking (ambulances, boats, fire trucks, medical kits, food/water).
  4. `Incident Clusters`: Duplicate/cluster detection grouping proximate incidents to identify macro-disasters.
  5. `Analytics`: Graphical and numerical breakdown of resolution times, disaster distribution, and response rates.
  6. `Master Database`: Live administrative relational database table browser with search, pagination, and JSON inspect.

- **Incident Action Operations**:
  - `[ACKNOWLEDGE]`: Updates status from `NEW` to `ACKNOWLEDGED`.
  - `[ASSIGN TEAM]`: Dispatches an `AVAILABLE` rescue fleet and updates team status to `BUSY`.
  - `[VIEW ROUTE]`: Calculates hazard-avoiding GIS route from squad location to incident coordinates.
  - `[CONTACT USER]`: Reveals citizen contact details and initiates direct dial / SMS note.
  - `[CHANGE PRIORITY]`: Manual authority triage override (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`).
  - `[MARK RESOLVED]`: Records mandatory resolution notes, sets status to `RESOLVED`, and records timestamp.
  - `[GENERATE REPORT]`: Generates a printable incident dossier with complete audit timeline.

---

## 3. Technology Stack

| Domain | Technology | Description |
|---|---|---|
| **Frontend** | Vanilla HTML5, Vanilla JavaScript (ES6+), Vanilla CSS | Ultra-fast, zero-build-step client, glassmorphism dark aesthetic |
| **Icons & Maps** | Lucide Icons, Leaflet.js, Mapbox GL JS | Vector icons, tactical map layers, custom colored risk pins |
| **Backend** | Node.js (>= 18), Express.js | High-concurrency RESTful API architecture |
| **Real-Time** | Socket.IO (v4) | Bidirectional WebSocket event mesh for instant push alerts |
| **Database** | SQLite3 (Local) / PostgreSQL (Prod) | Zero-config persistent relational database with automatic migration |
| **Security** | Helmet, bcryptjs, jsonwebtoken, CORS, RateLimiter | Enterprise-grade HTTP security headers, password hashing, and RBAC |
| **File Handling** | Multer | Secure multipart upload with MIME verification and size caps |
| **GIS & Weather** | Haversine, Open-Meteo, WeatherAPI.com | Geodesic distance calculations and live meteorological telemetry |

---

## 4. Multi-Disaster AI Risk Engine Specification

The platform utilizes a modular, explainable risk assessment engine (`backend/src/services/multiDisasterEngine.js` and `priorityService.js`):

### Risk Score Ranges & Classifications
- **0 – 25**: `LOW` (Green)
- **26 – 50**: `MODERATE` (Yellow)
- **51 – 75**: `HIGH` (Orange)
- **76 – 100**: `CRITICAL` (Red)

### Supported Disaster Modules & Factors
1. **Flood Engine**: Rainfall intensity, water level, terrain elevation, distance to river, population density.
2. **Landslide Engine**: Slope angle, precipitation saturation, soil instability, historical landslide frequency.
3. **Earthquake Engine**: Richter magnitude, distance to fault/epicenter, building vulnerability, local seismic zone.
4. **Cyclone Engine**: Sustained wind speed, barometric pressure drop, cyclone track proximity, storm surge alert.
5. **Fire Engine**: Ambient temperature, dry wind velocity, vegetation density, proximate fire reports.
6. **Lightning & Structural Risk**: Thunderstorm intensity, electrical grid proximity, building structural integrity.

> **AI Transparency Statement**: The current engine runs transparent deterministic mathematical heuristics and multi-factor weighted scoring. It explicitly reports confidence percentages and reasoning strings (e.g. *"Risk escalated due to extreme precipitation, low elevation, and 5 stranded citizens"*). It does **not** claim to be a black-box deep neural network.

---

## 5. Verified API Reference

All endpoints return standard JSON envelopes `{ success: true, data: ... }` or `{ success: false, message: ... }`:

### Public & Health Endpoints
- `GET /health` — Deployment health check (`{"status": "ok", "service": "AI Disaster Rescue Coordinator"}`)
- `GET /api/weather` — Meteorological telemetry proxy with live/demo indicator
- `GET /api/routes/hazards` — Active hazard zones, flood barriers, and blocked roadways
- `GET /api/routes/safe-route` — Safe route vector with hazard avoidance calculations
- `GET /api/hospitals` — Emergency hospitals with bed availability and ambulances
- `GET /api/shelters` — Relief shelters with capacity and occupancy metrics
- `GET /api/resources` — Available equipment inventory (ambulances, boats, etc.)

### Authentication
- `POST /api/auth/register` — Citizen registration (`fullName`, `email`, `password`, `phone`)
- `POST /api/auth/login` — Citizen login (`email`, `password`)
- `POST /api/auth/authority-login` — First responder & commander login (`username` / `badge_id`, `password`)
- `GET /api/auth/me` — Authenticated profile details

### Incidents & SOS
- `POST /api/incidents` — Submit SOS report (`disaster_type`, `latitude`, `longitude`, `details`, `people_affected`, `evidence`)
- `GET /api/incidents` — Scoped list (Citizens receive only their reports; Authorities receive global queue)
- `GET /api/incidents/:id` — Incident details with audit timeline (Enforces RBAC)
- `PATCH /api/incidents/:id/status` — Status transition (`ACKNOWLEDGED`, `ON_SCENE`, `RESOLVED`, etc.)
- `POST /api/incidents/:id/assign` — Assign rescue squad to incident
- `GET /api/incidents/:id/report` — Comprehensive printable incident dossier
- `GET /api/incidents/export/csv` — CSV export of all incidents for offline reporting
- `GET /api/incidents/analytics/summary` — Aggregated incident metrics, response times, and disaster distributions

### Command & Administration
- `GET /api/rescue-teams` — List of all tactical rescue squads
- `PATCH /api/rescue-teams/:id` — Update squad status (`AVAILABLE`, `BUSY`, `OFFLINE`)
- `GET /api/clusters` — AI incident clusters and duplicate detection groupings
- `POST /api/risk/evaluate` — Direct calculation via Multi-Disaster Risk Engine
- `GET /api/database/overview` — Administrative master database overview
- `GET /api/database/table/:tableName` — Dynamic database table viewer with column projection

---

## 6. Environment Variables

Documented in `.env.example`:

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` | Port for the backend Express server |
| `NODE_ENV` | Optional | `development` | Runtime mode (`development` or `production`) |
| `DATABASE_URL` | Optional | *(empty)* | PostgreSQL connection URL (defaults to persistent local SQLite) |
| `JWT_SECRET` | **Required** in Prod | `rescue_ai_super_secret_jwt_key_...` | Cryptographic secret for signing JWT tokens |
| `FRONTEND_URL` | Optional | `*` | Allowed CORS origins for API requests |
| `SOCKET_ORIGIN` | Optional | `*` | Allowed origins for Socket.IO WebSocket connections |
| `WEATHERAPI_KEY` | Optional | *(empty)* | Optional API key for WeatherAPI.com (falls back to Open-Meteo) |
| `MAPBOX_ACCESS_TOKEN` | Optional | *(empty)* | Optional vector map token (falls back to OpenStreetMap CartoDB) |

---

## 7. Local Setup & Quickstart

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation Steps
```bash
# 1. Clone repository
git clone https://github.com/theredwolf0234-star/disasterrescue.git
cd disasterrescue

# 2. Install backend dependencies
npm run install:backend

# 3. Create .env configuration
cp .env.example .env

# 4. Seed database with initial squads, shelters, hospitals & credentials
npm run seed

# 5. Run test suite (26 automated tests)
npm test

# 6. Start the server
npm start
```

### Default Credentials
| Portal | Username / Email | Password | Role |
|---|---|---|---|
| **Citizen Portal** | `satyam@example.com` | `citizen123` | CITIZEN |
| **Authority HQ** | `AISTER23` | `@aster23` | ADMIN |
| **NDRF Responder** | `ndrf_commander` | `authority123` | AUTHORITY |

Access the live portals:
- **Citizen Dispatch Portal**: `http://localhost:5000/index.html`
- **Authority Command Console**: `http://localhost:5000/authority.html`
- **System Health Check**: `http://localhost:5000/health`

---

## 8. Render Production Deployment Guide

The repository is pre-configured for 1-click deployment on **Render**:

1. **Create Web Service on Render**:
   - Connect the GitHub repository.
   - **Environment**: `Node`
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `node backend/src/server.js`

2. **Environment Variables on Render**:
   - `PORT`: `10000` (Render default)
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(Generate a secure 64-character random string)*
   - `DATABASE_URL`: *(Attach a Render PostgreSQL instance or mount persistent disk for SQLite)*

3. **Disk Mount (if using SQLite)**:
   - Mount Path: `/opt/render/project/src/backend/data`
   - Size: `1 GB`

4. **Health Check Path**:
   - Set Health Check Path to: `/health`

---

## 9. Real vs. Demo / Simulated Data Disclosure

To ensure complete academic and demonstration integrity, the platform maintains absolute transparency regarding data sources:

| Feature | Operational Status | Details |
|---|---|---|
| **Citizen SOS Dispatch** | **REAL** | Authenticates user, captures GPS, persists incident to DB, generates collision-proof ID. |
| **AI Risk Assessment** | **REAL** | Deterministic multi-factor scoring algorithm running live on incident parameters. |
| **Socket.IO Real-Time Mesh** | **REAL** | Instant bidirectional event emission between citizens and authority dashboards. |
| **Incident Status Lifecycle** | **REAL** | Complete 9-stage lifecycle stored in relational database with immutable audit logs. |
| **Relational Database** | **REAL** | Persistent SQLite/PostgreSQL with indexed queries and foreign key constraints. |
| **Weather Telemetry** | **HYBRID** | Real-time Open-Meteo satellite feed with graceful fallback to simulated radar if offline. |
| **Safe Route Engine** | **SIMULATED / DEMO** | Heuristic Dijkstra-based hazard avoidance using simulated flood/obstruction zones. |
| **Rescue Squad Locations** | **SIMULATED / DEMO** | Realistic mock coordinates representing active NDRF, SDRF, and EMS units. |
| **112 / 911 / NDRF Integration** | **DEMO ONLY** | No unauthorized integration with public emergency CAD dispatchers. Clearly labeled. |

---

## 10. Security & Cybersecurity Hardening

- **Cryptographic Hashing**: All citizen and authority passwords hashed with `bcryptjs` (salt factor 10).
- **Strict Role-Based Access Control (RBAC)**: Enforced via `authMiddleware.js` (`ADMIN`, `AUTHORITY`, `OPERATOR`, `RESPONDER`, `CITIZEN`). Normal citizens are strictly forbidden from viewing other citizens' incidents (returns 403 Forbidden).
- **Secure HTTP Headers**: Configured with `helmet` with custom CSP rules permitting Leaflet and CartoDB tiles.
- **Brute-Force & Rate Limiting**: `express-rate-limit` guards login and SOS endpoints against abuse.
- **File Upload Protection**: Multer filters incoming files by MIME type, validates extension signatures, enforces size limits (15MB), and sanitizes filenames to prevent path traversal attacks.
- **Sanitized SQL Queries**: All database queries use parameterized inputs (`?` and `$n`) to prevent SQL injection.
- **Audit Logging**: Every authority status transition, team assignment, and priority change is permanently recorded in `audit_logs` and `incident_updates`.

---

## 11. Known Limitations & Future Scope

### Limitations
- Voice transcription depends on browser Web Speech API availability when running on client; fallback audio files are stored safely for authority playback.
- OpenStreetMap CartoDB tiles require internet access on the client device for map rendering; when offline, cached pins and coordinates remain accessible.

### Future Scope
- Integration with LoRaWAN / satellite mesh radios for communication in infrastructure-destroyed environments.
- Computer vision model deployment (YOLOv8-Disaster) on dedicated GPU edge nodes for automated aerial drone video triage.
- Integration with official CAP (Common Alerting Protocol) feeds from the National Disaster Management Authority (NDMA).

---

## 12. License

This project is licensed under the **ISC License**. Developed for academic evaluation, disaster management research, and the Smart India Hackathon (SIH).
