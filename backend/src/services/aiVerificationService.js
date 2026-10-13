/**
 * AI-ASSISTED DISASTER VERIFICATION & TRIAGE ENGINE
 * 
 * Provides automated advisory assessments for coordinators and NGOs:
 * 1. Potential duplicate report identification (spatial, temporal, and lexical matching)
 * 2. Cross-referencing against active Government Disaster Alert zones (NDMA SACHET / IMD)
 * 3. Disaster classification refinement & preliminary urgency estimation
 * 4. Missing information detection & inconsistency flagging
 * 5. Coordinator incident summarization
 * 6. Recommended assistance categories (e.g. food, water, medical triage, shelter)
 * 
 * STRICT COMPLIANCE REQUIREMENT:
 * "AI must not independently declare a disaster confirmed or automatically
 * dispatch rescue teams. Human review is required for consequential decisions."
 */

const db = require('../config/database');
const { matchLocationToAlertZones, calculateDistanceKm } = require('./governmentAlertService');

/**
 * Tokenizes text for basic similarity comparison
 */
function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
}

/**
 * Computes Jaccard word similarity between two text snippets
 */
function computeTextSimilarity(text1, text2) {
    const tokens1 = new Set(tokenize(text1));
    const tokens2 = new Set(tokenize(text2));
    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let intersection = 0;
    for (const t of tokens1) {
        if (tokens2.has(t)) intersection++;
    }
    const union = new Set([...tokens1, ...tokens2]).size;
    return union > 0 ? intersection / union : 0;
}

/**
 * Evaluates duplicate probability against recent incidents (past 48 hours within 2.5 km)
 */
async function detectDuplicateReports({ category, details, latitude, longitude, excludeIncidentId = null }) {
    if (latitude === undefined || longitude === undefined) return { isPotentialDuplicate: false, duplicates: [] };

    try {
        const queryParams = [latitude, longitude];
        let sql = `
            SELECT id, category, details, latitude, longitude, emergency_level, status, created_at
            FROM incidents
            WHERE created_at >= datetime('now', '-48 hours')
              AND ABS(latitude - ?) < 0.03
              AND ABS(longitude - ?) < 0.03
        `;

        if (excludeIncidentId) {
            sql += ` AND id != ?`;
            queryParams.push(excludeIncidentId);
        }

        const candidates = await db.query(sql, queryParams);
        const matchedDuplicates = [];

        for (const candidate of candidates) {
            const distKm = calculateDistanceKm(latitude, longitude, candidate.latitude, candidate.longitude);
            if (distKm <= 2.5) {
                const textSim = computeTextSimilarity(details, candidate.details);
                const categoryMatch = (category || '').toLowerCase() === (candidate.category || '').toLowerCase();

                // Composite score based on distance, category, and text similarity
                let similarityScore = 0;
                if (distKm < 0.1) similarityScore += 45;
                else if (distKm < 0.5) similarityScore += 35;
                else if (distKm < 1.0) similarityScore += 25;
                else similarityScore += 15;

                if (categoryMatch) similarityScore += 35;
                similarityScore += Math.round(textSim * 20);

                if (similarityScore >= 55) {
                    matchedDuplicates.push({
                        incidentId: candidate.id,
                        category: candidate.category,
                        distanceKm: Math.round(distKm * 100) / 100,
                        similarityScore: Math.min(similarityScore, 98),
                        status: candidate.status,
                        createdAt: candidate.created_at
                    });
                }
            }
        }

        matchedDuplicates.sort((a, b) => b.similarityScore - a.similarityScore);

        return {
            isPotentialDuplicate: matchedDuplicates.length > 0,
            primaryDuplicateId: matchedDuplicates.length > 0 ? matchedDuplicates[0].incidentId : null,
            primaryDuplicateConfidence: matchedDuplicates.length > 0 ? matchedDuplicates[0].similarityScore : 0,
            matchedDuplicates
        };
    } catch (err) {
        console.error('[AIVerification] Error in duplicate detection:', err.message);
        return { isPotentialDuplicate: false, duplicates: [] };
    }
}

/**
 * Checks for missing required details or suspicious submission patterns
 */
function detectMissingInfoAndAnomalies({ category, details, count, address, latitude, longitude, isVerifiedGps, gpsAccuracy }) {
    const flags = [];
    const sanitizedDetails = (details || '').trim();

    if (sanitizedDetails.length < 15) {
        flags.push({
            type: 'INSUFFICIENT_DETAILS',
            severity: 'MEDIUM',
            message: 'Incident description is under 15 characters; situational context is limited.'
        });
    }

    if (!address || address.trim().length < 5) {
        flags.push({
            type: 'MISSING_LANDMARK',
            severity: 'LOW',
            message: 'No physical landmark or address specified. Responders must rely solely on GPS coordinates.'
        });
    }

    if (count > 50) {
        flags.push({
            type: 'HIGH_HEADCOUNT_ANOMALY',
            severity: 'HIGH',
            message: `Reported headcount (${count} persons) is unusually large. Requires urgent multi-source verification.`
        });
    }

    if (gpsAccuracy && parseFloat(gpsAccuracy) > 100) {
        flags.push({
            type: 'LOW_GPS_ACCURACY',
            severity: 'MEDIUM',
            message: `GPS telemetry accuracy radius is ±${Math.round(gpsAccuracy)}m. Physical position may have significant drift.`
        });
    }

    return flags;
}

/**
 * Generates recommended assistance categories based on incident context and headcount
 */
function recommendAssistanceCategories({ category, details, count }) {
    const ctx = `${category} ${details}`.toLowerCase();
    const recommendations = [];
    const victimCount = Math.max(1, parseInt(count, 10) || 1);

    // 1. Food & Drinking Water
    if (ctx.includes('flood') || ctx.includes('trap') || ctx.includes('starv') || ctx.includes('water') || ctx.includes('ration') || victimCount >= 5) {
        recommendations.push({
            category: 'FOOD_AND_WATER',
            title: 'Potable Water & Emergency Dry Rations',
            estimatedQuantity: `${victimCount * 3} Meal Packs, ${victimCount * 10}L Potable Water`,
            priority: 'HIGH',
            suitableFor: 'Community Kitchen & Relief NGOs'
        });
    }

    // 2. Medical & First-Aid Triage
    if (ctx.includes('injur') || ctx.includes('bleed') || ctx.includes('burn') || ctx.includes('unconscious') || ctx.includes('medical') || ctx.includes('wound') || ctx.includes('fracture')) {
        recommendations.push({
            category: 'MEDICAL_TRIAGE',
            title: 'Trauma First-Aid Satchels & Paramedic Crew',
            estimatedQuantity: `${Math.ceil(victimCount / 2)} Trauma Kits, Mobile Ambulance Staging`,
            priority: 'CRITICAL',
            suitableFor: 'Red Cross / Emergency Medical NGOs'
        });
    }

    // 3. Temporary Shelter & Blankets
    if (ctx.includes('submerged') || ctx.includes('collapse') || ctx.includes('roof') || ctx.includes('displaced') || ctx.includes('homeless') || ctx.includes('fire')) {
        recommendations.push({
            category: 'TEMPORARY_SHELTER',
            title: 'Emergency Tarpaulins, Cots & Blankets',
            estimatedQuantity: `${victimCount} Sleeping Cots / Tarps`,
            priority: 'HIGH',
            suitableFor: 'Shelter Management NGOs'
        });
    }

    // 4. Evacuation Boats / Technical Rescue
    if (ctx.includes('boat') || ctx.includes('deep water') || ctx.includes('current') || ctx.includes('submerged') || ctx.includes('stranded')) {
        recommendations.push({
            category: 'WATER_RESCUE',
            title: 'Inflatable Zodiac Boats & Life Jackets',
            estimatedQuantity: `${Math.ceil(victimCount / 4)} Inflatable Rafts`,
            priority: 'CRITICAL',
            suitableFor: 'Trained Water Rescue Volunteers / SDRF'
        });
    }

    // Fallback default
    if (recommendations.length === 0) {
        recommendations.push({
            category: 'GENERAL_ASSISTANCE',
            title: 'Field Situation Assessment & Welfare Check',
            estimatedQuantity: '2 Verification Volunteers',
            priority: 'MEDIUM',
            suitableFor: 'Local Community Volunteers'
        });
    }

    return recommendations;
}

/**
 * Summarizes the incident concisely for fast decision-making by NGO coordinators
 */
function generateCoordinatorSummary({ category, details, count, address, alertMatches = [] }) {
    const alertContext = alertMatches.length > 0 
        ? `[ALERT ZONE: ${alertMatches[0].hazardType} (${alertMatches[0].sourceAgency})] `
        : '';
    const loc = address ? `Near ${address}` : 'At reported coordinates';
    const cleanDetails = (details || '').replace(/\s+/g, ' ').substring(0, 160);

    return `${alertContext}${category.toUpperCase()} reported ${loc}. Affected headcount: ~${count} persons. Situation briefing: "${cleanDetails}${details && details.length > 160 ? '...' : ''}". Human coordinator review required before dispatch confirmation.`;
}

/**
 * Master AI verification function called during incident creation and inspection
 */
async function performAiAssistedVerification({
    incidentId = null,
    category,
    details,
    count = 1,
    address = '',
    latitude,
    longitude,
    isVerifiedGps = 1,
    gpsAccuracy = null
}) {
    const [duplicates, alertZones] = await Promise.all([
        detectDuplicateReports({ category, details, latitude, longitude, excludeIncidentId: incidentId }),
        matchLocationToAlertZones(latitude, longitude)
    ]);

    const flags = detectMissingInfoAndAnomalies({
        category, details, count, address, latitude, longitude, isVerifiedGps, gpsAccuracy
    });

    const recommendedAssistance = recommendAssistanceCategories({ category, details, count });
    const summary = generateCoordinatorSummary({
        category, details, count, address, alertMatches: alertZones
    });

    // Determine suggested preliminary urgency (advisory only)
    let suggestedUrgency = 'HIGH';
    if (alertZones.some(a => a.severity === 'EXTREME') || count >= 10 || details.toLowerCase().includes('critical') || details.toLowerCase().includes('trapped')) {
        suggestedUrgency = 'CRITICAL';
    } else if (count === 1 && !details.toLowerCase().includes('immediate') && alertZones.length === 0) {
        suggestedUrgency = 'MEDIUM';
    }

    return {
        aiReviewStatus: 'AI_ASSISTED_REVIEW_REQUIRED',
        humanReviewNotice: 'ADVISORY NOTICE: AI findings do not constitute official disaster confirmation or automated squad deployment. Human authorization is required for consequential relief decisions.',
        suggestedUrgency,
        duplicateAnalysis: duplicates,
        governmentAlertZoneMatch: {
            isInAlertZone: alertZones.length > 0,
            activeAlertCount: alertZones.length,
            matchingAlerts: alertZones
        },
        missingInfoAndFlags: flags,
        recommendedAssistance,
        coordinatorSummary: summary,
        generatedAt: new Date().toISOString()
    };
}

module.exports = {
    performAiAssistedVerification,
    detectDuplicateReports,
    recommendAssistanceCategories,
    computeTextSimilarity
};
