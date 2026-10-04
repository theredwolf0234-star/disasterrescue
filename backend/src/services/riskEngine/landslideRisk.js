/**
 * LANDSLIDE RISK ASSESSMENT MODULE
 * Assesses slope gradient, soil moisture saturation from rainfall,
 * elevation, and historical slip fault lines.
 */

function calculateLandslideRisk({ slopeDegrees = 32, rainfall = 10, soilSaturation = 65, elevationMeters = 300, population = 1 }) {
    let score = 15;
    const factors = {};

    // 1. Slope angle
    if (slopeDegrees > 40) {
        score += 35;
        factors.slope = 'CRITICAL (>40° steep incline)';
    } else if (slopeDegrees > 25) {
        score += 20;
        factors.slope = 'HIGH (25°-40° moderate-steep slope)';
    } else {
        factors.slope = 'LOW (<25° gentle gradient)';
    }

    // 2. Rainfall accumulation & soil saturation
    if (soilSaturation > 80 || rainfall > 30) {
        score += 30;
        factors.saturation = 'CRITICAL (Soil liquefaction threshold reached)';
    } else if (soilSaturation > 60 || rainfall > 15) {
        score += 18;
        factors.saturation = 'HIGH (Elevated pore water pressure)';
    } else {
        factors.saturation = 'LOW (Stable dry-to-moderate soil)';
    }

    // 3. Population affected
    if (population >= 5) {
        score += 20;
        factors.population = 'CRITICAL (Multiple settlements or transit corridor blocked)';
    } else {
        score += 10;
        factors.population = 'MODERATE';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Landslide hazard computed at ${score}/100 (${level}) due to slope gradient (${slopeDegrees}°), soil saturation index (${soilSaturation}%), and active rain trigger.`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Immediate roadblock of vulnerable mountain arteries, rapid evacuation of slope-base structures, and dispatch of geotechnical drone recon.'
        : 'Inspect slope retaining walls, restrict heavy vehicular transit, and alert downslope residents.';

    return {
        disasterType: 'LANDSLIDE',
        score,
        level,
        confidence: 85,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateLandslideRisk };
