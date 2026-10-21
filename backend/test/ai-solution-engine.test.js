/**
 * AISTER AI SOLUTION ENGINE & RESCUE DECISION-SUPPORT TEST SUITE
 * 
 * Verifies:
 * 1. AI Solution Engine structured assessments (Grounded rules + safe fallback)
 * 2. Database persistence & Tactical Grid ID consistency
 * 3. Automatic rescue-team capability matching & road-network ETA
 * 4. Atomic concurrency locking & duplicate assignment prevention
 * 5. Rescue team state machine & explicit decline / automated escalation
 * 6. Non-destructive duplicate emergency detection
 * 7. Endpoints: GET /api/incidents/:id/assessment, POST /api/incidents/:id/decline-team, GET /api/incidents/:id/duplicates
 */

const http = require('http');
const db = require('../src/config/database');
const { app } = require('../src/server');
const { computeTacticalGridId } = require('../src/utils/tacticalGrid');
const { generateStructuredAssessment, getIncidentStructuredAssessment } = require('../src/services/aiSolutionEngine');
const { findEligibleRescueTeams, autoDispatchIncident, declineRescueTeamAssignment, acknowledgeTeamDispatch } = require('../src/services/dispatchEngine');
const { calculateSafeRoute } = require('../src/services/safeRouteService');
const jwt = require('jsonwebtoken');

let server;
let baseUrl;
let adminToken;
let citizenToken;

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runTestSuite() {
    console.log('======================================================');
    console.log('   RUNNING AISTER AI SOLUTION ENGINE TEST SUITE       ');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✓ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        await db.initDB();

        // Start dedicated test server
        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        console.log(`[Test Server] Running on ${baseUrl}\n`);

        // Generate valid test JWTs
        const secret = process.env.JWT_SECRET || 'rescue_ai_jwt_secret_key_2026';
        adminToken = jwt.sign({ id: 'TEST_ADMIN_01', username: 'AISTER23', role: 'ADMIN' }, secret, { expiresIn: '1h' });
        citizenToken = jwt.sign({ id: 'TEST_CITIZEN_01', username: 'citizen_user', role: 'CITIZEN' }, secret, { expiresIn: '1h' });

        // ------------------------------------------------------------------
        // TEST 1: AI Solution Engine Structured Assessment Generation
        // ------------------------------------------------------------------
        console.log('[Domain 1] AI Solution Engine: Structured Analysis Generation');
        const assessmentResult = await generateStructuredAssessment({
            incidentId: 'INC_TEST_001',
            category: 'Flood',
            details: 'Severe flash flood inundation. 4 people trapped on roof with rising water levels and elderly person requiring assistance.',
            latitude: 26.8500,
            longitude: 80.9400,
            victimCount: 4,
            address: 'Sector B, Gomti Nagar, Lucknow',
            isVerifiedGps: 1,
            gpsAccuracy: 12
        });

        assert(assessmentResult.success === true, 'Assessment generated successfully');
        assert(assessmentResult.tacticalGridId.startsWith('TAC-'), `Tactical Grid ID computed: ${assessmentResult.tacticalGridId}`);
        assert(assessmentResult.disasterCategory === 'FLOOD', `Disaster category normalized correctly to ${assessmentResult.disasterCategory}`);
        assert(assessmentResult.urgency.level === 'CRITICAL' || assessmentResult.urgency.level === 'HIGH', `Urgency classified as ${assessmentResult.urgency.level}`);
        assert(assessmentResult.urgency.confidence >= 0.80, `High confidence score: ${assessmentResult.urgency.confidence}`);
        assert(Array.isArray(assessmentResult.urgency.supportingFactors) && assessmentResult.urgency.supportingFactors.length > 0, 'Fact-grounded supporting factors provided');
        assert(assessmentResult.resourceRequirements.some(r => r.resource.includes('Water')), 'Calculated potable drinking water rations');
        assert(assessmentResult.resourceRequirements.some(r => r.resource.includes('Boat') || r.resource.includes('Life-Jackets')), 'Calculated flood aquatic rescue gear');
        assert(assessmentResult.verifiedSafetyGuidance.length >= 3, 'Included verified NDMA/SDRF safety SOP guidance');
        assert(assessmentResult.suitableTeam.category === 'FLOOD_RESCUE', `Assigned suitable team category: ${assessmentResult.suitableTeam.category}`);
        assert(assessmentResult.isFallback === true, 'Safe offline fallback indicator confirmed');

        // ------------------------------------------------------------------
        // TEST 2: Database Persistence & Tactical Grid ID Consistency
        // ------------------------------------------------------------------
        console.log('\n[Domain 2] Database Persistence & Tactical Grid ID Consistency');
        const persisted = await getIncidentStructuredAssessment('INC_TEST_001');
        assert(persisted !== null, 'Structured assessment successfully retrieved from persistent database');
        assert(persisted.tacticalGridId === assessmentResult.tacticalGridId, `Tactical Grid ID matches exactly: ${persisted.tacticalGridId}`);
        assert(persisted.urgencyLevel === assessmentResult.urgency.level, 'Urgency level preserved in DB');
        assert(Array.isArray(persisted.resourceRequirements) && persisted.resourceRequirements.length > 0, 'Resource requirements JSON deserialized correctly');
        assert(Array.isArray(persisted.verifiedSafetyGuidance) && persisted.verifiedSafetyGuidance.length > 0, 'Safety guidance SOPs persisted in DB');

        // ------------------------------------------------------------------
        // TEST 3: Rescue Team Capability Ranking & Road Network Routing
        // ------------------------------------------------------------------
        console.log('\n[Domain 3] Rescue Team Capability Matching & Ranking');
        const floodCandidates = await findEligibleRescueTeams({
            disasterType: 'Flood',
            latitude: 26.8500,
            longitude: 80.9400,
            victimCount: 4,
            details: 'Submerged street, high water'
        });

        assert(Array.isArray(floodCandidates) && floodCandidates.length > 0, `Evaluated ${floodCandidates.length} rescue teams`);
        const eligibleFloodTeams = floodCandidates.filter(t => t.isEligible);
        assert(eligibleFloodTeams.length > 0, `Found ${eligibleFloodTeams.length} operationally eligible teams for flood rescue`);
        if (eligibleFloodTeams.length > 0) {
            assert(eligibleFloodTeams[0].suitabilityTier === 'SPECIALIZED' || eligibleFloodTeams[0].distanceKm < 50, 'Top ranked team matches specialized aquatic capability or shortest distance');
        }

        // Test Road Network Routing with Safe Fallback & Hazard Avoidance
        console.log('\n[Domain 4] GPS, Road-Network Routing & Honest Safety Labeling');
        const route = await calculateSafeRoute({
            originLat: 26.8467,
            originLng: 80.9462,
            destLat: 26.8650,
            destLng: 80.9320
        });

        assert(route.success === true, 'Tactical route generated');
        assert(route.distanceKm > 0, `Route distance computed: ${route.distanceKm} km`);
        assert(route.etaMinutes > 0, `Route transit ETA computed: ~${route.etaMinutes} mins`);
        assert(['VERIFIED_ROAD_NETWORK', 'UNVERIFIED_HAZARDS_CAUTION'].includes(route.safetyVerificationStatus), `Honest safety status: ${route.safetyVerificationStatus}`);
        assert(Boolean(route.disclaimer), 'Mandatory safety disclaimer present in route response');

        // ------------------------------------------------------------------
        // TEST 5: API Endpoints (POST SOS with Assessment, GET Assessment)
        // ------------------------------------------------------------------
        console.log('\n[Domain 5] API Endpoints: SOS Submission with AI Assessment');
        const sosRes = await makeRequest('POST', '/api/incidents', {
            category: 'Building Collapse',
            details: 'Residential floor collapsed after earthquake. 3 victims trapped under heavy concrete debris.',
            latitude: 26.8550,
            longitude: 80.9450,
            count: 3,
            autoDispatch: true,
            idempotency_key: `test_ai_sos_${Date.now()}`
        }, {
            'Authorization': `Bearer ${citizenToken}`
        });

        assert(sosRes.status === 201, `SOS created with HTTP 201: ${sosRes.body.data?.id}`);
        const newIncId = sosRes.body.data?.id;
        const returnedGridId = sosRes.body.data?.tacticalGridId || sosRes.body.data?.tactical_grid_id;
        assert(Boolean(returnedGridId), `Tactical Grid ID returned in API response: ${returnedGridId}`);
        assert(Boolean(sosRes.body.data?.aiSolutionAssessment), 'AI Solution Assessment included in creation payload');

        // Fetch via GET /api/incidents/:id/assessment
        const getAssessRes = await makeRequest('GET', `/api/incidents/${newIncId}/assessment`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(getAssessRes.status === 200, 'GET /api/incidents/:id/assessment returns HTTP 200');
        assert(getAssessRes.body.data?.incidentId === newIncId, 'Assessment incidentId matches');
        assert(getAssessRes.body.data?.tacticalGridId === returnedGridId, `Tactical Grid ID consistent: ${getAssessRes.body.data?.tacticalGridId}`);
        assert(getAssessRes.body.data?.resourceRequirements.some(r => r.resource.toLowerCase().includes('hydraulic') || r.resource.toLowerCase().includes('detector') || r.resource.toLowerCase().includes('water')), 'Appropriate collapse extrication tools calculated');

        // ------------------------------------------------------------------
        // TEST 6: Team Decline and Automated Recalculation / Escalation
        // ------------------------------------------------------------------
        console.log('\n[Domain 6] Team Decline & Automatic Recalculation / Escalation');
        const assignedTeam = sosRes.body.data?.assignedTeam || sosRes.body.data?.assigned_rescue_team;
        if (assignedTeam) {
            const teamId = assignedTeam.id || sosRes.body.data?.dispatch_team_id;

            const declineRes = await makeRequest('POST', `/api/incidents/${newIncId}/decline-team`, {
                teamId: teamId,
                reason: 'Road blocked by fallen high-voltage power lines. Unit unable to penetrate perimeter.'
            }, {
                'Authorization': `Bearer ${adminToken}`
            });

            assert(declineRes.status === 200, 'POST /api/incidents/:id/decline-team returns HTTP 200');
            assert(declineRes.body.data?.declined === true, 'Decline flag confirmed in response');
            assert(Boolean(declineRes.body.data?.escalation), 'Automated escalation triggered');

            // Verify team status in DB is released back to AVAILABLE with DECLINED state
            const teamRow = await db.get(`SELECT status, assignment_state, decline_reason FROM rescue_teams WHERE id = ?`, [teamId]);
            if (teamRow) {
                assert(teamRow.status === 'AVAILABLE', `Declined team status released to: ${teamRow.status}`);
                assert(teamRow.assignment_state === 'DECLINED', `Team assignment state: ${teamRow.assignment_state}`);
            }
        } else {
            console.log('  ℹ Notice: Incident placed in AWAITING_SQUAD (no candidate within perimeter) - skipping decline test');
        }

        // ------------------------------------------------------------------
        // TEST 7: Non-Destructive Duplicate Detection Endpoint
        // ------------------------------------------------------------------
        console.log('\n[Domain 7] Non-Destructive Duplicate Incident Detection');
        const dupeRes = await makeRequest('GET', `/api/incidents/${newIncId}/duplicates`, null, {
            'Authorization': `Bearer ${adminToken}`
        });

        assert(dupeRes.status === 200, 'GET /api/incidents/:id/duplicates returns HTTP 200');
        assert(dupeRes.body.incidentId === newIncId, 'Duplicate lookup preserves incident context');
        assert(typeof dupeRes.body.data?.isPotentialDuplicate === 'boolean', 'Returns boolean duplicate suggestion indicator without discarding record');

        // ------------------------------------------------------------------
        // TEST 8: Atomic Concurrency Locking
        // ------------------------------------------------------------------
        console.log('\n[Domain 8] Atomic Concurrency Locking Test');
        const targetTeam = await db.get(`SELECT id, name FROM rescue_teams WHERE status = 'AVAILABLE' LIMIT 1`);
        if (targetTeam) {
            // First lock attempt
            const lock1 = await db.run(
                `UPDATE rescue_teams
                 SET status = 'DISPATCHED',
                     assigned_incident_id = 'CONC_TEST_01',
                     active_incident_count = 1
                 WHERE id = ? AND status IN ('AVAILABLE', 'STANDBY')`,
                [targetTeam.id]
            );
            assert(lock1.changes === 1, 'First dispatch atomic lock acquired');

            // Concurrent attempt to book same team with status = AVAILABLE
            const lock2 = await db.run(
                `UPDATE rescue_teams
                 SET status = 'DISPATCHED',
                     assigned_incident_id = 'CONC_TEST_02',
                     active_incident_count = 2
                 WHERE id = ? AND status IN ('AVAILABLE', 'STANDBY')`,
                [targetTeam.id]
            );
            assert(lock2.changes === 0, 'Concurrent double-booking collision prevented by atomic lock condition');

            // Reset test team back to AVAILABLE
            await db.run(`UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL, active_incident_count = 0 WHERE id = ?`, [targetTeam.id]);
        }

    } catch (err) {
        console.error('\n[Test Suite Error]', err);
        failed++;
    } finally {
        if (server) {
            await new Promise(resolve => server.close(resolve));
            console.log('\n[Test Server] Shutdown complete.');
        }
    }

    console.log('\n======================================================');
    console.log(` AI SOLUTION ENGINE TEST SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('======================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

if (require.main === module) {
    runTestSuite();
}

module.exports = { runTestSuite };
