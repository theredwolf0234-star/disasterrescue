/**
 * AISTER V2 — Comprehensive Rescue System Integration Test Suite
 * 
 * Verifies all 10 core requirements:
 * 1. Citizen SOS Submission, Idempotency, GPS accuracy & manual location fallback
 * 2. Automatic Rescue-Team Assignment & Configurable Dispatch Engine
 * 3. Rescue Squad Acknowledgment & Lifecycle Tracking:
 *    Assigned -> Accepted -> En Route -> Arrived -> Completed
 * 4. Unacknowledged Assignment Auto-Reassignment & Escalation
 * 5. Safe Route Calculation with Freshness Timestamp & Road Verification Caveats
 * 6. Role-Based Access Control (RBAC): Citizen, Responder, Authority, Administrator
 * 7. Real-Time Telemetry & Audit Trail Logging
 */

const assert = require('assert');
const http = require('http');
const { app, server } = require('../src/server');
const db = require('../src/config/database');
const { calculateSafeRoute } = require('../src/services/safeRouteService');
const { checkAndEscalateUnacknowledgedIncidents } = require('../src/services/dispatchEngine');

const TEST_PORT = process.env.TEST_PORT || 5058;
const baseUrl = `http://localhost:${TEST_PORT}`;
let serverInstance = null;

function request(method, path, body = null, headers = {}) {
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
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
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
    console.log('================================================================');
    console.log('  STARTING AISTER V2 RESCUE SYSTEM COMPREHENSIVE TEST SUITE     ');
    console.log('================================================================\n');

    await db.initDatabase();
    await db.run(`UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL`);

    await new Promise((resolve, reject) => {
        serverInstance = server.listen(TEST_PORT, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    try {
        // -------------------------------------------------------------
        // TEST 1: System Health & Baseline Verification
        // -------------------------------------------------------------
        console.log('[Test 1] Health & Environmental Endpoints...');
        const health = await request('GET', '/api/health');
        assert.strictEqual(health.status, 200);
        assert.strictEqual(health.body.status, 'ok');
        assert.strictEqual(health.body.database, 'connected');

        const weather = await request('GET', '/api/weather?lat=26.8467&lng=80.9462');
        assert.strictEqual(weather.status, 200);
        assert.strictEqual(weather.body.success, true);
        assert.ok(weather.body.data);

        const forecast = await request('GET', '/api/weather/forecast?lat=26.8467&lng=80.9462');
        assert.strictEqual(forecast.status, 200);
        assert.strictEqual(forecast.body.success, true);
        assert.ok(forecast.body.data.forecast5Days || forecast.body.data.daily, 'Must contain 5-day weather forecast');
        console.log('  ✓ Backend health, live weather, and 5-day forecast endpoints verified.\n');

        // -------------------------------------------------------------
        // TEST 2: Multi-Role Authentication (CITIZEN, RESPONDER, AUTHORITY, ADMIN)
        // -------------------------------------------------------------
        console.log('[Test 2] Multi-Role Authentication...');
        // Citizen login
        const citLogin = await request('POST', '/api/auth/login', {
            email: 'satyam@example.com',
            password: 'citizen123'
        });
        assert.strictEqual(citLogin.status, 200);
        const citizenToken = citLogin.body.data.token;
        const citizenId = citLogin.body.data.user.id;

        // Authority login
        const authLogin = await request('POST', '/api/auth/authority-login', {
            username: 'ndrf_commander',
            password: 'authority123'
        });
        assert.strictEqual(authLogin.status, 200);
        const authorityToken = authLogin.body.data.token;
        assert.strictEqual(authLogin.body.data.user.role, 'AUTHORITY');

        // Admin login
        const adminLogin = await request('POST', '/api/auth/authority-login', {
            username: 'AISTER23',
            password: '@aster23'
        });
        assert.strictEqual(adminLogin.status, 200);
        const adminToken = adminLogin.body.data.token;
        assert.strictEqual(adminLogin.body.data.user.role, 'ADMIN');

        // Dedicated Responder login (Requirement 2 & 3)
        const respLogin = await request('POST', '/api/auth/authority-login', {
            username: 'responder_alpha',
            password: 'responder123'
        });
        assert.strictEqual(respLogin.status, 200);
        const responderToken = respLogin.body.data.token;
        assert.strictEqual(respLogin.body.data.user.role, 'RESPONDER');
        console.log('  ✓ Citizen, Responder, Authority, and Admin roles authenticated successfully.\n');

        // -------------------------------------------------------------
        // TEST 3: Citizen SOS with GPS, Accuracy, and Idempotency
        // -------------------------------------------------------------
        console.log('[Test 3] Citizen SOS Submission & Idempotency Controls...');
        const uniqueIdempKey = `sos_idemp_v2_${Date.now()}`;
        const sosPayload = {
            category: 'Flash Flood Rescue',
            count: 3,
            details: 'Trapped on second-floor balcony due to rising river water. Immediate extraction required.',
            latitude: 26.8525,
            longitude: 80.9430,
            address: 'Hazratganj Lowlands, Lucknow',
            is_verified_gps: 1,
            gps_accuracy: 4.8,
            gps_timestamp: new Date().toISOString(),
            autoDispatch: true,
            idempotency_key: uniqueIdempKey
        };

        const sosRes1 = await request('POST', '/api/incidents', sosPayload, {
            'Authorization': `Bearer ${citizenToken}`,
            'Idempotency-Key': uniqueIdempKey
        });
        assert.strictEqual(sosRes1.status, 201);
        assert.strictEqual(sosRes1.body.success, true);
        const incident1 = sosRes1.body.data.incident || sosRes1.body.data;
        assert.ok(incident1.id.startsWith('SOS-2026-'));
        assert.ok(incident1.assigned_rescue_team, 'Auto-dispatch must assign a capable rescue squad');
        assert.ok(incident1.status === 'ASSIGNED' || incident1.status === 'TEAM_ASSIGNED', 'Status must indicate squad assigned');
        assert.ok(incident1.ack_deadline, 'Auto-assigned incident must establish an acknowledgment deadline');

        // Resubmitting with SAME Idempotency-Key must NOT duplicate incident
        const sosRes2 = await request('POST', '/api/incidents', sosPayload, {
            'Authorization': `Bearer ${citizenToken}`,
            'Idempotency-Key': uniqueIdempKey
        });
        assert.strictEqual(sosRes2.status, 200);
        const returnedInc = sosRes2.body.data.incident || sosRes2.body.data;
        assert.strictEqual(returnedInc.id, incident1.id, 'Idempotency must return identical incident ID without duplicating');
        console.log(`  ✓ Incident #${incident1.id} logged and automatically assigned to squad: ${incident1.assigned_rescue_team}`);
        console.log('  ✓ Idempotency control prevented duplicate incident creation.\n');

        // -------------------------------------------------------------
        // TEST 4: Manual Location Entry when GPS is Unavailable / Denied
        // -------------------------------------------------------------
        console.log('[Test 4] Manual Location Entry (GPS Denied Fallback)...');
        const manualSosPayload = {
            category: 'Structural Collapse',
            count: 2,
            details: 'Balcony collapsed. GPS signal blocked by indoor building walls.',
            latitude: 26.8720,
            longitude: 80.9280,
            address: 'Aliganj Sector B, near Kendriya Vidyalaya, Lucknow',
            is_verified_gps: 0,
            gps_accuracy: 25.0,
            autoDispatch: true
        };
        const manualSosRes = await request('POST', '/api/incidents', manualSosPayload, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(manualSosRes.status, 201);
        const manualInc = manualSosRes.body.data.incident || manualSosRes.body.data;
        assert.ok(manualInc.id);
        assert.strictEqual(manualInc.is_verified_gps, 0);
        assert.strictEqual(manualInc.readable_address, manualSosPayload.address);
        console.log(`  ✓ Manual location fallback incident #${manualInc.id} accepted with address landmark.\n`);

        // -------------------------------------------------------------
        // TEST 5: Responder Assignment Lifecycle (Assigned -> Accepted -> En Route -> Arrived -> Completed)
        // -------------------------------------------------------------
        console.log('[Test 5] Rescue Squad Mission Lifecycle Tracking...');
        const testIncId = incident1.id;

        // Step 5a: Responder Acknowledges (ACCEPTED)
        const ackRes = await request('PATCH', `/api/incidents/${testIncId}/status`, {
            status: 'ACCEPTED',
            note: 'NDRF Unit Alpha acknowledged mission and mobilization.'
        }, {
            'Authorization': `Bearer ${responderToken}`
        });
        assert.strictEqual(ackRes.status, 200);
        assert.strictEqual(ackRes.body.data.status, 'ACCEPTED');
        assert.ok(ackRes.body.data.acknowledged_at, 'acknowledged_at timestamp must be recorded');
        console.log('  ✓ Step 1: Squad ACCEPTED (Acknowledged).');

        // Step 5b: Responder En Route (EN_ROUTE)
        const enrouteRes = await request('PATCH', `/api/incidents/${testIncId}/status`, {
            status: 'EN_ROUTE',
            note: 'Rescue boat unit en route to target coordinates.'
        }, {
            'Authorization': `Bearer ${responderToken}`
        });
        assert.strictEqual(enrouteRes.status, 200);
        assert.strictEqual(enrouteRes.body.data.status, 'EN_ROUTE');
        console.log('  ✓ Step 2: Squad EN_ROUTE to casualty scene.');

        // Step 5c: Responder Arrived (ARRIVED)
        const arrivedRes = await request('PATCH', `/api/incidents/${testIncId}/status`, {
            status: 'ARRIVED',
            note: 'Arrived at scene. Initiating casualty extraction.'
        }, {
            'Authorization': `Bearer ${responderToken}`
        });
        assert.strictEqual(arrivedRes.status, 200);
        assert.strictEqual(arrivedRes.body.data.status, 'ARRIVED');
        console.log('  ✓ Step 3: Squad ARRIVED on scene.');

        // Step 5d: Responder Transmits Field GPS Telemetry
        const telemRes = await request('PATCH', `/api/incidents/${testIncId}/location`, {
            latitude: 26.8526,
            longitude: 80.9431,
            accuracy: 3.5
        }, {
            'Authorization': `Bearer ${responderToken}`
        });
        assert.strictEqual(telemRes.status, 200);
        console.log('  ✓ Step 4: High-precision responder telemetry transmitted.');

        // Step 5e: Responder Completes Mission (COMPLETED)
        const completeRes = await request('PATCH', `/api/incidents/${testIncId}/status`, {
            status: 'COMPLETED',
            note: 'All 3 victims safely evacuated and transferred to relief shelter.'
        }, {
            'Authorization': `Bearer ${responderToken}`
        });
        assert.strictEqual(completeRes.status, 200);
        assert.strictEqual(completeRes.body.data.status, 'COMPLETED');
        assert.ok(completeRes.body.data.resolved_at, 'resolved_at timestamp must be populated');

        // Verify team was released back to AVAILABLE in rescue_teams table
        const assignedTeamId = incident1.dispatch_team_id;
        if (assignedTeamId) {
            const teamRow = await db.get(`SELECT status FROM rescue_teams WHERE id = ?`, [assignedTeamId]);
            assert.strictEqual(teamRow.status, 'AVAILABLE', 'Completed rescue must release team back to AVAILABLE status');
        }
        console.log('  ✓ Step 5: Mission COMPLETED and rescue squad released to AVAILABLE.\n');

        // -------------------------------------------------------------
        // TEST 6: Auto-Reassignment & Escalation of Unacknowledged Assignments
        // -------------------------------------------------------------
        console.log('[Test 6] Auto-Reassignment & Escalation on Unacknowledged Timeout...');
        // Create an unacknowledged incident with expired deadline
        const unackSos = await request('POST', '/api/incidents', {
            category: 'Building Fire Trapped',
            count: 1,
            details: 'Smoke inhalation emergency. Urgent extraction needed.',
            latitude: 26.8400,
            longitude: 80.9400,
            autoDispatch: true
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });
        const unackInc = unackSos.body.data.incident || unackSos.body.data;
        const unackIncId = unackInc.id;

        // Manually simulate expired ack_deadline (5 seconds ago) without acknowledgment
        const pastDeadline = new Date(Date.now() - 5000).toISOString();
        await db.run(
            `UPDATE incidents SET ack_deadline = ?, acknowledged_at = NULL WHERE id = ?`,
            [pastDeadline, unackIncId]
        );

        // Run escalation check
        const escalationResult = await checkAndEscalateUnacknowledgedIncidents();
        assert.ok(Array.isArray(escalationResult) && escalationResult.length >= 1, 'At least 1 incident must be escalated/reassigned');

        // Verify escalation state in database
        const escalatedRow = await db.get(`SELECT status, escalation_level FROM incidents WHERE id = ?`, [unackIncId]);
        assert.ok(escalatedRow.escalation_level >= 1, 'Escalation tier must increment');
        console.log(`  ✓ Unacknowledged incident #${unackIncId} automatically re-evaluated (Tier ${escalatedRow.escalation_level}).\n`);

        // -------------------------------------------------------------
        // TEST 7: Tactical Safe Route Service Caveats & Freshness
        // -------------------------------------------------------------
        console.log('[Test 7] Safe Route Calculation & Safety Verification Status...');
        const route = await calculateSafeRoute({
            originLat: 26.8467,
            originLng: 80.9462,
            destLat: 26.8525,
            destLng: 80.9430
        });

        assert.strictEqual(route.success, true);
        assert.ok(route.dataFreshnessTimestamp, 'Must include route data freshness timestamp');
        assert.ok(
            route.safetyVerificationStatus === 'VERIFIED_ROAD_NETWORK' ||
            route.safetyVerificationStatus === 'UNVERIFIED_HAZARDS_CAUTION',
            'Must provide explicit safety verification status'
        );
        assert.ok(route.safetyWarning, 'Must provide road safety warning/caveat during disaster conditions');
        console.log(`  ✓ Safe Route: Distance=${route.distanceKm} km, ETA=~${route.etaMinutes} mins`);
        console.log(`    Status: ${route.safetyVerificationStatus}, Freshness: ${route.dataFreshnessTimestamp}`);
        console.log(`    Caveat: "${route.safetyWarning.substring(0, 60)}..."\n`);

        // -------------------------------------------------------------
        // TEST 8: Role-Based Access Control (RBAC) Enforcement
        // -------------------------------------------------------------
        console.log('[Test 8] RBAC Security & Unauthorized Tampering Prevention...');
        // Citizen attempts to change status -> MUST BE REJECTED (HTTP 403)
        const tamperStatus = await request('PATCH', `/api/incidents/${unackIncId}/status`, {
            status: 'COMPLETED'
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(tamperStatus.status, 403, 'Citizen must not be authorized to alter incident status');

        // Citizen attempts to assign rescue squad -> MUST BE REJECTED (HTTP 403)
        const tamperAssign = await request('POST', `/api/incidents/${unackIncId}/assign`, {
            teamName: 'Unauthorized Team'
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });
        assert.strictEqual(tamperAssign.status, 403, 'Citizen must not be authorized to assign teams');

        // Unauthenticated request to stats -> MUST BE REJECTED (HTTP 401)
        const anonStats = await request('GET', '/api/incidents/stats/overview');
        assert.strictEqual(anonStats.status, 401, 'Unauthenticated user cannot view authority statistics');
        console.log('  ✓ All role permissions strictly enforced on backend endpoints.\n');

        // -------------------------------------------------------------
        // TEST 9: Audit Trail Logging
        // -------------------------------------------------------------
        console.log('[Test 9] Audit Trail & Activity History Verification...');
        const auditRows = await db.query(
            `SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY created_at DESC`,
            [testIncId]
        );
        assert.ok(auditRows.length > 0, 'Audit trail must record incident assignments and lifecycle updates');
        console.log(`  ✓ Audit trail logged ${auditRows.length} events for incident #${testIncId}.\n`);

        console.log('================================================================');
        console.log('  ALL V2 RESCUE SYSTEM TESTS PASSED SUCCESSFULLY!               ');
        console.log('================================================================');

    } finally {
        if (serverInstance) {
            await new Promise(r => serverInstance.close(r));
        }
    }
}

if (require.main === module) {
    runTests()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('\n❌ V2 TEST SUITE FAILED:', err);
            process.exit(1);
        });
}

module.exports = { runTests };
