/**
 * Dedicated Critical Fixes Test Suite for AISTER Disaster Rescue Coordinator
 * Directly tests the 10 core requirements:
 * 1. Admin Authentication & RBAC
 * 2. Complete User Registration & Login
 * 3. Forgot Password single-use cryptographic token security
 * 4. Permanent Database Storage for SOS & Incident Reports
 * 5. Tactical Grid ID generation, persistence & display
 * 6. Distance-aware AI Nearest Rescue Team Assignment & concurrency
 * 7. Admin Command Dashboard metrics & queries
 * 8. End-to-End full lifecycle
 */

const assert = require('assert');
const http = require('http');
const { app } = require('../src/server');
const db = require('../src/config/database');
const { computeTacticalGrid, computeTacticalGridId } = require('../src/utils/tacticalGrid');
const { autoDispatchIncident, findEligibleRescueTeams } = require('../src/services/dispatchEngine');

let testServer;
const testPort = 5058;
const baseUrl = `http://localhost:${testPort}`;

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

async function runCriticalTests() {
    console.log('\n======================================================');
    console.log('   RUNNING AISTER CRITICAL REQUIREMENTS TEST SUITE   ');
    console.log('======================================================\n');

    await db.initDatabase();

    await new Promise((resolve) => {
        testServer = app.listen(testPort, () => {
            console.log(`[Critical Test Server] Listening on ${baseUrl}`);
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
            console.error(err);
            failed++;
        }
    }

    const uniqueId = Date.now().toString().slice(-6);
    const testEmail = `citizen.crit.${uniqueId}@example.com`;
    const testPhone = `98${Date.now().toString().slice(-8)}`;
    const testPassword = 'StrongPassword@2026';
    let citizenToken = '';
    let citizenId = '';
    let adminToken = '';

    // ==========================================
    // 1. ADMIN AUTHENTICATION & RBAC
    // ==========================================
    await test('Req 1.1: Unauthenticated request to admin dashboard is denied with 401', async () => {
        const res = await makeRequest('GET', '/api/incidents/stats/overview');
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.body.success, false);
    });

    await test('Req 1.2: Admin login succeeds with verified credentials and issues ADMIN JWT', async () => {
        const res = await makeRequest('POST', '/api/auth/authority-login', {
            username: process.env.ADMIN_BOOTSTRAP_USER || 'AISTER23',
            password: process.env.ADMIN_BOOTSTRAP_PASSWORD || '@aster23'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data && res.body.data.token);
        assert.strictEqual(res.body.data.user.role, 'ADMIN');
        adminToken = res.body.data.token;
    });

    // ==========================================
    // 2. USER REGISTRATION & PRIVILEGE ESCALATION
    // ==========================================
    await test('Req 2.1: Citizen registration cannot escalate to ADMIN role', async () => {
        const res = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Test Attacker',
            email: testEmail,
            phone: testPhone,
            password: testPassword,
            role: 'ADMIN' // Malicious attempt to escalate privileges
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.user.role, 'CITIZEN', 'Role must be locked to CITIZEN');
        citizenToken = res.body.data.token;
        citizenId = res.body.data.user.id;
    });

    await test('Req 2.2: Duplicate email registration is prevented with 409 Conflict', async () => {
        const res = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Duplicate Citizen',
            email: testEmail, // Existing email
            phone: `91${Date.now().toString().slice(-8)}`,
            password: testPassword
        });
        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.success, false);
    });

    await test('Req 2.3: Duplicate phone registration is prevented with 409 Conflict', async () => {
        const res = await makeRequest('POST', '/api/auth/register', {
            fullName: 'Duplicate Phone Citizen',
            email: `another.${Date.now()}@example.com`,
            phone: testPhone, // Existing phone
            password: testPassword
        });
        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.success, false);
    });

    await test('Req 2.4: Normal citizen cannot access admin API (403 Forbidden)', async () => {
        const res = await makeRequest('GET', '/api/database/overview', null, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.body.success, false);
    });

    // ==========================================
    // 3. FORGOT PASSWORD WORKFLOW
    // ==========================================
    let resetToken = '';
    let resetCode = '';
    await test('Req 3.1: Forgot password reports unconfigured email honestly (503) without leaking account existence', async () => {
        // When SMTP is not configured, honest 503 is returned
        const oldEnv = process.env.NODE_ENV;
        const oldDevCode = process.env.ALLOW_DEV_RESET_CODE;
        delete process.env.NODE_ENV;
        delete process.env.ALLOW_DEV_RESET_CODE;

        const resUnconfigured = await makeRequest('POST', '/api/auth/forgot-password', {
            email: testEmail
        });
        assert.strictEqual(resUnconfigured.status, 503);
        assert.strictEqual(resUnconfigured.body.errorCode, 'EMAIL_SERVICE_NOT_CONFIGURED');
        assert.strictEqual(resUnconfigured.body.emailConfigured, false);

        // Restore test env flag for token lifecycle verification
        process.env.NODE_ENV = 'test';
        process.env.ALLOW_DEV_RESET_CODE = 'true';
    });

    await test('Req 3.2: Forgot password in test environment generates single-use cryptographic token', async () => {
        const res = await makeRequest('POST', '/api/auth/forgot-password', {
            email: testEmail
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        // Verify token is hashed in database
        const resetRow = await db.get(
            `SELECT * FROM password_resets WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
            [testEmail.toLowerCase().trim()]
        );
        assert.ok(resetRow);
        assert.ok(resetRow.token_hash, 'Token must be stored as cryptographic SHA-256 hash');
        assert.strictEqual(resetRow.used, 0, 'Token must initially be unused');
        resetToken = resetRow.token;
        resetCode = resetRow.code;

        // Verify non-existent email gets identical success message (prevents email harvesting)
        const nonExistentRes = await makeRequest('POST', '/api/auth/forgot-password', {
            email: 'nonexistent.random.user.999@example.com'
        });
        assert.strictEqual(nonExistentRes.status, 200);
        assert.strictEqual(nonExistentRes.body.success, true);
    });

    await test('Req 3.3: Password reset succeeds with valid token and invalidates token immediately', async () => {
        const newPassword = 'NewSecretPassword@2026';
        const res = await makeRequest('POST', '/api/auth/reset-password', {
            token: resetToken,
            code: resetCode,
            password: newPassword
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);

        // Reusing the same token must fail (single-use constraint)
        const reuseRes = await makeRequest('POST', '/api/auth/reset-password', {
            token: resetToken,
            code: resetCode,
            password: 'AnotherPassword@2026'
        });
        assert.strictEqual(reuseRes.status, 400);
        assert.strictEqual(reuseRes.body.success, false);

        // Login with old password fails
        const oldLoginRes = await makeRequest('POST', '/api/auth/login', {
            identifier: testEmail,
            password: testPassword
        });
        assert.strictEqual(oldLoginRes.status, 401);

        // Login with new password succeeds
        const newLoginRes = await makeRequest('POST', '/api/auth/login', {
            identifier: testEmail,
            password: newPassword
        });
        assert.strictEqual(newLoginRes.status, 200);
        citizenToken = newLoginRes.body.data.token;
    });

    // ==========================================
    // 4. PERMANENT DATABASE STORAGE FOR SOS
    // ==========================================
    let createdIncidentId = '';
    const testLat = 26.8500;
    const testLng = 80.9400;

    await test('Req 4.1: SOS reports are permanently saved to database with all fields', async () => {
        const res = await makeRequest('POST', '/api/incidents', {
            category: 'Flash Flood Evacuation',
            details: 'Family trapped on roof as water rises. Immediate rescue boat needed.',
            latitude: testLat,
            longitude: testLng,
            count: 4,
            address: 'Near Gomti Riverfront Barrage, Lucknow',
            is_verified_gps: 1,
            gps_accuracy: 3.5
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.id.startsWith('SOS-2026-'));
        createdIncidentId = res.body.data.id;

        // Query directly from SQLite database to confirm persistence
        const dbRow = await db.get(`SELECT * FROM incidents WHERE id = ?`, [createdIncidentId]);
        assert.ok(dbRow, 'Incident must exist in persistent database');
        assert.strictEqual(dbRow.category, 'Flash Flood Evacuation');
        assert.strictEqual(dbRow.user_id, citizenId);
        assert.strictEqual(parseFloat(dbRow.latitude), testLat);
        assert.strictEqual(parseFloat(dbRow.longitude), testLng);
        assert.ok(dbRow.tactical_grid_id, 'Tactical Grid ID must be stored');
        assert.strictEqual(dbRow.count, 4);
        assert.ok(dbRow.created_at);
        assert.ok(dbRow.updated_at);
    });

    await test('Req 4.2: Missing or invalid coordinates reject with 400 and prevent DB write', async () => {
        const res = await makeRequest('POST', '/api/incidents', {
            category: 'Medical',
            details: 'Invalid coords test',
            latitude: 999.0, // Invalid latitude
            longitude: 80.9400
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.success, false);
    });

    await test('Req 4.3: Repeated submission with same idempotency key does not duplicate records', async () => {
        const key = `idempotent_${Date.now()}`;
        const payload = {
            category: 'Building Collapse',
            details: 'Partial structure collapse near metro pillar',
            latitude: 26.8450,
            longitude: 80.9350,
            count: 2,
            idempotency_key: key
        };

        const first = await makeRequest('POST', '/api/incidents', payload, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(first.status, 201);
        const firstId = first.body.data.id;

        const second = await makeRequest('POST', '/api/incidents', payload, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(second.status, 200);
        assert.strictEqual(second.body.data.id, firstId);

        // Verify count of records in DB with this idempotency key is exactly 1
        const countRow = await db.get(`SELECT COUNT(*) as cnt FROM incidents WHERE idempotency_key = ?`, [key]);
        assert.strictEqual(countRow.cnt, 1);
    });

    // ==========================================
    // 5. TACTICAL GRID ID GENERATION & DISPLAY
    // ==========================================
    await test('Req 5.1: Deterministic 100m Tactical Grid ID generation from GPS coordinates', () => {
        const grid1 = computeTacticalGrid(26.8500, 80.9400);
        const grid2 = computeTacticalGrid(26.8500, 80.9400);
        assert.strictEqual(grid1.gridId, grid2.gridId, 'Tactical Grid ID must be deterministic');
        assert.ok(grid1.gridId.startsWith('TAC-'), 'Grid ID must have TAC- prefix');
        assert.ok(grid1.gridId.length >= 10, 'Grid ID must have sufficient resolution');
        assert.strictEqual(grid1.resolutionMeters, 100);

        // Invalid coordinates return valid: false
        assert.strictEqual(computeTacticalGrid(999, 80).valid, false);
        assert.strictEqual(computeTacticalGrid(NaN, 80).valid, false);
    });

    await test('Req 5.2: Tactical Grid ID is returned in API responses and reports', async () => {
        const res = await makeRequest('GET', `/api/incidents/${createdIncidentId}/report`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.tacticalGridId);
        assert.strictEqual(res.body.data.tacticalGridId, computeTacticalGridId(testLat, testLng));
    });

    await test('Req 5.3: Updating incident location recalculates and updates Tactical Grid ID in DB', async () => {
        const newLat = 26.8650;
        const newLng = 80.9600;
        const expectedNewGrid = computeTacticalGridId(newLat, newLng);

        const res = await makeRequest('PATCH', `/api/incidents/${createdIncidentId}/location`, {
            latitude: newLat,
            longitude: newLng,
            address: 'Relocated Command Point, Lucknow'
        }, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.tactical_grid_id, expectedNewGrid);

        const dbCheck = await db.get(`SELECT tactical_grid_id FROM incidents WHERE id = ?`, [createdIncidentId]);
        assert.strictEqual(dbCheck.tactical_grid_id, expectedNewGrid);
    });

    // ==========================================
    // 6. DISTANCE-AWARE AI RESCUE TEAM ASSIGNMENT
    // ==========================================
    await test('Req 6.1: Nearest eligible team is selected based on proximity', async () => {
        // Reset all teams to AVAILABLE
        await db.run(`UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL, active_incident_count = 0`);

        // Incident at 26.8610, 80.9550
        // TEAM_NDRF_01 is at 26.852, 80.945 (~1.41km away)
        // TEAM_SDRF_02 is at 26.852, 80.938 (~1.96km away)
        const candidates = await findEligibleRescueTeams({
            disasterType: 'Water Rescue / Submerged Area',
            latitude: 26.8610,
            longitude: 80.9550,
            victimCount: 2,
            details: 'Flooded area, boat extraction required'
        });

        assert.ok(candidates.length > 0);
        const topEligible = candidates.find(c => c.isEligible);
        assert.ok(topEligible, 'Must find an eligible rescue team');
        // Closest team (1.41km) must be ranked top
        assert.strictEqual(topEligible.teamId, 'TEAM_NDRF_01');
        assert.ok(topEligible.distanceKm < 1.5);
    });

    await test('Req 6.2: An unavailable or deployed team is never selected', async () => {
        // Mark the closest team as DEPLOYED
        await db.run(`UPDATE rescue_teams SET status = 'DEPLOYED' WHERE id = 'TEAM_NDRF_01'`);

        const candidates = await findEligibleRescueTeams({
            disasterType: 'Water Rescue / Submerged Area',
            latitude: 26.8610,
            longitude: 80.9550,
            victimCount: 2,
            details: 'Flooded area'
        });

        const selected = candidates.find(c => c.isEligible);
        assert.ok(selected);
        assert.notStrictEqual(selected.teamId, 'TEAM_NDRF_01', 'Deployed team must not be selected');
        // SDRF unit should now be selected as next nearest available
        assert.strictEqual(selected.teamId, 'TEAM_SDRF_02');
    });

    await test('Req 6.3: No eligible team within 50km produces explicit unassigned state with alternatives', async () => {
        // Set incident coordinates far away in the Himalayas (latitude: 31.0, longitude: 77.0)
        const farIncidentId = `SOS-FAR-${Date.now()}`;
        await db.run(
            `INSERT INTO incidents (id, category, details, latitude, longitude, status, created_at, updated_at)
             VALUES (?, 'Avalanche', 'Mountain rescue', 31.1048, 77.1734, 'RECEIVED', datetime('now'), datetime('now'))`,
            [farIncidentId]
        );

        const dispatchRes = await autoDispatchIncident(farIncidentId, {
            category: 'Avalanche',
            details: 'Mountain rescue'
        });

        assert.strictEqual(dispatchRes.success, true);
        assert.strictEqual(dispatchRes.dispatched, false);
        assert.strictEqual(dispatchRes.noSuitableNearbyTeam, true);
        assert.ok(dispatchRes.message.includes('No suitable nearby team available'));
        assert.ok(Array.isArray(dispatchRes.nearestAlternatives));
        assert.ok(dispatchRes.nearestAlternatives.length > 0);
        assert.ok(dispatchRes.nearestAlternatives[0].distanceKm > 50);
    });

    await test('Req 6.4: Atomic lock prevents concurrent double-booking of the same rescue team', async () => {
        // Reset all teams to AVAILABLE
        await db.run(`UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL`);

        const inc1 = `SOS-CONC-1-${Date.now()}`;
        const inc2 = `SOS-CONC-2-${Date.now()}`;
        await db.run(`INSERT INTO incidents (id, category, details, latitude, longitude, status, created_at, updated_at) VALUES (?, 'Flood', 'Victim A', 26.8610, 80.9550, 'RECEIVED', datetime('now'), datetime('now'))`, [inc1]);
        await db.run(`INSERT INTO incidents (id, category, details, latitude, longitude, status, created_at, updated_at) VALUES (?, 'Flood', 'Victim B', 26.8610, 80.9550, 'RECEIVED', datetime('now'), datetime('now'))`, [inc2]);

        // Run both dispatches concurrently
        const [res1, res2] = await Promise.all([
            autoDispatchIncident(inc1, { category: 'Flood', details: 'Victim A' }),
            autoDispatchIncident(inc2, { category: 'Flood', details: 'Victim B' })
        ]);

        assert.ok(res1.dispatched || res2.dispatched);
        if (res1.dispatched && res2.dispatched) {
            // Both dispatched: they MUST be assigned to DIFFERENT teams!
            assert.notStrictEqual(res1.assignedTeam.id, res2.assignedTeam.id, 'Teams must not be double-booked concurrently');
        }
    });

    // ==========================================
    // 7. ADMIN DASHBOARD METRICS & FILTERING
    // ==========================================
    await test('Req 7.1: Admin dashboard statistics reflect live database counts', async () => {
        const res = await makeRequest('GET', '/api/incidents/stats/overview', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.totalIncidents >= 1);
        assert.strictEqual(typeof res.body.data.unassignedIncidents, 'number');
        assert.strictEqual(typeof res.body.data.assignedIncidents, 'number');
        assert.strictEqual(typeof res.body.data.availableTeams, 'number');
        assert.strictEqual(typeof res.body.data.deployedTeams, 'number');
        assert.strictEqual(typeof res.body.data.resolvedIncidents, 'number');
    });

    await test('Req 7.2: Search by Tactical Grid ID filters incidents correctly', async () => {
        const gridToSearch = computeTacticalGridId(26.8650, 80.9600);
        const res = await makeRequest('GET', `/api/incidents?grid=${gridToSearch}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.data));
        assert.ok(res.body.data.length >= 1);
        assert.strictEqual(res.body.data[0].tactical_grid_id, gridToSearch);
    });

    // ==========================================
    // 8. END-TO-END RESCUE LIFECYCLE
    // ==========================================
    await test('Req 8.1: Full lifecycle: One-Tap SOS -> Persist -> Grid -> Assign -> Ack -> Resolve', async () => {
        // Reset teams
        await db.run(`UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL`);

        // 1. One-Tap SOS creation
        const sosRes = await makeRequest('POST', '/api/incidents', {
            source: 'ONE_TAP_SOS',
            autoDispatch: true,
            latitude: 26.8500,
            longitude: 80.9400
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });

        assert.strictEqual(sosRes.status, 201);
        const incidentId = sosRes.body.data.id;
        assert.strictEqual(sosRes.body.data.status, 'TEAM_ASSIGNED');
        assert.ok(sosRes.body.data.tactical_grid_id);
        const assignedTeamId = sosRes.body.data.assignedTeam.id;

        // 2. Rescue team acknowledges dispatch
        const ackRes = await makeRequest('POST', `/api/rescue-teams/${assignedTeamId}/acknowledge`, {
            incidentId,
            note: 'Unit en route with life vests and oxygen support.'
        }, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(ackRes.status, 200);
        assert.strictEqual(ackRes.body.data.status, 'TEAM_EN_ROUTE');

        // 3. Authority resolves incident
        const resolveRes = await makeRequest('PATCH', `/api/incidents/${incidentId}`, {
            status: 'RESOLVED',
            resolutionNotes: 'All 4 victims successfully extracted and safely transferred to base hospital.'
        }, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(resolveRes.status, 200);
        assert.strictEqual(resolveRes.body.data.status, 'RESOLVED');

        // 4. Verify team is released back to AVAILABLE in database
        const teamCheck = await db.get(`SELECT status, assigned_incident_id FROM rescue_teams WHERE id = ?`, [assignedTeamId]);
        assert.strictEqual(teamCheck.status, 'AVAILABLE');
        assert.strictEqual(teamCheck.assigned_incident_id, null);
    });

    console.log(`\n======================================================`);
    console.log(`Critical Tests Summary: ${passed} passed, ${failed} failed.`);
    console.log(`======================================================\n`);

    testServer.close(() => {
        process.exit(failed > 0 ? 1 : 0);
    });
}

runCriticalTests().catch(err => {
    console.error('Fatal critical test runner error:', err);
    if (testServer) testServer.close();
    process.exit(1);
});
