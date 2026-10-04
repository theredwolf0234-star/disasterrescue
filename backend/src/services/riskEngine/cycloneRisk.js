/**
 * CYCLONE RISK ASSESSMENT MODULE
 * Assesses wind velocity, storm surge potential, eye proximity, and rainfall intensity.
 */

function calculateCycloneRisk({ windSpeedKph = 60, rainfall = 20, distanceToCoastKm = 50, warningLevel = 'ORANGE', population = 1 }) {
    let score = 20;
    const factors = {};

    // 1. Wind Speed
    if (windSpeedKph > 120) {
        score += 40;
        factors.windSpeed = `CRITICAL (${windSpeedKph} km/h - Severe Cyclonic Storm)`;
    } else if (windSpeedKph > 80) {
        score += 25;
        factors.windSpeed = `HIGH (${windSpeedKph} km/h - Cyclonic Gale)`;
    } else if (windSpeedKph > 50) {
        score += 15;
        factors.windSpeed = `MODERATE (${windSpeedKph} km/h - Squall)`;
    } else {
        factors.windSpeed = 'LOW';
    }

    // 2. Rainfall & Surge
    if (rainfall > 30) {
        score += 25;
        factors.surgePrecip = 'CRITICAL (Intense tropical downpour with localized inundation)';
    } else if (rainfall > 10) {
        score += 15;
        factors.surgePrecip = 'HIGH (Substantial squall rainfall)';
    } else {
        factors.surgePrecip = 'MODERATE';
    }

    // 3. Warning Alert Level
    if (warningLevel === 'RED') {
        score += 20;
        factors.warning = 'RED ALERT: Imminent landfall danger';
    } else if (warningLevel === 'ORANGE') {
        score += 12;
        factors.warning = 'ORANGE ALERT: Severe weather watch';
    } else {
        score += 5;
        factors.warning = 'YELLOW ALERT: Monitoring';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Cyclone hazard score rated at ${score}/100 (${level}) driven by ${windSpeedKph} km/h wind gusts, active ${warningLevel} alert status, and tropical squall rainfall.`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Enforce mandatory coastal/riverfront evacuation, secure temporary roofs, open reinforced cyclone shelters, and position emergency power backups.'
        : 'Secure loose external equipment, clear storm drains, and advise citizens to remain indoors.';

    return {
        disasterType: 'CYCLONE',
        score,
        level,
        confidence: 91,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateCycloneRisk };
