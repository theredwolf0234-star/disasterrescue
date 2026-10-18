const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { logAction } = require('../services/auditService');

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}

/**
 * Calculates Estimated Time of Arrival (ETA) in minutes
 * Assumes average urban response transit speed of 35 km/h + 3 min mobilization delay
 */
function calculateEtaMinutes(distanceKm) {
    const speedKmH = 35;
    const travelTimeMinutes = (distanceKm / speedKmH) * 60;
    return Math.max(2, Math.round(travelTimeMinutes + 3));
}

/**
 * Analyzes team capabilities against incident disaster type and characteristics
 * Returns { score: 0-100, isEligible: boolean, matchedTags: string[], missingCritical: string[] }
 */
function evaluateCapabilityMatch(team, disasterType, details = '') {
    const typeStr = `${disasterType || ''} ${details || ''}`.toLowerCase();
    const teamProfile = `${team.name || ''} ${team.type || ''} ${team.vehicle || ''} ${team.equipment || ''} ${team.capabilities || ''}`.toLowerCase();

    let capabilityScore = 50; // Base readiness score for registered first-response squad
    const matchedTags = ['All-Hazard First Response'];
    const missingCritical = [];

    // General rapid response capability
    if (teamProfile.includes('rapid') || teamProfile.includes('ndrf') || teamProfile.includes('rescue') || teamProfile.includes('response') || teamProfile.includes('first-aid')) {
        capabilityScore += 15;
        matchedTags.push('Rapid Response Deployment');
    }

    const isFlood = typeStr.includes('flood') || typeStr.includes('water') || typeStr.includes('submerged') || typeStr.includes('drowning');
    const isMedical = typeStr.includes('medical') || typeStr.includes('injury') || typeStr.includes('trauma') || typeStr.includes('cardiac') || typeStr.includes('unconscious');
    const isEarthquakeOrCollapse = typeStr.includes('earthquake') || typeStr.includes('collapse') || typeStr.includes('rubble') || typeStr.includes('debris') || typeStr.includes('landslide');
    const isFireOrHazard = typeStr.includes('fire') || typeStr.includes('burn') || typeStr.includes('smoke') || typeStr.includes('gas') || typeStr.includes('chemical');
    const isCycloneOrStorm = typeStr.includes('cyclone') || typeStr.includes('storm') || typeStr.includes('gale') || typeStr.includes('wind');

    if (isFlood) {
        const hasWaterEquipment = teamProfile.includes('boat') || teamProfile.includes('water') || teamProfile.includes('raft') || teamProfile.includes('amphibious') || teamProfile.includes('life jacket');
        if (hasWaterEquipment) {
            capabilityScore += 60;
            matchedTags.push('Water Rescue / Amphibious Craft / Life Jackets');
        } else {
            // High flood hazard strictly penalizes teams lacking watercraft
            capabilityScore -= 20;
            missingCritical.push('Inflatable Rafts / Amphibious Craft');
        }
    }

    if (isMedical) {
        const hasMedical = teamProfile.includes('medical') || teamProfile.includes('ambulance') || teamProfile.includes('triage') || teamProfile.includes('trauma') || teamProfile.includes('doctor') || teamProfile.includes('paramedic');
        if (hasMedical) {
            capabilityScore += 60;
            matchedTags.push('Paramedic / ACLS Ambulance / Trauma Triage');
        } else if (teamProfile.includes('first-aid')) {
            capabilityScore += 25;
            matchedTags.push('First-Aid Kit');
        }
    }

    if (isEarthquakeOrCollapse) {
        const hasExtrication = teamProfile.includes('search') || teamProfile.includes('extrication') || teamProfile.includes('cutter') || teamProfile.includes('crane') || teamProfile.includes('earthmover') || teamProfile.includes('spreader');
        if (hasExtrication) {
            capabilityScore += 60;
            matchedTags.push('Hydraulic Spreaders / Search Cameras / Debris Clearing');
        }
    }

    if (isFireOrHazard) {
        const hasHazard = teamProfile.includes('hazard') || teamProfile.includes('fire') || teamProfile.includes('clearing') || teamProfile.includes('gas detector') || teamProfile.includes('scba');
        if (hasHazard) {
            capabilityScore += 60;
            matchedTags.push('Hazard Containment / Gas Detectors / Chainsaws');
        }
    }

    if (isCycloneOrStorm) {
        const hasAllTerrain = teamProfile.includes('all-terrain') || teamProfile.includes('heavy') || teamProfile.includes('generator') || teamProfile.includes('cable');
        if (hasAllTerrain) {
            capabilityScore += 50;
            matchedTags.push('All-Terrain Transit / Power Generation');
        }
    }

    // A team is deemed capable if its capability score is at least 35 and it doesn't lack critical life-safety gear
    const isEligible = capabilityScore >= 35 && missingCritical.length === 0;

    return {
        score: Math.max(0, Math.min(100, capabilityScore)),
        isEligible,
        matchedTags,
        missingCritical
    };
}

/**
 * Finds and ranks all eligible rescue teams for a given incident location and disaster type
 */
async function findEligibleRescueTeams({ disasterType, latitude, longitude, victimCount = 1, details = '' }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
        throw new Error('Valid incident coordinates required to match rescue teams');
    }

    const allTeams = await db.query(`SELECT * FROM rescue_teams ORDER BY name ASC`);
    const evaluatedTeams = [];

    for (const team of allTeams) {
        const teamLat = team.current_lat !== null && team.current_lat !== undefined ? parseFloat(team.current_lat) : 26.8467;
        const teamLng = team.current_lng !== null && team.current_lng !== undefined ? parseFloat(team.current_lng) : 80.9462;

        const distanceKm = haversineDistanceKm(lat, lng, teamLat, teamLng);
        const etaMinutes = calculateEtaMinutes(distanceKm);
        const capability = evaluateCapabilityMatch(team, disasterType, details);

        // Distance score: 100 at 0km, decreasing with distance
        const distanceScore = Math.max(0, 100 - (distanceKm * 4));

        // Availability factor
        let availabilityScore = 0;
        if (team.status === 'AVAILABLE') availabilityScore = 100;
        else if (team.status === 'STANDBY' || team.status === 'IDLE') availabilityScore = 80;
        else if (team.status === 'DISPATCHED' || team.status === 'ON_SCENE') availabilityScore = 20;

        // Overall weighted ranking: Capability (45%), Distance/ETA (35%), Availability (20%)
        const totalScore = Number((
            (capability.score * 0.45) +
            (distanceScore * 0.35) +
            (availabilityScore * 0.20)
        ).toFixed(1));

        evaluatedTeams.push({
            team,
            teamId: team.id,
            teamName: team.name,
            unitCode: team.unit_code,
            teamLeader: team.team_leader,
            contactPhone: team.contact_phone,
            status: team.status,
            distanceKm,
            etaMinutes,
            capabilityScore: capability.score,
            isEligible: capability.isEligible && (team.status === 'AVAILABLE' || team.status === 'STANDBY'),
            matchedTags: capability.matchedTags,
            missingCritical: capability.missingCritical,
            totalScore
        });
    }

    // Sort by totalScore descending
    evaluatedTeams.sort((a, b) => b.totalScore - a.totalScore);

    return evaluatedTeams;
}

/**
 * Automatically dispatches the best suitable team to an incident
 * Follows strict requirement: never falsely claims dispatched if no eligible team available.
 */
async function autoDispatchIncident(incidentId, options = {}) {
    const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
    if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
    }

    // Check if incident already has an assigned team to prevent duplicate assignments
    if (incident.assigned_rescue_team && incident.status !== 'RECEIVED' && incident.status !== 'REQUESTED') {
        return {
            success: true,
            dispatched: false,
            alreadyAssigned: true,
            teamName: incident.assigned_rescue_team,
            status: incident.status,
            message: `Incident already assigned to ${incident.assigned_rescue_team}. Duplicate dispatch suppressed.`
        };
    }

    const disasterType = options.category || incident.category;
    const details = options.details || incident.details;
    const lat = incident.latitude;
    const lng = incident.longitude;

    const candidates = await findEligibleRescueTeams({
        disasterType,
        latitude: lat,
        longitude: lng,
        victimCount: incident.count || 1,
        details
    });

    // Pick top eligible available candidate
    const eligibleTeam = candidates.find(c => c.isEligible);

    if (eligibleTeam) {
        const teamObj = eligibleTeam.team;
        const nowIso = new Date().toISOString();
        const ackDeadlineIso = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3-minute acknowledgement window

        // 1. Update incident
        await db.run(
            `UPDATE incidents
             SET assigned_rescue_team = ?,
                 assigned_authority = 'NDRF Tactical Command Grid',
                 status = 'TEAM_ASSIGNED',
                 dispatch_team_id = ?,
                 dispatch_eta_minutes = ?,
                 dispatch_distance_km = ?,
                 ack_deadline = ?,
                 dispatch_notes = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                teamObj.name,
                teamObj.id,
                eligibleTeam.etaMinutes,
                eligibleTeam.distanceKm,
                ackDeadlineIso,
                `Auto-assigned via capability match (${eligibleTeam.matchedTags.join('; ')}). Distance: ${eligibleTeam.distanceKm}km, ETA: ${eligibleTeam.etaMinutes}m.`,
                incidentId
            ]
        );

        // 2. Update team status to DISPATCHED
        await db.run(
            `UPDATE rescue_teams
             SET status = 'DISPATCHED',
                 assigned_incident_id = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [incidentId, teamObj.id]
        );

        // 3. Append to incident_updates audit timeline
        const updateNote = `[AUTO-DISPATCH] Unit '${teamObj.name}' (${teamObj.unit_code}) dispatched to scene. Distance: ${eligibleTeam.distanceKm} km, ETA: ~${eligibleTeam.etaMinutes} mins. Capability Match Score: ${eligibleTeam.capabilityScore}/100. Acknowledgment deadline: 3 minutes.`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, 'SYSTEM_DISPATCH_ENGINE', 'AUTHORITY', ?, 'TEAM_ASSIGNED', ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                incidentId,
                incident.status,
                updateNote
            ]
        );

        // 4. Create urgent notification for assigned team & authority
        await db.run(
            `INSERT INTO notifications (id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at)
             VALUES (?, NULL, 'AUTHORITY', ?, ?, ?, 'DISPATCH', 0, datetime('now'))`,
            [
                generateUUID('NOTIF'),
                `DISPATCH ALERT: ${teamObj.unit_code} -> ${incidentId}`,
                `Tactical squad ${teamObj.name} deployed to ${disasterType} emergency at [${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}]. ETA: ${eligibleTeam.etaMinutes} mins.`,
                incidentId
            ]
        );

        // 5. Audit log
        await logAction({
            userId: options.dispatchedBy || 'SYSTEM_AUTO_DISPATCH',
            userRole: 'AUTHORITY',
            action: 'AUTOMATIC_RESCUE_DISPATCH',
            entityType: 'INCIDENT',
            entityId: incidentId,
            details: {
                teamId: teamObj.id,
                teamName: teamObj.name,
                distanceKm: eligibleTeam.distanceKm,
                etaMinutes: eligibleTeam.etaMinutes,
                matchedCapabilities: eligibleTeam.matchedTags
            }
        });

        // 6. Broadcast via Socket.IO
        try {
            const { getIO } = require('../sockets/socketHandler');
            const io = getIO();
            if (io) {
                const updatedInc = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
                const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [incidentId]);
                
                io.emit('incident:updated', { ...updatedInc, incident: updatedInc, updates });
                io.to('authorities').emit('team:dispatched', {
                    incidentId,
                    team: {
                        id: teamObj.id,
                        name: teamObj.name,
                        unitCode: teamObj.unit_code,
                        leader: teamObj.team_leader,
                        phone: teamObj.contact_phone
                    },
                    location: { latitude: lat, longitude: lng },
                    priority: incident.emergency_level,
                    distanceKm: eligibleTeam.distanceKm,
                    etaMinutes: eligibleTeam.etaMinutes,
                    ackDeadline: ackDeadlineIso
                });
            }
        } catch (sErr) {
            console.warn('[Dispatch] Socket emission skipped:', sErr.message);
        }

        return {
            success: true,
            dispatched: true,
            status: 'TEAM_ASSIGNED',
            assignedTeam: {
                id: teamObj.id,
                name: teamObj.name,
                unitCode: teamObj.unit_code,
                leader: teamObj.team_leader,
                phone: teamObj.contact_phone,
                vehicle: teamObj.vehicle,
                equipment: teamObj.equipment,
                distanceKm: eligibleTeam.distanceKm,
                etaMinutes: eligibleTeam.etaMinutes,
                matchedCapabilities: eligibleTeam.matchedTags
            },
            distanceKm: eligibleTeam.distanceKm,
            etaMinutes: eligibleTeam.etaMinutes,
            ackDeadline: ackDeadlineIso
        };
    } else {
        // No suitable team available — NEVER falsely state team dispatched!
        const escalationNote = `[DISPATCH QUEUE] No available rescue squads meet operational capability criteria within local radius. Incident status set to AWAITING ASSISTANCE and escalated to regional command dispatcher.`;

        await db.run(
            `UPDATE incidents
             SET dispatch_notes = ?,
                 escalation_level = 1,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [escalationNote, incidentId]
        );

        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, 'SYSTEM_DISPATCH_ENGINE', 'AUTHORITY', ?, ?, ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                incidentId,
                incident.status,
                incident.status,
                escalationNote
            ]
        );

        await db.run(
            `INSERT INTO notifications (id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at)
             VALUES (?, NULL, 'AUTHORITY', ?, ?, ?, 'ESCALATION', 0, datetime('now'))`,
            [
                generateUUID('NOTIF'),
                `ESCALATION: No Squad Available for ${incidentId}`,
                `Emergency ${incidentId} (${disasterType}) requires mutual aid or manual responder assignment.`,
                incidentId
            ]
        );

        return {
            success: true,
            dispatched: false,
            awaitingAssistance: true,
            status: incident.status,
            reason: 'All registered rescue teams are either currently deployed on high-priority emergencies or lack required specialized rescue gear.',
            candidatesEvaluated: candidates.length,
            message: 'Incident recorded and awaiting assistance; escalated to Command Authority queue.'
        };
    }
}

/**
 * Acknowledges a dispatched incident on behalf of a rescue team
 */
async function acknowledgeTeamDispatch({ teamId, incidentId, responderId = null, note = '' }) {
    const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
    if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
    }

    const team = await db.get(`SELECT * FROM rescue_teams WHERE id = ? OR name = ?`, [teamId, teamId]);
    if (!team) {
        throw new Error(`Rescue team ${teamId} not found`);
    }

    const ackTime = new Date().toISOString();
    const ackNote = note || `Rescue Unit '${team.name}' acknowledged emergency alert and confirmed immediate departure.`;

    await db.run(
        `UPDATE incidents
         SET status = 'TEAM_EN_ROUTE',
             acknowledged_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
        [incidentId]
    );

    await db.run(
        `UPDATE rescue_teams
         SET last_ack_at = datetime('now'),
             status = 'DISPATCHED',
             updated_at = datetime('now')
         WHERE id = ?`,
        [team.id]
    );

    await db.run(
        `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
         VALUES (?, ?, ?, 'RESPONDER', ?, 'TEAM_EN_ROUTE', ?, datetime('now'))`,
        [
            generateUUID('INCU'),
            incidentId,
            responderId || team.id,
            incident.status,
            ackNote
        ]
    );

    await logAction({
        userId: responderId || team.id,
        userRole: 'RESPONDER',
        action: 'TEAM_ACKNOWLEDGE_DISPATCH',
        entityType: 'INCIDENT',
        entityId: incidentId,
        details: { teamId: team.id, acknowledgedAt: ackTime }
    });

    try {
        const { getIO } = require('../sockets/socketHandler');
        const io = getIO();
        if (io) {
            const updatedInc = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
            const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [incidentId]);
            io.emit('incident:updated', { ...updatedInc, incident: updatedInc, updates });
        }
    } catch (e) {}

    return {
        success: true,
        incidentId,
        teamId: team.id,
        status: 'TEAM_EN_ROUTE',
        acknowledgedAt: ackTime
    };
}

/**
 * Escalates an incident to another team or Duty Commander if unacknowledged
 */
async function escalateIncident({ incidentId, reason = 'Acknowledgment deadline exceeded', authorityUser = null }) {
    const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
    if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
    }

    const prevTeam = incident.assigned_rescue_team;
    const currentEscalation = (incident.escalation_level || 0) + 1;

    // Release previous team
    if (incident.dispatch_team_id) {
        await db.run(
            `UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL, updated_at = datetime('now') WHERE id = ?`,
            [incident.dispatch_team_id]
        );
    }

    // Try finding next best available team
    const candidates = await findEligibleRescueTeams({
        disasterType: incident.category,
        latitude: incident.latitude,
        longitude: incident.longitude,
        victimCount: incident.count || 1,
        details: incident.details
    });

    // Exclude the previously unresponsive team
    const nextCandidate = candidates.find(c => c.isEligible && c.teamName !== prevTeam);

    if (nextCandidate) {
        const nextTeam = nextCandidate.team;
        const ackDeadline = new Date(Date.now() + 3 * 60 * 1000).toISOString();

        await db.run(
            `UPDATE incidents
             SET assigned_rescue_team = ?,
                 dispatch_team_id = ?,
                 dispatch_eta_minutes = ?,
                 dispatch_distance_km = ?,
                 status = 'TEAM_ASSIGNED',
                 ack_deadline = ?,
                 escalation_level = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                nextTeam.name,
                nextTeam.id,
                nextCandidate.etaMinutes,
                nextCandidate.distanceKm,
                ackDeadline,
                currentEscalation,
                incidentId
            ]
        );

        await db.run(
            `UPDATE rescue_teams SET status = 'DISPATCHED', assigned_incident_id = ?, updated_at = datetime('now') WHERE id = ?`,
            [incidentId, nextTeam.id]
        );

        const escalationTimelineNote = `[ESCALATION LVL ${currentEscalation}] Reassigned from '${prevTeam || 'Previous'}' to '${nextTeam.name}' (${nextTeam.unit_code}) due to: ${reason}. ETA: ~${nextCandidate.etaMinutes} mins.`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, 'AUTHORITY', 'ESCALATED', 'TEAM_ASSIGNED', ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                incidentId,
                authorityUser ? authorityUser.id : 'ESCALATION_ENGINE',
                escalationTimelineNote
            ]
        );

        return {
            success: true,
            escalated: true,
            reassigned: true,
            newTeam: nextTeam.name,
            etaMinutes: nextCandidate.etaMinutes,
            escalationLevel: currentEscalation
        };
    } else {
        // No alternative team available
        await db.run(
            `UPDATE incidents
             SET assigned_rescue_team = NULL,
                 dispatch_team_id = NULL,
                 status = 'REQUESTED',
                 escalation_level = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [currentEscalation, incidentId]
        );

        const unassignedEscalationNote = `[CRITICAL ESCALATION LVL ${currentEscalation}] Unacknowledged by '${prevTeam}'. No alternate field teams available in area. Staged for direct Dispatcher manual intervention.`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, 'AUTHORITY', 'ESCALATED', 'REQUESTED', ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                incidentId,
                authorityUser ? authorityUser.id : 'ESCALATION_ENGINE',
                unassignedEscalationNote
            ]
        );

        return {
            success: true,
            escalated: true,
            reassigned: false,
            awaitingAssistance: true,
            escalationLevel: currentEscalation,
            message: 'Incident escalated to Authority Commander for priority mutual-aid dispatch.'
        };
    }
}

/**
 * Scans for unacknowledged incident assignments that have exceeded their ack deadline
 * Automatically escalates to secondary team or sets to REQUESTED for manual intervention
 */
async function checkAndEscalateUnacknowledgedIncidents() {
    try {
        const unacked = await db.query(
            `SELECT id, category, details, latitude, longitude, count, assigned_rescue_team, dispatch_team_id, ack_deadline, escalation_level
             FROM incidents
             WHERE status IN ('ASSIGNED', 'TEAM_ASSIGNED')
               AND acknowledged_at IS NULL
               AND ack_deadline IS NOT NULL
               AND datetime(ack_deadline) < datetime('now')`
        );

        const results = [];
        for (const inc of unacked) {
            console.log(`[DispatchEngine] Incident ${inc.id} unacknowledged past deadline (${inc.ack_deadline}). Escalating...`);
            const res = await escalateIncident({
                incidentId: inc.id,
                reason: `Acknowledgment deadline exceeded by ${inc.assigned_rescue_team || 'assigned team'}. Automatic escalation triggered.`
            });
            results.push({ incidentId: inc.id, ...res });
        }
        return results;
    } catch (err) {
        console.error('[DispatchEngine] Escalation check error:', err.message);
        return [];
    }
}

module.exports = {
    haversineDistanceKm,
    calculateEtaMinutes,
    evaluateCapabilityMatch,
    findEligibleRescueTeams,
    autoDispatchIncident,
    acknowledgeTeamDispatch,
    escalateIncident,
    checkAndEscalateUnacknowledgedIncidents
};
