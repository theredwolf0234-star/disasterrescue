require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');

const db = require('./config/database');
const { initSocket } = require('./sockets/socketHandler');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { generalLimiter, strictLimiter } = require('./middleware/rateLimiter');

// Import Route Handlers
const authRoutes = require('./routes/authRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const shelterRoutes = require('./routes/shelterRoutes');
const rescueTeamRoutes = require('./routes/rescueTeamRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const databaseRoutes = require('./routes/databaseRoutes');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const SOCKET_ORIGIN = process.env.SOCKET_ORIGIN || '*';

// 1. Security Headers via Helmet (configured to allow Leaflet & tile sources)
app.use(helmet({
    contentSecurityPolicy: false, // Allows Leaflet OpenStreetMap/Carto tiles & Lucide CDN seamlessly
    crossOriginEmbedderPolicy: false
}));

// 2. CORS Configuration
app.use(cors({
    origin: (origin, callback) => {
        // Allow all in dev, or match FRONTEND_URL
        if (!origin || FRONTEND_URL === '*' || origin === FRONTEND_URL) {
            callback(null, true);
        } else {
            callback(null, true); // Permissive for local testing across ports
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. Request Logging
if (NODE_ENV !== 'test') {
    app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// 4. Body Parsers with Safe Size Limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 5. Rate Limiting
app.use('/api', generalLimiter);
app.use('/api/auth', strictLimiter);

// 6. Serve Uploaded Static Assets Safely
const uploadsPath = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath, { maxAge: '1d' }));

// 7. Serve Frontend Assets for direct all-in-one deployment
const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// 8. Health Check Endpoint
app.get('/api/health', async (req, res) => {
    try {
        await db.get('SELECT 1');
        res.json({
            status: 'ok',
            database: 'connected',
            environment: NODE_ENV,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({
            status: 'error',
            database: 'disconnected',
            environment: NODE_ENV,
            timestamp: new Date().toISOString(),
            error: err.message
        });
    }
});

// 9. Mount REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/sos', incidentRoutes); // Direct backward-compatible alias
app.use('/api/shelters', shelterRoutes);
app.use('/api/rescue-teams', rescueTeamRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/database', databaseRoutes);

// 10. SPA / Static routing fallback
app.get('/authority', (req, res) => {
    res.sendFile(path.join(frontendPath, 'authority.html'));
});

// 11. Centralized 404 & Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// 12. Socket.IO Setup
const io = new Server(server, {
    cors: {
        origin: SOCKET_ORIGIN === '*' ? true : SOCKET_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true
    }
});
initSocket(io);

// 13. Initialize DB and Start Server
async function startServer() {
    try {
        await db.initDatabase();

        server.listen(PORT, () => {
            console.log(`====================================================`);
            console.log(`  RESCUE AI — Disaster Rescue Coordinator Backend  `);
            console.log(`  Running on: http://localhost:${PORT}             `);
            console.log(`  Environment: ${NODE_ENV}                         `);
            console.log(`  Socket.IO: Active and listening                  `);
            console.log(`====================================================`);
        });
    } catch (err) {
        console.error('[Server] Fatal startup error:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, server, startServer };
