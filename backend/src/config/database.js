const path = require('path');
const fs = require('fs');

let dbDriver = null;
let isPostgres = false;
let sqliteDb = null;
let pgPool = null;

const DATABASE_URL = process.env.DATABASE_URL || '';

/**
 * Normalizes query string between SQLite (?) and PostgreSQL ($1, $2, ...)
 */
function normalizeQuery(sql, isPg) {
    if (isPg) {
        let paramIndex = 1;
        let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        pgSql = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
        return pgSql;
    } else {
        return sql.replace(/\$(\d+)/g, '?');
    }
}

async function initDatabase() {
    if (DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://')) {
        const { Pool } = require('pg');
        isPostgres = true;
        pgPool = new Pool({
            connectionString: DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        try {
            // Test connection
            const client = await pgPool.connect();
            client.release();
            console.log('[DB] Connected to PostgreSQL successfully.');
        } catch (pgErr) {
            console.error('[DB] PostgreSQL connection error:', pgErr.message);
            throw pgErr;
        }
    } else {
        const sqlite3 = require('sqlite3').verbose();
        isPostgres = false;

        const dataDir = path.resolve(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const dbFilePath = path.join(dataDir, 'rescue_ai.db');
        sqliteDb = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbFilePath, (err) => {
                if (err) return reject(err);
                resolve(db);
            });
        });

        // Enable foreign keys in SQLite
        await new Promise((resolve, reject) => {
            sqliteDb.run('PRAGMA foreign_keys = ON;', (err) => (err ? reject(err) : resolve()));
        });

        console.log(`[DB] Connected to persistent SQLite database at: ${dbFilePath}`);
    }

    await createTables();
}

async function query(sql, params = []) {
    const formattedSql = normalizeQuery(sql, isPostgres);

    if (isPostgres) {
        const res = await pgPool.query(formattedSql, params);
        return res.rows;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.all(formattedSql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }
}

async function get(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

async function run(sql, params = []) {
    const formattedSql = normalizeQuery(sql, isPostgres);

    if (isPostgres) {
        const res = await pgPool.query(formattedSql, params);
        return { changes: res.rowCount };
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(formattedSql, params, function (err) {
                if (err) return reject(err);
                resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }
}

async function createTables() {
    const idType = isPostgres ? 'VARCHAR(64) PRIMARY KEY' : 'TEXT PRIMARY KEY';
    const textType = isPostgres ? 'TEXT' : 'TEXT';
    const numType = isPostgres ? 'NUMERIC' : 'REAL';
    const intType = isPostgres ? 'INTEGER' : 'INTEGER';
    const tsDefault = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";

    // 1. users
    await run(`
        CREATE TABLE IF NOT EXISTS users (
            id ${idType},
            full_name ${textType} NOT NULL,
            email ${textType} UNIQUE NOT NULL,
            password_hash ${textType} NOT NULL,
            phone ${textType},
            emergency_phone ${textType},
            blood_group ${textType},
            role ${textType} DEFAULT 'CITIZEN',
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 2. authority_users
    await run(`
        CREATE TABLE IF NOT EXISTS authority_users (
            id ${idType},
            username ${textType} UNIQUE NOT NULL,
            email ${textType} UNIQUE NOT NULL,
            password_hash ${textType} NOT NULL,
            badge_number ${textType} NOT NULL,
            organization ${textType} NOT NULL,
            role ${textType} DEFAULT 'AUTHORITY',
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 3. incidents
    await run(`
        CREATE TABLE IF NOT EXISTS incidents (
            id ${idType},
            user_id ${textType},
            category ${textType} NOT NULL,
            emergency_level ${textType} NOT NULL DEFAULT 'HIGH',
            count ${intType} DEFAULT 1,
            details ${textType} NOT NULL,
            latitude ${numType} NOT NULL,
            longitude ${numType} NOT NULL,
            readable_address ${textType},
            status ${textType} NOT NULL DEFAULT 'RECEIVED',
            assigned_authority ${textType},
            assigned_rescue_team ${textType},
            evidence_url ${textType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault}),
            resolved_at ${textType},
            resolution_notes ${textType}
        )
    `);

    // 4. incident_updates
    await run(`
        CREATE TABLE IF NOT EXISTS incident_updates (
            id ${idType},
            incident_id ${textType} NOT NULL,
            updated_by_id ${textType} NOT NULL,
            updated_by_role ${textType} NOT NULL,
            status_from ${textType},
            status_to ${textType},
            note ${textType} NOT NULL,
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 5. shelters
    await run(`
        CREATE TABLE IF NOT EXISTS shelters (
            id ${idType},
            title ${textType} NOT NULL,
            status ${textType} DEFAULT 'Operational',
            capacity ${intType} DEFAULT 100,
            current_occupancy ${intType} DEFAULT 0,
            food_packets ${intType} DEFAULT 0,
            water_liters ${intType} DEFAULT 0,
            medical_kits ${intType} DEFAULT 0,
            blankets ${intType} DEFAULT 0,
            resources_summary ${textType} DEFAULT 'Standard Emergency Supplies',
            latitude ${numType} NOT NULL,
            longitude ${numType} NOT NULL,
            address ${textType},
            contact_phone ${textType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // Migration helper for shelters table resource columns
    try { await run(`ALTER TABLE shelters ADD COLUMN food_packets ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE shelters ADD COLUMN water_liters ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE shelters ADD COLUMN medical_kits ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE shelters ADD COLUMN blankets ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE shelters ADD COLUMN resources_summary ${textType} DEFAULT 'Standard Emergency Supplies'`); } catch (e) {}


    // 6. rescue_teams
    await run(`
        CREATE TABLE IF NOT EXISTS rescue_teams (
            id ${idType},
            name ${textType} NOT NULL,
            unit_code ${textType} UNIQUE NOT NULL,
            team_leader ${textType} NOT NULL,
            contact_phone ${textType},
            status ${textType} DEFAULT 'AVAILABLE',
            assigned_incident_id ${textType},
            current_lat ${numType},
            current_lng ${numType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 7. notifications
    await run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id ${idType},
            user_id ${textType},
            recipient_role ${textType} DEFAULT 'ALL',
            title ${textType} NOT NULL,
            message ${textType} NOT NULL,
            incident_id ${textType},
            type ${textType} DEFAULT 'INFO',
            is_read ${intType} DEFAULT 0,
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 8. weather_reports
    await run(`
        CREATE TABLE IF NOT EXISTS weather_reports (
            id ${idType},
            latitude ${numType} NOT NULL,
            longitude ${numType} NOT NULL,
            temperature ${numType},
            rainfall ${numType},
            wind_speed ${numType},
            humidity ${numType},
            condition ${textType},
            provider ${textType} DEFAULT 'Open-Meteo',
            fetched_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 9. audit_logs
    await run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id ${idType},
            user_id ${textType},
            user_role ${textType},
            action ${textType} NOT NULL,
            entity_type ${textType} NOT NULL,
            entity_id ${textType},
            details ${textType},
            ip_address ${textType},
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    console.log('[DB] All 9 relational database tables initialized successfully.');
}

module.exports = {
    initDatabase,
    query,
    get,
    run,
    isPostgres: () => isPostgres
};
