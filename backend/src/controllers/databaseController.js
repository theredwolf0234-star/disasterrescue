const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const ALLOWED_TABLES = {
    incidents: {
        label: 'SOS Incidents & Reports',
        icon: 'alert-triangle',
        description: 'Citizen emergency beacons, categories, GPS coordinates, priority scores, and live status',
        columns: ['id', 'user_id', 'category', 'emergency_level', 'count', 'details', 'latitude', 'longitude', 'readable_address', 'status', 'assigned_authority', 'assigned_rescue_team', 'evidence_url', 'created_at', 'resolved_at'],
        selectSql: `SELECT id, user_id, category, emergency_level, count, details, latitude, longitude, readable_address, status, assigned_authority, assigned_rescue_team, evidence_url, created_at, resolved_at FROM incidents`,
        searchColumns: ['id', 'category', 'emergency_level', 'details', 'readable_address', 'status', 'assigned_authority']
    },
    users: {
        label: 'Registered Citizens',
        icon: 'users',
        description: 'Verified citizen profiles, emergency contact phone lines, and blood groups',
        columns: ['id', 'full_name', 'email', 'phone', 'emergency_phone', 'blood_group', 'role', 'created_at', 'updated_at'],
        selectSql: `SELECT id, full_name, email, phone, emergency_phone, blood_group, role, created_at, updated_at FROM users`,
        searchColumns: ['id', 'full_name', 'email', 'phone', 'emergency_phone', 'blood_group']
    },
    authority_users: {
        label: 'Command Staff & Admins',
        icon: 'shield-check',
        description: 'First responders, NDRF officers, badge numbers, commanding organizations, and admin credentials',
        columns: ['id', 'username', 'email', 'badge_number', 'organization', 'role', 'created_at', 'updated_at'],
        selectSql: `SELECT id, username, email, badge_number, organization, role, created_at, updated_at FROM authority_users`,
        searchColumns: ['id', 'username', 'email', 'badge_number', 'organization', 'role']
    },
    shelters: {
        label: 'Relief Shelters & Logistics',
        icon: 'home',
        description: 'Designated disaster shelter camps, occupancy ratios, food kits, water, and medical resources',
        columns: ['id', 'title', 'status', 'capacity', 'current_occupancy', 'food_packets', 'water_liters', 'medical_kits', 'blankets', 'latitude', 'longitude', 'created_at'],
        selectSql: `SELECT id, title, status, capacity, current_occupancy, food_packets, water_liters, medical_kits, blankets, latitude, longitude, created_at FROM shelters`,
        searchColumns: ['id', 'title', 'status', 'resources_summary']
    },
    rescue_teams: {
        label: 'Emergency Rescue Teams',
        icon: 'truck',
        description: 'Field response squads, boat squads, ambulances, personnel strength, and live telemetry coordinates',
        columns: ['id', 'name', 'unit_type', 'vehicle_type', 'personnel_count', 'contact_phone', 'status', 'assigned_incident_id', 'current_lat', 'current_lng', 'created_at'],
        selectSql: `SELECT id, name, unit_type, vehicle_type, personnel_count, contact_phone, status, assigned_incident_id, current_lat, current_lng, created_at FROM rescue_teams`,
        searchColumns: ['id', 'name', 'unit_type', 'vehicle_type', 'contact_phone', 'status']
    },
    incident_updates: {
        label: 'Incident Timeline Logs',
        icon: 'clock',
        description: 'Permanent immutable audit trail of dispatch state transitions, officer notes, and timestamps',
        columns: ['id', 'incident_id', 'updated_by_id', 'updated_by_role', 'status_from', 'status_to', 'note', 'created_at'],
        selectSql: `SELECT id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at FROM incident_updates`,
        searchColumns: ['id', 'incident_id', 'updated_by_role', 'note']
    },
    audit_logs: {
        label: 'Security & Access Audit Logs',
        icon: 'file-text',
        description: 'System actions, login timestamps, dispatch modifications, client IP addresses, and security events',
        columns: ['id', 'user_id', 'user_role', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at'],
        selectSql: `SELECT id, user_id, user_role, action, entity_type, entity_id, details, ip_address, created_at FROM audit_logs`,
        searchColumns: ['id', 'user_id', 'user_role', 'action', 'details', 'ip_address']
    },
    notifications: {
        label: 'System Broadcasts & Alerts',
        icon: 'bell',
        description: 'Emergency push broadcasts, incident alerts, evacuation warnings, and recipient logs',
        columns: ['id', 'user_id', 'recipient_role', 'title', 'message', 'incident_id', 'type', 'is_read', 'created_at'],
        selectSql: `SELECT id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at FROM notifications`,
        searchColumns: ['id', 'title', 'message', 'recipient_role', 'type']
    },
    weather_reports: {
        label: 'Meteo Telemetry Records',
        icon: 'cloud-rain',
        description: 'Live atmospheric weather data points, precipitation rates, wind velocity, and ambient temperatures',
        columns: ['id', 'latitude', 'longitude', 'temperature', 'rainfall', 'wind_speed', 'humidity', 'condition', 'provider', 'fetched_at'],
        selectSql: `SELECT id, latitude, longitude, temperature, rainfall, wind_speed, humidity, condition, provider, fetched_at FROM weather_reports`,
        searchColumns: ['id', 'condition', 'provider']
    },
    hospitals: {
        label: 'Trauma Centers & Hospitals',
        icon: 'activity',
        description: 'Designated emergency hospitals, ICU beds, available standard beds, and ambulance fleet',
        columns: ['id', 'name', 'latitude', 'longitude', 'address', 'emergency_status', 'total_beds', 'available_beds', 'icu_beds', 'available_ambulances', 'contact_phone', 'trauma_level', 'created_at'],
        selectSql: `SELECT id, name, latitude, longitude, address, emergency_status, total_beds, available_beds, icu_beds, available_ambulances, contact_phone, trauma_level, created_at FROM hospitals`,
        searchColumns: ['id', 'name', 'address', 'emergency_status', 'trauma_level']
    },
    resources: {
        label: 'Emergency Resource Fleet',
        icon: 'package',
        description: 'Inventory of ambulances, rescue boats, fire engines, surgical kits, and rations',
        columns: ['id', 'category', 'resource_name', 'total_units', 'available_units', 'deployed_units', 'unit_description', 'location_hub', 'updated_at'],
        selectSql: `SELECT id, category, resource_name, total_units, available_units, deployed_units, unit_description, location_hub, updated_at FROM resources`,
        searchColumns: ['id', 'category', 'resource_name', 'location_hub']
    },
    media: {
        label: 'Disaster Evidence Media',
        icon: 'image',
        description: 'Photos, videos, and voice recordings uploaded with incidents, including AI vision analysis tags',
        columns: ['id', 'incident_id', 'file_url', 'file_type', 'file_name', 'file_size', 'created_at'],
        selectSql: `SELECT id, incident_id, file_url, file_type, file_name, file_size, created_at FROM media`,
        searchColumns: ['id', 'incident_id', 'file_name', 'file_type']
    },
    risk_analysis: {
        label: 'AI Disaster Risk Engine Records',
        icon: 'cpu',
        description: 'Modular multi-disaster hazard evaluations, risk scores (0-100), factors, and actionable guidance',
        columns: ['id', 'incident_id', 'disaster_type', 'risk_score', 'risk_level', 'reason', 'confidence', 'recommended_action', 'created_at'],
        selectSql: `SELECT id, incident_id, disaster_type, risk_score, risk_level, reason, confidence, recommended_action, created_at FROM risk_analysis`,
        searchColumns: ['id', 'incident_id', 'disaster_type', 'risk_level', 'reason']
    },
    incident_clusters: {
        label: 'Incident Geospatial Clusters',
        icon: 'layers',
        description: 'Geospatially aggregated incident clusters for coordinated multi-casualty disaster response',
        columns: ['id', 'cluster_name', 'disaster_type', 'centroid_lat', 'centroid_lng', 'radius_km', 'incident_count', 'total_victims', 'priority', 'status', 'created_at'],
        selectSql: `SELECT id, cluster_name, disaster_type, centroid_lat, centroid_lng, radius_km, incident_count, total_victims, priority, status, created_at FROM incident_clusters`,
        searchColumns: ['id', 'cluster_name', 'disaster_type', 'priority', 'status']
    }
};

/**
 * GET /api/database/overview
 * Returns system database metadata, engine info, table row counts, and storage stats
 */
async function getDatabaseOverview(req, res, next) {
    try {
        const isPg = db.isPostgres();
        let dbEngine = isPg ? 'PostgreSQL' : 'SQLite (Embedded)';
        let dbPath = 'PostgreSQL Connection Pool';
        let dbSizeBytes = 0;
        let dbSizeFormatted = 'N/A';
        let lastModified = new Date().toISOString();

        if (!isPg) {
            const sqliteFile = path.resolve(__dirname, '../../data/rescue_ai.db');
            if (fs.existsSync(sqliteFile)) {
                const stats = fs.statSync(sqliteFile);
                dbPath = sqliteFile;
                dbSizeBytes = stats.size;
                dbSizeFormatted = (stats.size / 1024).toFixed(1) + ' KB';
                if (stats.size > 1024 * 1024) {
                    dbSizeFormatted = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
                }
                lastModified = stats.mtime.toISOString();
            }
        }

        const tableList = [];
        let totalRecordsAll = 0;

        for (const [key, conf] of Object.entries(ALLOWED_TABLES)) {
            try {
                const row = await db.get(`SELECT COUNT(*) as cnt FROM ${key}`);
                const count = row ? Number(row.cnt) : 0;
                totalRecordsAll += count;
                tableList.push({
                    name: key,
                    label: conf.label,
                    icon: conf.icon,
                    description: conf.description,
                    columnsCount: conf.columns.length,
                    rowCount: count
                });
            } catch (err) {
                tableList.push({
                    name: key,
                    label: conf.label,
                    icon: conf.icon,
                    description: conf.description,
                    columnsCount: conf.columns.length,
                    rowCount: 0
                });
            }
        }

        res.json({
            success: true,
            data: {
                engine: dbEngine,
                filePath: dbPath,
                sizeBytes: dbSizeBytes,
                sizeFormatted: dbSizeFormatted,
                lastModified,
                totalTables: Object.keys(ALLOWED_TABLES).length,
                totalRecords: totalRecordsAll,
                tables: tableList
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/database/table/:tableName
 * Returns paginated table rows with optional search and column headers (strictly excluding password_hash)
 */
async function getTableData(req, res, next) {
    try {
        const { tableName } = req.params;
        const conf = ALLOWED_TABLES[tableName];

        if (!conf) {
            return res.status(404).json({
                success: false,
                message: `Table '${tableName}' does not exist or access is restricted.`,
                errorCode: 'TABLE_NOT_FOUND'
            });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();

        let whereClause = '';
        const params = [];

        if (search && conf.searchColumns && conf.searchColumns.length > 0) {
            const conditions = conf.searchColumns.map(col => `CAST(${col} AS TEXT) LIKE ?`);
            whereClause = ` WHERE (${conditions.join(' OR ')})`;
            for (let i = 0; i < conf.searchColumns.length; i++) {
                params.push(`%${search}%`);
            }
        }

        // Count total
        const countQuery = `SELECT COUNT(*) as cnt FROM ${tableName}${whereClause}`;
        const countResult = await db.get(countQuery, params);
        const total = countResult ? Number(countResult.cnt) : 0;

        // Determine sort column
        let sortCol = req.query.sort;
        if (!conf.columns.includes(sortCol)) {
            sortCol = conf.columns.includes('created_at') ? 'created_at' : (conf.columns.includes('fetched_at') ? 'fetched_at' : conf.columns[0]);
        }
        const order = (req.query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Select rows
        const dataQuery = `${conf.selectSql}${whereClause} ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`;
        const queryParams = [...params, limit, offset];
        const rows = await db.query(dataQuery, queryParams);

        res.json({
            success: true,
            data: {
                tableName,
                label: conf.label,
                description: conf.description,
                columns: conf.columns,
                rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/database/export/:tableName
 * Export table data as CSV or JSON
 */
async function exportTableData(req, res, next) {
    try {
        const { tableName } = req.params;
        const format = (req.query.format || 'csv').toLowerCase();
        const conf = ALLOWED_TABLES[tableName];

        if (!conf) {
            return res.status(404).json({
                success: false,
                message: `Table '${tableName}' does not exist.`,
                errorCode: 'TABLE_NOT_FOUND'
            });
        }

        const rows = await db.query(`${conf.selectSql} ORDER BY 1 DESC LIMIT 2000`);

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${tableName}_export_${Date.now()}.json"`);
            return res.send(JSON.stringify(rows, null, 2));
        }

        // Format as CSV
        const headers = conf.columns;
        const csvRows = [headers.join(',')];

        for (const row of rows) {
            const values = headers.map(h => {
                let val = row[h];
                if (val === null || val === undefined) return '""';
                val = String(val).replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvContent = csvRows.join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${tableName}_export_${Date.now()}.csv"`);
        res.send(csvContent);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/database/query
 * Safe read-only SQL query executor (ADMIN only)
 */
async function executeCustomQuery(req, res, next) {
    try {
        const { query: sql } = req.body;

        if (!sql || typeof sql !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'SQL query string is required.',
                errorCode: 'INVALID_QUERY'
            });
        }

        const trimmed = sql.trim();
        // Strictly allow only read-only SELECT queries
        if (!/^SELECT\b/i.test(trimmed)) {
            return res.status(403).json({
                success: false,
                message: 'Security restriction: Only read-only SELECT queries are allowed.',
                errorCode: 'READ_ONLY_VIOLATION'
            });
        }

        // Prevent modification keywords in subqueries or CTEs
        const dangerousKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'REPLACE', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH', 'VACUUM'];
        for (const kw of dangerousKeywords) {
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            if (regex.test(trimmed)) {
                return res.status(403).json({
                    success: false,
                    message: `Security violation: Mutation statement '${kw}' is strictly forbidden.`,
                    errorCode: 'MUTATION_FORBIDDEN'
                });
            }
        }

        const rows = await db.query(trimmed);
        res.json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: `SQL execution error: ${err.message}`,
            errorCode: 'SQL_ERROR'
        });
    }
}

module.exports = {
    getDatabaseOverview,
    getTableData,
    exportTableData,
    executeCustomQuery
};
