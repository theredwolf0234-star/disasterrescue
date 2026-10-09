const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { logAction } = require('../services/auditService');

// GET /api/rescue-teams
async function getRescueTeams(req, res, next) {
    try {
        const teams = await db.query(
            `SELECT * FROM rescue_teams ORDER BY name ASC`
        );
        res.json({
            success: true,
            count: teams.length,
            data: teams
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/rescue-teams
async function createRescueTeam(req, res, next) {
    try {
        const { name, unitCode, teamLeader, contactPhone, currentLat, currentLng } = req.body;

        if (!name || !unitCode || !teamLeader) {
            return res.status(400).json({
                success: false,
                message: 'Name, unit code, and team leader are required fields.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const id = generateUUID('TEAM');
        await db.run(
            `INSERT INTO rescue_teams (id, name, unit_code, team_leader, contact_phone, status, assigned_incident_id, current_lat, current_lng, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'AVAILABLE', NULL, ?, ?, datetime('now'), datetime('now'))`,
            [
                id,
                name.trim(),
                unitCode.trim().toUpperCase(),
                teamLeader.trim(),
                contactPhone || null,
                currentLat ? parseFloat(currentLat) : null,
                currentLng ? parseFloat(currentLng) : null
            ]
        );

        const newTeam = await db.get(`SELECT * FROM rescue_teams WHERE id = ?`, [id]);

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'CREATE_RESCUE_TEAM',
            entityType: 'RESCUE_TEAM',
            entityId: id,
            details: { name, unitCode },
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'Rescue team created successfully.',
            data: newTeam
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/rescue-teams/:id
async function updateRescueTeam(req, res, next) {
    try {
        const { id } = req.params;
        const { status, assignedIncidentId, currentLat, currentLng, contactPhone } = req.body;

        const team = await db.get(`SELECT * FROM rescue_teams WHERE id = ?`, [id]);
        if (!team) {
            return res.status(404).json({ success: false, message: 'Rescue team not found.' });
        }

        await db.run(
            `UPDATE rescue_teams
             SET status = COALESCE(?, status),
                 assigned_incident_id = COALESCE(?, assigned_incident_id),
                 current_lat = COALESCE(?, current_lat),
                 current_lng = COALESCE(?, current_lng),
                 contact_phone = COALESCE(?, contact_phone),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                status || null,
                assignedIncidentId !== undefined ? assignedIncidentId : null,
                currentLat !== undefined ? parseFloat(currentLat) : null,
                currentLng !== undefined ? parseFloat(currentLng) : null,
                contactPhone || null,
                id
            ]
        );

        const updated = await db.get(`SELECT * FROM rescue_teams WHERE id = ?`, [id]);
        res.json({
            success: true,
            message: 'Rescue team updated successfully.',
            data: updated
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/rescue-teams/:id/location
async function updateTeamLocation(req, res, next) {
    try {
        const { id } = req.params;
        const { latitude, longitude, accuracy, batteryLevel } = req.body;

        if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required fields.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const numLat = parseFloat(latitude);
        const numLng = parseFloat(longitude);
        const numAcc = accuracy !== undefined && accuracy !== null ? parseFloat(accuracy) : null;

        if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinate range.',
                errorCode: 'INVALID_COORDINATES'
            });
        }

        const team = await db.get(`SELECT id, name FROM rescue_teams WHERE id = ?`, [id]);
        if (!team) {
            return res.status(404).json({ success: false, message: 'Rescue team not found.', errorCode: 'NOT_FOUND' });
        }

        const locId = generateUUID('LOC');
        const now = new Date().toISOString();

        // 1. Insert into team_locations audit log
        await db.run(
            `INSERT INTO team_locations (id, team_id, latitude, longitude, accuracy, battery_level, timestamp, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [locId, id, numLat, numLng, numAcc, batteryLevel ? parseFloat(batteryLevel) : null]
        );

        // 2. Update rescue_teams current coordinates
        await db.run(
            `UPDATE rescue_teams SET current_lat = ?, current_lng = ?, updated_at = datetime('now') WHERE id = ?`,
            [numLat, numLng, id]
        );

        // 3. Emit real-time WebSocket update to authorities room
        try {
            const { getIO } = require('../sockets/socketHandler');
            const io = getIO();
            if (io) {
                io.to('authorities').emit('team:location_updated', {
                    teamId: id,
                    teamName: team.name,
                    latitude: numLat,
                    longitude: numLng,
                    accuracy: numAcc,
                    timestamp: now
                });
            }
        } catch (e) {
            // Non-blocking socket emission
        }

        res.json({
            success: true,
            message: 'Responder telemetry updated successfully.',
            data: {
                teamId: id,
                latitude: numLat,
                longitude: numLng,
                accuracy: numAcc,
                timestamp: now
            }
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/rescue-teams/:id/location
async function getTeamLocation(req, res, next) {
    try {
        const { id } = req.params;
        const latest = await db.get(
            `SELECT * FROM team_locations WHERE team_id = ? ORDER BY created_at DESC LIMIT 1`,
            [id]
        );
        if (latest) {
            return res.json({
                success: true,
                data: latest
            });
        }

        const team = await db.get(`SELECT id, name, current_lat, current_lng, updated_at FROM rescue_teams WHERE id = ?`, [id]);
        if (!team) {
            return res.status(404).json({ success: false, message: 'Rescue team not found.', errorCode: 'NOT_FOUND' });
        }

        if (team.current_lat !== null && team.current_lng !== null) {
            return res.json({
                success: true,
                data: {
                    teamId: id,
                    latitude: team.current_lat,
                    longitude: team.current_lng,
                    accuracy: null,
                    timestamp: team.updated_at,
                    isStaticBaseline: true
                }
            });
        }

        return res.status(404).json({
            success: false,
            message: 'Responder location unavailable',
            errorCode: 'LOCATION_UNAVAILABLE'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getRescueTeams,
    createRescueTeam,
    updateRescueTeam,
    updateTeamLocation,
    getTeamLocation
};

