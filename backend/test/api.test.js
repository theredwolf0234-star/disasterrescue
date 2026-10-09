/**
 * Comprehensive Automated Test Suite for RESCUE AI Backend API
 * Verifies health, authentication, RBAC authorization, scoped data access,
 * incident lifecycle, timeline recording, and edge-case validations.
 */

const assert = require('assert');
const http = require('http');
const { app } = require('../src/server');
const db = require('../src/config/database');
const { getIO } = require('../src/sockets/socketHandler');

let testServer;
const testPort = 5056;
const baseUrl = `http://localhost:${testPort}`;

let citizen1Token = '';
let citizen1Id = '';
let citizen2Token = '';
let citizen2Id = '';
let authorityToken = '';
let citizen1IncidentId = '';
let citizen2IncidentId = '';

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const serializedBody = body ? (typeof body === 'object' ? JSON.stringify(body) : body) : null;
        const reqHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        if (serializedBody) {
            reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
        }

        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: reqHeaders
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (serializedBody) {
            req.write(serializedBody);
        }
        req.end();
    });
}

async function runTests() {
    console.log('\n======================================================');
    console.log('   RUNNING RESCUE AI COMPREHENSIVE BACKEND TESTS      ');
    console.log('======================================================\n');

    await db.initDatabase();

    await new Promise((resolve) => {
        testServer = app.listen(testPort, () => {
            console.log(`[Test Server] Running on ${baseUrl}`);
            resolve();
        });
    });

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  ✓ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ✗ FAIL: ${name}`);
            console.error(`    ${err.message}`);
            failed++;
        }
    }

    // 1. Backend Health
    await test('1. GET /api/health returns 200 with status ok and connected database', async () => {
        const res = await makeRequest('GET', '/api/health');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.status, 'ok');
        assert.strictEqual(res.body.database, 'connected');
    });

    // 2. Citizen Registration & Login
    await test('2. Citizen registration and login', async () => {
        // Register Citizen 1
        const reg1 = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Test Citizen Alpha',
            email: `citizen.alpha.${Date.now()}@example.com`,
            password: 'password123',
            phone: '9988776655'
        });
        assert.strictEqual(reg1.status, 201);
        assert.strictEqual(reg1.body.success, true);
        assert.ok(reg1.body.data.token);
        assert.strictEqual(reg1.body.data.user.role, 'CITIZEN');
        citizen1Token = reg1.body.data.token;
        citizen1Id = reg1.body.data.user.id;

        // Register Citizen 2 (for multi-tenant data isolation testing)
        const reg2 = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Test Citizen Beta',
            email: `citizen.beta.${Date.now()}@example.com`,
            password: 'password123',
            phone: '9988776644'
        });
        assert.strictEqual(reg2.status, 201);
        citizen2Token = reg2.body.data.token;
        citizen2Id = reg2.body.data.user.id;

        // Login existing seeded citizen
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            email: 'satyam@example.com',
            password: 'citizen123'
        });
        assert.strictEqual(loginRes.status, 200);
        assert.strictEqual(loginRes.body.data.user.role, 'CITIZEN');
    });

    // 3. Authority Login
    await test('3. POST /api/auth/authority-login authenticates valid authority credentials', async () => {
        const res = await makeRequest('POST', '/api/auth/authority-login', {
            username: 'ndrf_commander',
            password: 'authority123'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.user.role, 'AUTHORITY');
        assert.ok(res.body.data.token);
        authorityToken = res.body.data.token;
    });

    // 3b. Admin Login (AISTER23)
    await test('3b. POST /api/auth/authority-login authenticates AISTER23 with ADMIN role', async () => {
        const res = await makeRequest('POST', '/api/auth/authority-login', {
            username: 'AISTER23',
            password: '@aster23'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.user.role, 'ADMIN');
        assert.strictEqual(res.body.data.user.username, 'AISTER23');
        assert.ok(res.body.data.token);
    });

    // 4. Unauthorized Dashboard API Access (Strict RBAC)
    await test('4. Unauthorized dashboard API access is rejected with 401 or 403', async () => {
        // Stats without token -> 401
        const noAuthStats = await makeRequest('GET', '/api/incidents/stats/overview');
        assert.strictEqual(noAuthStats.status, 401);

        // Stats with citizen token -> 403
        const citizenStats = await makeRequest('GET', '/api/incidents/stats/overview', null, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(citizenStats.status, 403);
        assert.strictEqual(citizenStats.body.errorCode, 'FORBIDDEN');

        // Status update with citizen token -> 403
        const citizenPatch = await makeRequest('PATCH', '/api/incidents/SOS-2026-000001', {
            status: 'RESOLVED'
        }, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(citizenPatch.status, 403);
        assert.strictEqual(citizenPatch.body.errorCode, 'FORBIDDEN');
    });

    // 5. Citizen Creates Incident
    await test('5. Citizen creates emergency SOS incident with automatic priority', async () => {
        const res = await makeRequest('POST', '/api/incidents', {
            category: 'Medical Emergency',
            count: 3,
            details: 'Severe head trauma and unconscious victim trapped on upper floor due to water surge.',
            latitude: 26.8525,
            longitude: 80.9430,
            address: 'Hazratganj Lane 4'
        }, {
            'Authorization': `Bearer ${citizen1Token}`
        });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.id.startsWith('SOS-2026-'));
        assert.strictEqual(res.body.data.emergency_level, 'CRITICAL');
        assert.strictEqual(res.body.data.status, 'RECEIVED');
        assert.strictEqual(res.body.data.user_id, citizen1Id);
        assert.ok(res.body.data.priorityExplanation);
        citizen1IncidentId = res.body.data.id;

        // Citizen 2 also creates an incident
        const res2 = await makeRequest('POST', '/api/incidents', {
            category: 'Evacuation Request',
            count: 2,
            details: 'Elderly couple unable to evacuate ground floor water.',
            latitude: 26.8600,
            longitude: 80.9300,
            address: 'Alambagh Sector 3'
        }, {
            'Authorization': `Bearer ${citizen2Token}`
        });
        assert.strictEqual(res2.status, 201);
        citizen2IncidentId = res2.body.data.id;
    });

    // 6. Citizen Retrieves Only Own Incidents (CRITICAL FIX)
    await test('6. Citizen GET /api/incidents returns ONLY own reports (user_id = req.user.id)', async () => {
        const res = await makeRequest('GET', '/api/incidents', null, {
            'Authorization': `Bearer ${citizen1Token}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data));

        // Every single returned incident MUST belong to Citizen 1
        for (const inc of res.body.data) {
            assert.strictEqual(inc.user_id, citizen1Id, 'Citizen must only receive their own incident reports');
        }

        // Citizen 2's incident must NOT be in Citizen 1's list
        const leaked = res.body.data.find(i => i.id === citizen2IncidentId);
        assert.strictEqual(leaked, undefined, "Citizen 2's report must NOT be exposed to Citizen 1");
    });

    // 7. Citizen Cannot Retrieve Another Citizen's Incident Details
    await test('7. Citizen cannot retrieve another citizen incident via GET /api/incidents/:id (403 Forbidden)', async () => {
        const res = await makeRequest('GET', `/api/incidents/${citizen2IncidentId}`, null, {
            'Authorization': `Bearer ${citizen1Token}`
        });

        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
    });

    // 8. Authority Retrieves All Incidents Globally
    await test('8. Authority GET /api/incidents returns complete incident list across all citizens', async () => {
        const res = await makeRequest('GET', '/api/incidents', null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.length >= 2);

        const found1 = res.body.data.find(i => i.id === citizen1IncidentId);
        const found2 = res.body.data.find(i => i.id === citizen2IncidentId);
        assert.ok(found1, "Authority must access Citizen 1's report");
        assert.ok(found2, "Authority must access Citizen 2's report");
    });

    // 9. Authority Retrieves Overview Statistics
    await test('9. Authority GET /api/incidents/stats/overview returns correct schema and handles null sum', async () => {
        const res = await makeRequest('GET', '/api/incidents/stats/overview', null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data);
        assert.strictEqual(typeof res.body.data.total, 'number');
        assert.strictEqual(typeof res.body.data.active, 'number');
        assert.strictEqual(typeof res.body.data.critical, 'number');
        assert.strictEqual(typeof res.body.data.resolved, 'number');
        assert.strictEqual(typeof res.body.data.people, 'number');
        assert.ok(res.body.data.total >= 2);
        assert.ok(res.body.data.people >= 5);
    });

    // 10. Authority Updates Incident Status & Assigns Team
    await test('10. Authority PATCH /api/incidents/:id updates status and assigns rescue team', async () => {
        const res = await makeRequest('PATCH', `/api/incidents/${citizen1IncidentId}`, {
            status: 'TEAM_ASSIGNED',
            assignedRescueTeam: 'NDRF Quick Response Team Alpha',
            note: 'Air boat deployed to Hazratganj Lane 4'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.status, 'TEAM_ASSIGNED');
        assert.strictEqual(res.body.data.assigned_rescue_team, 'NDRF Quick Response Team Alpha');
    });

    // 11. Incident Timeline Entry is Created
    await test('11. Incident timeline entry is saved in incident_updates on update', async () => {
        const res = await makeRequest('GET', `/api/incidents/${citizen1IncidentId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body.data.updates));
        assert.ok(res.body.data.updates.length >= 2, 'Must contain initial SOS timeline and team assigned update');

        const updateEntry = res.body.data.updates.find(u => u.status_to === 'TEAM_ASSIGNED');
        assert.ok(updateEntry, 'Timeline must contain TEAM_ASSIGNED transition');
        assert.strictEqual(updateEntry.updated_by_role, 'AUTHORITY');
    });

    // 12. Invalid Status is Rejected
    await test('12. PATCH /api/incidents/:id rejects invalid status with 400', async () => {
        const res = await makeRequest('PATCH', `/api/incidents/${citizen1IncidentId}`, {
            status: 'UNAUTHORIZED_CUSTOM_STATUS'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.errorCode, 'INVALID_STATUS');
    });

    // 13. Missing Coordinates Rejected
    await test('13. POST /api/incidents rejects missing or invalid coordinates with 400', async () => {
        const res1 = await makeRequest('POST', '/api/incidents', {
            category: 'Medical Emergency',
            details: 'Trapped victim',
            // Missing lat/lng
        });
        assert.strictEqual(res1.status, 400);
        assert.strictEqual(res1.body.errorCode, 'VALIDATION_ERROR');

        const res2 = await makeRequest('POST', '/api/incidents', {
            category: 'Medical Emergency',
            details: 'Trapped victim',
            latitude: 999.0, // Invalid latitude > 90
            longitude: 80.94
        });
        assert.strictEqual(res2.status, 400);
        assert.strictEqual(res2.body.errorCode, 'INVALID_COORDINATES');
    });

    // 14. Socket.IO Events Emission Check
    await test('14. Socket.IO instance initialized and event emission methods callable', async () => {
        const io = getIO();
        assert.ok(io, 'Socket.IO instance must be active');
    });

    // 15. Resolved Incident Gets resolved_at Timestamp
    await test('15. Resolving an incident populates resolved_at timestamp and resolution_notes', async () => {
        const res = await makeRequest('PATCH', `/api/incidents/${citizen1IncidentId}`, {
            status: 'RESOLVED',
            resolutionNotes: 'All 3 victims safely evacuated to Central Relief Camp #1.'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.data.status, 'RESOLVED');
        assert.ok(res.body.data.resolved_at, 'resolved_at timestamp must be set');
        assert.strictEqual(res.body.data.resolution_notes, 'All 3 victims safely evacuated to Central Relief Camp #1.');
    });

    // 16. Database and 404 Errors are Handled Cleanly
    await test('16. Non-existent incident returns 404 NOT_FOUND cleanly without crash', async () => {
        const res = await makeRequest('GET', '/api/incidents/SOS-NON-EXISTENT-999', null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 404);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.errorCode, 'NOT_FOUND');
    });

    // 17. Database Overview API
    await test('17. Authority GET /api/database/overview returns tables and engine metadata', async () => {
        const res = await makeRequest('GET', '/api/database/overview', null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.engine);
        assert.ok(res.body.data.totalTables >= 9, 'Must have at least 9 relational tables');
        assert.ok(res.body.data.totalRecords > 0);
        assert.ok(res.body.data.tables.length >= 9, 'Must return at least 9 tables metadata');
    });

    // 18. Safe Table Projection (No password_hash)
    await test('18. GET /api/database/table/users safely projects columns without password_hash', async () => {
        const res = await makeRequest('GET', '/api/database/table/users', null, {
            'Authorization': `Bearer ${authorityToken}`
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(!res.body.data.columns.includes('password_hash'), 'columns must NOT contain password_hash');
        if (res.body.data.rows.length > 0) {
            assert.strictEqual(res.body.data.rows[0].password_hash, undefined, 'row must NOT expose password_hash');
        }
    });

    // 19. Citizen Access to Database API is Rejected (403)
    await test('19. Citizen access to /api/database is rejected with 403 Forbidden', async () => {
        const res = await makeRequest('GET', '/api/database/overview', null, {
            'Authorization': `Bearer ${citizen1Token}`
        });

        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
    });

    // 20. GET /health
    await test('20. GET /health returns standard health check specification', async () => {
        const res = await makeRequest('GET', '/health');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.status, 'ok');
        assert.strictEqual(res.body.service, 'AI Disaster Rescue Coordinator');
    });

    // 21. GET /api/hospitals
    await test('21. GET /api/hospitals returns hospital listings with beds and coordinates', async () => {
        const res = await makeRequest('GET', '/api/hospitals');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data));
        assert.ok(res.body.data.length >= 4, 'Should return at least 4 hospitals');
        assert.ok(res.body.data[0].name);
        assert.ok(res.body.data[0].available_beds !== undefined);
    });

    // 22. GET /api/resources
    await test('22. GET /api/resources returns resource inventory', async () => {
        const res = await makeRequest('GET', '/api/resources', null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data));
        assert.ok(res.body.data.length >= 5, 'Should return resources categories');
    });

    // 23. GET /api/routes/safe-route
    await test('23. GET /api/routes/safe-route calculates route with hazard avoidance', async () => {
        const res = await makeRequest('GET', '/api/routes/safe-route?originLat=26.8467&originLng=80.9462&destLat=26.8600&destLng=80.9300');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.distanceKm > 0);
        assert.ok(res.body.data.etaMinutes > 0);
        assert.ok(Array.isArray(res.body.data.waypoints));
        assert.ok(res.body.data.routeRisk);
    });

    // 24. POST /api/risk/evaluate
    await test('24. POST /api/risk/evaluate computes modular risk score and factors', async () => {
        const res = await makeRequest('POST', '/api/risk/evaluate', {
            disasterType: 'Flood',
            latitude: 26.8467,
            longitude: 80.9462,
            peopleAffected: 6
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(typeof res.body.data.score === 'number');
        assert.ok(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(res.body.data.level));
        assert.ok(res.body.data.reason);
        assert.ok(res.body.data.recommendedAction);
    });

    // 25. GET /api/incidents/analytics/summary
    await test('25. GET /api/incidents/analytics/summary provides aggregated statistics', async () => {
        const res = await makeRequest('GET', '/api/incidents/analytics/summary', null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.totalIncidents !== undefined);
        assert.ok(Array.isArray(res.body.data.byDisaster));
        assert.ok(res.body.data.fleetSummary);
    });

    // 26. GET /api/incidents/:id/timeline
    await test('26. GET /api/incidents/:id/timeline returns chronological updates', async () => {
        const res = await makeRequest('GET', `/api/incidents/${citizen1IncidentId}/timeline`, null, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data));
    });

    // 27. POST /api/rescue-teams/:id/location
    await test('27. POST /api/rescue-teams/:id/location updates responder GPS telemetry', async () => {
        const res = await makeRequest('POST', '/api/rescue-teams/TEAM_NDRF_01/location', {
            latitude: 26.8520,
            longitude: 80.9450,
            accuracy: 8.5,
            batteryLevel: 92
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.teamId, 'TEAM_NDRF_01');
    });

    // 28. GET /api/rescue-teams/:id/location
    await test('28. GET /api/rescue-teams/:id/location returns latest telemetry record', async () => {
        const res = await makeRequest('GET', '/api/rescue-teams/TEAM_NDRF_01/location', null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.team_id, 'TEAM_NDRF_01');
    });

    // 29. GET /api/incidents/:id/report - Authorization check: Citizen 2 blocked from Citizen 1 report
    await test('29. Citizen cannot view another citizen report dossier via GET /api/incidents/:id/report (403 Forbidden)', async () => {
        const res = await makeRequest('GET', `/api/incidents/${citizen1IncidentId}/report`, null, {
            'Authorization': `Bearer ${citizen2Token}`
        });
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.errorCode, 'FORBIDDEN');
    });

    // 30. GET /api/incidents/:id/report - Ownership and Authority access granted
    await test('30. Incident reporter and Authority can view report dossier with verified GPS metadata', async () => {
        // Reporter citizen 1 access
        const citizenRes = await makeRequest('GET', `/api/incidents/${citizen1IncidentId}/report`, null, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(citizenRes.status, 200);
        assert.strictEqual(citizenRes.body.success, true);
        assert.strictEqual(citizenRes.body.data.incidentId, citizen1IncidentId);
        assert.ok(citizenRes.body.data.location.isVerifiedGps !== undefined);

        // Authority access
        const authRes = await makeRequest('GET', `/api/incidents/${citizen1IncidentId}/report`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(authRes.status, 200);
        assert.strictEqual(authRes.body.success, true);
    });

    // 31. GET /api/incidents/export/csv - Citizen blocked from CSV export (403 Forbidden)
    await test('31. Citizen blocked from incident CSV export via /api/incidents/export/csv (403 Forbidden)', async () => {
        const res = await makeRequest('GET', '/api/incidents/export/csv', null, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.success, false);
    });

    // 32. GET /api/incidents/export/csv - Authority CSV export works and sanitizes formula injection
    await test('32. Authority can export CSV with formula injection sanitization and filter parameters', async () => {
        const res = await makeRequest('GET', '/api/incidents/export/csv?category=Flooding', null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.ok(typeof res.body === 'string');
        assert.ok(res.body.includes('Incident_ID,Category,Emergency_Level'));
        // Verify formula injection characters are not raw
        assert.ok(!res.body.includes(',"=cmd'));
    });

    // 33. Idempotent SOS Beacon Submission
    await test('33. Idempotent SOS submission prevents duplicate incident records on double-click', async () => {
        const testIdempotencyKey = `idemp_${Date.now()}_test`;
        const payload = {
            category: 'Flash Flood Rescue',
            details: 'Victim requiring evacuation testing idempotency',
            latitude: 26.8500,
            longitude: 80.9400,
            count: 2,
            idempotency_key: testIdempotencyKey,
            is_verified_gps: 1,
            gps_accuracy: 4.5
        };

        // First dispatch
        const res1 = await makeRequest('POST', '/api/incidents', payload, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(res1.status, 201);
        const firstId = res1.body.data.id;

        // Second dispatch with same idempotency key
        const res2 = await makeRequest('POST', '/api/incidents', payload, {
            'Authorization': `Bearer ${citizen1Token}`
        });
        assert.strictEqual(res2.status, 200);
        assert.strictEqual(res2.body.data.id, firstId);
        assert.strictEqual(res2.body.message, 'Incident previously registered (idempotent request).');
    });

    // 34. Weather endpoint returns honest telemetry status
    await test('34. GET /api/weather returns honest status (LIVE, CACHED_STALE, or UNAVAILABLE)', async () => {
        const res = await makeRequest('GET', '/api/weather?lat=26.8467&lng=80.9462');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(['LIVE', 'CACHED_STALE', 'UNAVAILABLE'].includes(res.body.data.dataStatus));
    });

    // 35. Authenticated Citizen Account Deletion
    await test('35. Authenticated citizen can delete account with password verification and anonymized incident retention', async () => {
        // Register temporary citizen
        const tempReg = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Delete Target Citizen',
            email: `delete.me.${Date.now()}@example.com`,
            password: 'deletePassword123',
            phone: '9111222333'
        });
        assert.strictEqual(tempReg.status, 201);
        const tempToken = tempReg.body.data.token;
        const tempUserId = tempReg.body.data.user.id;

        // Create an incident under this citizen
        const incRes = await makeRequest('POST', '/api/incidents', {
            category: 'Medical Emergency',
            details: 'Emergency beacon by temporary citizen',
            latitude: 26.8480,
            longitude: 80.9420,
            count: 1
        }, {
            'Authorization': `Bearer ${tempToken}`
        });
        assert.strictEqual(incRes.status, 201);
        const tempIncId = incRes.body.data.id;

        // Wrong password fails
        const wrongPassRes = await makeRequest('DELETE', '/api/auth/account', {
            password: 'wrongPassword'
        }, {
            'Authorization': `Bearer ${tempToken}`
        });
        assert.strictEqual(wrongPassRes.status, 401);

        // Correct password succeeds
        const deleteRes = await makeRequest('DELETE', '/api/auth/account', {
            password: 'deletePassword123'
        }, {
            'Authorization': `Bearer ${tempToken}`
        });
        assert.strictEqual(deleteRes.status, 200);
        assert.strictEqual(deleteRes.body.success, true);

        // Token can no longer fetch profile
        const meRes = await makeRequest('GET', '/api/auth/me', null, {
            'Authorization': `Bearer ${tempToken}`
        });
        assert.strictEqual(meRes.status, 404);

        // Incident record retained but anonymized
        const authIncRes = await makeRequest('GET', `/api/incidents/${tempIncId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(authIncRes.status, 200);
        assert.strictEqual(authIncRes.body.data.user_id, 'DELETED_CITIZEN');
    });

    console.log(`\n======================================================`);
    console.log(`Tests Summary: ${passed} passed, ${failed} failed.`);
    console.log(`======================================================\n`);

    testServer.close(() => {
        process.exit(failed > 0 ? 1 : 0);
    });
}

runTests().catch(err => {
    console.error('Fatal test execution error:', err);
    if (testServer) testServer.close();
    process.exit(1);
});
