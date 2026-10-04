/**
 * Transparent Emergency Priority Determination Service
 * Powered by Modular Multi-Disaster AI Risk Engine
 * 
 * Score Tiers:
 * 0–25   = LOW
 * 26–50  = MODERATE / MEDIUM
 * 51–75  = HIGH
 * 76–100 = CRITICAL
 */

const { evaluateDisasterRisk } = require('./riskEngine');

function calculateEmergencyPriority({ category, count = 1, details = '', weather = {}, location = {} }) {
    const riskAssessment = evaluateDisasterRisk({
        category,
        count,
        details,
        weather,
        location
    });

    return {
        level: riskAssessment.level === 'MODERATE' ? 'MEDIUM' : riskAssessment.level,
        score: riskAssessment.score,
        reasoning: riskAssessment.reason,
        factors: riskAssessment.factors,
        confidence: riskAssessment.confidence,
        recommendedAction: riskAssessment.recommendedAction,
        disasterType: riskAssessment.disasterType,
        riskLevel: riskAssessment.level
    };
}

module.exports = {
    calculateEmergencyPriority,
    evaluateDisasterRisk
};
