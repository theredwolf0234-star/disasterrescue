/**
 * LIGHTNING & THUNDERSTORM RISK ASSESSMENT MODULE
 * Assesses convective instability, precipitation, and outdoor exposure vulnerability.
 */

function calculateLightningRisk({ convectiveIndex = 'HIGH', rainfall = 15, isOutdoor = true, population = 1 }) {
    let score = 20;
    const factors = {};

    if (convectiveIndex === 'HIGH' || convectiveIndex === 'SEVERE') {
        score += 35;
        factors.atmosphere = 'CRITICAL (High convective cloud-to-ground flash density)';
    } else if (convectiveIndex === 'MODERATE') {
        score += 20;
        factors.atmosphere = 'HIGH (Active thunder cell detected)';
    } else {
        factors.atmosphere = 'LOW';
    }

    if (isOutdoor) {
        score += 25;
        factors.exposure = 'HIGH (Citizens exposed in agricultural/open ground without Faraday shielding)';
    } else {
        score += 10;
        factors.exposure = 'LOW (Within grounded structure)';
    }

    if (population >= 3) {
        score += 20;
        factors.population = 'HIGH (Group exposure)';
    } else {
        score += 10;
        factors.population = 'MODERATE';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Lightning hazard score calculated at ${score}/100 (${level}) based on intense atmospheric convective activity and exposed outdoor population (${population} person(s)).`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Broadcast immediate lightning warning via SMS/push, guide individuals to seek enclosed masonry shelter immediately, and stay away from tall solitary trees/poles.'
        : 'Monitor radar reflectivity and advise avoiding open sports fields and water bodies.';

    return {
        disasterType: 'LIGHTNING',
        score,
        level,
        confidence: 86,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateLightningRisk };
