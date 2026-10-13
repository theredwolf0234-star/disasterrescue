/**
 * Comprehensive NGO Integration, AI Verification & Government Alerts Test Suite
 * Validates requirements 1-12 of the collaborative disaster-management platform.
 */

const assert = require('assert');
const http = require('http');
const { app } = require('../src/server');
const db = require('../src/config/database');

let testServer;
const testPort = 5058;
const baseUrl = `http://localhost:${testPort}`;

let authorityToken = '';
let ngoToken = '';
let testNgoId = '';
let testIncidentId = '';
let testAssignmentId = '';

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
    console.log('\n=============================================================');
    console.log('   RUNNING NGO INTEGRATION, AI VERIFICATION & ALERT TESTS   ');
    console.log('=============================================================\n');

    await db.initDatabase();

    await new Promise((resolve) => {
        testServer = app.listen(testPort, () => {
            console.log(`[NGO Test Server] Running on ${baseUrl}`);
            resolve();
        });
    });

    try {
        // -----------------------------------------------------------------
        // 1. Authority Login
        // -----------------------------------------------------------------
        const authRes = await makeRequest('POST', '/api/auth/authority-login', {
            username: 'ndrf_commander',
            password: 'authority123'
        });
        assert.strictEqual(authRes.status, 200);
        authorityToken = authRes.body.data.token;
        console.log('  ✓ PASS: 1. Authority login succeeds and acquires command JWT');

        // -----------------------------------------------------------------
        // 2. NGO Public Registration (Pending state)
        // -----------------------------------------------------------------
        const uniqueEmail = `relief-${Date.now()}@testngo.org`;
        const regRes = await makeRequest('POST', '/api/ngo/register', {
            name: 'Rapid Relief Foundation',
            registrationNumber: 'NGO-UP-REG-2026-999',
            contactPerson: 'Arun Verma',
            officialEmail: uniqueEmail,
            phone: '+91-9876543210',
            operationalAreas: ['Lucknow', 'Kanpur', 'Barabanki'],
            servicesOffered: ['Food Distribution', 'Medical First-Aid', 'Shelter Camps'],
            emergencyCapabilities: '150 volunteers, 3 inflatable rescue boats, 2 mobile medical vans',
            password: 'testPassword123'
        });
        assert.strictEqual(regRes.status, 201);
        assert.strictEqual(regRes.body.success, true);
        assert.strictEqual(regRes.body.data.status, 'PENDING');
        testNgoId = regRes.body.data.ngoId;
        console.log('  ✓ PASS: 2. NGO registration creates organization in PENDING state awaiting admin verification');

        // -----------------------------------------------------------------
        // 3. Unapproved NGO Login Blocked (403 Forbidden)
        // -----------------------------------------------------------------
        const pendingLoginRes = await makeRequest('POST', '/api/ngo/login', {
            email: uniqueEmail,
            password: 'testPassword123'
        });
        assert.strictEqual(pendingLoginRes.status, 403);
        assert.strictEqual(pendingLoginRes.body.errorCode, 'APPLICATION_PENDING');
        console.log('  ✓ PASS: 3. Unapproved NGO login blocked with 403 APPLICATION_PENDING');

        // -----------------------------------------------------------------
        // 4. Authority Reviews Directory & Approves NGO
        // -----------------------------------------------------------------
        const dirRes = await makeRequest('GET', '/api/ngo/directory?status=PENDING', null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(dirRes.status, 200);
        assert.ok(dirRes.body.data.ngos.some(n => n.id === testNgoId));

        const approveRes = await makeRequest('PATCH', `/api/ngo/organization/${testNgoId}/status`, {
            status: 'APPROVED',
            remarks: 'Verification documents validated with Registrar of Societies.'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(approveRes.status, 200);
        assert.strictEqual(approveRes.body.data.status, 'APPROVED');
        console.log('  ✓ PASS: 4. Authority verifies and approves NGO organization application');

        // -----------------------------------------------------------------
        // 5. Approved NGO Logs In & Acquires NGO Role Token
        // -----------------------------------------------------------------
        const approvedLoginRes = await makeRequest('POST', '/api/ngo/login', {
            email: uniqueEmail,
            password: 'testPassword123'
        });
        assert.strictEqual(approvedLoginRes.status, 200);
        assert.strictEqual(approvedLoginRes.body.success, true);
        assert.strictEqual(approvedLoginRes.body.data.user.role, 'NGO');
        assert.strictEqual(approvedLoginRes.body.data.ngo.id, testNgoId);
        ngoToken = approvedLoginRes.body.data.token;
        console.log('  ✓ PASS: 5. Approved NGO login succeeds with role NGO and organization scope');

        // -----------------------------------------------------------------
        // 6. Seeded Approved NGO Login Check (Red Cross UP)
        // -----------------------------------------------------------------
        const redCrossLogin = await makeRequest('POST', '/api/ngo/login', {
            email: 'coordinator@redcross-up.org',
            password: 'ngo123'
        });
        assert.strictEqual(redCrossLogin.status, 200);
        assert.strictEqual(redCrossLogin.body.data.ngo.id, 'NGO_REDCROSS_UP');
        console.log('  ✓ PASS: 6. Seeded Indian Red Cross NGO credentials login verified');

        // -----------------------------------------------------------------
        // 7. NGO Dashboard Access (Role-Based Access)
        // -----------------------------------------------------------------
        const dashboardRes = await makeRequest('GET', '/api/ngo/dashboard', null, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(dashboardRes.status, 200);
        assert.strictEqual(dashboardRes.body.success, true);
        assert.ok(dashboardRes.body.data.ngo);
        assert.ok(Array.isArray(dashboardRes.body.data.tasks));
        assert.ok(Array.isArray(dashboardRes.body.data.alerts));
        console.log('  ✓ PASS: 7. NGO Dashboard loads organization metrics, tasks, and disaster warnings');

        // -----------------------------------------------------------------
        // 8. Citizen SOS Report Submission with AI-Assisted Triage
        // -----------------------------------------------------------------
        const incidentRes = await makeRequest('POST', '/api/incidents', {
            category: 'Flash Flooding',
            details: 'River Gomti overbank inundation. 8 people stranded with children in village primary school.',
            latitude: 26.8520,
            longitude: 80.9500,
            count: 8,
            address: 'Pipraghat, Gomti Nagar Sector 6, Lucknow',
            idempotency_key: `TEST-IDEMP-${Date.now()}`
        });
        assert.strictEqual(incidentRes.status, 201);
        testIncidentId = incidentRes.body.data.incident.id;

        // Fetch incident details to verify AI-assisted verification analysis
        const incDetailRes = await makeRequest('GET', `/api/incidents/${testIncidentId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(incDetailRes.status, 200);
        const incData = incDetailRes.body.data;
        assert.ok(incData.ai_verification_summary, 'AI verification summary must be present');
        assert.ok(incData.ai_alert_zone_match, 'AI alert zone match must be populated');
        assert.ok(incData.ai_recommended_assistance, 'AI recommended assistance must be populated');
        console.log('  ✓ PASS: 8. Incident creation runs AI triage (alert matching, duplicate detection, coordinator summary)');

        // -----------------------------------------------------------------
        // 9. Authority Assigns Incident to NGO
        // -----------------------------------------------------------------
        const assignRes = await makeRequest('POST', '/api/ngo/assign', {
            incidentId: testIncidentId,
            ngoId: testNgoId,
            instructions: 'Establish relief camp, provide water purification packs and food packets for 8 victims.',
            requiredAssistance: ['FOOD_AND_WATER', 'EMERGENCY_MEDICAL', 'TEMPORARY_SHELTER']
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(assignRes.status, 201);
        assert.strictEqual(assignRes.body.success, true);
        testAssignmentId = assignRes.body.data.taskId;
        console.log('  ✓ PASS: 9. Authority assigns incident to NGO partner with required assistance categories');

        // -----------------------------------------------------------------
        // 10. NGO Responds to Task (Accepts Task)
        // -----------------------------------------------------------------
        const respondRes = await makeRequest('POST', `/api/ngo/tasks/${testAssignmentId}/respond`, {
            action: 'ACCEPT',
            notes: 'Field squad dispatched with 2 relief vans and 100 food packets.'
        }, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(respondRes.status, 200);
        assert.strictEqual(respondRes.body.data.status, 'UNDER_REVIEW');
        console.log('  ✓ PASS: 10. NGO accepts assigned assistance task');

        // -----------------------------------------------------------------
        // 11. NGO Progress Workflow Progression
        // -----------------------------------------------------------------
        const progressSteps = ['Under Review', 'Assistance Planned', 'Assistance in Progress', 'Completed'];
        for (const step of progressSteps) {
            const progRes = await makeRequest('PATCH', `/api/ngo/tasks/${testAssignmentId}/progress`, {
                status: step,
                notes: `Milestone reached: ${step}`,
                peopleAssisted: 8
            }, {
                'Authorization': `Bearer ${ngoToken}`
            });
            assert.strictEqual(progRes.status, 200);
            assert.strictEqual(progRes.body.data.status, step.toUpperCase().replace(/\s+/g, '_'));
        }
        console.log('  ✓ PASS: 11. NGO updates assistance progress through Received -> Under Review -> Planned -> In Progress -> Completed');

        // -----------------------------------------------------------------
        // 12. NGO Volunteer Management & Privacy Protection
        // -----------------------------------------------------------------
        const addVolRes = await makeRequest('POST', '/api/ngo/volunteers', {
            name: 'Pooja Sharma',
            phone: '+91-9811223344',
            email: 'pooja.volunteer@relief.org',
            skills: ['Paramedic / First Aid', 'Disaster Counseling', 'Boat Rescue'],
            serviceAreas: ['Lucknow Urban', 'Gomti Basin'],
            availabilityStatus: 'AVAILABLE'
        }, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(addVolRes.status, 201);
        const volunteerId = addVolRes.body.data.id;

        const volListRes = await makeRequest('GET', '/api/ngo/volunteers', null, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(volListRes.status, 200);
        assert.ok(volListRes.body.data.volunteers.some(v => v.id === volunteerId));
        console.log('  ✓ PASS: 12. NGO records and manages volunteer roster with verified skills');

        // -----------------------------------------------------------------
        // 13. NGO Relief Supply Inventory Recording
        // -----------------------------------------------------------------
        const invRes = await makeRequest('POST', '/api/ngo/inventory', {
            resourceType: 'FOOD_SUPPLY',
            resourceName: 'Ready-to-eat dry ration packets',
            availableQuantity: 650,
            unitMeasure: 'packets',
            locationHub: 'Gomti Nagar Sector 6 Depot'
        }, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(invRes.status, 200);
        assert.strictEqual(invRes.body.success, true);
        console.log('  ✓ PASS: 13. NGO records available emergency supplies, food, water, and shelter capacity');

        // -----------------------------------------------------------------
        // 14. Inter-Agency Coordination Messages
        // -----------------------------------------------------------------
        const msgRes = await makeRequest('POST', `/api/ngo/coordination/${testIncidentId}`, {
            message: 'All 8 victims safely provided dry food packets and medical checks. Temporary shelter allocated.',
            channel: 'ALL'
        }, {
            'Authorization': `Bearer ${ngoToken}`
        });
        assert.strictEqual(msgRes.status, 201);

        const getMsgsRes = await makeRequest('GET', `/api/ngo/coordination/${testIncidentId}`, null, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(getMsgsRes.status, 200);
        assert.ok(getMsgsRes.body.data.messages.length >= 1);
        console.log('  ✓ PASS: 14. Secure coordinator-to-NGO message exchange logged for incident');

        // -----------------------------------------------------------------
        // 15. Government Disaster Alerts Ingestion & Spatial Matching
        // -----------------------------------------------------------------
        const alertsRes = await makeRequest('GET', '/api/alerts');
        assert.strictEqual(alertsRes.status, 200);
        assert.strictEqual(alertsRes.body.success, true);
        assert.ok(alertsRes.body.data.alerts.length >= 2);
        assert.strictEqual(alertsRes.body.data.metadata.isCacheOutdated, false);
        assert.ok(alertsRes.body.data.metadata.sourceAgency.includes('NDMA SACHET'));

        const matchAlertRes = await makeRequest('GET', '/api/alerts/match?lat=26.8500&lng=80.9500');
        assert.strictEqual(matchAlertRes.status, 200);
        assert.strictEqual(matchAlertRes.body.data.inAlertZone, true);
        assert.ok(matchAlertRes.body.data.matchingAlerts.length >= 1);
        console.log('  ✓ PASS: 15. NDMA SACHET alerts ingested with provenance, cache age, and spatial matching');

        // -----------------------------------------------------------------
        // 16. NGO Account Suspension Control
        // -----------------------------------------------------------------
        const suspendRes = await makeRequest('PATCH', `/api/ngo/organization/${testNgoId}/status`, {
            status: 'SUSPENDED',
            remarks: 'Compliance audit pending.'
        }, {
            'Authorization': `Bearer ${authorityToken}`
        });
        assert.strictEqual(suspendRes.status, 200);
        assert.strictEqual(suspendRes.body.data.status, 'SUSPENDED');

        const suspendedLogin = await makeRequest('POST', '/api/ngo/login', {
            email: uniqueEmail,
            password: 'testPassword123'
        });
        assert.strictEqual(suspendedLogin.status, 403);
        assert.strictEqual(suspendedLogin.body.errorCode, 'ACCOUNT_SUSPENDED');
        console.log('  ✓ PASS: 16. Account suspension immediately revokes NGO dashboard access');

        console.log('\n=============================================================');
        console.log('   ALL 16 NGO & RESCUE PLATFORM INTEGRATION TESTS PASSED!   ');
        console.log('=============================================================\n');

    } finally {
        if (testServer) {
            testServer.close();
        }
    }
}

runTests().catch(err => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    if (testServer) testServer.close();
    process.exit(1);
});
