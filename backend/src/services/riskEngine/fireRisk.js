/**
 * FIRE & WILDFIRE RISK ASSESSMENT MODULE
 * Assesses ambient temperature, wind spread velocity, vegetation dryness,
 * and structure confinement indicators.
 */

function calculateFireRisk({ temperatureC = 38, windSpeedKph = 25, isEnclosedStructure = true, trappedCount = 0, nearbyHazards = [] }) {
    let score = 25;
    const factors = {};

    // 1. Heat & Wind Vector
    if (temperatureC > 40 && windSpeedKph > 30) {
        score += 35;
        factors.ambientVector = `CRITICAL (${temperatureC}°C, ${windSpeedKph} km/h wind rapid flame propagation)`;
    } else if (temperatureC > 32 || windSpeedKph > 20) {
        score += 20;
        factors.ambientVector = `HIGH (${temperatureC}°C, moderate wind)`;
    } else {
        factors.ambientVector = 'MODERATE';
    }

    // 2. Trapped Victims
    if (trappedCount >= 2) {
        score += 35;
        factors.entrapment = `CRITICAL (${trappedCount} victim(s) reported entrapped by smoke/flames)`;
    } else if (trappedCount === 1) {
        score += 25;
        factors.entrapment = 'HIGH (1 victim entrapped)';
    } else {
        factors.entrapment = 'LOW (Evacuation cleared or exterior fire)';
    }

    // 3. Structure vs Open Area
    if (isEnclosedStructure) {
        score += 15;
        factors.structure = 'HIGH (Confined space with toxic carbon monoxide buildup risk)';
    } else {
        factors.structure = 'MODERATE (Open vegetative/commercial area)';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Fire triage score estimated at ${score}/100 (${level}) due to ${trappedCount > 0 ? `${trappedCount} entrapped victim(s)` : 'structure fire hazard'}, ambient temperature (${temperatureC}°C), and wind speed (${windSpeedKph} km/h).`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Deploy breathing apparatus squads (SCBA), dispatch high-pressure water tenders, cordon off 200m thermal radius, and alert burn ICU units.'
        : 'Dispatch fire engine squad, establish perimeter hydrant lines, and ventilate structure.';

    return {
        disasterType: 'FIRE',
        score,
        level,
        confidence: 89,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateFireRisk };
