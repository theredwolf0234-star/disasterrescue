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

    // 10. hospitals (Emergency Trauma Centers & Bed/Ambulance Capacity)
    await run(`
        CREATE TABLE IF NOT EXISTS hospitals (
            id ${idType},
            name ${textType} NOT NULL,
            latitude ${numType} NOT NULL,
            longitude ${numType} NOT NULL,
            address ${textType},
            emergency_status ${textType} DEFAULT 'OPERATIONAL',
            total_beds ${intType} DEFAULT 200,
            available_beds ${intType} DEFAULT 45,
            icu_beds ${intType} DEFAULT 12,
            available_ambulances ${intType} DEFAULT 4,
            contact_phone ${textType},
            trauma_level ${textType} DEFAULT 'Level-1 Trauma Center',
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 11. resources (Fleet, Boats, Ambulances, Fire Trucks, Rations)
    await run(`
        CREATE TABLE IF NOT EXISTS resources (
            id ${idType},
            category ${textType} NOT NULL,
            resource_name ${textType} NOT NULL,
            total_units ${intType} DEFAULT 10,
            available_units ${intType} DEFAULT 8,
            deployed_units ${intType} DEFAULT 2,
            unit_description ${textType},
            location_hub ${textType} DEFAULT 'Central Emergency Depot',
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 12. media (Multi-file evidence: Photos, Videos, Voice SOS audio)
    await run(`
        CREATE TABLE IF NOT EXISTS media (
            id ${idType},
            incident_id ${textType} NOT NULL,
            file_url ${textType} NOT NULL,
            file_type ${textType} NOT NULL,
            file_name ${textType},
            file_size ${intType},
            ai_analysis_json ${textType},
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 13. risk_analysis (Modular AI Disaster Risk Engine Assessments)
    await run(`
        CREATE TABLE IF NOT EXISTS risk_analysis (
            id ${idType},
            incident_id ${textType} NOT NULL,
            disaster_type ${textType} NOT NULL,
            risk_score ${intType} NOT NULL,
            risk_level ${textType} NOT NULL,
            factors_json ${textType},
            reason ${textType} NOT NULL,
            confidence ${intType} DEFAULT 85,
            recommended_action ${textType},
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 14. incident_clusters (Geospatial & Temporal Incident Aggregations)
    await run(`
        CREATE TABLE IF NOT EXISTS incident_clusters (
            id ${idType},
            cluster_name ${textType} NOT NULL,
            disaster_type ${textType} NOT NULL,
            centroid_lat ${numType} NOT NULL,
            centroid_lng ${numType} NOT NULL,
            radius_km ${numType} DEFAULT 2.0,
            incident_count ${intType} DEFAULT 1,
            total_victims ${intType} DEFAULT 1,
            priority ${textType} DEFAULT 'HIGH',
            status ${textType} DEFAULT 'ACTIVE',
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 15. team_locations (Responder Periodic Telemetry)
    await run(`
        CREATE TABLE IF NOT EXISTS team_locations (
            id ${idType},
            team_id ${textType} NOT NULL,
            latitude ${numType} NOT NULL,
            longitude ${numType} NOT NULL,
            accuracy ${numType},
            battery_level ${numType},
            timestamp ${textType} DEFAULT (${tsDefault}),
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 16. push_subscriptions (Android FCM / Web Push Tokens)
    await run(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id ${idType},
            user_id ${textType},
            device_token ${textType},
            endpoint ${textType},
            p256dh ${textType},
            auth ${textType},
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);


    // Migrations for incidents table
    try { await run(`ALTER TABLE incidents ADD COLUMN risk_score ${intType} DEFAULT 70`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN risk_factors ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN cluster_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN media_urls ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_vision_analysis ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN audio_url ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN recommended_action ${textType}`); } catch (e) {}

    // Migrations for rescue_teams table
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN members ${intType} DEFAULT 6`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN type ${textType} DEFAULT 'Rapid Response'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN vehicle ${textType} DEFAULT 'All-Terrain Rescue Vehicle'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN equipment ${textType} DEFAULT 'First-Aid, Inflatable Rafts, Cutters'`); } catch (e) {}

    // Performance Indexes
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_level ON incidents(emergency_level)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_team ON incidents(assigned_rescue_team)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_rescue_teams_status ON rescue_teams(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_media_incident ON media(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_risk_incident ON risk_analysis(incident_id)`); } catch (e) {}

    console.log('[DB] Core relational database tables and performance indexes verified.');
    await seedDefaultAdminAndAuthority();
}

async function seedDefaultAdminAndAuthority() {
    try {
        const bcrypt = require('bcryptjs');

        // 1. Ensure Admin AISTER23 exists with password @aster23
        const adminHash = await bcrypt.hash('@aster23', 10);
        const adminUser = await get(`SELECT id FROM authority_users WHERE LOWER(username) = LOWER('AISTER23') OR LOWER(badge_number) = LOWER('AISTER23')`);
        if (!adminUser) {
            await run(
                `INSERT OR REPLACE INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', datetime('now'), datetime('now'))`,
                [
                    'AUTH_admin_aister23',
                    'AISTER23',
                    'admin@aster23.gov.in',
                    adminHash,
                    'AISTER23',
                    'Disaster Rescue Administration Command'
                ]
            );
            console.log('[DB] Admin account AISTER23 created and verified.');
        } else {
            await run(
                `UPDATE authority_users 
                 SET password_hash = ?, badge_number = 'AISTER23', role = 'ADMIN', updated_at = datetime('now')
                 WHERE id = ?`,
                [adminHash, adminUser.id]
            );
            console.log('[DB] Admin account AISTER23 verified and active.');
        }

        // 2. Ensure ndrf_commander exists
        const officerUser = await get(`SELECT id FROM authority_users WHERE LOWER(username) = LOWER('ndrf_commander')`);
        if (!officerUser) {
            const officerHash = await bcrypt.hash('authority123', 10);
            await run(
                `INSERT OR REPLACE INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'AUTHORITY', datetime('now'), datetime('now'))`,
                [
                    'AUTH_dev_officer_01',
                    'ndrf_commander',
                    'officer@ndrf.gov.in',
                    officerHash,
                    'NDRF-HQ-DELHI-01',
                    'National Disaster Response Force (NDRF)'
                ]
            );
            console.log('[DB] NDRF Authority account verified and active.');
        }

        // 3. Ensure default shelters exist if table is empty
        const shelterCount = await get(`SELECT COUNT(*) as cnt FROM shelters`);
        if (!shelterCount || Number(shelterCount.cnt) === 0) {
            const shelters = [
                ['SHELTER_01', 'Central Relief Camp #1 (Hazratganj Community Complex)', 'Operational', 250, 42, 850, 2400, 65, 320, '850 Meal Packets, 2400L Potable Water, 65 Trauma First-Aid Kits', 26.8467, 80.9462, 'Near Hazratganj Metro Station, Lucknow', '0522-261122'],
                ['SHELTER_02', 'Gomti Nagar Indoor Stadium Relief Station #2', 'Operational', 400, 118, 1400, 4500, 120, 500, '1400 Meal Packets, 4500L Potable Water, Emergency Surgical Kits', 26.8525, 80.9982, 'Vipin Khand, Gomti Nagar, Lucknow', '0522-272044'],
                ['SHELTER_03', 'Alambagh Safe Evacuation Refuge #3', 'Operational', 180, 25, 600, 1800, 40, 200, '600 Meal Packets, 1800L Potable Water, 40 First-Aid Kits', 26.8142, 80.9015, 'Kanpur Road, Alambagh, Lucknow', '0522-245100']
            ];
            for (const s of shelters) {
                await run(
                    `INSERT INTO shelters (id, title, status, capacity, current_occupancy, food_packets, water_liters, medical_kits, blankets, resources_summary, latitude, longitude, address, contact_phone, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    s
                );
            }
        }

        // 4. Ensure default rescue teams exist if table is empty
        const teamCount = await get(`SELECT COUNT(*) as cnt FROM rescue_teams`);
        if (!teamCount || Number(teamCount.cnt) === 0) {
            const teams = [
                ['TEAM_01', 'NDRF Battalion 11 Unit Alpha', 'NDRF-11-A', 'Insp. Rajesh Sharma', '+91 94150 11001', 'AVAILABLE', 8, 'Urban Search & Extrication', 'Heavy Rescue ARV-1', 'Hydraulic Spreaders, Search Cameras, Gas Detectors', 26.8500, 80.9400],
                ['TEAM_02', 'Gomti Flood Water Rescue Unit Boat-2', 'SDRF-W-02', 'Sub-Insp. Amit Verma', '+91 94150 11002', 'AVAILABLE', 6, 'Water Rescue & Inundation', 'Amphibious Motor Boat #2', 'Inflatable Gemini Boats, Life Jackets, Sonar Scanner', 26.8610, 80.9550],
                ['TEAM_03', 'Rapid Trauma & Triage Medical Squad 04', 'MED-SQ-04', 'Dr. Priya Saxena', '+91 94150 11003', 'AVAILABLE', 5, 'Medical Emergency Triage', 'Advanced Cardiac Life Support Ambulance', 'Defibrillators, Mobile Oxygen, Trauma Field Kits', 26.8390, 80.9320],
                ['TEAM_04', 'Civil Defense Hazard Response Squad', 'CD-HZ-01', 'Commander Vikram Singh', '+91 94150 11004', 'AVAILABLE', 10, 'Hazard & Debris Clearing', 'Hydraulic Crane & Earthmover', 'Chain Saws, Power Generators, Heavy Tow Cables', 26.8250, 80.9150]
            ];
            for (const t of teams) {
                await run(
                    `INSERT INTO rescue_teams (id, name, unit_code, team_leader, contact_phone, status, members, type, vehicle, equipment, current_lat, current_lng, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    t
                );
            }
        }

        // 5. Ensure default emergency hospitals exist if table is empty
        const hospitalCount = await get(`SELECT COUNT(*) as cnt FROM hospitals`);
        if (!hospitalCount || Number(hospitalCount.cnt) === 0) {
            const hospitals = [
                ['HOSP_01', "King George's Medical University (KGMU) Trauma Center", 26.8693, 80.9167, 'Shah Mina Road, Chowk, Lucknow', 'OPERATIONAL', 350, 68, 24, 8, '0522-2257540', 'Level-1 Apex Trauma Center'],
                ['HOSP_02', 'Dr. Ram Manohar Lohia Institute of Medical Sciences', 26.8625, 81.0062, 'Vibhuti Khand, Gomti Nagar, Lucknow', 'OPERATIONAL', 280, 52, 18, 6, '0522-6692000', 'Super Specialty Emergency Hospital'],
                ['HOSP_03', 'Sanjay Gandhi Postgraduate Institute (SGPGIMS)', 26.7441, 80.9392, 'Raebareli Road, Lucknow', 'OPERATIONAL', 400, 85, 30, 10, '0522-2494000', 'Quaternary Emergency & Critical Care'],
                ['HOSP_04', 'Dr. Shyama Prasad Mukherjee Civil Hospital', 26.8432, 80.9419, 'Park Road, Hazratganj, Lucknow', 'OPERATIONAL', 150, 28, 8, 4, '0522-2239014', 'District Emergency Hospital']
            ];
            for (const h of hospitals) {
                await run(
                    `INSERT INTO hospitals (id, name, latitude, longitude, address, emergency_status, total_beds, available_beds, icu_beds, available_ambulances, contact_phone, trauma_level, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    h
                );
            }
        }

        // 6. Ensure default resource fleet inventory exists if table is empty
        const resCount = await get(`SELECT COUNT(*) as cnt FROM resources`);
        if (!resCount || Number(resCount.cnt) === 0) {
            const resources = [
                ['RES_01', 'AMBULANCE', 'Advanced Life Support (ALS) Ambulances', 14, 9, 5, 'Equipped with portable ventilators and oxygen support', 'Central Trauma Depot'],
                ['RES_02', 'RESCUE_BOAT', 'Inflatable Zodiac & Motorized Rescue Boats', 8, 6, 2, 'Outboard motor rafts with 10-person payload', 'Gomti Riverfront Barrage Station'],
                ['RES_03', 'FIRE_VEHICLE', 'High-Pressure Fire Engines & Water Cannons', 10, 8, 2, '5000L water capacity with foam induction system', 'Hazratganj Fire Station'],
                ['RES_04', 'RESCUE_TEAM', 'Trained NDRF / SDRF Search & Rescue Teams', 12, 9, 3, 'Specialized multi-hazard rescue personnel squads', 'Battalion 11 Command HQ'],
                ['RES_05', 'MEDICAL_KIT', 'Comprehensive Trauma & Surgical Field Packs', 250, 195, 55, 'Sterile dressings, tourniquets, analgesics, splints', 'Civil Medical Supply Depot'],
                ['RES_06', 'SHELTER_BED', 'Emergency Relief Cots & Blankets', 830, 645, 185, 'Foldable emergency beds with thermal insulation', 'Regional Logistics Warehouse'],
                ['RES_07', 'RATION_PACK', 'Emergency MRE Food & Potable Water Kits', 2850, 2150, 700, '72-hour nutritional survival rations & water pouches', 'Food & Civil Supplies Reserve']
            ];
            for (const r of resources) {
                await run(
                    `INSERT INTO resources (id, category, resource_name, total_units, available_units, deployed_units, unit_description, location_hub, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    r
                );
            }
        }
    } catch (seedErr) {
        console.warn('[DB] Auto-seed warning:', seedErr.message);
    }
}

module.exports = {
    initDatabase,
    query,
    get,
    run,
    isPostgres: () => isPostgres
};
