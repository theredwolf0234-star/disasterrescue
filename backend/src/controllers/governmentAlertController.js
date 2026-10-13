/**
 * GOVERNMENT DISASTER ALERT CONTROLLER
 * 
 * Provides authorized public warning data from NDMA SACHET portal & meteorological divisions.
 */

const { getActiveGovernmentAlerts, matchLocationToAlertZones, syncGovernmentAlerts } = require('../services/governmentAlertService');
const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { logAction } = require('../services/auditService');

async function getAlerts(req, res, next) {
    try {
        const result = await getActiveGovernmentAlerts();
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
}

async function matchAlerts(req, res, next) {
    try {
        const { lat, lng } = req.query;
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, message: 'Latitude (lat) and Longitude (lng) are required.' });
        }

        const matches = await matchLocationToAlertZones(parseFloat(lat), parseFloat(lng));
        res.json({
            success: true,
            data: {
                location: { lat: parseFloat(lat), lng: parseFloat(lng) },
                inAlertZone: matches.length > 0,
                matchingAlerts: matches
            }
        });
    } catch (err) {
        next(err);
    }
}

async function triggerSync(req, res, next) {
    try {
        const syncResult = await syncGovernmentAlerts();
        await logAction({
            userId: req.user ? req.user.id : 'SYSTEM',
            userRole: req.user ? req.user.role : 'SYSTEM',
            action: 'GOVERNMENT_ALERTS_SYNCED',
            entityType: 'ALERTS',
            details: 'Manual synchronization of NDMA SACHET and public alerts feed triggered.',
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Government alerts synchronized successfully.',
            data: syncResult
        });
    } catch (err) {
        next(err);
    }
}

async function createAlert(req, res, next) {
    try {
        const {
            alertIdentifier,
            sourceAgency,
            hazardType,
            severity,
            affectedArea,
            centroidLat,
            centroidLng,
            radiusKm,
            officialInstructions,
            expiresAt
        } = req.body;

        if (!alertIdentifier || !hazardType || !severity || !affectedArea || centroidLat === undefined || centroidLng === undefined || !officialInstructions) {
            return res.status(400).json({
                success: false,
                message: 'All core alert fields are required (Identifier, Hazard, Severity, Area, Lat, Lng, Instructions).'
            });
        }

        const id = generateUUID('GOV_ALT');
        const now = new Date().toISOString();
        const expiry = expiresAt || new Date(Date.now() + 48 * 3600 * 1000).toISOString();

        await db.run(
            `INSERT INTO government_alerts (
                id, alert_identifier, source_agency, hazard_type, severity,
                affected_area, centroid_lat, centroid_lng, radius_km,
                official_instructions, effective_from, expires_at, is_active, last_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
            [
                id,
                alertIdentifier.trim(),
                sourceAgency ? sourceAgency.trim() : 'NDMA SACHET / State EOC',
                hazardType.trim(),
                severity.toUpperCase().trim(),
                affectedArea.trim(),
                parseFloat(centroidLat),
                parseFloat(centroidLng),
                radiusKm ? parseFloat(radiusKm) : 25.0,
                officialInstructions.trim(),
                now,
                expiry
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Government alert registered and active on public safety grid.',
            data: { id, alertIdentifier, hazardType, severity, affectedArea }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAlerts,
    matchAlerts,
    triggerSync,
    createAlert
};
