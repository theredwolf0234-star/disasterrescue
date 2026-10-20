const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { logAction } = require('../services/auditService');

// Progressive Operational Dispatch Radii in kilometers (Configurable via Environment)
const DEFAULT_INITIAL_RADIUS_KM = parseFloat(process.env.INITIAL_DISPATCH_RADIUS_KM) || 25; // Tier 1: Local Immediate
const DEFAULT_DISTRICT_RADIUS_KM = parseFloat(process.env.DISTRICT_DISPATCH_RADIUS_KM) || 60; // Tier 2: District
const DEFAULT_REGIONAL_RADIUS_KM = parseFloat(process.env.REGIONAL_DISPATCH_RADIUS_KM) || 150; // Tier 3: Neighboring Operational Zone
const DEFAULT_STATE_RADIUS_KM = parseFloat(process.env.STATE_DISPATCH_RADIUS_KM) || 350; // Tier 4: State Sector
const DEFAULT_MAX_RADIUS_KM = parseFloat(process.env.MAX_DISPATCH_RADIUS_KM) || 800; // Tier 5: Regional Mutual-Aid

const SEARCH_RADII = [DEFAULT_INITIAL_RADIUS_KM, DEFAULT_DISTRICT_RADIUS_KM, DEFAULT_REGIONAL_RADIUS_KM, DEFAULT_STATE_RADIUS_KM, DEFAULT_MAX_RADIUS_KM];
const MAX_DISPATCH_RADIUS_KM = DEFAULT_MAX_RADIUS_KM;

/**
 * Returns progressive search radius tiers up to an optional maximum radius
 */
function getSearchTiers(maxRadius = null) {
    const max = maxRadius ? parseFloat(maxRadius) : DEFAULT_MAX_RADIUS_KM;
    const tiers = [
        { tier: 1, name: 'Local Immediate Sector', radiusKm: Math.min(DEFAULT_INITIAL_RADIUS_KM, max) },
        { tier: 2, name: 'District Response Zone', radiusKm: Math.min(DEFAULT_DISTRICT_RADIUS_KM, max) },
        { tier: 3, name: 'Neighboring Operational Zone', radiusKm: Math.min(DEFAULT_REGIONAL_RADIUS_KM, max) },
        { tier: 4, name: 'State Tactical Grid', radiusKm: Math.min(DEFAULT_STATE_RADIUS_KM, max) },
        { tier: 5, name: 'Regional Mutual-Aid Grid', radiusKm: max }
    ];
    // Filter out duplicates if max cap is small
    const seen = new Set();
    const result = [];
    for (const t of tiers) {
        if (!seen.has(t.radiusKm) && t.radiusKm > 0) {
            seen.add(t.radiusKm);
            result.push(t);
        }
    }
    return result;
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 * Strictly verified geospatial standard.
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 === null || lat1 === undefined || lon1 === null || lon1 === undefined ||
        lat2 === null || lat2 === undefined || lon2 === null || lon2 === undefined) {
        return Infinity;
    }
    const R = 6371; // Earth's mean radius in km
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
 * Calculates Estimated Time of Arrival (ETA) in minutes.
 * Incorporates urban terrain transit speed (35 km/h) plus standard 3-minute mobilization.
 */
function calculateEtaMinutes(distanceKm) {
    if (!Number.isFinite(distanceKm) || distanceKm === Infinity) return null;
    const speedKmH = 35;
    const travelTimeMinutes = (distanceKm / speedKmH) * 60;
    return Math.max(2, Math.round(travelTimeMinutes + 3));
}

/**
 * Evaluates operational capability and suitability of a rescue team for a specific disaster.
 * Ensures teams are not dispatched to missions they cannot safely handle.
 */
function evaluateCapabilityMatch(team, disasterType = '', details = '') {
    const typeStr = `${disasterType || ''} ${details || ''}`.toLowerCase();
    const teamProfile = `${team.name || ''} ${team.type || ''} ${team.vehicle || ''} ${team.equipment || ''} ${team.capabilities || ''} ${team.skills || ''}`.toLowerCase();

    let suitabilityTier = 'STANDARD'; // 'SPECIALIZED', 'STANDARD', 'UNSUITABLE'
    let capabilityScore = 60; // Base score for certified first-response teams
    const matchedTags = ['General First-Aid & Extrication'];
    const missingCritical = [];

    const isFlood = typeStr.includes('flood') || typeStr.includes('water') || typeStr.includes('submerged') || typeStr.includes('drowning') || typeStr.includes('inundation');
    const isMedical = typeStr.includes('medical') || typeStr.includes('injury') || typeStr.includes('trauma') || typeStr.includes('cardiac') || typeStr.includes('unconscious') || typeStr.includes('bleeding');
    const isCollapse = typeStr.includes('collapse') || typeStr.includes('earthquake') || typeStr.includes('rubble') || typeStr.includes('debris') || typeStr.includes('landslide') || typeStr.includes('trapped');
    const isFire = typeStr.includes('fire') || typeStr.includes('burn') || typeStr.includes('smoke') || typeStr.includes('gas') || typeStr.includes('chemical') || typeStr.includes('hazmat');
    const isAvalanche = typeStr.includes('avalanche') || typeStr.includes('snow') || typeStr.includes('blizzard') || typeStr.includes('mountain');

    if (isAvalanche) {
        const hasMountainAvalanche = teamProfile.includes('avalanche') || teamProfile.includes('mountain') || teamProfile.includes('glacier') || teamProfile.includes('high altitude');
        if (hasMountainAvalanche) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 95;
            matchedTags.push('High-Altitude Mountain Rescue / Avalanche Transceiver');
        } else {
            suitabilityTier = 'UNSUITABLE';
            capabilityScore = 15;
            missingCritical.push('High-Altitude Mountain & Avalanche Extrication Gear');
        }
    } else if (isFlood) {
        const hasWatercraft = teamProfile.includes('boat') || teamProfile.includes('water') || teamProfile.includes('raft') || teamProfile.includes('amphibious') || teamProfile.includes('aquatic') || teamProfile.includes('watercraft') || teamProfile.includes('flood');
        if (hasWatercraft) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 95;
            matchedTags.push('Aquatic Craft / Inflatable Rafts / Water Rescue');
        } else if (teamProfile.includes('ndrf') || teamProfile.includes('rapid') || teamProfile.includes('rescue')) {
            // General rapid response teams can assist in perimeter rescue
            suitabilityTier = 'STANDARD';
            capabilityScore = 65;
            matchedTags.push('Perimeter Evacuation / Life-Jackets');
        } else {
            // Unsuitable for flood operations
            suitabilityTier = 'UNSUITABLE';
            capabilityScore = 20;
            missingCritical.push('Watercraft / Aquatic Extrication Gear');
        }
    } else if (isMedical) {
        const hasMedical = teamProfile.includes('medical') || teamProfile.includes('ambulance') || teamProfile.includes('triage') || teamProfile.includes('trauma') || teamProfile.includes('doctor') || teamProfile.includes('paramedic');
        if (hasMedical) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 95;
            matchedTags.push('Paramedic / ACLS Ambulance / Trauma Triage');
        } else {
            suitabilityTier = 'STANDARD';
            capabilityScore = 60;
            matchedTags.push('First-Aid Kit');
        }
    } else if (isCollapse) {
        const hasSearchExtrication = teamProfile.includes('search') || teamProfile.includes('extrication') || teamProfile.includes('cutter') || teamProfile.includes('crane') || teamProfile.includes('spreader') || teamProfile.includes('hydraulic');
        if (hasSearchExtrication) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 95;
            matchedTags.push('Hydraulic Spreaders / Search Sensors / Heavy Extrication');
        } else if (teamProfile.includes('ndrf') || teamProfile.includes('sdrf') || teamProfile.includes('rapid')) {
            suitabilityTier = 'STANDARD';
            capabilityScore = 70;
            matchedTags.push('Urban Search & Rescue Squad');
        } else {
            suitabilityTier = 'UNSUITABLE';
            capabilityScore = 25;
            missingCritical.push('Structural Extrication Equipment');
        }
    } else if (isFire) {
        const hasFireHazmat = teamProfile.includes('fire') || teamProfile.includes('hazmat') || teamProfile.includes('gas') || teamProfile.includes('scba');
        if (hasFireHazmat) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 95;
            matchedTags.push('Fire Containment / Breathing Apparatus / Gas Detectors');
        } else {
            suitabilityTier = 'STANDARD';
            capabilityScore = 55;
            matchedTags.push('Evacuation Assistance');
        }
    } else {
        // General all-hazard emergency
        if (teamProfile.includes('ndrf') || teamProfile.includes('rapid') || teamProfile.includes('rescue')) {
            suitabilityTier = 'SPECIALIZED';
            capabilityScore = 85;
            matchedTags.push('All-Hazard Rapid Response Squad');
        }
    }

    const isEligible = suitabilityTier !== 'UNSUITABLE' && capabilityScore >= 40 && missingCritical.length === 0;

    return {
        score: capabilityScore,
        suitabilityTier,
        isEligible,
        matchedTags,
        missingCritical
    };
}

/**
 * Finds, evaluates, and ranks rescue teams strictly based on distance, availability, and operational suitability.
 * The nearest suitable eligible team is ranked first by default.
 */
async function findEligibleRescueTeams({ disasterType, latitude, longitude, victimCount = 1, details = '', searchRadiusKm = MAX_DISPATCH_RADIUS_KM }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Valid incident coordinates required to match rescue teams');
    }

    const allTeams = await db.query(`SELECT * FROM rescue_teams ORDER BY name ASC`);
    
    // Query active unresolved incidents to check if any assigned incident is still in progress
    const activeIncidents = await db.query(
        `SELECT id FROM incidents WHERE status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`
    );
    const activeBusyIncidentIds = new Set(activeIncidents.map(i => i.id));

    const evaluatedTeams = [];

    for (const team of allTeams) {
        // Validate coordinates
        const hasValidCoords = team.current_lat !== null && team.current_lat !== undefined &&
                               team.current_lng !== null && team.current_lng !== undefined &&
                               !isNaN(parseFloat(team.current_lat)) && !isNaN(parseFloat(team.current_lng)) &&
                               parseFloat(team.current_lat) >= -90 && parseFloat(team.current_lat) <= 90 &&
                               parseFloat(team.current_lng) >= -180 && parseFloat(team.current_lng) <= 180;

        const teamLat = hasValidCoords ? parseFloat(team.current_lat) : null;
        const teamLng = hasValidCoords ? parseFloat(team.current_lng) : null;

        // Check telemetry freshness (stale if updated > 24 hours ago)
        let isStaleLocation = false;
        const lastLocationTime = team.last_location_update || team.updated_at;
        if (lastLocationTime) {
            const lastUpdate = new Date(lastLocationTime).getTime();
            if (Date.now() - lastUpdate > 24 * 60 * 60 * 1000) {
                isStaleLocation = true;
            }
        }

        // Check verified location flag
        const isVerifiedLocation = team.is_verified_location !== 0 && team.is_verified_location !== false;

        // Calculate actual Haversine distance
        const distanceKm = hasValidCoords ? haversineDistanceKm(lat, lng, teamLat, teamLng) : Infinity;
        const etaMinutes = calculateEtaMinutes(distanceKm);

        // Check availability: team status must be AVAILABLE/STANDBY and not beyond operational capacity
        const isAssignedToActive = Boolean(team.assigned_incident_id && activeBusyIncidentIds.has(team.assigned_incident_id));
        const maxCapacity = team.max_capacity ? parseInt(team.max_capacity, 10) : 2;
        const activeCount = team.active_incident_count ? parseInt(team.active_incident_count, 10) : (isAssignedToActive ? 1 : 0);
        const hasAvailableSlot = activeCount < maxCapacity;
        const isStatusAvailable = (team.status === 'AVAILABLE' || team.status === 'STANDBY') && hasAvailableSlot;

        // Evaluate capability & suitability
        const capability = evaluateCapabilityMatch(team, disasterType, details);

        // Check within search radius
        const isWithinRadius = distanceKm <= searchRadiusKm;

        // Team is strictly eligible ONLY if:
        // 1. Has real, valid coordinates
        // 2. Verified location and non-stale coordinates
        // 3. Is available (not deployed beyond capacity)
        // 4. Is operationally suitable for the disaster
        // 5. Is within the operational search radius
        const isEligible = hasValidCoords && isVerifiedLocation && !isStaleLocation && isStatusAvailable && capability.isEligible && isWithinRadius;

        // Combined Ranking Score (Nearest eligible team ranked top by default):
        // Primary driver: Distance (shorter distance = higher score, 100 at 0km, decreasing linearly)
        // Secondary driver: Capability suitability bonus for specialized units
        // Availability bonus for squads with more spare capacity
        let rankingScore = 0;
        if (isEligible) {
            const proximityScore = Math.max(0, 100 - (distanceKm * 0.5)); // Proximity score
            const tierBonus = capability.suitabilityTier === 'SPECIALIZED' ? 20 : 0;
            const capacityBonus = Math.max(0, (maxCapacity - activeCount) * 5);
            rankingScore = Number((proximityScore + tierBonus + capacityBonus).toFixed(1));
        } else {
            rankingScore = -1; // Ineligible
        }

        evaluatedTeams.push({
            team,
            teamId: team.id,
            teamName: team.name,
            unitCode: team.unit_code,
            teamLeader: team.team_leader,
            contactPhone: team.contact_phone,
            status: team.status,
            operationalZone: team.operational_zone || 'ZONE_LUCKNOW',
            maxCapacity,
            activeCount,
            currentLat: teamLat,
            currentLng: teamLng,
            hasValidLocation: hasValidCoords,
            isVerifiedLocation,
            isStaleLocation,
            isAvailable: isStatusAvailable,
            isCurrentlyDeployed: isAssignedToActive,
            distanceKm,
            etaMinutes,
            capabilityScore: capability.score,
            suitabilityTier: capability.suitabilityTier,
            isEligible,
            isWithinRadius,
            matchedTags: capability.matchedTags,
            missingCritical: capability.missingCritical,
            rankingScore
        });
    }

    // Sort: Eligible teams first, ordered strictly by shortest distance (proximity priority)
    // If operational suitability is equal, nearest team is ALWAYS first.
    evaluatedTeams.sort((a, b) => {
        if (a.isEligible && !b.isEligible) return -1;
        if (!a.isEligible && b.isEligible) return 1;

        if (a.isEligible && b.isEligible) {
            // When suitability tiers are identical, nearest team wins strictly
            if (a.suitabilityTier === b.suitabilityTier) {
                return a.distanceKm - b.distanceKm;
            }
            // A specialized team wins over standard team only if within 15km difference
            if (a.suitabilityTier === 'SPECIALIZED' && b.suitabilityTier !== 'SPECIALIZED') {
                return (a.distanceKm - b.distanceKm) > 15 ? 1 : -1;
            }
            if (b.suitabilityTier === 'SPECIALIZED' && a.suitabilityTier !== 'SPECIALIZED') {
                return (b.distanceKm - a.distanceKm) > 15 ? -1 : 1;
            }
            return a.distanceKm - b.distanceKm;
        }

        // For ineligible teams, sort by distance for transparent reporting of alternatives
        return a.distanceKm - b.distanceKm;
    });

    return evaluatedTeams;
}

/**
 * Automatically assigns and dispatches the nearest suitable available rescue team.
 * Follows progressive search radius expansion:
 * Tier 1: Local Immediate (25km) -> Tier 2: District (60km) -> Tier 3: Neighboring Zone (150km) -> Tier 4: State Sector (350km) -> Tier 5: Mutual-Aid (800km)
 * Prevents concurrent double-booking via atomic status updates.
 */
async function autoDispatchIncident(incidentId, options = {}) {
    const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
    if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
    }

    // Validate coordinates
    if (!incident.latitude || !incident.longitude || isNaN(parseFloat(incident.latitude)) || isNaN(parseFloat(incident.longitude))) {
        return {
            success: false,
            dispatched: false,
            reason: 'INVALID_VICTIM_COORDINATES',
            message: 'Incident lacks verified GPS coordinates. Automated dispatch requires valid coordinates.'
        };
    }

    // Check if incident already has an assigned team to prevent duplicate assignments
    if (incident.assigned_rescue_team && incident.status !== 'RECEIVED' && incident.status !== 'REQUESTED' && incident.status !== 'AWAITING_SQUAD') {
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

    // Progressive Search Radius expansion
    const searchTiers = getSearchTiers(options.searchRadiusKm || null);
    let candidates = [];
    let selectedCandidate = null;
    let assignedTier = searchTiers[0];

    for (const tier of searchTiers) {
        candidates = await findEligibleRescueTeams({
            disasterType,
            latitude: lat,
            longitude: lng,
            victimCount: incident.count || 1,
            details,
            searchRadiusKm: tier.radiusKm
        });

        // Find the top eligible candidate within this radius tier
        const topEligible = candidates.find(c => c.isEligible);
        if (topEligible) {
            selectedCandidate = topEligible;
            assignedTier = tier;
            break; // Found nearest suitable team within this tier!
        }
    }

    if (selectedCandidate) {
        const teamObj = selectedCandidate.team;
        const ackDeadlineIso = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3-minute acknowledgement window

        // Atomic lock to prevent concurrent double-booking of the same team beyond max capacity
        const lockResult = await db.run(
            `UPDATE rescue_teams
             SET status = 'DISPATCHED',
                 assigned_incident_id = ?,
                 active_incident_count = COALESCE(active_incident_count, 0) + 1,
                 notification_status = 'NOTIFIED',
                 last_location_update = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ? AND status IN ('AVAILABLE', 'STANDBY') AND COALESCE(active_incident_count, 0) < COALESCE(max_capacity, 2)`,
            [incidentId, teamObj.id]
        );

        if (lockResult.changes === 0) {
            // Concurrent booking collision detected: another process booked this team.
            // Re-evaluate and dispatch next nearest candidate.
            console.warn(`[DispatchEngine] Race condition detected on team ${teamObj.id}. Retrying with next available candidate...`);
            const fallbackCandidates = await findEligibleRescueTeams({
                disasterType,
                latitude: lat,
                longitude: lng,
                victimCount: incident.count || 1,
                details,
                searchRadiusKm: options.searchRadiusKm || MAX_DISPATCH_RADIUS_KM
            });
            const fallback = fallbackCandidates.find(c => c.isEligible && c.teamId !== teamObj.id);
            if (!fallback) {
                return recordNoTeamAvailable(incident, disasterType, fallbackCandidates, options.searchRadiusKm || MAX_DISPATCH_RADIUS_KM);
            }
            return autoDispatchIncident(incidentId, options);
        }

        // Calculate real road route vs straight-line distance
        let roadDistKm = null;
        let straightLineDistKm = selectedCandidate.distanceKm;
        let finalDistanceKm = selectedCandidate.distanceKm;
        let finalEtaMinutes = selectedCandidate.etaMinutes;
        let distanceType = 'straight_line';
        let routingEngine = 'Straight-Line Geodesic';
        let etaText = `~${finalEtaMinutes} mins (Direct: ${finalDistanceKm} km)`;

        try {
            const { calculateSafeRoute } = require('./safeRouteService');
            const route = await calculateSafeRoute({
                originLat: selectedCandidate.currentLat,
                originLng: selectedCandidate.currentLng,
                destLat: lat,
                destLng: lng,
                teamId: teamObj.id,
                incidentId: incidentId
            });
            if (route && route.routeDistanceKm > 0) {
                roadDistKm = route.routeDistanceKm;
                finalDistanceKm = route.routeDistanceKm;
                finalEtaMinutes = route.etaMinutes || calculateEtaMinutes(finalDistanceKm);
                distanceType = 'road';
                routingEngine = route.routingEngine || 'OSRM Real-World Road Network';
                etaText = `~${finalEtaMinutes} mins (Road: ${finalDistanceKm} km)`;
            }
        } catch (routeErr) {
            console.warn('[DispatchEngine] Road routing fallback to straight-line:', routeErr.message);
        }

        // 1. Update incident with nearest assigned team details
        const dispatchNote = `[AUTO-DISPATCH] Nearest eligible squad '${teamObj.name}' (${teamObj.unit_code}) assigned from Tier ${assignedTier.tier} (${assignedTier.name}). Distance: ${finalDistanceKm} km (${distanceType}), ETA: ~${finalEtaMinutes} mins. Capability Match: ${selectedCandidate.suitabilityTier} (${selectedCandidate.matchedTags.join('; ')}).`;

        await db.run(
            `UPDATE incidents
             SET assigned_rescue_team = ?,
                 assigned_authority = 'NDRF Tactical Command Grid',
                 status = 'TEAM_ASSIGNED',
                 dispatch_team_id = ?,
                 dispatch_eta_minutes = ?,
                 dispatch_eta_text = ?,
                 dispatch_distance_km = ?,
                 dispatch_distance_type = ?,
                 road_distance_km = ?,
                 straight_line_distance_km = ?,
                 routing_engine = ?,
                 assignment_time = datetime('now'),
                 last_status_update = datetime('now'),
                 ack_deadline = ?,
                 dispatch_notes = ?,
                 escalation_level = ?,
                 escalation_reason = NULL,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                teamObj.name,
                teamObj.id,
                finalEtaMinutes,
                etaText,
                finalDistanceKm,
                distanceType,
                roadDistKm,
                straightLineDistKm,
                routingEngine,
                ackDeadlineIso,
                dispatchNote,
                assignedTier.tier > 1 ? assignedTier.tier - 1 : 0,
                incidentId
            ]
        );

        // 2. Append to incident timeline
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, 'SYSTEM_DISPATCH_ENGINE', 'AUTHORITY', ?, 'TEAM_ASSIGNED', ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                incidentId,
                incident.status,
                dispatchNote
            ]
        );

        // 3. Urgent notification for assigned squad and dashboard
        await db.run(
            `INSERT INTO notifications (id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at)
             VALUES (?, NULL, 'AUTHORITY', ?, ?, ?, 'DISPATCH', 0, datetime('now'))`,
            [
                generateUUID('NOTIF'),
                `DISPATCH ALERT: ${teamObj.unit_code} -> ${incidentId}`,
                `Nearest suitable squad ${teamObj.name} deployed to ${disasterType} at [${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}]. Distance: ${finalDistanceKm}km (${distanceType}), ETA: ~${finalEtaMinutes}m.`,
                incidentId
            ]
        );

        // 4. Audit log
        await logAction({
            userId: options.dispatchedBy || 'SYSTEM_AUTO_DISPATCH',
            userRole: 'AUTHORITY',
            action: 'AUTOMATIC_RESCUE_DISPATCH',
            entityType: 'INCIDENT',
            entityId: incidentId,
            details: {
                teamId: teamObj.id,
                teamName: teamObj.name,
                distanceKm: finalDistanceKm,
                distanceType,
                roadDistanceKm: roadDistKm,
                straightLineDistanceKm: straightLineDistKm,
                etaMinutes: finalEtaMinutes,
                suitabilityTier: selectedCandidate.suitabilityTier,
                isStaleLocation: selectedCandidate.isStaleLocation,
                tier: assignedTier.name
            }
        });

        // 5. Broadcast real-time update
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
                        phone: teamObj.contact_phone,
                        distanceKm: finalDistanceKm,
                        distanceType,
                        etaMinutes: finalEtaMinutes
                    },
                    location: { latitude: lat, longitude: lng },
                    priority: incident.emergency_level,
                    ackDeadline: ackDeadlineIso
                });
            }
        } catch (sErr) {
            console.warn('[Dispatch] Socket emission notice:', sErr.message);
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
                distanceKm: finalDistanceKm,
                distanceType,
                roadDistanceKm: roadDistKm,
                straightLineDistanceKm: straightLineDistKm,
                etaMinutes: finalEtaMinutes,
                etaText,
                suitabilityTier: selectedCandidate.suitabilityTier,
                matchedCapabilities: selectedCandidate.matchedTags
            },
            distanceKm: finalDistanceKm,
            distanceType,
            roadDistanceKm: roadDistKm,
            straightLineDistanceKm: straightLineDistKm,
            etaMinutes: finalEtaMinutes,
            etaText,
            routingEngine,
            ackDeadline: ackDeadlineIso
        };
    } else {
        // No suitable team available within configured maximum radius
        return recordNoTeamAvailable(incident, disasterType, candidates, options.searchRadiusKm || MAX_DISPATCH_RADIUS_KM);
    }
}

/**
 * Handles explicit "No suitable nearby team available" state with auditable fallback.
 * Retains the incident as AWAITING_SQUAD and records transparent reasons and nearest alternatives.
 */
async function recordNoTeamAvailable(incident, disasterType, candidates = [], searchRadiusKm = MAX_DISPATCH_RADIUS_KM) {
    // Provide nearest alternatives for manual authority inspection and transparent citizen reporting
    const nearestAlternatives = (candidates || []).slice(0, 5).map(c => ({
        teamId: c.teamId,
        teamName: c.teamName,
        distanceKm: c.distanceKm,
        status: c.status,
        operationalZone: c.team?.operational_zone || 'ZONE_REGIONAL',
        reasonIneligible: !c.hasValidLocation ? 'Missing GPS telemetry' :
                         c.isStaleLocation ? 'Stale telemetry (>24h without fix)' :
                         !c.isAvailable ? 'Currently deployed at capacity' :
                         !c.isWithinRadius ? `Beyond ${searchRadiusKm}km boundary` :
                         'Unsuitable equipment for disaster'
    }));

    const nearestAlternative = nearestAlternatives.length > 0 ? nearestAlternatives[0] : null;
    const nearestDistKm = nearestAlternative ? nearestAlternative.distanceKm : null;
    const escalationReason = `No qualified rescue squad available within ${searchRadiusKm} km operational perimeter. All units are either deployed, beyond operational radius, or lack specialized gear. Escalated to Regional Command Center (Level 1).`;
    const fallbackNote = `[DISPATCH ADVISORY] No suitable nearby team available within operational radius (${searchRadiusKm}km). Incident placed in Priority Dispatch Queue awaiting regional mutual-aid or manual assignment.`;

    await db.run(
        `UPDATE incidents
         SET status = 'AWAITING_SQUAD',
             assigned_rescue_team = NULL,
             dispatch_team_id = NULL,
             dispatch_notes = ?,
             escalation_level = 1,
             escalation_reason = ?,
             nearest_distance_km = ?,
             dispatch_distance_km = ?,
             dispatch_distance_type = 'nearest_candidate',
             dispatch_eta_minutes = NULL,
             dispatch_eta_text = 'Pending Squad Allocation',
             last_status_update = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
        [fallbackNote, escalationReason, nearestDistKm, nearestDistKm, incident.id]
    );

    await db.run(
        `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
         VALUES (?, ?, 'SYSTEM_DISPATCH_ENGINE', 'AUTHORITY', ?, 'AWAITING_SQUAD', ?, datetime('now'))`,
        [
            generateUUID('INCU'),
            incident.id,
            incident.status,
            fallbackNote
        ]
    );

    await db.run(
        `INSERT INTO notifications (id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at)
         VALUES (?, NULL, 'AUTHORITY', ?, ?, ?, 'ESCALATION', 0, datetime('now'))`,
        [
            generateUUID('NOTIF'),
            `NO NEARBY SQUAD: ${incident.id}`,
            `No available rescue squads within ${searchRadiusKm}km for ${incident.id} (${disasterType}). Commander review required.`,
            incident.id
        ]
    );

    return {
        success: true,
        dispatched: false,
        noSuitableNearbyTeam: true,
        status: 'AWAITING_SQUAD',
        message: `No suitable nearby team available within ${searchRadiusKm}km operational radius.`,
        nearestAlternatives,
        nearestDistanceKm: nearestDistKm,
        escalationLevel: 1,
        escalationReason,
        candidatesEvaluated: candidates.length
    };
}

/**
 * Acknowledges a dispatched incident on behalf of a rescue team.
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
 * Escalates an incident to another team or Duty Commander if unacknowledged or rejected.
 */
async function escalateIncident({ incidentId, reason = 'Acknowledgment deadline exceeded', authorityUser = null }) {
    const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
    if (!incident) {
        throw new Error(`Incident ${incidentId} not found`);
    }

    const prevTeam = incident.assigned_rescue_team;
    const currentEscalation = (incident.escalation_level || 0) + 1;

    // Release previously assigned team back to AVAILABLE
    if (incident.dispatch_team_id) {
        await db.run(
            `UPDATE rescue_teams SET status = 'AVAILABLE', assigned_incident_id = NULL, updated_at = datetime('now') WHERE id = ?`,
            [incident.dispatch_team_id]
        );
    }

    // Try finding next nearest eligible team excluding previous team
    const candidates = await findEligibleRescueTeams({
        disasterType: incident.category,
        latitude: incident.latitude,
        longitude: incident.longitude,
        victimCount: incident.count || 1,
        details: incident.details,
        searchRadiusKm: MAX_DISPATCH_RADIUS_KM
    });

    const nextCandidate = candidates.find(c => c.isEligible && c.teamName !== prevTeam);

    if (nextCandidate) {
        const nextTeam = nextCandidate.team;
        const ackDeadline = new Date(Date.now() + 3 * 60 * 1000).toISOString();

        await db.run(
            `UPDATE rescue_teams SET status = 'DISPATCHED', assigned_incident_id = ?, updated_at = datetime('now') WHERE id = ?`,
            [incidentId, nextTeam.id]
        );

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

        const escalationTimelineNote = `[ESCALATION LVL ${currentEscalation}] Reassigned from '${prevTeam || 'Previous'}' to nearest eligible squad '${nextTeam.name}' (${nextTeam.unit_code}). Reason: ${reason}. Distance: ${nextCandidate.distanceKm}km, ETA: ~${nextCandidate.etaMinutes}m.`;
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
            distanceKm: nextCandidate.distanceKm,
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

        const unassignedEscalationNote = `[CRITICAL ESCALATION LVL ${currentEscalation}] Unacknowledged by '${prevTeam}'. No alternate field teams available within ${MAX_DISPATCH_RADIUS_KM}km. Escalated for direct Command Officer manual intervention.`;
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
 * Scans for unacknowledged incident assignments that have exceeded their ack deadline.
 * Automatically escalates to secondary team or sets to REQUESTED for manual intervention.
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

/**
 * Periodically rescans and safely retries dispatch for incidents awaiting squad allocation.
 */
async function retryUnassignedDispatches() {
    try {
        const awaitingIncidents = await db.query(
            `SELECT id, category, details, latitude, longitude, count, escalation_level
             FROM incidents
             WHERE status = 'AWAITING_SQUAD'
               AND created_at >= datetime('now', '-24 hours')
             ORDER BY emergency_level DESC, created_at ASC
             LIMIT 10`
        );
        const results = [];
        for (const inc of awaitingIncidents) {
            const res = await autoDispatchIncident(inc.id, {
                category: inc.category,
                details: inc.details,
                dispatchedBy: 'AUTO_RETRY_ENGINE'
            });
            results.push({ incidentId: inc.id, ...res });
        }
        return results;
    } catch (err) {
        console.error('[DispatchEngine] Retry unassigned dispatches error:', err.message);
        return [];
    }
}

module.exports = {
    SEARCH_RADII,
    MAX_DISPATCH_RADIUS_KM,
    getSearchTiers,
    haversineDistanceKm,
    calculateEtaMinutes,
    evaluateCapabilityMatch,
    findEligibleRescueTeams,
    autoDispatchIncident,
    acknowledgeTeamDispatch,
    escalateIncident,
    checkAndEscalateUnacknowledgedIncidents,
    retryUnassignedDispatches
};

