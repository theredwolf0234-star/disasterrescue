/**
 * Transparent Emergency Priority Determination Service
 * 
 * Rules:
 * CRITICAL: Immediate danger to life, trapped/collapse with >2 victims, severe traumatic injury, flash floods
 * HIGH: Trapped/isolated victim, acute injury, rising water/fire danger
 * MEDIUM: Structural damage, property threat, non-immediate danger
 * LOW: Advisory, resource inquiry, minor non-injury assistance
 */

function calculateEmergencyPriority({ category, count = 1, details = '' }) {
    const text = `${category} ${details}`.toLowerCase();
    const victimCount = parseInt(count, 10) || 1;

    // Critical triggers
    const isCriticalKeyword = 
        text.includes('collapse') || 
        text.includes('drowning') || 
        text.includes('severe head injury') || 
        text.includes('submerged') || 
        text.includes('unconscious') ||
        text.includes('cardiac') ||
        text.includes('flash flood');

    const isHighKeyword = 
        text.includes('trapped') || 
        text.includes('injury') || 
        text.includes('bleeding') || 
        text.includes('fracture') || 
        text.includes('fire') || 
        text.includes('elderly') || 
        text.includes('child') || 
        text.includes('water rising');

    if ((isCriticalKeyword && victimCount >= 2) || victimCount >= 5 || text.includes('mass casualty')) {
        return {
            level: 'CRITICAL',
            score: 95,
            reasoning: 'Immediate life-threatening conditions involving multiple victims or severe structural/flood failure.'
        };
    }

    if (isCriticalKeyword || (isHighKeyword && victimCount >= 2) || category === 'Medical Emergency') {
        return {
            level: 'CRITICAL',
            score: 85,
            reasoning: 'Critical medical trauma or hazardous flood situation requiring immediate first responder intervention.'
        };
    }

    if (isHighKeyword || category === 'Trapped / Collapse' || category === 'Evacuation Request') {
        return {
            level: 'HIGH',
            score: 70,
            reasoning: 'Urgent assistance needed; victims isolated or endangered by encroaching disaster.'
        };
    }

    if (text.includes('property') || text.includes('water logging') || text.includes('food') || text.includes('power cut')) {
        return {
            level: 'MEDIUM',
            score: 45,
            reasoning: 'Non-life-threatening environmental hazard or relief supply requirement.'
        };
    }

    return {
        level: 'LOW',
        score: 20,
        reasoning: 'General information request or low-severity situational report.'
    };
}

module.exports = {
    calculateEmergencyPriority
};
