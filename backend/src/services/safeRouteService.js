/**
 * TACTICAL SAFE ROUTE RECOMMENDATION ENGINE
 * 
 * Computes safe transit corridors from Rescue Teams to Incident Targets
 * or Shelter destinations using real-world road networks (OSRM / OpenStreetMap)
 * with dynamic hazard-avoidance for flood inundation zones, blocked roads,
 * and structural collapse barriers.
 */

const db = require('../config/database');
const { haversineDistanceKm } = require('./clusterService');

// Known regional hazard corridors to avoid
const HAZARD_ZONES = [
    { name: 'Gomti Riverfront Inundation Zone', lat: 26.8550, lng: 80.9500, radiusKm: 0.8, type: 'FLOOD' },
    { name: 'Kapoorthala Debris & Power Line Blockage', lat: 26.8780, lng: 80.9410, radiusKm: 0.5, type: 'BLOCKED_ROAD' },
    { name: 'Daliganj Low-Lying Waterlogging', lat: 26.8650, lng: 80.9320, radiusKm: 0.6, type: 'FLOOD' }
];

/**
 * Fetch real-world road routing geometry and turn-by-turn steps from OSRM
 */
async function fetchOsrmRoadRoute(startLng, startLat, endLng, endLat, detourLng = null, detourLat = null) {
    const coordsStr = detourLng !== null && detourLat !== null
        ? `${startLng},${startLat};${detourLng},${detourLat};${endLng},${endLat}`
        : `${startLng},${startLat};${endLng},${endLat}`;
    
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true`;
    
    const res = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'AISTER-DisasterRescue/2.0' },
        signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) {
        throw new Error(`OSRM service responded with HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(data.message || 'No valid road corridor found by OSRM');
    }

    return data.routes[0];
}

/**
 * Check if a road polyline passes dangerously close to known hazard zones
 */
function findIntersectingHazards(coordinates, hazards) {
    const intersected = new Map();
    for (const [lng, lat] of coordinates) {
        for (const zone of hazards) {
            if (!intersected.has(zone.name)) {
                const dist = haversineDistanceKm(lat, lng, zone.lat, zone.lng);
                if (dist <= zone.radiusKm + 0.15) { // within hazard danger perimeter
                    intersected.set(zone.name, zone);
                }
            }
        }
    }
    return Array.from(intersected.values());
}

async function calculateSafeRoute({ originLat, originLng, destLat, destLng, teamId = null, incidentId = null }) {
    let startLat = parseFloat(originLat);
    let startLng = parseFloat(originLng);
    let endLat = parseFloat(destLat);
    let endLng = parseFloat(destLng);
    let teamName = 'Emergency Field Team';
    let targetName = 'Incident Location';

    // If teamId is provided, pull real team position from database
    if (teamId) {
        const team = await db.get(`SELECT id, name, current_lat, current_lng FROM rescue_teams WHERE id = ?`, [teamId]);
        if (team && team.current_lat && team.current_lng) {
            startLat = parseFloat(team.current_lat);
            startLng = parseFloat(team.current_lng);
            teamName = team.name;
        }
    }

    // If incidentId is provided, pull incident target coordinates
    if (incidentId) {
        const inc = await db.get(`SELECT id, category, latitude, longitude, readable_address, assigned_rescue_team, dispatch_team_id FROM incidents WHERE id = ?`, [incidentId]);
        if (inc && inc.latitude && inc.longitude) {
            endLat = parseFloat(inc.latitude);
            endLng = parseFloat(inc.longitude);
            targetName = `${inc.category} (${inc.id})`;
        }
        if ((isNaN(startLat) || isNaN(startLng)) && inc) {
            const teamLookup = inc.dispatch_team_id || inc.assigned_rescue_team;
            if (teamLookup) {
                const team = await db.get(`SELECT current_lat, current_lng, name FROM rescue_teams WHERE id = ? OR name = ?`, [teamLookup, teamLookup]);
                if (team && team.current_lat && team.current_lng) {
                    startLat = parseFloat(team.current_lat);
                    startLng = parseFloat(team.current_lng);
                    teamName = team.name;
                }
            }
        }
    }

    // Default origin to Lucknow Emergency Command HQ if unspecified
    if (isNaN(startLat) || isNaN(startLng)) {
        startLat = 26.8467;
        startLng = 80.9462;
        teamName = 'Command HQ Dispatch Staging';
    }

    if (isNaN(endLat) || isNaN(endLng)) {
        throw new Error('Valid destination coordinates are required for route calculation.');
    }

    let routeDistanceKm = 0;
    let etaMinutes = 0;
    let waypoints = [];
    let instructions = [];
    let avoidedHazards = [];
    let routingEngine = 'OSRM Real-World Road Network (OpenStreetMap)';

    // Step 1: Attempt Real-World Road Network Routing via OSRM
    try {
        let route = await fetchOsrmRoadRoute(startLng, startLat, endLng, endLat);
        let roadCoords = route.geometry.coordinates;

        // Step 2: Check if road route intersects active hazards
        const detectedHazards = findIntersectingHazards(roadCoords, HAZARD_ZONES);

        if (detectedHazards.length > 0) {
            // Pick the primary intersecting hazard and calculate a bypass waypoint
            const primaryHazard = detectedHazards[0];
            avoidedHazards = detectedHazards.map(h => h.name);

            // Compute an offset waypoint (tangent bypass away from the hazard center)
            const detourLat = primaryHazard.lat + (primaryHazard.lat > (startLat + endLat) / 2 ? 0.012 : -0.012);
            const detourLng = primaryHazard.lng + (primaryHazard.lng > (startLng + endLng) / 2 ? 0.012 : -0.012);

            try {
                // Re-route through safe detour waypoint using real roads
                const detourRoute = await fetchOsrmRoadRoute(startLng, startLat, endLng, endLat, detourLng, detourLat);
                route = detourRoute;
                roadCoords = detourRoute.geometry.coordinates;
                routingEngine = 'OSRM Real-World Road Network (Hazard Bypass Active)';
            } catch (detourErr) {
                // Keep original road route with warning if secondary detour query fails
                console.warn('[Routing] Detour road calculation fallback:', detourErr.message);
            }
        }

        waypoints = roadCoords;
        routeDistanceKm = Number((route.distance / 1000).toFixed(2));
        
        // Urban emergency transit speed (avg ~35 km/h, with traffic factors)
        etaMinutes = Math.max(2, Math.round((route.duration / 60) * 0.85));

        // Format turn-by-turn driving instructions from OSRM steps
        if (route.legs && route.legs.length > 0) {
            route.legs.forEach(leg => {
                if (leg.steps && leg.steps.length > 0) {
                    leg.steps.forEach(step => {
                        const mType = step.maneuver ? step.maneuver.type : 'proceed';
                        const street = step.name || 'arterial road';
                        const stepDist = step.distance >= 1000 
                            ? `${(step.distance / 1000).toFixed(1)} km` 
                            : `${Math.round(step.distance)} m`;
                        
                        let formatted = '';
                        if (mType === 'depart') formatted = `Depart staging location onto ${street} (${stepDist})`;
                        else if (mType === 'arrive') formatted = `Arrive at casualty scene: ${targetName}`;
                        else formatted = `${mType.replace(/_/g, ' ')} onto ${street} (${stepDist})`;

                        if (formatted && !instructions.includes(formatted)) {
                            instructions.push(formatted);
                        }
                    });
                }
            });
        }

        if (instructions.length === 0) {
            instructions = [
                `Depart staging location towards ${targetName}`,
                avoidedHazards.length > 0 ? `Bypass active hazard: ${avoidedHazards.join(', ')}` : 'Maintain high-speed transit on arterial road network',
                `Arrive at ${targetName} [${endLat.toFixed(4)}, ${endLng.toFixed(4)}]`
            ];
        }

    } catch (osrmError) {
        // Fallback: Local Tactical Geometry Corridor (used only when external OSRM is offline)
        console.warn('[Routing] OSRM road query unavailable, falling back to tactical grid:', osrmError.message);
        routingEngine = 'Tactical Corridor (Local Fallback Grid)';

        const directDistKm = haversineDistanceKm(startLat, startLng, endLat, endLng);
        HAZARD_ZONES.forEach(zone => {
            const d1 = haversineDistanceKm(startLat, startLng, zone.lat, zone.lng);
            const d2 = haversineDistanceKm(endLat, endLng, zone.lat, zone.lng);
            if (d1 < 2.5 || d2 < 2.5) avoidedHazards.push(zone.name);
        });

        waypoints = [[startLng, startLat]];
        const numMidpoints = 6;
        for (let i = 1; i <= numMidpoints; i++) {
            const ratio = i / (numMidpoints + 1);
            let midLat = startLat + (endLat - startLat) * ratio;
            let midLng = startLng + (endLng - startLng) * ratio;

            HAZARD_ZONES.forEach(zone => {
                const d = haversineDistanceKm(midLat, midLng, zone.lat, zone.lng);
                if (d < zone.radiusKm + 0.3) {
                    midLat += 0.009;
                    midLng += 0.009;
                }
            });

            waypoints.push([Number(midLng.toFixed(5)), Number(midLat.toFixed(5))]);
        }
        waypoints.push([endLng, endLat]);

        routeDistanceKm = Number((directDistKm * (avoidedHazards.length > 0 ? 1.25 : 1.14)).toFixed(2));
        etaMinutes = Math.max(3, Math.round((routeDistanceKm / 32) * 60));
        instructions = [
            `Depart staging area at [${startLat.toFixed(4)}, ${startLng.toFixed(4)}]`,
            avoidedHazards.length > 0 ? `Bypass hazard zone: ${avoidedHazards.join(', ')}` : 'Maintain high-speed transit on designated safe corridor',
            `Proceed along tactical corridor to ${targetName}`,
            `Estimated arrival in ~${etaMinutes} minutes`
        ];
    }

    const routeRisk = avoidedHazards.length > 1 ? 'MODERATE' : (avoidedHazards.length === 1 ? 'LOW-MODERATE' : 'LOW');

    return {
        success: true,
        source: routingEngine,
        isRealRoadRoute: routingEngine.startsWith('OSRM'),
        team: { id: teamId, name: teamName },
        target: { id: incidentId, name: targetName },
        origin: { latitude: startLat, longitude: startLng },
        destination: { latitude: endLat, longitude: endLng },
        distanceKm: routeDistanceKm,
        etaMinutes,
        routeRisk,
        avoidedHazards,
        summary: `Road Transit: ${routeDistanceKm} km • ETA: ~${etaMinutes} mins • Risk: ${routeRisk}`,
        waypoints,
        instructions
    };
}

module.exports = {
    calculateSafeRoute,
    HAZARD_ZONES
};
