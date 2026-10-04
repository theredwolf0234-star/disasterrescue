/**
 * FLOOD RISK ASSESSMENT MODULE
 * Multi-Criteria Decision Matrix based on precipitation intensity,
 * hydrologic proximity, elevation, and population vulnerability.
 */

function calculateFloodRisk({ rainfall = 0, waterLevelMeters = 0, elevationMeters = 120, distanceToRiverKm = 1.5, population = 1, floodZone = 'MODERATE' }) {
    let score = 20; // baseline
    const factors = {};

    // 1. Rainfall intensity (mm/h)
    if (rainfall > 35) {
        score += 35;
        factors.rainfall = 'CRITICAL (>35 mm/h torrential)';
    } else if (rainfall > 15) {
        score += 22;
        factors.rainfall = 'HIGH (15-35 mm/h heavy downpour)';
    } else if (rainfall > 5) {
        score += 10;
        factors.rainfall = 'MODERATE (5-15 mm/h steady rain)';
    } else {
        factors.rainfall = 'LOW (<5 mm/h light/none)';
    }

    // 2. Proximity to river basin or water drainage corridor
    if (distanceToRiverKm < 0.5) {
        score += 20;
        factors.riverProximity = 'CRITICAL (<500m to riverfront basin)';
    } else if (distanceToRiverKm < 1.5) {
        score += 12;
        factors.riverProximity = 'HIGH (<1.5km to primary canal/river)';
    } else {
        factors.riverProximity = 'LOW (Safe buffer >1.5km)';
    }

    // 3. Elevation & Topography
    if (elevationMeters < 110) {
        score += 18;
        factors.elevation = 'HIGH (Low-lying depression prone to severe water accumulation)';
    } else if (elevationMeters < 125) {
        score += 8;
        factors.elevation = 'MODERATE (Standard alluvial plain)';
    } else {
        factors.elevation = 'LOW (Elevated ridge)';
    }

    // 4. Population affected
    if (population >= 5) {
        score += 20;
        factors.population = 'CRITICAL (>=5 individuals endangered)';
    } else if (population >= 2) {
        score += 15;
        factors.population = 'HIGH (Multiple individuals isolated)';
    } else {
        score += 5;
        factors.population = 'MODERATE (1 individual)';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Flood risk evaluated at ${score}/100 (${level}) due to ${rainfall > 15 ? 'heavy localized precipitation' : 'steady rainfall'}, proximity to low-lying drainage corridors (${distanceToRiverKm}km), and ${population} affected victim(s).`;
    const recommendedAction = level === 'CRITICAL' 
        ? 'Deploy motorized rescue boats (Zodiac), initiate immediate shoreline evacuation, and issue flash flood warnings.'
        : level === 'HIGH'
        ? 'Mobilize field squads with water rescue gear, secure high ground shelters, and monitor water gauges.'
        : 'Maintain hydrologic monitoring and verify community drainage clearance.';

    return {
        disasterType: 'FLOOD',
        score,
        level,
        confidence: 88,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateFloodRisk };
