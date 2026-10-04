/**
 * STRUCTURAL COLLAPSE & TRAUMA RISK ASSESSMENT MODULE
 * Assesses building integrity, debris collapse pattern, victim entrapment count,
 * and hazardous void stability.
 */

function calculateStructuralRisk({ damageLevel = 'SEVERE', trappedCount = 1, secondaryCollapseRisk = true, population = 1 }) {
    let score = 30;
    const factors = {};

    if (damageLevel === 'TOTAL_COLLAPSE' || damageLevel === 'PANCAKE_COLLAPSE') {
        score += 40;
        factors.collapsePattern = 'CRITICAL (Pancake / multi-floor structural failure)';
    } else if (damageLevel === 'SEVERE' || damageLevel === 'PARTIAL_COLLAPSE') {
        score += 28;
        factors.collapsePattern = 'HIGH (Partial collapse with compromised load-bearing pillars)';
    } else {
        score += 12;
        factors.collapsePattern = 'MODERATE (Non-structural masonry fracturing)';
    }

    if (trappedCount >= 3) {
        score += 30;
        factors.entrapment = `CRITICAL (${trappedCount} victims verified trapped under heavy concrete)`;
    } else if (trappedCount >= 1) {
        score += 20;
        factors.entrapment = `HIGH (${trappedCount} victim(s) trapped)`;
    } else {
        factors.entrapment = 'LOW (All occupants accounted for outside)';
    }

    if (secondaryCollapseRisk) {
        score += 15;
        factors.aftershockRisk = 'HIGH (Unstable overhangs pose danger to first responders)';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Structural failure severity computed at ${score}/100 (${level}) due to ${damageLevel.toLowerCase()} collapse pattern and ${trappedCount} entrapped victim(s) requiring technical extrication.`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Deploy USAR acoustic search listening devices, hydraulic spreaders/cutters, shoring equipment, and dispatch Mobile Surgical ICU.'
        : 'Cordon perimeter 1.5x building height, stabilize load-bearing corners, and isolate utility gas/power lines.';

    return {
        disasterType: 'STRUCTURAL_COLLAPSE',
        score,
        level,
        confidence: 93,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateStructuralRisk };
