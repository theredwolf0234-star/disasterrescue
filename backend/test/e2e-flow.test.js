/**
 * End-to-End Real Working Flow Integration Test
 * Verifies the full user cycle:
 * CITIZEN SOS → DATABASE → AUTHORITY DASHBOARD → REALTIME ALERT → AUTHORITY ACTION → DATABASE UPDATE → CITIZEN REPORT STATUS UPDATE
 */

const assert = require('assert');
const http = require('http');
const { io } = require('socket.io-client');
const { app, server } = require('../src/server');
const db = require('../src/config/database');

const TEST_PORT = process.env.TEST_PORT || 5057;
const baseUrl = process.env.TEST_URL || `http://localhost:${TEST_PORT}`;
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

async function runE2E() {
    await db.initDatabase();

    if (!process.env.TEST_URL) {
        await new Promise((resolve, reject) => {
            serverInstance = server.listen(TEST_PORT, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    console.log('===============================================================');
    console.log('  TESTING REAL WORKING FLOW: CITIZEN SOS TO AUTHORITY DISPATCH ');
    console.log('===============================================================\n');

    // 1. Backend Health Check
    console.log('[Step 1] Verifying Backend Health (/api/health)...');
    const health = await request('GET', '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'ok');
    assert.strictEqual(health.body.database, 'connected');
    console.log('  ✓ Backend healthy and persistent database connected.\n');

    // 2. Connect WebSocket clients for Citizen and Authority
    console.log('[Step 2] Connecting Real-time Socket.IO clients...');
    const authoritySocket = io(baseUrl, { transports: ['websocket'] });
    const citizenSocket = io(baseUrl, { transports: ['websocket'] });

    await new Promise((res) => {
        let connectedCount = 0;
        function check() {
            connectedCount++;
            if (connectedCount === 2) res();
        }
        authoritySocket.on('connect', () => {
            authoritySocket.emit('join', 'authorities');
            check();
        });
        citizenSocket.on('connect', () => {
            citizenSocket.emit('join', 'citizens');
            check();
        });
    });
    console.log('  ✓ Socket.IO connected and rooms joined.\n');

    // Setup socket event tracking
    let receivedNewIncidentAlert = null;
    let receivedStatusUpdateAlert = null;

    authoritySocket.on('incident:new', (inc) => {
        receivedNewIncidentAlert = inc;
    });

    citizenSocket.on('incident:updated', (inc) => {
        receivedStatusUpdateAlert = inc;
    });

    // 3. Citizen Login
    console.log('[Step 3] Citizen Login (satyam@example.com)...');
    const citizenLogin = await request('POST', '/api/auth/login', {
        email: 'satyam@example.com',
        password: 'citizen123'
    });
    assert.strictEqual(citizenLogin.status, 200);
    const citizenToken = citizenLogin.body.data.token;
    const citizenId = citizenLogin.body.data.user.id;
    console.log(`  ✓ Citizen authenticated. User ID: ${citizenId}\n`);

    // 4. Authority Login
    console.log('[Step 4] Authority Login (ndrf_commander)...');
    const authLogin = await request('POST', '/api/auth/authority-login', {
        username: 'ndrf_commander',
        password: 'authority123'
    });
    assert.strictEqual(authLogin.status, 200);
    const authToken = authLogin.body.data.token;
    console.log('  ✓ Authority authenticated. Role: AUTHORITY\n');

    // 5. Authority checks stats prior to SOS
    console.log('[Step 5] Authority queries statistics (/api/incidents/stats/overview)...');
    const statsBefore = await request('GET', '/api/incidents/stats/overview', null, {
        'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(statsBefore.status, 200);
    const initialTotal = statsBefore.body.data.total;
    const initialPeople = statsBefore.body.data.people;
    console.log(`  ✓ Stats retrieved: Total=${initialTotal}, Active=${statsBefore.body.data.active}, People=${initialPeople}\n`);

    // 6. Citizen Submits SOS
    console.log('[Step 6] Citizen submits emergency SOS beacon...');
    const sosPayload = {
        category: 'Medical Emergency',
        count: 4,
        details: 'Severe flash flood collapse with 4 victims trapped on terrace needing medical extraction',
        latitude: 26.8525,
        longitude: 80.9430,
        address: 'Sector 4, Hazratganj Riverfront, Lucknow'
    };
    const sosRes = await request('POST', '/api/incidents', sosPayload, {
        'Authorization': `Bearer ${citizenToken}`
    });
    assert.strictEqual(sosRes.status, 201);
    assert.strictEqual(sosRes.body.success, true);
    const incidentId = sosRes.body.data.id;
    assert.ok(incidentId.startsWith('SOS-2026-'));
    assert.strictEqual(sosRes.body.data.emergency_level, 'CRITICAL');
    assert.strictEqual(sosRes.body.data.status, 'RECEIVED');
    assert.strictEqual(sosRes.body.data.count, 4);
    assert.strictEqual(sosRes.body.data.user_id, citizenId);
    console.log(`  ✓ SOS incident created permanently in database. Incident ID: ${incidentId}`);
    console.log(`    Priority: ${sosRes.body.data.emergency_level}, Reason: ${sosRes.body.data.priorityExplanation}\n`);

    // 7. Subscribe citizen socket to this incident
    citizenSocket.emit('subscribe:incident', incidentId);

    // Wait 200ms for websocket alert
    await new Promise(r => setTimeout(r, 200));
    assert.ok(receivedNewIncidentAlert, 'Authority must receive real-time incident:new alert via WebSocket');
    assert.strictEqual(receivedNewIncidentAlert.id, incidentId);
    console.log('  ✓ Real-time Socket.IO alert received by Authority dashboard.\n');

    // 8. Citizen checks My Reports
    console.log('[Step 7] Citizen queries My Reports (GET /api/incidents)...');
    const citizenReports = await request('GET', '/api/incidents', null, {
        'Authorization': `Bearer ${citizenToken}`
    });
    assert.strictEqual(citizenReports.status, 200);
    const foundReport = citizenReports.body.data.find(i => i.id === incidentId);
    assert.ok(foundReport, 'Citizen reports list must contain the newly submitted incident');
    assert.strictEqual(foundReport.user_id, citizenId);
    console.log(`  ✓ Citizen sees new incident [${incidentId}] under My Reports.\n`);

    // 9. Authority Dashboard updates stats
    console.log('[Step 8] Authority dashboard checks updated stats...');
    const statsAfter = await request('GET', '/api/incidents/stats/overview', null, {
        'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(statsAfter.status, 200);
    assert.strictEqual(statsAfter.body.data.total, initialTotal + 1, 'Total counter must increment');
    assert.strictEqual(statsAfter.body.data.people, initialPeople + 4, 'People affected must increment by 4');
    console.log(`  ✓ Updated Stats verified: Total=${statsAfter.body.data.total}, People=${statsAfter.body.data.people}\n`);

    // 10. Authority inspects incident details
    console.log('[Step 9] Authority inspects incident details (GET /api/incidents/:id)...');
    const inspectRes = await request('GET', `/api/incidents/${incidentId}`, null, {
        'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(inspectRes.status, 200);
    assert.ok(inspectRes.body.data.updates.length >= 1, 'Initial timeline entry must be present');
    console.log(`  ✓ Incident details retrieved with initial timeline note: "${inspectRes.body.data.updates[0].note}"\n`);

    // 11. Authority Changes Status & Assigns Rescue Squad
    console.log('[Step 10] Authority updates incident status & assigns rescue squad...');
    const patchRes = await request('PATCH', `/api/incidents/${incidentId}`, {
        status: 'TEAM_ASSIGNED',
        assignedRescueTeam: 'NDRF Quick Response Team Alpha',
        note: 'Air boat and trauma medics dispatched to Hazratganj Riverfront'
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.data.status, 'TEAM_ASSIGNED');
    assert.strictEqual(patchRes.body.data.assigned_rescue_team, 'NDRF Quick Response Team Alpha');
    console.log(`  ✓ Incident updated to TEAM_ASSIGNED with squad assigned in database.\n`);

    // Wait for websocket propagation to citizen
    await new Promise(r => setTimeout(r, 200));
    assert.ok(receivedStatusUpdateAlert, 'Citizen must receive real-time incident:updated alert');
    assert.strictEqual(receivedStatusUpdateAlert.status, 'TEAM_ASSIGNED');
    console.log('  ✓ Real-time Socket.IO status update received by Citizen.\n');

    // 12. Authority Marks Incident Resolved
    console.log('[Step 11] Authority resolves incident...');
    const resolveRes = await request('PATCH', `/api/incidents/${incidentId}`, {
        status: 'RESOLVED',
        resolutionNotes: 'All 4 victims safely extracted and relocated to Gomti Medical Relief Base.'
    }, {
        'Authorization': `Bearer ${authToken}`
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.body.data.status, 'RESOLVED');
    assert.ok(resolveRes.body.data.resolved_at, 'resolved_at timestamp must be set');
    console.log(`  ✓ Incident RESOLVED with timestamp: ${resolveRes.body.data.resolved_at}\n`);

    // 13. Citizen views updated report with timeline
    console.log('[Step 12] Citizen views finalized report and complete timeline...');
    const citizenFinalReport = await request('GET', `/api/incidents/${incidentId}`, null, {
        'Authorization': `Bearer ${citizenToken}`
    });
    assert.strictEqual(citizenFinalReport.status, 200);
    assert.strictEqual(citizenFinalReport.body.data.status, 'RESOLVED');
    assert.strictEqual(citizenFinalReport.body.data.assigned_rescue_team, 'NDRF Quick Response Team Alpha');
    assert.ok(citizenFinalReport.body.data.updates.length >= 3, 'Must contain initial, assignment, and resolution timeline notes');
    console.log('  ✓ Complete timeline verified:');
    citizenFinalReport.body.data.updates.forEach((u, idx) => {
        console.log(`    [${idx + 1}] (${u.updated_by_role}) ${u.status_to || u.status_from || 'LOG'}: ${u.note}`);
    });

    console.log('\n===============================================================');
    console.log('  ALL REAL WORKING FLOW TESTS PASSED SUCCESSFULLY!             ');
    console.log('===============================================================\n');

    if (authoritySocket) authoritySocket.disconnect();
    if (citizenSocket) citizenSocket.disconnect();
    if (serverInstance) serverInstance.close();
    process.exit(0);
}

runE2E().catch(err => {
    console.error('E2E Flow Test failed:', err);
    if (serverInstance) serverInstance.close();
    process.exit(1);
});
