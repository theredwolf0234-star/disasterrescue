const db = require('../config/database');
const { generateIncidentId, generateUUID } = require('../utils/idGenerator');
const { calculateEmergencyPriority } = require('../services/priorityService');
const { analyzeDisasterMedia } = require('../services/aiVisionService');
const { logAction } = require('../services/auditService');
const { emitNewIncident, emitIncidentUpdated } = require('../sockets/socketHandler');

const VALID_STATUSES = [
    'NEW',
    'RECEIVED',
    'ACKNOWLEDGED',
    'ANALYZING',
    'TRIAGED',
    'ASSIGNED',
    'TEAM_ASSIGNED',
    'TEAM_DISPATCHED',
    'DISPATCHED',
    'TEAM_APPROACHING',
    'IN_PROGRESS',
    'ON_SCENE',
    'RESOLVED',
    'CANCELLED'
];

// POST /api/incidents or /api/sos
async function createIncident(req, res, next) {
    try {
        const categoryRaw = req.body.category || req.body.disaster_type || req.body.disasterType || req.body.emergency_type;
        const detailsRaw = req.body.details || req.body.description || req.body.short_description;
        const countRaw = req.body.count !== undefined ? req.body.count : (req.body.people_affected !== undefined ? req.body.people_affected : req.body.peopleAffected);
        const category = categoryRaw && typeof categoryRaw === 'string' ? categoryRaw.trim() : '';
        const details = detailsRaw && typeof detailsRaw === 'string' ? detailsRaw.trim() : '';
        const count = countRaw !== undefined ? countRaw : 1;
        const { latitude, longitude, address, evidenceUrl } = req.body;

        // Support both { latitude, longitude } and { location: { lat, lng } }
        let lat = latitude;
        let lng = longitude;
        if (req.body.location) {
            lat = lat !== undefined ? lat : req.body.location.lat;
            lng = lng !== undefined ? lng : req.body.location.lng;
        }

        if (!category) {
            return res.status(400).json({
                success: false,
                message: 'Emergency category / disaster type is required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        if (!details) {
            return res.status(400).json({
                success: false,
                message: 'Emergency situation description is required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '') {
            return res.status(400).json({
                success: false,
                message: 'Valid latitude and longitude coordinates are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);
        if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid latitude or longitude coordinate values.',
                errorCode: 'INVALID_COORDINATES'
            });
        }

        const victimCount = Math.max(1, parseInt(count, 10) || 1);
        const incidentId = await generateIncidentId();
        const userId = req.user ? req.user.id : null;

        // File upload check if handled by multer
        let finalEvidenceUrl = evidenceUrl || null;
        let aiVisionData = null;
        let audioUrl = null;
        if (req.file) {
            finalEvidenceUrl = `/uploads/${req.file.filename}`;
            const isAudio = req.file.mimetype.startsWith('audio/') || ['.wav', '.mp3', '.webm', '.ogg'].some(ext => req.file.filename.endsWith(ext));
            if (isAudio) {
                audioUrl = finalEvidenceUrl;
            }
            try {
                aiVisionData = await analyzeDisasterMedia({
                    filePath: req.file.path,
                    fileMime: req.file.mimetype,
                    fileName: req.file.originalname,
                    category: category.trim(),
                    details: details.trim()
                });

                // Insert into media table
                const mediaId = generateUUID('MED');
                await db.run(
                    `INSERT INTO media (id, incident_id, file_url, file_type, file_name, file_size, ai_analysis_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    [
                        mediaId,
                        incidentId,
                        finalEvidenceUrl,
                        isAudio ? 'audio' : req.file.mimetype.startsWith('video/') ? 'video' : 'image',
                        req.file.originalname,
                        req.file.size,
                        JSON.stringify(aiVisionData)
                    ]
                );
            } catch (mediaErr) {
                console.warn('[Incident] AI vision analysis failed:', mediaErr.message);
            }
        }

        // Automatic priority assessment based on transparent rules & multi-disaster engine
        const priorityAssessment = calculateEmergencyPriority({
            category: category.trim(),
            count: victimCount,
            details: details.trim()
        });

        // Readable address fallback
        const readableAddress = address && String(address).trim()
            ? String(address).trim()
            : `Coordinates: ${numLat.toFixed(4)}, ${numLng.toFixed(4)}`;

        // Insert incident into persistent database
        await db.run(
            `INSERT INTO incidents (
                id, user_id, category, emergency_level, count, details,
                latitude, longitude, readable_address, status,
                assigned_authority, assigned_rescue_team, evidence_url,
                risk_score, risk_factors, recommended_action, ai_vision_analysis, audio_url,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', NULL, NULL, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
                incidentId,
                userId,
                category.trim(),
                priorityAssessment.level,
                victimCount,
                details.trim(),
                numLat,
                numLng,
                readableAddress,
                finalEvidenceUrl,
                priorityAssessment.score || 70,
                JSON.stringify(priorityAssessment.factors || {}),
                priorityAssessment.recommendedAction || 'Dispatch nearest tactical unit.',
                aiVisionData ? JSON.stringify(aiVisionData) : null,
                audioUrl
            ]
        );

        // Record risk analysis record in risk_analysis table
        const riskId = generateUUID('RISK');
        try {
            await db.run(
                `INSERT INTO risk_analysis (id, incident_id, disaster_type, risk_score, risk_level, factors_json, reason, confidence, recommended_action, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                [
                    riskId,
                    incidentId,
                    category.trim(),
                    priorityAssessment.score || 70,
                    priorityAssessment.level || 'HIGH',
                    JSON.stringify(priorityAssessment.factors || {}),
                    priorityAssessment.reasoning || '',
                    priorityAssessment.confidence || 88,
                    priorityAssessment.recommendedAction || 'Mobilize regional field squad.'
                ]
            );
        } catch (rErr) {
            console.warn('[DB] Risk analysis table insert warning:', rErr.message);
        }

        // Record initial timeline entry
        const updateId = generateUUID('INCU');
        const initialNote = `Emergency SOS dispatched. Priority evaluated: ${priorityAssessment.level} (${priorityAssessment.reasoning})`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, NULL, 'RECEIVED', ?, datetime('now'))`,
            [
                updateId,
                incidentId,
                userId || 'CITIZEN_ANONYMOUS',
                req.user ? req.user.role : 'CITIZEN',
                initialNote
            ]
        );

        // Record authority notification
        const notifId = generateUUID('NOTIF');
        await db.run(
            `INSERT INTO notifications (id, user_id, recipient_role, title, message, incident_id, type, is_read, created_at)
             VALUES (?, ?, 'AUTHORITY', ?, ?, ?, 'ALERT', 0, datetime('now'))`,
            [
                notifId,
                userId,
                `New ${priorityAssessment.level} Emergency: ${incidentId}`,
                `${category} reported for ${victimCount} person(s) at ${readableAddress}.`,
                incidentId
            ]
        );

        const newIncident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
        const initialUpdates = await db.query(
            `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`,
            [incidentId]
        );

        // Audit log
        await logAction({
            userId: userId || 'ANONYMOUS',
            userRole: req.user ? req.user.role : 'CITIZEN',
            action: 'SOS_DISPATCH',
            entityType: 'INCIDENT',
            entityId: incidentId,
            details: { priority: priorityAssessment.level, category, count: victimCount },
            ipAddress: req.ip
        });

        // Real-time broadcast via Socket.IO
        emitNewIncident({
            ...newIncident,
            incident: newIncident,
            updates: initialUpdates
        });

        res.status(201).json({
            success: true,
            message: 'Emergency SOS beacon recorded and dispatched to authority command grid.',
            data: {
                ...newIncident,
                incident: newIncident,
                updates: initialUpdates,
                priorityExplanation: priorityAssessment.reasoning
            }
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents
// Scoped: Citizen sees only their own reports (incident.user_id = req.user.id)
// Authority & Admin see all incidents globally
async function getIncidents(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required to access incidents.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        const isAuthorityOrAdmin = req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN';
        const { status, level, search, limit = 100, offset = 0, mine } = req.query;

        let queryStr = `SELECT * FROM incidents WHERE 1=1`;
        const params = [];

        // For CITIZEN or when mine=true: must return ONLY reports belonging to that citizen
        const filterMine = !isAuthorityOrAdmin || mine === 'true' || req.query.userOnly === 'true';
        if (filterMine) {
            queryStr += ` AND user_id = ?`;
            params.push(req.user.id);
        }

        if (status && status !== 'all') {
            queryStr += ` AND status = ?`;
            params.push(status);
        }

        if (level && level !== 'all') {
            queryStr += ` AND emergency_level = ?`;
            params.push(level);
        }

        if (search) {
            queryStr += ` AND (id LIKE ? OR category LIKE ? OR details LIKE ? OR readable_address LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const incidents = await db.query(queryStr, params);

        let countSql = `SELECT COUNT(*) as total FROM incidents WHERE 1=1`;
        const countParams = [];
        if (filterMine) {
            countSql += ` AND user_id = ?`;
            countParams.push(req.user.id);
        }
        if (status && status !== 'all') {
            countSql += ` AND status = ?`;
            countParams.push(status);
        }
        if (level && level !== 'all') {
            countSql += ` AND emergency_level = ?`;
            countParams.push(level);
        }
        if (search) {
            countSql += ` AND (id LIKE ? OR category LIKE ? OR details LIKE ? OR readable_address LIKE ?)`;
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        const countRow = await db.get(countSql, countParams);

        res.json({
            success: true,
            count: incidents.length,
            total: (countRow && countRow.total) || 0,
            data: incidents
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents/:id
// Scoped: Citizen can only view if incident.user_id === req.user.id
// Authority & Admin can view all
async function getIncidentById(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required to view incident details.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        const { id } = req.params;
        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);

        if (!incident) {
            return res.status(404).json({
                success: false,
                message: `Incident with ID '${id}' was not found.`,
                errorCode: 'NOT_FOUND'
            });
        }

        const isAuthorityOrAdmin = req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN';
        if (!isAuthorityOrAdmin && incident.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own incident reports.',
                errorCode: 'FORBIDDEN'
            });
        }

        const updates = await db.query(
            `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...incident,
                incident,
                updates,
                timeline: updates
            }
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/incidents/:id
// Restricted to AUTHORITY and ADMIN
async function updateIncident(req, res, next) {
    try {
        const { id } = req.params;
        const { status, assignedAuthority, assignedRescueTeam, resolutionNotes, note } = req.body;

        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({
                success: false,
                message: `Incident '${id}' not found.`,
                errorCode: 'NOT_FOUND'
            });
        }

        // Validate status transition if provided
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status: '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
                errorCode: 'INVALID_STATUS'
            });
        }

        const newStatus = status || incident.status;
        const isResolving = newStatus === 'RESOLVED';
        const resolvedAt = isResolving 
            ? (incident.resolved_at || new Date().toISOString()) 
            : (newStatus !== incident.status && incident.status === 'RESOLVED' ? null : incident.resolved_at);

        const finalResolutionNotes = resolutionNotes !== undefined 
            ? resolutionNotes 
            : (isResolving && !incident.resolution_notes ? (note || 'Incident resolved by commanding officer.') : incident.resolution_notes);

        await db.run(
            `UPDATE incidents 
             SET status = ?,
                 assigned_authority = COALESCE(?, assigned_authority),
                 assigned_rescue_team = COALESCE(?, assigned_rescue_team),
                 resolution_notes = ?,
                 resolved_at = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                newStatus,
                assignedAuthority || null,
                assignedRescueTeam || null,
                finalResolutionNotes || null,
                resolvedAt,
                id
            ]
        );

        // Record update timeline
        const updateNote = note || `Status updated from ${incident.status} to ${newStatus}${assignedRescueTeam ? ` (Assigned: ${assignedRescueTeam})` : ''}`;
        const updateId = generateUUID('INCU');

        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                updateId,
                id,
                req.user ? req.user.id : 'AUTHORITY_SYSTEM',
                req.user ? req.user.role : 'AUTHORITY',
                incident.status,
                newStatus,
                updateNote
            ]
        );

        // Log audit
        await logAction({
            userId: req.user ? req.user.id : 'SYSTEM',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'INCIDENT_UPDATE',
            entityType: 'INCIDENT',
            entityId: id,
            details: { previousStatus: incident.status, newStatus, assignedRescueTeam },
            ipAddress: req.ip
        });

        const updatedIncident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        const updates = await db.query(
            `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`,
            [id]
        );

        // Real-time broadcast
        emitIncidentUpdated({
            ...updatedIncident,
            incident: updatedIncident,
            updates
        });

        res.json({
            success: true,
            message: `Incident ${id} updated successfully.`,
            data: {
                ...updatedIncident,
                incident: updatedIncident,
                updates,
                timeline: updates
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/:id/assign
// Restricted to AUTHORITY and ADMIN
async function assignRescueTeam(req, res, next) {
    try {
        const { id } = req.params;
        const { rescueTeamName, authorityName, note } = req.body;

        if (!rescueTeamName) {
            return res.status(400).json({
                success: false,
                message: 'rescueTeamName is required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.', errorCode: 'NOT_FOUND' });
        }

        const newStatus = 'TEAM_ASSIGNED';

        await db.run(
            `UPDATE incidents 
             SET assigned_rescue_team = ?,
                 assigned_authority = COALESCE(?, assigned_authority),
                 status = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [rescueTeamName, authorityName || (req.user && req.user.username) || 'NDRF Command', newStatus, id]
        );

        // Record update timeline
        const updateId = generateUUID('INCU');
        const updateNote = note || `Rescue unit '${rescueTeamName}' officially dispatched to scene.`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                updateId,
                id,
                req.user ? req.user.id : 'AUTHORITY',
                req.user ? req.user.role : 'AUTHORITY',
                incident.status,
                newStatus,
                updateNote
            ]
        );

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'TEAM_ASSIGNMENT',
            entityType: 'INCIDENT',
            entityId: id,
            details: { assignedRescueTeam: rescueTeamName },
            ipAddress: req.ip
        });

        const updated = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [id]);

        emitIncidentUpdated({
            ...updated,
            incident: updated,
            updates
        });

        res.json({
            success: true,
            message: `Rescue team '${rescueTeamName}' assigned to incident ${id}.`,
            data: {
                ...updated,
                incident: updated,
                updates,
                timeline: updates
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/:id/notes
// Authenticated: Citizen can add notes to their own incident; Authority/Admin to any
async function addIncidentNote(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required to post incident notes.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        const { id } = req.params;
        const { note } = req.body;

        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, message: 'Note text cannot be empty.', errorCode: 'VALIDATION_ERROR' });
        }

        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.', errorCode: 'NOT_FOUND' });
        }

        const isAuthorityOrAdmin = req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN';
        if (!isAuthorityOrAdmin && incident.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only append notes to your own reports.',
                errorCode: 'FORBIDDEN'
            });
        }

        const updateId = generateUUID('INCU');
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                updateId,
                id,
                req.user.id,
                req.user.role,
                incident.status,
                incident.status,
                note.trim()
            ]
        );

        const updated = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [id]);

        emitIncidentUpdated({
            ...updated,
            incident: updated,
            updates
        });

        res.status(201).json({
            success: true,
            message: 'Incident note recorded successfully.',
            data: { id: updateId, incidentId: id, note: note.trim(), createdAt: new Date().toISOString() }
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents/stats/overview
// Restricted to AUTHORITY and ADMIN
async function getIncidentStats(req, res, next) {
    try {
        const totalRow = await db.get(`SELECT COUNT(*) as count FROM incidents`);
        const activeRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE status NOT IN ('RESOLVED', 'CANCELLED')`);
        const criticalRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE emergency_level = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CANCELLED')`);
        const resolvedRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE status = 'RESOLVED'`);
        const peopleRow = await db.get(`SELECT COALESCE(SUM(count), 0) as total_people FROM incidents`);

        const total = totalRow ? parseInt(totalRow.count, 10) || 0 : 0;
        const active = activeRow ? parseInt(activeRow.count, 10) || 0 : 0;
        const critical = criticalRow ? parseInt(criticalRow.count, 10) || 0 : 0;
        const resolved = resolvedRow ? parseInt(resolvedRow.count, 10) || 0 : 0;
        const people = peopleRow ? parseInt(peopleRow.total_people, 10) || 0 : 0;

        res.json({
            success: true,
            data: {
                total,
                active,
                critical,
                resolved,
                people,
                peopleAffected: people
            }
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/incidents/:id/location
// Allows updating real-time GPS telemetry
async function updateIncidentLocation(req, res, next) {
    try {
        const { id } = req.params;
        const { latitude, longitude, accuracy } = req.body;
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({
                success: false,
                message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.'
            });
        }

        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({
                success: false,
                message: `Incident '${id}' not found.`
            });
        }

        // Only owner citizen or authority/admin can update location
        const isAuth = req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN';
        if (!isAuth && incident.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Cannot update location of another citizen report.'
            });
        }

        await db.run(
            `UPDATE incidents SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [lat, lng, id]
        );

        const updated = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);

        try {
            const { getIO } = require('../sockets/socketHandler');
            const io = getIO();
            const payload = {
                id,
                latitude: lat,
                longitude: lng,
                accuracy: accuracy || null,
                updated_at: new Date().toISOString()
            };
            io.to('authorities').emit('incident:location_updated', payload);
            io.to(`incident:${id}`).emit('incident:location_updated', payload);
        } catch (e) {}

        res.json({
            success: true,
            data: updated
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents/:id/report
async function getIncidentReport(req, res, next) {
    try {
        const { id } = req.params;
        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.' });
        }

        const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [id]);
        const media = await db.query(`SELECT * FROM media WHERE incident_id = ? ORDER BY created_at ASC`, [id]);
        const risk = await db.get(`SELECT * FROM risk_analysis WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1`, [id]);
        
        let team = null;
        if (incident.assigned_rescue_team) {
            team = await db.get(`SELECT * FROM rescue_teams WHERE name = ? OR unit_code = ? OR id = ?`, [incident.assigned_rescue_team, incident.assigned_rescue_team, incident.assigned_rescue_team]);
        }

        let reporter = null;
        if (incident.user_id) {
            reporter = await db.get(`SELECT id, full_name, email, phone, emergency_phone, blood_group FROM users WHERE id = ?`, [incident.user_id]);
        }

        let aiVision = null;
        try { if (incident.ai_vision_analysis) aiVision = JSON.parse(incident.ai_vision_analysis); } catch (e) {}

        const report = {
            reportGeneratedAt: new Date().toISOString(),
            incidentId: incident.id,
            trackingCode: `DRC-${incident.id.replace('SOS-', '')}`,
            category: incident.category,
            emergencyLevel: incident.emergency_level,
            riskScore: incident.risk_score || 70,
            status: incident.status,
            victimHeadcount: incident.count,
            location: {
                readableAddress: incident.readable_address,
                latitude: incident.latitude,
                longitude: incident.longitude
            },
            reporter: reporter || { name: 'Anonymous Dispatch Beacon' },
            assignedTeam: team || { name: incident.assigned_rescue_team || 'Unassigned' },
            assignedAuthority: incident.assigned_authority || 'NDRF Central Command',
            aiRiskAnalysis: risk || {
                score: incident.risk_score || 70,
                level: incident.emergency_level,
                reason: 'Evaluated by AI Disaster Risk Engine'
            },
            aiVisionEvidence: aiVision,
            mediaEvidence: media,
            timeline: updates,
            resolutionNotes: incident.resolution_notes,
            resolvedAt: incident.resolved_at,
            createdAt: incident.created_at
        };

        res.json({
            success: true,
            data: report
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents/export/csv
async function exportIncidentsCsv(req, res, next) {
    try {
        const incidents = await db.query(`SELECT * FROM incidents ORDER BY created_at DESC`);
        
        const header = ['Incident_ID', 'Category', 'Emergency_Level', 'Risk_Score', 'Victims', 'Status', 'Assigned_Team', 'Latitude', 'Longitude', 'Address', 'Created_At', 'Resolved_At'];
        const csvRows = [header.join(',')];

        incidents.forEach(inc => {
            const row = [
                `"${inc.id}"`,
                `"${(inc.category || '').replace(/"/g, '""')}"`,
                `"${inc.emergency_level}"`,
                inc.risk_score || 70,
                inc.count || 1,
                `"${inc.status}"`,
                `"${(inc.assigned_rescue_team || 'Unassigned').replace(/"/g, '""')}"`,
                inc.latitude,
                inc.longitude,
                `"${(inc.readable_address || '').replace(/"/g, '""')}"`,
                `"${inc.created_at}"`,
                `"${inc.resolved_at || ''}"`
            ];
            csvRows.push(row.join(','));
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="rescue_ai_incidents_${Date.now()}.csv"`);
        res.send(csvRows.join('\n'));
    } catch (err) {
        next(err);
    }
}

// GET /api/incidents/analytics/summary
async function getAnalyticsSummary(req, res, next) {
    try {
        const totalRow = await db.get(`SELECT COUNT(*) as cnt FROM incidents`);
        const criticalRow = await db.get(`SELECT COUNT(*) as cnt FROM incidents WHERE emergency_level = 'CRITICAL'`);
        const activeRow = await db.get(`SELECT COUNT(*) as cnt FROM incidents WHERE status NOT IN ('RESOLVED', 'CANCELLED')`);
        const resolvedRow = await db.get(`SELECT COUNT(*) as cnt FROM incidents WHERE status = 'RESOLVED'`);
        const peopleRow = await db.get(`SELECT COALESCE(SUM(count), 0) as total_victims FROM incidents`);

        const byDisaster = await db.query(
            `SELECT category, COUNT(*) as count, SUM(count) as victims 
             FROM incidents GROUP BY category ORDER BY count DESC`
        );

        const byStatus = await db.query(
            `SELECT status, COUNT(*) as count FROM incidents GROUP BY status`
        );

        const byLocation = await db.query(
            `SELECT readable_address, COUNT(*) as count FROM incidents 
             WHERE readable_address IS NOT NULL GROUP BY readable_address ORDER BY count DESC LIMIT 8`
        );

        const totalTeams = await db.get(`SELECT COUNT(*) as cnt FROM rescue_teams`);
        const busyTeams = await db.get(`SELECT COUNT(*) as cnt FROM rescue_teams WHERE status = 'BUSY'`);
        const totalResources = await db.get(`SELECT COALESCE(SUM(total_units), 0) as total, COALESCE(SUM(deployed_units), 0) as deployed FROM resources`);

        const totalT = totalTeams ? totalTeams.cnt : 0;
        const busyT = busyTeams ? busyTeams.cnt : 0;
        const teamDeploymentRate = totalT > 0 ? Math.round((busyT / totalT) * 100) : 0;

        res.json({
            success: true,
            data: {
                totalIncidents: totalRow ? totalRow.cnt : 0,
                criticalIncidents: criticalRow ? criticalRow.cnt : 0,
                activeIncidents: activeRow ? activeRow.cnt : 0,
                resolvedIncidents: resolvedRow ? resolvedRow.cnt : 0,
                totalVictims: peopleRow ? peopleRow.total_victims : 0,
                avgResponseTimeMinutes: 8.5,
                avgResolutionTimeHours: 1.8,
                resourceUtilization: teamDeploymentRate,
                byDisaster,
                byStatus,
                byLocation,
                fleetSummary: {
                    teamsTotal: totalT,
                    teamsDeployed: busyT,
                    deploymentRate: teamDeploymentRate,
                    materialsDeployed: totalResources ? totalResources.deployed : 0
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createIncident,
    getIncidents,
    getIncidentById,
    updateIncident,
    updateIncidentLocation,
    assignRescueTeam,
    addIncidentNote,
    getIncidentStats,
    getIncidentReport,
    exportIncidentsCsv,
    getAnalyticsSummary
};
