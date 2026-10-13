/**
 * NDRF Gateway Integration & CAP Protocol Test Suite
 */

const assert = require('assert');
const http = require('http');
const { app } = require('../src/server');
const db = require('../src/config/database');
const ndrfService = require('../src/services/ndrfService');

let testServer;
const testPort = 5057;
const baseUrl = `http://localhost:${testPort}`;

let authorityToken = '';
let testIncidentId = '';
let testCadId = '';

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
                    resolve({ status: res.statusCode, body: parsed, raw: data, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data, raw: data, headers: res.headers });
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
    console.log('   RUNNING NDRF GATEWAY & EOC INTEGRATION TESTS       ');
    console.log('======================================================\n');

    await db.initDatabase();

    await new Promise((resolve) => {
        testServer = app.listen(testPort, () => {
            console.log(`[NDRF Test Server] Running on ${baseUrl}`);
            resolve();
        });
    });

    try {
        // Step 1: Authority Login
        const authRes = await makeRequest('POST', '/api/auth/authority-login', {
            username: 'ndrf_commander',
            password: 'authority123'
        });
        assert.strictEqual(authRes.status, 200);
        authorityToken = authRes.body.data.token;
        console.log('  ✓ PASS: 1. Authority login succeeds (ndrf_commander)');

        // Step 2: Gateway Status Check
        const statusRes = await makeRequest('GET', '/api/ndrf/status');
        assert.strictEqual(statusRes.status, 200);
        assert.strictEqual(statusRes.body.success, true);
        assert.strictEqual(statusRes.body.data.status, 'ONLINE');
        assert.strictEqual(statusRes.body.data.nationalHotline, '1078');
        assert.ok(statusRes.body.data.activeBattalions >= 6);
        console.log('  ✓ PASS: 2. GET /api/ndrf/status reports ONLINE with hotline 1078 and battalion count');

        // Step 3: Gateway Ping Handshake
        const pingRes = await makeRequest('POST', '/api/ndrf/ping', {}, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(pingRes.status, 200);
        assert.strictEqual(pingRes.body.success, true);
        assert.strictEqual(pingRes.body.data.status, 'CONNECTED');
        assert.ok(pingRes.body.data.latencyMs >= 0);
        console.log(`  ✓ PASS: 3. POST /api/ndrf/ping verifies roundtrip handshake (${pingRes.body.data.latencyMs}ms)`);

        // Step 4: Battalions Registry
        const bnRes = await makeRequest('GET', '/api/ndrf/battalions');
        assert.strictEqual(bnRes.status, 200);
        assert.strictEqual(bnRes.body.success, true);
        assert.ok(Array.isArray(bnRes.body.data));
        const lucknowBn = bnRes.body.data.find(b => b.code === '11-BN-NDRF');
        assert.ok(lucknowBn, '11-BN-NDRF must be present');
        assert.ok(lucknowBn.tacticalFrequency.includes('156.800 MHz'));
        console.log('  ✓ PASS: 4. GET /api/ndrf/battalions returns operational battalions with VHF frequencies');

        // Step 5: SOS Beacon Creation with Automatic NDRF Relay
        const sosRes = await makeRequest('POST', '/api/incidents', {
            category: 'Flash Flooding',
            details: 'Dangerous water current rising rapidly. 3 persons stranded on roof.',
            latitude: 26.8467,
            longitude: 80.9462,
            count: 3,
            autoDispatch: true
        });
        assert.strictEqual(sosRes.status, 201);
        testIncidentId = sosRes.body.data.id;
        assert.ok(sosRes.body.data.ndrf_cad_id, 'Incident should have ndrf_cad_id assigned');
        testCadId = sosRes.body.data.ndrf_cad_id;
        assert.strictEqual(sosRes.body.data.ndrf_status, 'ACKNOWLEDGED');
        console.log(`  ✓ PASS: 5. High-priority SOS auto-relays to NDRF (Incident: ${testIncidentId}, CAD: ${testCadId})`);

        // Step 6: Manual / Re-Relay to NDRF EOC
        const manualRelayRes = await makeRequest('POST', `/api/ndrf/relay/${testIncidentId}`, {}, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(manualRelayRes.status, 200);
        assert.strictEqual(manualRelayRes.body.success, true);
        assert.ok(manualRelayRes.body.data.cadReferenceId);
        console.log('  ✓ PASS: 6. Authority POST /api/ndrf/relay/:id executes manual relay with CAD reference');

        // Step 7: Retrieve Incident Transmissions
        const txRes = await makeRequest('GET', `/api/ndrf/transmissions/${testIncidentId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(txRes.status, 200);
        assert.strictEqual(txRes.body.success, true);
        assert.ok(txRes.body.data.length >= 1);
        assert.strictEqual(txRes.body.data[0].incident_id, testIncidentId);
        console.log('  ✓ PASS: 7. GET /api/ndrf/transmissions/:incidentId returns transmission history');

        // Step 8: Common Alerting Protocol (CAP v1.2) XML & JSON Export
        const capRes = await makeRequest('GET', `/api/ndrf/cap/${testIncidentId}?format=xml`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(capRes.status, 200);
        assert.ok(capRes.raw.includes('xmlns="urn:oasis:names:tc:emergency:cap:1.2"'));
        assert.ok(capRes.raw.includes('<sender>ndrf-cad-relay@disaster-rescue.gov.in</sender>'));
        assert.ok(capRes.raw.includes('<instruction>'));
        console.log('  ✓ PASS: 8. GET /api/ndrf/cap/:id?format=xml generates valid OASIS CAP v1.2 XML');

        // Step 9: Simulate Tactical Status Progression (e.g. MOBILIZED -> EN_ROUTE)
        const updateRes = await makeRequest('POST', `/api/ndrf/simulate-update/${testCadId}`, {
            status: 'EN_ROUTE',
            notes: 'NDRF Rescue Convoy 11 Alpha rolling on National Highway with amphibious boats.'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(updateRes.status, 200);
        assert.strictEqual(updateRes.body.success, true);
        assert.strictEqual(updateRes.body.data.status, 'EN_ROUTE');

        // Verify incident reflects status update
        const verifyInc = await makeRequest('GET', `/api/incidents/${testIncidentId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(verifyInc.status, 200);
        assert.strictEqual(verifyInc.body.data.ndrf_status, 'EN_ROUTE');
        assert.ok(verifyInc.body.data.updates.some(u => u.status_to === 'EN_ROUTE' || u.note.includes('EN_ROUTE')));
        console.log('  ✓ PASS: 9. POST /api/ndrf/simulate-update/:cadId advances deployment state to EN_ROUTE with timeline');

        console.log('\n======================================================');
        console.log('All NDRF Gateway Integration tests passed successfully!');
        console.log('======================================================\n');
    } finally {
        if (testServer) testServer.close();
    }
}

runTests().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error('Test Failed:', err);
    process.exit(1);
});
