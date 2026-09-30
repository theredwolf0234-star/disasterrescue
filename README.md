# RESCUE AI — Disaster Rescue Coordinator Platform

[![License: ISC](https://img.shields.io/badge/License-ISC-purple.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Build Status](https://img.shields.io/badge/tests-16%2F16%20passed-emerald)](https://github.com)
[![E2E Flow](https://img.shields.io/badge/e2e%20flow-verified%20live-emerald)](https://github.com)

**RESCUE AI** is a production-grade, full-stack disaster coordination, situational awareness, and emergency triage platform. It integrates a citizen-facing dispatch portal, an authority command console, real-time WebSocket mesh telemetry, a transparent priority engine, persistent relational storage, and open meteorology satellite APIs.

---

> [!IMPORTANT]
> **Emergency Advisory Notice:**
> This platform is an emergency coordination and triage platform prototype. It does **not** automatically dispatch public emergency services (112 / 911 / Police / Fire / NDRF). In case of immediate life threat, contact **112** directly.

---

## 1. Verified Real Working Flow

```
CITIZEN SOS
    │
    ▼ (POST /api/incidents with JWT, coordinates, category, evidence)
DATABASE (SQLite / PostgreSQL)
    │
    ▼ (Inserts incidents, incident_updates, notifications)
SOCKET.IO EVENT (incident:new)
    │
    ▼ (Dispatched to 'authorities' room)
AUTHORITY DASHBOARD
    │
    ▼ (Real-time alert displayed, queue updated, stats incremented)
AUTHORITY ACTION
    │
    ▼ (PATCH /api/incidents/:id - Status change, squad assignment, timeline notes)
DATABASE UPDATE
    │
    ▼ (Updates status, resolution notes, resolved_at, writes to incident_updates)
SOCKET.IO EVENT (incident:updated & incident:status_changed)
    │
    ▼ (Dispatched to 'citizens' and incident room)
CITIZEN REPORT STATUS UPDATE
    (Citizen 'My Reports' view and details modal reflect new status in real-time)
```

---

## 2. Architecture & File Structure

```
LUCKNOW/
│
├── frontend/
│   ├── index.html                  # Citizen emergency portal & live dispatch
│   ├── authority.html              # Authority command dashboard & tactical grid
│   ├── css/
│   │   └── style.css               # Production theme tokens, animations, scrollbars
│   ├── js/
│   │   ├── api.js                  # Centralized REST API client & toast engine
│   │   ├── socket.js               # Real-time Socket.IO client & connection badges
│   │   ├── voice-sos.js            # Vanilla Web Speech API hands-free voice intake
│   │   ├── citizen-map.js          # Mapbox GL / Leaflet citizen map with GPS & safe routing
│   │   ├── citizen-app.js          # Citizen UI state, scoped reports & SOS dispatch
│   │   └── authority-app.js        # Authority auth gate, triage queue & dispatch actions
│   ├── assets/                     # Static imagery and logos
│   └── package.json                # Frontend package descriptor
│
├── backend/
│   ├── src/
│   │   ├── server.js               # Express application with Helmet, CORS & Socket.IO
│   │   ├── config/
│   │   │   └── database.js         # Relational database adapter (PostgreSQL & SQLite)
│   │   ├── controllers/
│   │   │   ├── authController.js       # Register, login, authority-login, me, profile
│   │   │   ├── incidentController.js   # Scoped SOS reports, triage, updates & stats
│   │   │   ├── shelterController.js    # Relief shelters & resource inventory
│   │   │   ├── rescueTeamController.js # Rescue squad dispatch & positions
│   │   │   ├── weatherController.js    # WeatherAPI.com / Open-Meteo telemetry proxy
│   │   │   ├── geocodeController.js    # Reverse and forward geocoding proxy
│   │   │   ├── notificationController.js # System alerts
│   │   │   └── auditController.js      # Administrative audit logs
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js       # JWT verification & RBAC role guards
│   │   │   ├── rateLimiter.js          # Express rate limiting against brute force
│   │   │   ├── uploadMiddleware.js     # Secure MIME/size photo & video upload
│   │   │   └── errorHandler.js        # Centralized 404 & safe 500 error handlers
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── incidentRoutes.js
│   │   │   ├── shelterRoutes.js
│   │   │   ├── rescueTeamRoutes.js
│   │   │   ├── weatherRoutes.js
│   │   │   ├── geocodeRoutes.js
│   │   │   ├── notificationRoutes.js
│   │   │   └── auditRoutes.js
│   │   ├── services/
│   │   │   ├── priorityService.js      # Transparent rule-based triage assessment
│   │   │   ├── weatherService.js       # Atmospheric telemetry service
│   │   │   └── auditService.js         # Security audit logging engine
│   │   ├── sockets/
│   │   │   └── socketHandler.js        # Real-time room management & event dispatch
│   │   └── utils/
│   │       └── idGenerator.js          # Collision-proof formatted IDs (SOS-YYYY-XXXXXX)
│   ├── scripts/
│   │   └── seed.js                 # Realistic seed data with bcrypt password hashing
│   ├── test/
│   │   ├── api.test.js             # 16 automated unit & integration tests
│   │   └── e2e-flow.test.js        # Live citizen-to-authority end-to-end flow test
│   ├── data/
│   │   └── rescue_ai.db            # Persistent SQLite database (local dev)
│   ├── uploads/                    # Sanitized user evidence uploads (photo/video)
│   └── package.json                # Backend dependencies and scripts
│
├── .env.example                    # Environment variable template
├── .env                            # Local development configuration
├── .gitignore                      # Git exclusions (node_modules, .env, *.db)
├── README.md                       # Comprehensive operational documentation
└── package.json                    # Root monorepo orchestration
```

---

## 3. Database Layer & Safety

The database abstraction layer (`backend/src/config/database.js`) dynamically detects the environment:

- **Development**: Local zero-configuration persistent **SQLite** (`backend/data/rescue_ai.db`).
- **Production**: **PostgreSQL** via connection string `DATABASE_URL=postgresql://user:password@host:5432/dbname`.
- **Query Normalization**: Seamlessly converts `?` to `$1, $2, ...` and `datetime('now')` to `NOW()` when running on PostgreSQL.
- **Relational Integrity**: Foreign keys enabled; all 9 relational tables created with safe `CREATE TABLE IF NOT EXISTS`:
  1. `users`
  2. `authority_users`
  3. `incidents`
  4. `incident_updates`
  5. `shelters`
  6. `rescue_teams`
  7. `notifications`
  8. `weather_reports`
  9. `audit_logs`
- **Data Persistence**: Zero destruction of existing records during restarts or migrations.

---

## 4. Verified API Endpoints & Role Authorization

| Method | Endpoint | Access Role | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | System status & database connectivity check |
| `POST` | `/api/auth/register` | Public | Citizen registration |
| `POST` | `/api/auth/login` | Public | Citizen login |
| `POST` | `/api/auth/authority-login` | Public | Authority login (NDRF / First Responder) |
| `GET` | `/api/auth/me` | Authenticated | Current profile information |
| `GET` | `/api/incidents` | Authenticated | **Citizen**: returns only own reports (`user_id = req.user.id`).<br>**Authority/Admin**: returns all incidents globally |
| `GET` | `/api/incidents/:id` | Authenticated | **Citizen**: restricted to own incident (403 if other).<br>**Authority/Admin**: access to any incident with full timeline |
| `POST` | `/api/incidents` | Optional Auth | Submit SOS beacon with coordinates, details, optional address & evidence |
| `GET` | `/api/incidents/stats/overview` | Authority, Admin | Live metrics (`total`, `active`, `critical`, `resolved`, `people`) |
| `PATCH` | `/api/incidents/:id` | Authority, Admin | Update status, assigned authority, team, resolution notes, and timeline |
| `POST` | `/api/incidents/:id/assign` | Authority, Admin | Assign rescue team and record update timeline |
| `POST` | `/api/incidents/:id/notes` | Authenticated | Append timeline triage note (Citizen for own, Authority for any) |
| `GET` | `/api/shelters` | Public | List operational relief shelters and resource inventory |
| `POST` | `/api/shelters` | Authority, Admin | Register new relief shelter |
| `PATCH` | `/api/shelters/:id` | Authority, Admin | Update shelter capacity, occupancy, and ration stock |
| `DELETE`| `/api/shelters/:id` | Authority, Admin | Delete relief shelter |
| `GET` | `/api/rescue-teams` | Public / Auth | List available rescue squads and active coordinates |
| `GET` | `/api/weather` | Public | Weather telemetry proxy |
| `GET` | `/api/geocode/reverse` | Public | Reverse geocoding proxy |

---

## 5. Environment Variables

Documented in `.env.example`:

| Variable | Required | Default / Example | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` | Port for the backend Express server |
| `NODE_ENV` | Optional | `development` | Environment mode (`development` or `production`) |
| `DATABASE_URL` | Optional | *(empty for local SQLite)* | PostgreSQL connection URL for production deployments |
| `JWT_SECRET` | **Required** in Prod | `rescue_ai_super_secret_jwt_key_...` | Secret key for signing and verifying JWT tokens |
| `FRONTEND_URL` | Optional | `*` | CORS allowed origin for HTTP API requests |
| `SOCKET_ORIGIN` | Optional | `*` | Allowed origin for Socket.IO connections |
| `WEATHERAPI_KEY`| Optional | *(empty)* | Optional API key for WeatherAPI.com (falls back to Open-Meteo) |
| `MAPBOX_ACCESS_TOKEN` | Optional | Default public token | Mapbox vector map and directions access token |

---

## 6. Local Quickstart Commands

```bash
# 1. Install dependencies
npm run install:backend

# 2. Seed development database with test credentials
npm run seed

# 3. Run automated tests (16 comprehensive tests)
npm test

# 4. Run end-to-end working flow test
npm run test:e2e

# 5. Start development server
npm start
```

Default seeded credentials:
- **Citizen Account**: `satyam@example.com` / `citizen123`
- **Authority Account**: `ndrf_commander` / `authority123`

Access the portals:
- **Citizen Portal**: `http://localhost:5000/index.html`
- **Authority Command HQ**: `http://localhost:5000/authority.html`
- **Health Check**: `http://localhost:5000/api/health`

---

## 7. Production Deployment Instructions

1. **Platform Selection**:
   Deploy on Node.js hosting environments such as Railway, Render, Fly.io, AWS Elastic Beanstalk, or Docker.
2. **Persistent Storage**:
   - Provide a managed PostgreSQL database URL in `DATABASE_URL`.
   - If using SQLite, ensure the platform mounts a persistent volume to `backend/data/` and `backend/uploads/`.
3. **Environment Setup**:
   - Set `NODE_ENV=production`.
   - Set a strong, randomly generated `JWT_SECRET`.
   - Set `FRONTEND_URL` and `SOCKET_ORIGIN` to your production domain (e.g. `https://rescue-ai.yourdomain.com`).
4. **Static File Serving**:
   - The Express application automatically serves frontend assets from `frontend/` and user evidence from `backend/uploads/`.
5. **Reverse Proxy & SSL**:
   - Route traffic through NGINX, Cloudflare, or platform load balancer with WebSocket upgrade headers enabled (`Upgrade: websocket`, `Connection: Upgrade`).

---

## 8. Test Results Summary

```
======================================================
   RUNNING RESCUE AI COMPREHENSIVE BACKEND TESTS      
======================================================

  ✓ PASS: 1. GET /api/health returns 200 with status ok and connected database
  ✓ PASS: 2. Citizen registration and login
  ✓ PASS: 3. POST /api/auth/authority-login authenticates valid authority credentials
  ✓ PASS: 4. Unauthorized dashboard API access is rejected with 401 or 403
  ✓ PASS: 5. Citizen creates emergency SOS incident with automatic priority
  ✓ PASS: 6. Citizen GET /api/incidents returns ONLY own reports (user_id = req.user.id)
  ✓ PASS: 7. Citizen cannot retrieve another citizen incident via GET /api/incidents/:id (403 Forbidden)
  ✓ PASS: 8. Authority GET /api/incidents returns complete incident list across all citizens
  ✓ PASS: 9. Authority GET /api/incidents/stats/overview returns correct schema and handles null sum
  ✓ PASS: 10. Authority PATCH /api/incidents/:id updates status and assigns rescue team
  ✓ PASS: 11. Incident timeline entry is saved in incident_updates on update
  ✓ PASS: 12. PATCH /api/incidents/:id rejects invalid status with 400
  ✓ PASS: 13. POST /api/incidents rejects missing or invalid coordinates with 400
  ✓ PASS: 14. Socket.IO instance initialized and event emission methods callable
  ✓ PASS: 15. Resolving an incident populates resolved_at timestamp and resolution_notes
  ✓ PASS: 16. Non-existent incident returns 404 NOT_FOUND cleanly without crash

======================================================
Tests Summary: 16 passed, 0 failed.
======================================================
```
