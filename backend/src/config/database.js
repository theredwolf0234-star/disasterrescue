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

    // 17. ndrf_transmissions (National Disaster Response Force EOC / CAD Gateway Transmissions)
    await run(`
        CREATE TABLE IF NOT EXISTS ndrf_transmissions (
            id ${idType},
            incident_id ${textType} NOT NULL,
            cad_reference_id ${textType} NOT NULL,
            battalion_code ${textType} NOT NULL,
            battalion_name ${textType} NOT NULL,
            status ${textType} NOT NULL DEFAULT 'TRANSMITTED',
            relay_mode ${textType} NOT NULL DEFAULT 'SIMULATED',
            endpoint_url ${textType},
            priority ${textType} NOT NULL,
            eoc_officer ${textType},
            eta_minutes ${intType},
            distance_km ${numType},
            frequency_mhz ${textType},
            cap_identifier ${textType},
            cap_alert_xml ${textType},
            cap_alert_json ${textType},
            response_payload ${textType},
            error_message ${textType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 18. ngos (Registered Non-Governmental Organizations)
    await run(`
        CREATE TABLE IF NOT EXISTS ngos (
            id ${idType},
            name ${textType} NOT NULL,
            registration_number ${textType} NOT NULL,
            darpan_id ${textType},
            tax_exemption_number ${textType},
            contact_person ${textType} NOT NULL,
            official_email ${textType} UNIQUE NOT NULL,
            phone ${textType} NOT NULL,
            operational_areas ${textType} NOT NULL,
            services_offered ${textType} NOT NULL,
            emergency_capabilities ${textType},
            verification_doc_url ${textType},
            status ${textType} NOT NULL DEFAULT 'PENDING',
            reviewed_by ${textType},
            reviewed_at ${textType},
            rejection_reason ${textType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 19. ngo_users (NGO Authorized Staff Credentials)
    await run(`
        CREATE TABLE IF NOT EXISTS ngo_users (
            id ${idType},
            ngo_id ${textType} NOT NULL,
            full_name ${textType} NOT NULL,
            email ${textType} UNIQUE NOT NULL,
            password_hash ${textType} NOT NULL,
            role ${textType} DEFAULT 'NGO',
            is_active ${intType} DEFAULT 1,
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 20. volunteers (Managed Volunteer Personnel Under NGOs)
    await run(`
        CREATE TABLE IF NOT EXISTS volunteers (
            id ${idType},
            ngo_id ${textType} NOT NULL,
            full_name ${textType} NOT NULL,
            phone ${textType} NOT NULL,
            email ${textType},
            skills ${textType} NOT NULL,
            service_areas ${textType} NOT NULL,
            availability_status ${textType} DEFAULT 'AVAILABLE',
            assigned_incident_id ${textType},
            assigned_task ${textType},
            authorized_by ${textType},
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 21. ngo_relief_inventory (NGO Relief Supplies, Rations, Water, Shelter Capacity)
    await run(`
        CREATE TABLE IF NOT EXISTS ngo_relief_inventory (
            id ${idType},
            ngo_id ${textType} NOT NULL,
            resource_type ${textType} NOT NULL,
            resource_name ${textType} NOT NULL,
            available_quantity ${intType} DEFAULT 0,
            unit_measure ${textType} DEFAULT 'units',
            location_hub ${textType},
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 22. incident_ngo_assignments (Disaster Relief Tasks Assigned to NGOs)
    await run(`
        CREATE TABLE IF NOT EXISTS incident_ngo_assignments (
            id ${idType},
            incident_id ${textType} NOT NULL,
            ngo_id ${textType} NOT NULL,
            assigned_by_role ${textType} NOT NULL,
            assigned_by_id ${textType} NOT NULL,
            requested_services ${textType},
            status ${textType} NOT NULL DEFAULT 'ASSIGNED',
            decline_reason ${textType},
            assistance_notes ${textType},
            people_assisted ${intType} DEFAULT 0,
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 23. coordination_messages (Secure Inter-Agency Coordination Channel)
    await run(`
        CREATE TABLE IF NOT EXISTS coordination_messages (
            id ${idType},
            incident_id ${textType} NOT NULL,
            sender_id ${textType} NOT NULL,
            sender_role ${textType} NOT NULL,
            sender_name ${textType} NOT NULL,
            recipient_role ${textType} DEFAULT 'ALL',
            message ${textType} NOT NULL,
            is_urgent ${intType} DEFAULT 0,
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 24. government_alerts (Authorized NDMA SACHET / IMD Public Warnings)
    await run(`
        CREATE TABLE IF NOT EXISTS government_alerts (
            id ${idType},
            alert_identifier ${textType} UNIQUE NOT NULL,
            source_agency ${textType} NOT NULL,
            hazard_type ${textType} NOT NULL,
            severity ${textType} NOT NULL,
            affected_area ${textType} NOT NULL,
            centroid_lat ${numType} NOT NULL,
            centroid_lng ${numType} NOT NULL,
            radius_km ${numType} DEFAULT 25.0,
            official_instructions ${textType} NOT NULL,
            effective_from ${textType} NOT NULL,
            expires_at ${textType} NOT NULL,
            is_active ${intType} DEFAULT 1,
            last_synced_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 25. password_resets (Expiring Security Tokens for Password Recovery)
    await run(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id ${idType},
            user_id ${textType} NOT NULL,
            user_type ${textType} NOT NULL,
            email ${textType} NOT NULL,
            token ${textType} NOT NULL,
            expires_at ${textType} NOT NULL,
            used ${intType} DEFAULT 0,
            created_at ${textType} DEFAULT (${tsDefault})
        )
    `);

    // 26. login_attempt_logs (Audit Trail of Authentication Attempts for Brute-Force Monitoring)
    await run(`
        CREATE TABLE IF NOT EXISTS login_attempt_logs (
            id ${idType},
            ip_address ${textType} NOT NULL,
            identifier ${textType},
            user_type ${textType} DEFAULT 'AUTHORITY',
            success ${intType} NOT NULL,
            attempted_at ${textType} DEFAULT (${tsDefault})
        )
    `);
    try { await run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempt_logs(ip_address, attempted_at)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ident ON login_attempt_logs(identifier, attempted_at)`); } catch (e) {}

    // 27. rate_limit_records (Multi-instance / Server Restart Persistent Rate Limiting Store)
    await run(`
        CREATE TABLE IF NOT EXISTS rate_limit_records (
            key ${textType} PRIMARY KEY,
            total_hits ${intType} DEFAULT 1,
            reset_time ${textType} NOT NULL
        )
    `);

    // Migrations for authority_users login lockout & failed attempts
    try { await run(`ALTER TABLE authority_users ADD COLUMN failed_login_attempts ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE authority_users ADD COLUMN locked_until ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE authority_users ADD COLUMN last_failed_login ${textType}`); } catch (e) {}

    // Migrations for users login lockout & failed attempts
    try { await run(`ALTER TABLE users ADD COLUMN failed_login_attempts ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE users ADD COLUMN locked_until ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE users ADD COLUMN last_failed_login ${textType}`); } catch (e) {}

    // Migrations for users table (avatar, language, notifications)
    try { await run(`ALTER TABLE users ADD COLUMN avatar_url ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE users ADD COLUMN language_pref ${textType} DEFAULT 'en'`); } catch (e) {}
    try { await run(`ALTER TABLE users ADD COLUMN notification_prefs ${textType} DEFAULT '{"sms":true,"push":true,"email":true}'`); } catch (e) {}

    // Migrations for incidents table
    try { await run(`ALTER TABLE incidents ADD COLUMN tactical_grid_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN risk_score ${intType} DEFAULT 70`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN risk_factors ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN cluster_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN media_urls ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_vision_analysis ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN audio_url ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN recommended_action ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN is_verified_gps ${intType} DEFAULT 1`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN location_source ${textType} DEFAULT 'gps'`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN gps_accuracy ${numType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN gps_timestamp ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN idempotency_key ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_team_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_eta_minutes ${intType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_distance_km ${numType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_notes ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ack_deadline ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN acknowledged_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN escalation_level ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ndrf_cad_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ndrf_status ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ndrf_battalion ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ndrf_relayed_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN assigned_ngo_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ngo_assistance_status ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_duplicate_of_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_verification_summary ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_missing_info_flags ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_alert_zone_match ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_recommended_assistance ${textType}`); } catch (e) {}

    // Migrations for password_resets table (token_hash and code_hash)
    try { await run(`ALTER TABLE password_resets ADD COLUMN token_hash ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE password_resets ADD COLUMN code_hash ${textType}`); } catch (e) {}

    // Migrations for rescue_teams table
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN members ${intType} DEFAULT 6`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN type ${textType} DEFAULT 'Rapid Response'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN vehicle ${textType} DEFAULT 'All-Terrain Rescue Vehicle'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN equipment ${textType} DEFAULT 'First-Aid, Inflatable Rafts, Cutters'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN capabilities ${textType} DEFAULT 'General Rescue, First-Aid'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN active_incident_count ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN last_ack_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN operational_zone ${textType} DEFAULT 'ZONE_LUCKNOW'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN max_capacity ${intType} DEFAULT 2`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN last_location_update ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN is_verified_location ${intType} DEFAULT 1`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN notification_status ${textType} DEFAULT 'IDLE'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN skills ${textType}`); } catch (e) {}

    // 28. incident_assessments (Structured AI Solution Engine Analysis for SOS reports)
    await run(`
        CREATE TABLE IF NOT EXISTS incident_assessments (
            id ${idType},
            incident_id ${textType} UNIQUE NOT NULL,
            tactical_grid_id ${textType} NOT NULL,
            category ${textType} NOT NULL,
            summary ${textType} NOT NULL,
            validated_lat ${numType} NOT NULL,
            validated_lng ${numType} NOT NULL,
            location_description ${textType},
            urgency_level ${textType} NOT NULL,
            urgency_confidence ${intType} DEFAULT 85,
            supporting_factors ${textType} NOT NULL,
            people_affected ${intType} DEFAULT 1,
            reported_hazards ${textType} NOT NULL,
            resource_requirements ${textType} NOT NULL,
            recommended_steps ${textType} NOT NULL,
            verified_safety_guidance ${textType} NOT NULL,
            suitable_team_category ${textType} NOT NULL,
            routing_requirements ${textType} NOT NULL,
            missing_information ${textType} NOT NULL,
            uncertainty_flags ${textType} NOT NULL,
            source_timestamps ${textType} NOT NULL,
            ai_model ${textType} DEFAULT 'RULE_GROUNDED_ENGINE',
            is_fallback ${intType} DEFAULT 0,
            created_at ${textType} DEFAULT (${tsDefault}),
            updated_at ${textType} DEFAULT (${tsDefault})
        )
    `);
    try { await run(`CREATE INDEX IF NOT EXISTS idx_assessments_inc ON incident_assessments(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_assessments_grid ON incident_assessments(tactical_grid_id)`); } catch (e) {}

    // Migrations for incidents dispatch & lifecycle
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_distance_type ${textType} DEFAULT 'road'`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN escalation_reason ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN nearest_distance_km ${numType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN last_status_update ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN assignment_time ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN road_distance_km ${numType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN straight_line_distance_km ${numType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN dispatch_eta_text ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN routing_engine ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN ai_solution_assessment_id ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE incidents ADD COLUMN corroborating_incident_ids ${textType}`); } catch (e) {}

    // Migrations for notifications delivery tracking & resilience
    try { await run(`ALTER TABLE notifications ADD COLUMN delivery_status ${textType} DEFAULT 'DELIVERED'`); } catch (e) {}
    try { await run(`ALTER TABLE notifications ADD COLUMN retry_count ${intType} DEFAULT 0`); } catch (e) {}
    try { await run(`ALTER TABLE notifications ADD COLUMN last_attempt_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE notifications ADD COLUMN failure_reason ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE notifications ADD COLUMN is_test ${intType} DEFAULT 0`); } catch (e) {}

    // Migrations for rescue_teams assignment state machine
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN assignment_state ${textType} DEFAULT 'UNASSIGNED'`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN assigned_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN accepted_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN declined_at ${textType}`); } catch (e) {}
    try { await run(`ALTER TABLE rescue_teams ADD COLUMN decline_reason ${textType}`); } catch (e) {}

    try { await run(`ALTER TABLE weather_reports ADD COLUMN forecast_json ${textType}`); } catch (e) {}

    // Performance Indexes
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_tactical_grid ON incidents(tactical_grid_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_level ON incidents(emergency_level)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_team ON incidents(assigned_rescue_team)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_ndrf_cad ON incidents(ndrf_cad_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_incidents_ngo ON incidents(assigned_ngo_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_rescue_teams_status ON rescue_teams(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_media_incident ON media(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_risk_incident ON risk_analysis(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ndrf_tx_incident ON ndrf_transmissions(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ndrf_tx_cad ON ndrf_transmissions(cad_reference_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ndrf_tx_status ON ndrf_transmissions(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngos_status ON ngos(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngos_email ON ngos(official_email)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_users_email ON ngo_users(email)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_users_ngo ON ngo_users(ngo_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_volunteers_ngo ON volunteers(ngo_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(availability_status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_inventory_ngo ON ngo_relief_inventory(ngo_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_tasks_incident ON incident_ngo_assignments(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_tasks_ngo ON incident_ngo_assignments(ngo_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_ngo_tasks_status ON incident_ngo_assignments(status)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_coord_msg_incident ON coordination_messages(incident_id)`); } catch (e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_gov_alerts_active ON government_alerts(is_active)`); } catch (e) {}

    // Backfill any existing incidents missing tactical_grid_id
    try {
        const { computeTacticalGrid } = require('../utils/tacticalGrid');
        const ungridded = await query(`SELECT id, latitude, longitude FROM incidents WHERE (tactical_grid_id IS NULL OR tactical_grid_id = '') AND latitude IS NOT NULL`);
        for (const row of ungridded) {
            const gridRes = computeTacticalGrid(row.latitude, row.longitude);
            if (gridRes && gridRes.gridId) {
                await run(`UPDATE incidents SET tactical_grid_id = ? WHERE id = ?`, [gridRes.gridId, row.id]);
            }
        }
    } catch (bgErr) {
        console.warn('[DB] Tactical Grid backfill notice:', bgErr.message);
    }

    console.log('[DB] Core relational database tables and performance indexes verified.');
    await seedDefaultAdminAndAuthority();
}

async function seedDefaultAdminAndAuthority() {
    try {
        const bcrypt = require('bcryptjs');

        // 1. Secure Admin Bootstrap: Read credentials from deployment environment variables
        const bootstrapAdminUser = process.env.ADMIN_BOOTSTRAP_USER || process.env.ADMIN_USERNAME || 'AISTER23';
        const bootstrapAdminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD || '@aster23';
        const bootstrapAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || 'admin@aister23.gov.in';
        const forceAdminReset = process.env.ADMIN_FORCE_PASSWORD_RESET === 'true';

        const adminUser = await get(
            `SELECT id, username, password_hash, role FROM authority_users WHERE LOWER(username) = LOWER(?) OR LOWER(badge_number) = LOWER(?) OR role = 'ADMIN'`,
            [bootstrapAdminUser, bootstrapAdminUser]
        );

        if (!adminUser) {
            const adminHash = await bcrypt.hash(bootstrapAdminPass, 10);
            await run(
                `INSERT INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', datetime('now'), datetime('now'))`,
                [
                    'AUTH_admin_aister23',
                    bootstrapAdminUser,
                    bootstrapAdminEmail,
                    adminHash,
                    bootstrapAdminUser,
                    'Disaster Rescue Administration Command'
                ]
            );
            console.log(`[DB] Admin account '${bootstrapAdminUser}' securely bootstrapped.`);
        } else {
            // Preserve existing admin account and password; only reset if explicitly forced via env variable
            if (forceAdminReset) {
                const newHash = await bcrypt.hash(bootstrapAdminPass, 10);
                await run(
                    `UPDATE authority_users 
                     SET password_hash = ?, updated_at = datetime('now')
                     WHERE id = ?`,
                    [newHash, adminUser.id]
                );
                console.log(`[DB] Admin account '${adminUser.username}' password reset via ADMIN_FORCE_PASSWORD_RESET.`);
            } else {
                console.log(`[DB] Admin account '${adminUser.username}' verified and preserved (credentials maintained).`);
            }
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

        // 2b. Ensure verified field responder exists (Role: RESPONDER)
        const responderUser = await get(`SELECT id FROM authority_users WHERE LOWER(username) = LOWER('responder_alpha')`);
        if (!responderUser) {
            const responderHash = await bcrypt.hash('responder123', 10);
            await run(
                `INSERT OR REPLACE INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'RESPONDER', datetime('now'), datetime('now'))`,
                [
                    'AUTH_dev_responder_01',
                    'responder_alpha',
                    'alpha.leader@ndrf.gov.in',
                    responderHash,
                    'RESP-NDRF-11-A',
                    'NDRF Battalion 11 Unit Alpha'
                ]
            );
            console.log('[DB] NDRF Field Responder account verified and active (role: RESPONDER).');
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

        // 4. Ensure default rescue teams exist and operational attributes are set
        const defaultTeams = [
            ['TEAM_01', 'NDRF Battalion 11 Unit Alpha', 'NDRF-11-A', 'Insp. Rajesh Sharma', '+91 94150 11001', 'AVAILABLE', 8, 'Urban Search & Extrication', 'Heavy Rescue ARV-1', 'Hydraulic Spreaders, Search Cameras, Gas Detectors', 26.8500, 80.9400, 'ZONE_LUCKNOW', 2, 1, 'Urban Search & Extrication, First-Aid, Collapse Rescue, General Rescue'],
            ['TEAM_02', 'Gomti Flood Water Rescue Unit Boat-2', 'SDRF-W-02', 'Sub-Insp. Amit Verma', '+91 94150 11002', 'AVAILABLE', 6, 'Water Rescue & Inundation', 'Amphibious Motor Boat #2', 'Inflatable Gemini Boats, Life Jackets, Sonar Scanner', 26.8750, 80.9720, 'ZONE_LUCKNOW', 2, 1, 'Water Rescue & Inundation, Flood Evacuation, Aquatic Craft'],
            ['TEAM_03', 'Rapid Trauma & Triage Medical Squad 04', 'MED-SQ-04', 'Dr. Priya Saxena', '+91 94150 11003', 'AVAILABLE', 5, 'Medical Emergency Triage', 'Advanced Cardiac Life Support Ambulance', 'Defibrillators, Mobile Oxygen, Trauma Field Kits', 26.8390, 80.9320, 'ZONE_LUCKNOW', 2, 1, 'Medical Emergency Triage, Paramedic, Advanced Trauma Care, First-Aid'],
            ['TEAM_04', 'Civil Defense Hazard Response Squad', 'CD-HZ-01', 'Commander Vikram Singh', '+91 94150 11004', 'AVAILABLE', 10, 'Hazard & Debris Clearing', 'Hydraulic Crane & Earthmover', 'Chain Saws, Power Generators, Heavy Tow Cables', 26.8250, 80.9150, 'ZONE_LUCKNOW', 2, 1, 'Hazard & Debris Clearing, Fire Containment, Evacuation Assistance'],
            ['TEAM_05', 'NDRF Battalion 08 Quick Response Unit (NCR / Ghaziabad)', 'NDRF-08-NCR', 'Asst. Comdt. Alok Verma', '+91 94150 11005', 'AVAILABLE', 8, 'Urban Search & Extrication', 'All-Terrain Rescue Vehicle ARV-8', 'Hydraulic Cutters, Search Sensors, Gas Detectors, Life Jackets', 28.6692, 77.4538, 'ZONE_NCR_DELHI', 3, 1, 'Urban Search & Extrication, Structural Collapse, Hazmat, General Rescue, First-Aid'],
            ['TEAM_06', 'SDRF Noida Sector 29 Disaster Intervention Squad', 'SDRF-NOIDA-01', 'Insp. Neeraj Tyagi', '+91 94150 11006', 'AVAILABLE', 6, 'Rapid Water & Urban Rescue', 'Emergency Response Vehicle ERV-2', 'Inflatable Boats, Flood Evacuation Rafts, Trauma First-Aid', 28.5700, 77.3250, 'ZONE_NCR_DELHI', 2, 1, 'Water Rescue & Inundation, Flood Evacuation, Urban Extrication, First-Aid, General Rescue'],
            ['TEAM_07', 'Delhi Disaster Management Authority (DDMA Central Squad)', 'DDMA-CENTRAL-01', 'Capt. Sunita Rao', '+91 94150 11007', 'AVAILABLE', 6, 'Emergency Medical & Tactical Triage', 'ACLS Mobile Intensive Care Unit', 'Defibrillators, Cardiac Monitors, Trauma Kits, Evacuation Stretchers', 28.6139, 77.2090, 'ZONE_NCR_DELHI', 2, 1, 'Medical Emergency Triage, Paramedic, Trauma Field Kits, Evacuation Assistance, First-Aid'],
            ['TEAM_08', 'NDRF Battalion 11 Unit Bravo (Varanasi Base)', 'NDRF-11-VNS', 'Insp. Manoj Upadhyay', '+91 94150 11008', 'AVAILABLE', 8, 'Aquatic & Riverine Search Rescue', 'Twin-Engine Rescue Launch #4', 'Deep-Water Sonar, Life Rafts, Flood Evacuation Kits', 25.3176, 82.9739, 'ZONE_VARANASI', 2, 1, 'Water Rescue & Inundation, Flood Evacuation, Aquatic Craft, First-Aid']
        ];
        for (const t of defaultTeams) {
            await run(
                `INSERT OR IGNORE INTO rescue_teams (
                    id, name, unit_code, team_leader, contact_phone, status, members, type, vehicle, equipment, current_lat, current_lng, operational_zone, max_capacity, is_verified_location, last_location_update, skills, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))`,
                t
            );
        }

        // Align TEAM_02 coordinates to Gomti Barrage station if at old clash location
        await run(`UPDATE rescue_teams SET current_lat = 26.8750, current_lng = 80.9720 WHERE id = 'TEAM_02' AND current_lat = 26.8610`);

        // Backfill any teams that have null operational columns
        await run(`
            UPDATE rescue_teams SET
                operational_zone = CASE 
                    WHEN operational_zone IS NOT NULL AND operational_zone != '' THEN operational_zone
                    WHEN id IN ('TEAM_05', 'TEAM_06', 'TEAM_07') THEN 'ZONE_NCR_DELHI'
                    WHEN id = 'TEAM_08' THEN 'ZONE_VARANASI'
                    ELSE 'ZONE_LUCKNOW'
                END,
                max_capacity = COALESCE(max_capacity, 2),
                is_verified_location = COALESCE(is_verified_location, 1),
                last_location_update = COALESCE(last_location_update, datetime('now')),
                notification_status = COALESCE(notification_status, 'IDLE'),
                skills = COALESCE(skills, capabilities, type)
            WHERE operational_zone IS NULL OR max_capacity IS NULL OR last_location_update IS NULL OR skills IS NULL
        `);

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

        // 7. Ensure partner NGOs exist if table is empty
        const ngoCount = await get(`SELECT COUNT(*) as cnt FROM ngos`);
        if (!ngoCount || Number(ngoCount.cnt) === 0) {
            const ngos = [
                [
                    'NGO_REDCROSS_UP',
                    'Indian Red Cross Society (UP State Branch)',
                    'REG/UP/SOCIETY/1920/001',
                    'UP/2021/0284910',
                    'AAATI0123F',
                    'Dr. Alok Srivastava (Disaster Response Nodal)',
                    'coordinator@redcross-up.org',
                    '+91 94150 22334',
                    'Lucknow, Varanasi, Ayodhya, Prayagraj, Gorakhpur',
                    JSON.stringify(['MEDICAL', 'FOOD_RATIONS', 'POTABLE_WATER', 'VOLUNTEERS', 'FIRST_AID_TRAINING']),
                    'Field Mobile Medical Units, 120 Certified First-Aid Responders, Emergency Blood Stock, Triage Tents',
                    '/uploads/docs/redcross_darpan_cert.pdf',
                    'APPROVED',
                    'AUTH_admin_aister23',
                    new Date().toISOString()
                ],
                [
                    'NGO_GOONJ_RELIEF',
                    'Goonj Disaster Relief & Rehabilitation Network',
                    'REG/DL/TRUST/1999/4821',
                    'DL/2018/0192834',
                    'AAATG9876E',
                    'Meenakshi Gupta (Emergency Operations Head)',
                    'relief@goonj-up.org',
                    '+91 98110 33445',
                    'Lucknow, Kanpur, Sitapur, Barabanki, Unnao',
                    JSON.stringify(['FOOD_RATIONS', 'CLOTHING', 'SHELTER_KITS', 'SANITATION', 'DIGNITY_KITS']),
                    'Central Relief Warehouse in Lucknow, 4 Distribution Fleets, 3500 Ration & Cloth Kits on Standby',
                    '/uploads/docs/goonj_darpan_cert.pdf',
                    'APPROVED',
                    'AUTH_admin_aister23',
                    new Date().toISOString()
                ],
                [
                    'NGO_SEVA_BHARATI',
                    'Seva Bharati Disaster Relief Mission',
                    'REG/UP/TRUST/2004/1102',
                    'UP/2023/0394812',
                    'AAATS4567D',
                    'Ramesh Chandra Verma',
                    'contact@sevabharati-up.org',
                    '+91 94500 55667',
                    'Lucknow Urban & Rural',
                    JSON.stringify(['COMMUNITY_KITCHEN', 'VOLUNTEER_MOBILIZATION', 'TEMPORARY_SHELTER']),
                    '18 Community Kitchen Hubs, 80 Local Volunteers ready for debris clearance',
                    '/uploads/docs/seva_bharati_doc.pdf',
                    'PENDING',
                    null,
                    null
                ]
            ];

            for (const n of ngos) {
                await run(
                    `INSERT INTO ngos (id, name, registration_number, darpan_id, tax_exemption_number, contact_person, official_email, phone, operational_areas, services_offered, emergency_capabilities, verification_doc_url, status, reviewed_by, reviewed_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    n
                );
            }
            console.log('[DB] Partner NGOs seeded and verified.');
        }

        // 8. Ensure NGO staff user credentials exist
        const ngoUserCount = await get(`SELECT COUNT(*) as cnt FROM ngo_users`);
        if (!ngoUserCount || Number(ngoUserCount.cnt) === 0) {
            const ngoHash = await bcrypt.hash('ngo123', 10);
            const ngoUsers = [
                ['NGO_USR_01', 'NGO_REDCROSS_UP', 'Dr. Alok Srivastava', 'coordinator@redcross-up.org', ngoHash],
                ['NGO_USR_02', 'NGO_GOONJ_RELIEF', 'Meenakshi Gupta', 'relief@goonj-up.org', ngoHash]
            ];

            for (const u of ngoUsers) {
                await run(
                    `INSERT INTO ngo_users (id, ngo_id, full_name, email, password_hash, role, is_active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, 'NGO', 1, datetime('now'), datetime('now'))`,
                    u
                );
            }
            console.log('[DB] NGO coordinator accounts verified (password: ngo123).');
        }

        // 9. Ensure default NGO volunteers exist
        const volCount = await get(`SELECT COUNT(*) as cnt FROM volunteers`);
        if (!volCount || Number(volCount.cnt) === 0) {
            const volunteers = [
                ['VOL_01', 'NGO_REDCROSS_UP', 'Anil Verma', '+91 98765 43210', 'anil.v@redcross.org', 'Advanced First-Aid, CPR, Triage Sorting', 'Hazratganj, Qaiserbagh', 'AVAILABLE', 'Dr. Alok Srivastava'],
                ['VOL_02', 'NGO_REDCROSS_UP', 'Sunita Mishra', '+91 98765 43211', 'sunita.m@redcross.org', 'Nursing, Patient Evacuation, Psychosocial Support', 'Chowk, Old Lucknow', 'AVAILABLE', 'Dr. Alok Srivastava'],
                ['VOL_03', 'NGO_GOONJ_RELIEF', 'Vikas Pandey', '+91 98765 43212', 'vikas.p@goonj.org', 'Heavy Logistics, Truck Driving, Debris Clearance', 'Gomti Nagar, Indira Nagar', 'AVAILABLE', 'Meenakshi Gupta'],
                ['VOL_04', 'NGO_GOONJ_RELIEF', 'Pooja Tiwari', '+91 98765 43213', 'pooja.t@goonj.org', 'Food Rations Packing, Community Kitchen Management', 'Alambagh, Charbagh', 'AVAILABLE', 'Meenakshi Gupta']
            ];

            for (const v of volunteers) {
                await run(
                    `INSERT INTO volunteers (id, ngo_id, full_name, phone, email, skills, service_areas, availability_status, authorized_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, datetime('now'), datetime('now'))`,
                    v
                );
            }
        }

        // 10. Ensure default NGO relief inventory exists
        const invCount = await get(`SELECT COUNT(*) as cnt FROM ngo_relief_inventory`);
        if (!invCount || Number(invCount.cnt) === 0) {
            const inventory = [
                ['NGO_INV_01', 'NGO_REDCROSS_UP', 'MEDICAL_KITS', 'Trauma First-Aid Field Satchels', 150, 'kits', 'Red Cross Hazratganj Medical Depot'],
                ['NGO_INV_02', 'NGO_REDCROSS_UP', 'POTABLE_WATER', 'Clean Drinking Water Packets (1L)', 3500, 'liters', 'Red Cross Gomti Relief Center'],
                ['NGO_INV_03', 'NGO_GOONJ_RELIEF', 'FOOD_RATIONS', '72-Hour Dry Ration Packs (Dal, Rice, Biscuits)', 1200, 'packets', 'Goonj Central Logistics Depot, Transport Nagar'],
                ['NGO_INV_04', 'NGO_GOONJ_RELIEF', 'SHELTER_CAPACITY', 'Emergency Tarpaulins & Folding Cots', 300, 'cots', 'Goonj Regional Staging Warehouse'],
                ['NGO_INV_05', 'NGO_GOONJ_RELIEF', 'VOLUNTEER_CREW', 'Trained Relief Logistics Volunteers', 45, 'volunteers', 'Lucknow Urban Sector Hub']
            ];

            for (const i of inventory) {
                await run(
                    `INSERT INTO ngo_relief_inventory (id, ngo_id, resource_type, resource_name, available_quantity, unit_measure, location_hub, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    i
                );
            }
        }

        // 11. Ensure authorized NDMA SACHET public alerts exist
        const alertCount = await get(`SELECT COUNT(*) as cnt FROM government_alerts`);
        if (!alertCount || Number(alertCount.cnt) === 0) {
            const now = new Date();
            const tomorrow = new Date(Date.now() + 48 * 3600 * 1000);
            const alerts = [
                [
                    'GOV_ALT_01',
                    'SACHET-UP-2026-FL-001',
                    'NDMA SACHET (Official Disaster Alert Portal)',
                    'Riverine Flood / High Inundation Warning',
                    'SEVERE',
                    'Lucknow, Gomti River Basin Low-Lying Catchments',
                    26.8525,
                    80.9500,
                    15.0,
                    'Gomti River water discharge elevated. Residents along low-lying riverfronts must move to designated multi-hazard shelters. Avoid approaching riverbanks or submerged underpasses.',
                    now.toISOString(),
                    tomorrow.toISOString(),
                    1,
                    now.toISOString()
                ],
                [
                    'GOV_ALT_02',
                    'SACHET-UP-2026-HW-002',
                    'IMD / NDMA (Meteorological Division)',
                    'Severe Heatwave & Dehydration Advisory',
                    'MODERATE',
                    'Central Uttar Pradesh Urban Corridors',
                    26.8467,
                    80.9462,
                    30.0,
                    'Temperatures forecast exceeding 42°C with high UV index. Stay hydrated, avoid direct sun exposure between 11:00 AM and 4:00 PM, and utilize municipal hydration kiosks.',
                    now.toISOString(),
                    tomorrow.toISOString(),
                    1,
                    now.toISOString()
                ]
            ];

            for (const a of alerts) {
                await run(
                    `INSERT INTO government_alerts (id, alert_identifier, source_agency, hazard_type, severity, affected_area, centroid_lat, centroid_lng, radius_km, official_instructions, effective_from, expires_at, is_active, last_synced_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    a
                );
            }
            console.log('[DB] Authorized NDMA SACHET Government Alerts seeded.');
        }
    } catch (seedErr) {
        console.warn('[DB] Auto-seed warning:', seedErr.message);
    }
}

module.exports = {
    initDatabase,
    initDB: initDatabase,
    query,
    all: query,
    get,
    run,
    isPostgres: () => isPostgres
};
