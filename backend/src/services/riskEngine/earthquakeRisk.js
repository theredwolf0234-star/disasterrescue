/**
 * EARTHQUAKE RISK ASSESSMENT MODULE
 * Assesses Richter magnitude, epicentral distance, seismic hazard zones (Zone III/IV/V),
 * and unreinforced masonry vulnerability.
 */

function calculateEarthquakeRisk({ magnitude = 5.2, epicentralDistanceKm = 40, seismicZone = 'IV', buildingVulnerability = 'HIGH', population = 1 }) {
    let score = 20;
    const factors = {};

    // 1. Magnitude
    if (magnitude >= 7.0) {
        score += 45;
        factors.magnitude = `CRITICAL (M${magnitude} Major Seismic Rupture)`;
    } else if (magnitude >= 6.0) {
        score += 35;
        factors.magnitude = `HIGH (M${magnitude} Strong Quake)`;
    } else if (magnitude >= 4.5) {
        score += 20;
        factors.magnitude = `MODERATE (M${magnitude} Moderate Tremor)`;
    } else {
        score += 8;
        factors.magnitude = `LOW (M${magnitude} Minor)`;
    }

    // 2. Epicentral Proximity
    if (epicentralDistanceKm < 20) {
        score += 25;
        factors.proximity = 'CRITICAL (<20km from epicenter)';
    } else if (epicentralDistanceKm < 60) {
        score += 15;
        factors.proximity = 'HIGH (20-60km radius)';
    } else {
        score += 5;
        factors.proximity = 'MODERATE (>60km distance)';
    }

    // 3. Seismic Zone & Building vulnerability
    if (buildingVulnerability === 'HIGH' || seismicZone === 'V') {
        score += 20;
        factors.vulnerability = 'HIGH (Unreinforced masonry / Seismic Zone V)';
    } else {
        score += 10;
        factors.vulnerability = 'MODERATE';
    }

    score = Math.min(100, Math.max(10, Math.round(score)));

    let level = 'LOW';
    if (score >= 76) level = 'CRITICAL';
    else if (score >= 51) level = 'HIGH';
    else if (score >= 26) level = 'MODERATE';

    const reason = `Earthquake impact index estimated at ${score}/100 (${level}) driven by M${magnitude} shock at ${epicentralDistanceKm}km distance within Seismic Zone ${seismicZone}.`;
    const recommendedAction = level === 'CRITICAL'
        ? 'Dispatch Heavy Urban Search & Rescue (USAR) extrication squads, activate secondary gas valve shutoffs, and establish outdoor open field triage centers.'
        : 'Inspect vital bridges, hospital buildings, and electrical sub-stations for hairline structural failure.';

    return {
        disasterType: 'EARTHQUAKE',
        score,
        level,
        confidence: 90,
        reason,
        factors,
        recommendedAction
    };
}

module.exports = { calculateEarthquakeRisk };
