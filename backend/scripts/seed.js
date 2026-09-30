require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const { generateUUID } = require('../src/utils/idGenerator');

async function seed() {
    console.log('[Seed] Initializing database schema...');
    await db.initDatabase();

    console.log('[Seed] Seeding development data...');

    // 1. Citizen Users
    const citizenPassword = await bcrypt.hash('citizen123', 10);
    const citizenId = 'USR_dev_citizen_01';

    await db.run(
        `INSERT OR REPLACE INTO users (id, full_name, email, password_hash, phone, emergency_phone, blood_group, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CITIZEN', datetime('now'), datetime('now'))`,
        [
            citizenId,
            'Satyam Pathak',
            'satyam@example.com',
            citizenPassword,
            '9876543210',
            '9123456789',
            'O+ Positive'
        ]
    );

    // 2. Authority Users
    const authorityPassword = await bcrypt.hash('authority123', 10);
    const authId = 'AUTH_dev_officer_01';

    await db.run(
        `INSERT OR REPLACE INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'AUTHORITY', datetime('now'), datetime('now'))`,
        [
            authId,
            'ndrf_commander',
            'officer@ndrf.gov.in',
            authorityPassword,
            'NDRF-HQ-DELHI-01',
            'National Disaster Response Force (NDRF)'
        ]
    );

    // 2b. Admin User (AISTER23)
    const adminPassword = await bcrypt.hash('@aster23', 10);
    const adminId = 'AUTH_admin_aister23';

    await db.run(
        `INSERT OR REPLACE INTO authority_users (id, username, email, password_hash, badge_number, organization, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', datetime('now'), datetime('now'))`,
        [
            adminId,
            'AISTER23',
            'admin@aster23.gov.in',
            adminPassword,
            'ASTER-HQ-CMD-01',
            'Disaster Command Administration'
        ]
    );

    // 3. Shelters
    const shelters = [
        {
            id: 'SHELTER_01',
            title: 'Central Relief Camp #1 (Hazratganj Community Complex)',
            status: 'Operational',
            capacity: 250,
            current_occupancy: 42,
            food_packets: 850,
            water_liters: 2400,
            medical_kits: 65,
            blankets: 320,
            resources_summary: '850 Meal Packets, 2400L Potable Water, 65 Trauma First-Aid Kits, 320 Thermal Blankets, 15kVA Generator',
            latitude: 26.8467,
            longitude: 80.9462,
            address: 'Hazratganj Multi-Utility Centre, Lucknow, UP',
            contact_phone: '+91 522 2238491'
        },
        {
            id: 'SHELTER_02',
            title: 'NDRF Disaster Medical Base Station #2',
            status: 'Operational',
            capacity: 150,
            current_occupancy: 68,
            food_packets: 400,
            water_liters: 1500,
            medical_kits: 120,
            blankets: 180,
            resources_summary: '400 Meal Packets, 1500L Water, 120 Advanced Trauma Kits, 12 Oxygen Cylinders, 180 Blankets',
            latitude: 26.8550,
            longitude: 80.9320,
            address: 'Near Gomti Barrage, Riverfront Zone, Lucknow, UP',
            contact_phone: '+91 522 2614990'
        },
        {
            id: 'SHELTER_03',
            title: 'Alambagh Safe Evacuation Refuge #3',
            status: 'Operational',
            capacity: 300,
            current_occupancy: 15,
            food_packets: 1200,
            water_liters: 3500,
            medical_kits: 45,
            blankets: 450,
            resources_summary: '1200 Meal Packets, 3500L Potable Water, 45 First-Aid Kits, 450 Blankets, 2 Inflatable Rafts',
            latitude: 26.8150,
            longitude: 80.9080,
            address: 'Alambagh High Grounds, Lucknow, UP',
            contact_phone: '+91 522 2451020'
        }
    ];

    for (const s of shelters) {
        await db.run(
            `INSERT OR REPLACE INTO shelters (id, title, status, capacity, current_occupancy, food_packets, water_liters, medical_kits, blankets, resources_summary, latitude, longitude, address, contact_phone, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [s.id, s.title, s.status, s.capacity, s.current_occupancy, s.food_packets, s.water_liters, s.medical_kits, s.blankets, s.resources_summary, s.latitude, s.longitude, s.address, s.contact_phone]
        );
    }

    // 4. Rescue Teams
    const teams = [
        {
            id: 'TEAM_NDRF_01',
            name: 'NDRF Quick Response Team Alpha',
            unit_code: 'NDRF-ALPHA',
            team_leader: 'Capt. Rajesh Varma',
            contact_phone: '+91 94150 11223',
            status: 'AVAILABLE',
            current_lat: 26.8480,
            current_lng: 80.9420
        },
        {
            id: 'TEAM_SDRF_02',
            name: 'SDRF Aquatic Extraction Unit 4',
            unit_code: 'SDRF-BOAT-4',
            team_leader: 'Insp. Amit Singh',
            contact_phone: '+91 94150 44556',
            status: 'DISPATCHED',
            current_lat: 26.8520,
            current_lng: 80.9380
        },
        {
            id: 'TEAM_MED_03',
            name: 'State Trauma Paramedic Unit 2',
            unit_code: 'MED-PARAMEDIC-2',
            team_leader: 'Dr. Priya Saxena',
            contact_phone: '+91 94150 77889',
            status: 'STANDBY',
            current_lat: 26.8400,
            current_lng: 80.9500
        }
    ];

    for (const t of teams) {
        await db.run(
            `INSERT OR REPLACE INTO rescue_teams (id, name, unit_code, team_leader, contact_phone, status, assigned_incident_id, current_lat, current_lng, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, datetime('now'), datetime('now'))`,
            [t.id, t.name, t.unit_code, t.team_leader, t.contact_phone, t.status, t.current_lat, t.current_lng]
        );
    }

    // 5. Sample Incidents with Unique Standardized Format SOS-2026-XXXXXX
    const sampleIncidents = [
        {
            id: 'SOS-2026-000001',
            userId: citizenId,
            category: 'Medical Emergency',
            emergencyLevel: 'CRITICAL',
            count: 3,
            details: 'Severe head trauma and compound fracture following concrete wall collapse in flash water surge.',
            latitude: 26.8525,
            longitude: 80.9430,
            address: 'Lane 4, Near Hazratganj Metro Station, Lucknow',
            status: 'IN_PROGRESS',
            assignedAuthority: 'ndrf_commander',
            assignedRescueTeam: 'State Trauma Paramedic Unit 2'
        },
        {
            id: 'SOS-2026-000002',
            userId: null,
            category: 'Trapped / Collapse',
            emergencyLevel: 'HIGH',
            count: 4,
            details: 'Rising water submerging ground floor apartment. 4 family members including an infant trapped on terrace.',
            latitude: 26.8610,
            longitude: 80.9370,
            address: 'Sector B, Gomti Nagar Riverfront, Lucknow',
            status: 'DISPATCHED',
            assignedAuthority: 'ndrf_commander',
            assignedRescueTeam: 'SDRF Aquatic Extraction Unit 4'
        },
        {
            id: 'SOS-2026-000003',
            userId: null,
            category: 'Evacuation Request',
            emergencyLevel: 'MEDIUM',
            count: 2,
            details: 'Elderly couple unable to evacuate ground floor due to flooded street entrance. Safe on first floor.',
            latitude: 26.8390,
            longitude: 80.9250,
            address: 'Old City Chowk Sector 2, Lucknow',
            status: 'RECEIVED',
            assignedAuthority: null,
            assignedRescueTeam: null
        }
    ];

    for (const inc of sampleIncidents) {
        await db.run(
            `INSERT OR REPLACE INTO incidents (
                id, user_id, category, emergency_level, count, details,
                latitude, longitude, readable_address, status,
                assigned_authority, assigned_rescue_team, evidence_url,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))`,
            [
                inc.id,
                inc.userId,
                inc.category,
                inc.emergencyLevel,
                inc.count,
                inc.details,
                inc.latitude,
                inc.longitude,
                inc.address,
                inc.status,
                inc.assignedAuthority,
                inc.assignedRescueTeam
            ]
        );

        // Timeline log
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, NULL, ?, ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                inc.id,
                authId,
                'AUTHORITY',
                inc.status,
                `Incident initialized in command triage. Priority assessed: ${inc.emergencyLevel}.`
            ]
        );
    }

    console.log('[Seed] Seeding completed successfully!');
    process.exit(0);
}

seed().catch((err) => {
    console.error('[Seed] Error seeding database:', err);
    process.exit(1);
});
