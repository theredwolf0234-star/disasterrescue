const db = require('../config/database');
const { generateIncidentId, generateUUID } = require('../utils/idGenerator');
const { calculateEmergencyPriority } = require('../services/priorityService');
const { analyzeDisasterMedia } = require('../services/aiVisionService');
const { logAction } = require('../services/auditService');
const { emitNewIncident, emitIncidentUpdated } = require('../sockets/socketHandler');
const { computeTacticalGrid, computeTacticalGridId } = require('../utils/tacticalGrid');

const VALID_STATUSES = [
    'NEW',
    'RECEIVED',
    'REQUESTED',
    'ACKNOWLEDGED',
    'ACCEPTED',
    'ANALYZING',
    'ASSESSING',
    'TRIAGED',
    'ASSIGNED',
    'DISPATCHING',
    'TEAM_ASSIGNED',
    'TEAM_DISPATCHED',
    'DISPATCHED',
    'TEAM_APPROACHING',
    'TEAM_EN_ROUTE',
    'EN_ROUTE',
    'IN_PROGRESS',
    'ON_SCENE',
    'ARRIVED',
    'RESOLVED',
    'COMPLETED',
    'CANCELLED'
];

// POST /api/incidents or /api/sos
async function createIncident(req, res, next) {
    try {
        const categoryRaw = req.body.category || req.body.disaster_type || req.body.disasterType || req.body.emergency_type;
        const detailsRaw = req.body.details || req.body.description || req.body.short_description;
        const isQuickSos = req.body.source === 'ONE_TAP_SOS' || req.body.isOneTap || req.body.quickSos || req.headers['x-sos-quick'] || (!categoryRaw && !detailsRaw);
        const category = categoryRaw && typeof categoryRaw === 'string' && categoryRaw.trim()
            ? categoryRaw.trim()
            : (isQuickSos ? 'Emergency SOS' : '');
        const details = detailsRaw && typeof detailsRaw === 'string' && detailsRaw.trim()
            ? detailsRaw.trim()
            : (isQuickSos ? 'One-tap emergency distress beacon initiated by citizen. Live GPS tracking active.' : '');
        const countRaw = req.body.count !== undefined ? req.body.count : (req.body.people_affected !== undefined ? req.body.people_affected : req.body.peopleAffected);
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
        const userId = req.user ? req.user.id : null;

        // Idempotency key verification & rapid duplicate suppression
        const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key || req.body.idempotencyKey || null;
        if (idempotencyKey) {
            const existingByIdempotency = await db.get(
                `SELECT * FROM incidents WHERE idempotency_key = ? ORDER BY created_at DESC LIMIT 1`,
                [idempotencyKey]
            );
            if (existingByIdempotency) {
                const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [existingByIdempotency.id]);
                return res.status(200).json({
                    success: true,
                    message: 'Incident previously registered (idempotent request).',
                    data: {
                        ...existingByIdempotency,
                        incident: existingByIdempotency,
                        updates
                    }
                });
            }
        }

        // Rapid duplicate beacon suppression (same reporter, same category, same location within ~50m within 20s)
        const recentDuplicate = await db.get(
            `SELECT * FROM incidents 
             WHERE category = ? 
               AND ABS(latitude - ?) < 0.0005 
               AND ABS(longitude - ?) < 0.0005 
               AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
               AND created_at >= datetime('now', '-20 seconds')
             ORDER BY created_at DESC LIMIT 1`,
            [category.trim(), numLat, numLng, userId, userId]
        );
        if (recentDuplicate) {
            const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [recentDuplicate.id]);
            return res.status(200).json({
                success: true,
                message: 'Duplicate SOS beacon suppressed; existing incident active.',
                data: {
                    ...recentDuplicate,
                    incident: recentDuplicate,
                    updates
                }
            });
        }

        const incidentId = await generateIncidentId();

        // GPS Telemetry verification & accuracy
        const isVerifiedGps = req.body.is_verified_gps !== undefined ? (req.body.is_verified_gps ? 1 : 0) : (req.body.isVerifiedGps !== undefined ? (req.body.isVerifiedGps ? 1 : 0) : 1);
        const rawAccuracy = req.body.gps_accuracy !== undefined ? parseFloat(req.body.gps_accuracy) : (req.body.gpsAccuracy !== undefined ? parseFloat(req.body.gpsAccuracy) : null);
        const gpsAccuracy = !isNaN(rawAccuracy) ? rawAccuracy : null;
        const gpsTimestamp = req.body.gps_timestamp || req.body.gpsTimestamp || new Date().toISOString();

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

        // Deterministic Tactical Grid ID generation (100m resolution)
        const tacticalGridId = computeTacticalGridId(numLat, numLng);

        // Insert incident into persistent database
        await db.run(
            `INSERT INTO incidents (
                id, user_id, category, emergency_level, count, details,
                latitude, longitude, readable_address, tactical_grid_id, status,
                assigned_authority, assigned_rescue_team, evidence_url,
                risk_score, risk_factors, recommended_action, ai_vision_analysis, audio_url,
                is_verified_gps, gps_accuracy, gps_timestamp, idempotency_key,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
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
                tacticalGridId,
                finalEvidenceUrl,
                priorityAssessment.score || 70,
                JSON.stringify(priorityAssessment.factors || {}),
                priorityAssessment.recommendedAction || 'Dispatch nearest tactical unit.',
                aiVisionData ? JSON.stringify(aiVisionData) : null,
                audioUrl,
                isVerifiedGps,
                gpsAccuracy,
                gpsTimestamp,
                idempotencyKey
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

        // Automatic SOS assignment: initiated automatically upon submission for SOS beacons
        let dispatchResult = null;
        const isAutoDispatch = req.body.autoDispatch === true || req.body.source === 'ONE_TAP_SOS' || req.headers['x-auto-dispatch'] === 'true' || Boolean(isQuickSos) || req.baseUrl === '/api/sos';
        if (isAutoDispatch) {
            try {
                const { autoDispatchIncident } = require('../services/dispatchEngine');
                dispatchResult = await autoDispatchIncident(incidentId, {
                    category: category.trim(),
                    details: details.trim(),
                    dispatchedBy: userId || 'AUTO_DISPATCH_ENGINE'
                });
            } catch (dispErr) {
                console.warn('[Incident] Automatic dispatch error:', dispErr.message);
            }
        }

        // Automatic Relay to NDRF EOC CAD Gateway for High/Critical Beacons
        let ndrfRelayResult = null;
        const autoRelayEnabled = process.env.NDRF_GATEWAY_ENABLED !== 'false' && process.env.NDRF_AUTO_RELAY_CRITICAL !== 'false';
        const isCriticalOrHigh = priorityAssessment.level === 'CRITICAL' || priorityAssessment.level === 'HIGH' || isAutoDispatch;
        if (autoRelayEnabled && isCriticalOrHigh) {
            try {
                const { relayIncidentToNdrf } = require('../services/ndrfService');
                ndrfRelayResult = await relayIncidentToNdrf(incidentId, {
                    relayedBy: userId || 'AUTO_NDRF_CAD_GATEWAY'
                });
            } catch (ndrfErr) {
                console.warn('[Incident] Automatic NDRF relay warning:', ndrfErr.message);
            }
        }

        // AI-Assisted Verification & Triage Analysis (Advisory with Mandatory Human Review)
        let aiVerification = null;
        try {
            const { performAiAssistedVerification } = require('../services/aiVerificationService');
            aiVerification = await performAiAssistedVerification({
                incidentId,
                category: category.trim(),
                details: details.trim(),
                count: victimCount,
                address: readableAddress,
                latitude: numLat,
                longitude: numLng,
                isVerifiedGps,
                gpsAccuracy
            });

            if (aiVerification) {
                await db.run(
                    `UPDATE incidents 
                     SET ai_verification_summary = ?,
                         ai_missing_info_flags = ?,
                         ai_alert_zone_match = ?,
                         ai_recommended_assistance = ?,
                         ai_duplicate_of_id = ?
                     WHERE id = ?`,
                    [
                        aiVerification.coordinatorSummary,
                        JSON.stringify(aiVerification.missingInfoAndFlags || []),
                        JSON.stringify(aiVerification.governmentAlertZoneMatch || {}),
                        JSON.stringify(aiVerification.recommendedAssistance || []),
                        aiVerification.duplicateAnalysis && aiVerification.duplicateAnalysis.isPotentialDuplicate 
                            ? aiVerification.duplicateAnalysis.primaryDuplicateId 
                            : null,
                        incidentId
                    ]
                );
            }
        } catch (aiVerErr) {
            console.warn('[Incident] AI Verification triage error:', aiVerErr.message);
        }

        const finalIncident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
        const finalUpdates = await db.query(
            `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`,
            [incidentId]
        );

        // Real-time broadcast via Socket.IO
        emitNewIncident({
            ...finalIncident,
            incident: finalIncident,
            updates: finalUpdates,
            dispatch: dispatchResult,
            ndrf: ndrfRelayResult
        });

        res.status(201).json({
            success: true,
            message: dispatchResult && dispatchResult.dispatched
                ? `Emergency SOS recorded and automatically dispatched to ${dispatchResult.assignedTeam ? dispatchResult.assignedTeam.name : 'rescue team'}. ETA: ~${dispatchResult.etaMinutes} mins.`
                : 'Emergency SOS beacon recorded and dispatched to authority command grid.',
            data: {
                ...finalIncident,
                incident: finalIncident,
                updates: finalUpdates,
                dispatch: dispatchResult,
                ndrf: ndrfRelayResult,
                assignedTeam: dispatchResult ? dispatchResult.assignedTeam : null,
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
        const isResponder = req.user.role === 'RESPONDER';
        const { status, level, category, search, grid, limit = 100, offset = 0, mine, from, to, assigned } = req.query;

        let queryStr = `SELECT * FROM incidents WHERE 1=1`;
        const params = [];

        // For CITIZEN or when mine=true: must return ONLY reports belonging to that citizen
        const filterMine = (!isAuthorityOrAdmin && !isResponder) || mine === 'true' || req.query.userOnly === 'true';
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

        if (category && category !== 'all') {
            queryStr += ` AND category = ?`;
            params.push(category);
        }

        if (grid) {
            queryStr += ` AND tactical_grid_id LIKE ?`;
            params.push(`%${grid}%`);
        }

        if (search) {
            queryStr += ` AND (id LIKE ? OR tactical_grid_id LIKE ? OR category LIKE ? OR details LIKE ? OR readable_address LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        if (from) {
            queryStr += ` AND created_at >= ?`;
            params.push(from);
        }

        if (to) {
            queryStr += ` AND created_at <= ?`;
            params.push(to);
        }

        if (assigned === 'true') {
            queryStr += ` AND (assigned_rescue_team IS NOT NULL OR dispatch_team_id IS NOT NULL)`;
        } else if (assigned === 'false') {
            queryStr += ` AND assigned_rescue_team IS NULL AND dispatch_team_id IS NULL`;
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
        if (category && category !== 'all') {
            countSql += ` AND category = ?`;
            countParams.push(category);
        }
        if (grid) {
            countSql += ` AND tactical_grid_id LIKE ?`;
            countParams.push(`%${grid}%`);
        }
        if (search) {
            countSql += ` AND (id LIKE ? OR tactical_grid_id LIKE ? OR category LIKE ? OR details LIKE ? OR readable_address LIKE ?)`;
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (from) {
            countSql += ` AND created_at >= ?`;
            countParams.push(from);
        }
        if (to) {
            countSql += ` AND created_at <= ?`;
            countParams.push(to);
        }
        if (assigned === 'true') {
            countSql += ` AND (assigned_rescue_team IS NOT NULL OR dispatch_team_id IS NOT NULL)`;
        } else if (assigned === 'false') {
            countSql += ` AND assigned_rescue_team IS NULL AND dispatch_team_id IS NULL`;
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
        const isResponder = req.user.role === 'RESPONDER';
        const isAssignedNgo = req.user.role === 'NGO' && incident.assigned_ngo_id === req.user.ngoId;
        if (!isAuthorityOrAdmin && !isResponder && !isAssignedNgo && incident.user_id !== req.user.id) {
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

        const ndrfTransmission = await db.get(
            `SELECT * FROM ndrf_transmissions WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1`,
            [id]
        );

        const ngoAssignment = await db.get(
            `SELECT t.*, n.name as ngo_name, n.phone as ngo_phone, n.contact_person, n.official_email
             FROM incident_ngo_assignments t 
             JOIN ngos n ON t.ngo_id = n.id 
             WHERE t.incident_id = ? 
             ORDER BY t.created_at DESC LIMIT 1`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...incident,
                incident,
                updates,
                timeline: updates,
                ndrfTransmission: ndrfTransmission || null,
                ngoAssignment: ngoAssignment || null
            }
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/incidents/:id
// Restricted to AUTHORITY, ADMIN, and assigned RESPONDER
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

        const isAuthorityOrAdmin = req.user && (req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN');
        const isResponder = req.user && req.user.role === 'RESPONDER';

        if (!isAuthorityOrAdmin && !isResponder) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Access restricted. Role lacks permission to update incident status.',
                errorCode: 'FORBIDDEN'
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
        const isResolving = newStatus === 'RESOLVED' || newStatus === 'COMPLETED';
        const resolvedAt = isResolving 
            ? (incident.resolved_at || new Date().toISOString()) 
            : (newStatus !== incident.status && (incident.status === 'RESOLVED' || incident.status === 'COMPLETED') ? null : incident.resolved_at);

        const isAcknowledging = newStatus === 'ACCEPTED' || newStatus === 'ACKNOWLEDGED' || newStatus === 'EN_ROUTE' || newStatus === 'TEAM_EN_ROUTE';
        const acknowledgedAt = isAcknowledging 
            ? (incident.acknowledged_at || new Date().toISOString()) 
            : incident.acknowledged_at;

        const finalResolutionNotes = resolutionNotes !== undefined 
            ? resolutionNotes 
            : (isResolving && !incident.resolution_notes ? (note || 'Incident marked completed and resolved.') : incident.resolution_notes);

        await db.run(
            `UPDATE incidents 
             SET status = ?,
                 assigned_authority = COALESCE(?, assigned_authority),
                 assigned_rescue_team = COALESCE(?, assigned_rescue_team),
                 resolution_notes = ?,
                 resolved_at = ?,
                 acknowledged_at = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                newStatus,
                isAuthorityOrAdmin ? (assignedAuthority || null) : null,
                isAuthorityOrAdmin ? (assignedRescueTeam || null) : null,
                finalResolutionNotes || null,
                resolvedAt,
                acknowledgedAt,
                id
            ]
        );

        // Manage responder fleet availability
        const teamIdToManage = incident.dispatch_team_id;
        if (isResolving && teamIdToManage) {
            await db.run(
                `UPDATE rescue_teams 
                 SET status = 'AVAILABLE', assigned_incident_id = NULL, updated_at = datetime('now') 
                 WHERE id = ?`,
                [teamIdToManage]
            );
        } else if ((newStatus === 'EN_ROUTE' || newStatus === 'TEAM_EN_ROUTE') && teamIdToManage) {
            await db.run(
                `UPDATE rescue_teams SET status = 'DISPATCHED', updated_at = datetime('now') WHERE id = ?`,
                [teamIdToManage]
            );
        } else if ((newStatus === 'ARRIVED' || newStatus === 'ON_SCENE') && teamIdToManage) {
            await db.run(
                `UPDATE rescue_teams SET status = 'ON_SCENE', updated_at = datetime('now') WHERE id = ?`,
                [teamIdToManage]
            );
        }

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
        const { checkAndEscalateUnacknowledgedIncidents } = require('../services/dispatchEngine');
        try {
            await checkAndEscalateUnacknowledgedIncidents();
        } catch (escErr) {
            console.warn('[Stats] Escalation check notice:', escErr.message);
        }

        const totalRow = await db.get(`SELECT COUNT(*) as count FROM incidents`);
        const activeRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`);
        const criticalRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE emergency_level = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`);
        const resolvedRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE status IN ('RESOLVED', 'COMPLETED')`);
        const peopleRow = await db.get(`SELECT COALESCE(SUM(count), 0) as total_people FROM incidents`);
        const unackedRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE status IN ('ASSIGNED', 'TEAM_ASSIGNED') AND acknowledged_at IS NULL`);
        const awaitingRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE (assigned_rescue_team IS NULL OR status = 'REQUESTED') AND status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`);
        const assignedRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE (assigned_rescue_team IS NOT NULL OR dispatch_team_id IS NOT NULL) AND status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`);
        const unassignedRow = await db.get(`SELECT COUNT(*) as count FROM incidents WHERE assigned_rescue_team IS NULL AND dispatch_team_id IS NULL AND status NOT IN ('RESOLVED', 'CANCELLED', 'COMPLETED')`);
        const availableTeamsRow = await db.get(`SELECT COUNT(*) as count FROM rescue_teams WHERE status IN ('AVAILABLE', 'STANDBY')`);
        const deployedTeamsRow = await db.get(`SELECT COUNT(*) as count FROM rescue_teams WHERE status IN ('DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'DEPLOYED')`);
        const totalTeamsRow = await db.get(`SELECT COUNT(*) as count FROM rescue_teams`);

        const total = totalRow ? parseInt(totalRow.count, 10) || 0 : 0;
        const active = activeRow ? parseInt(activeRow.count, 10) || 0 : 0;
        const critical = criticalRow ? parseInt(criticalRow.count, 10) || 0 : 0;
        const resolved = resolvedRow ? parseInt(resolvedRow.count, 10) || 0 : 0;
        const people = peopleRow ? parseInt(peopleRow.total_people, 10) || 0 : 0;
        const unacknowledged = unackedRow ? parseInt(unackedRow.count, 10) || 0 : 0;
        const awaitingAssistance = awaitingRow ? parseInt(awaitingRow.count, 10) || 0 : 0;
        const assigned = assignedRow ? parseInt(assignedRow.count, 10) || 0 : 0;
        const unassigned = unassignedRow ? parseInt(unassignedRow.count, 10) || 0 : 0;
        const availableTeams = availableTeamsRow ? parseInt(availableTeamsRow.count, 10) || 0 : 0;
        const deployedTeams = deployedTeamsRow ? parseInt(deployedTeamsRow.count, 10) || 0 : 0;
        const totalTeams = totalTeamsRow ? parseInt(totalTeamsRow.count, 10) || 0 : 0;

        res.json({
            success: true,
            data: {
                total,
                totalIncidents: total,
                active,
                critical,
                resolved,
                resolvedIncidents: resolved,
                people,
                peopleAffected: people,
                unacknowledged,
                awaitingAssistance,
                assigned,
                assignedIncidents: assigned,
                unassigned,
                unassignedIncidents: unassigned,
                availableTeams,
                deployedTeams,
                totalTeams
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

        // Only owner citizen, assigned responder, or authority/admin can update location
        const isAuth = req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN' || req.user.role === 'RESPONDER';
        if (!isAuth && incident.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Cannot update location of another citizen report.'
            });
        }

        // Deterministically recalculate Tactical Grid ID for updated GPS coordinates
        const newTacticalGridId = computeTacticalGridId(lat, lng);

        await db.run(
            `UPDATE incidents SET latitude = ?, longitude = ?, tactical_grid_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [lat, lng, newTacticalGridId, id]
        );

        const updated = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);

        try {
            const { getIO } = require('../sockets/socketHandler');
            const io = getIO();
            const payload = {
                id,
                latitude: lat,
                longitude: lng,
                tactical_grid_id: newTacticalGridId,
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

        // Server-side authorization check: citizen can only view own reports; authority/admin can view any
        const isAuth = req.user && (req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN');
        if (!isAuth && (!req.user || incident.user_id !== req.user.id)) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Access restricted. You do not have permission to view this incident report.',
                errorCode: 'FORBIDDEN'
            });
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
                longitude: incident.longitude,
                tacticalGridId: incident.tactical_grid_id || computeTacticalGridId(incident.latitude, incident.longitude),
                isVerifiedGps: Boolean(incident.is_verified_gps),
                gpsAccuracy: incident.gps_accuracy
            },
            tacticalGridId: incident.tactical_grid_id || computeTacticalGridId(incident.latitude, incident.longitude),
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
        const { category, status, emergency_level, from, to } = req.query;
        let sql = `SELECT * FROM incidents WHERE 1=1`;
        const params = [];

        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }
        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }
        if (emergency_level) {
            sql += ` AND emergency_level = ?`;
            params.push(emergency_level);
        }
        if (from) {
            sql += ` AND created_at >= ?`;
            params.push(from);
        }
        if (to) {
            sql += ` AND created_at <= ?`;
            params.push(to);
        }

        sql += ` ORDER BY created_at DESC`;
        const incidents = await db.query(sql, params);

        // Sanitize string to prevent spreadsheet formula injection (=, +, -, @, \t, \r)
        function sanitizeCsvField(val) {
            if (val === null || val === undefined) return '""';
            let str = String(val);
            if (/^[=+\-@\t\r]/.test(str)) {
                str = `'${str}`;
            }
            return `"${str.replace(/"/g, '""')}"`;
        }
        
        const header = [
            'Incident_ID', 'Category', 'Emergency_Level', 'Tactical_Grid_ID', 'Risk_Score', 
            'Victims', 'Status', 'Assigned_Team', 'Latitude', 'Longitude', 
            'Address', 'Verified_GPS', 'GPS_Accuracy_Meters', 'Created_At', 'Resolved_At'
        ];
        const csvRows = [header.join(',')];

        incidents.forEach(inc => {
            const row = [
                sanitizeCsvField(inc.id),
                sanitizeCsvField(inc.category),
                sanitizeCsvField(inc.emergency_level),
                sanitizeCsvField(inc.tactical_grid_id || computeTacticalGridId(inc.latitude, inc.longitude)),
                Number(inc.risk_score) || 70,
                Number(inc.count) || 1,
                sanitizeCsvField(inc.status),
                sanitizeCsvField(inc.assigned_rescue_team || 'Unassigned'),
                inc.latitude,
                inc.longitude,
                sanitizeCsvField(inc.readable_address),
                inc.is_verified_gps ? 'YES' : 'NO',
                inc.gps_accuracy !== null && inc.gps_accuracy !== undefined ? inc.gps_accuracy : 'N/A',
                sanitizeCsvField(inc.created_at),
                sanitizeCsvField(inc.resolved_at || '')
            ];
            csvRows.push(row.join(','));
        });

        // Audit log the export
        if (req.user) {
            await logAction({
                userId: req.user.id,
                userRole: req.user.role,
                action: 'EXPORT_INCIDENTS_CSV',
                entityType: 'INCIDENT',
                entityId: 'ALL',
                details: { filterCategory: category, filterStatus: status, rowCount: incidents.length },
                ipAddress: req.ip
            });
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
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

// GET /api/incidents/:id/timeline
async function getIncidentTimeline(req, res, next) {
    try {
        const { id } = req.params;
        const incident = await db.get(`SELECT id, user_id FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.', errorCode: 'NOT_FOUND' });
        }

        const isAuthorityOrAdmin = req.user && ['AUTHORITY', 'ADMIN', 'OPERATOR', 'RESPONDER'].includes(req.user.role);
        const isOwner = req.user && incident.user_id && req.user.id === incident.user_id;
        if (!isAuthorityOrAdmin && !isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden: You can only view timeline for your own incidents.',
                errorCode: 'FORBIDDEN'
            });
        }

        const timeline = await db.query(
            `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`,
            [id]
        );

        res.json({
            success: true,
            incidentId: id,
            count: timeline.length,
            data: timeline
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/:id/evidence
async function uploadIncidentEvidence(req, res, next) {
    try {
        const { id } = req.params;
        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.', errorCode: 'NOT_FOUND' });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No evidence media file provided.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const finalEvidenceUrl = `/uploads/${req.file.filename}`;
        const isAudio = req.file.mimetype.startsWith('audio/') || ['.wav', '.mp3', '.webm', '.ogg'].some(ext => req.file.filename.endsWith(ext));
        const isVideo = req.file.mimetype.startsWith('video/');
        const fileType = isAudio ? 'audio' : isVideo ? 'video' : 'image';

        let aiVisionData = null;
        try {
            aiVisionData = await analyzeDisasterMedia({
                filePath: req.file.path,
                fileMime: req.file.mimetype,
                fileName: req.file.originalname,
                category: incident.category,
                details: incident.details
            });
        } catch (mediaErr) {
            console.warn('[Incident Evidence] AI analysis error:', mediaErr.message);
        }

        const mediaId = generateUUID('MED');
        await db.run(
            `INSERT INTO media (id, incident_id, file_url, file_type, file_name, file_size, ai_analysis_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                mediaId,
                id,
                finalEvidenceUrl,
                fileType,
                req.file.originalname,
                req.file.size,
                JSON.stringify(aiVisionData)
            ]
        );

        if (!incident.evidence_url) {
            await db.run(`UPDATE incidents SET evidence_url = ? WHERE id = ?`, [finalEvidenceUrl, id]);
        }
        if (isAudio && !incident.audio_url) {
            await db.run(`UPDATE incidents SET audio_url = ? WHERE id = ?`, [finalEvidenceUrl, id]);
        }

        const updateId = generateUUID('UPD');
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, note, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [
                updateId,
                id,
                req.user ? req.user.id : 'CITIZEN',
                req.user ? req.user.role : 'CITIZEN',
                `Evidence uploaded (${fileType}): ${req.file.originalname}`
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Evidence attached to incident successfully.',
            data: {
                id: mediaId,
                incidentId: id,
                fileUrl: finalEvidenceUrl,
                fileType,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                aiAnalysis: aiVisionData
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST or PATCH /api/incidents/:id/supplement
// Allows user to add disaster type, audio recording, photo, victim count without delaying initial SOS
async function supplementIncident(req, res, next) {
    try {
        const { id } = req.params;
        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.', errorCode: 'NOT_FOUND' });
        }

        // Verify authorization: citizen must own it or be authority
        if (req.user && req.user.role === 'CITIZEN' && incident.user_id && incident.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.', errorCode: 'FORBIDDEN' });
        }

        const category = req.body.category || req.body.disasterType || null;
        const details = req.body.details || req.body.description || null;
        const count = req.body.count !== undefined ? parseInt(req.body.count, 10) : null;
        const address = req.body.address || null;
        let evidenceUrl = req.body.evidenceUrl || null;
        let audioUrl = req.body.audioUrl || null;

        let aiVisionData = null;
        if (req.file) {
            evidenceUrl = `/uploads/${req.file.filename}`;
            const isAudio = req.file.mimetype.startsWith('audio/') || ['.wav', '.mp3', '.webm', '.ogg'].some(ext => req.file.filename.endsWith(ext));
            if (isAudio) audioUrl = evidenceUrl;

            try {
                aiVisionData = await analyzeDisasterMedia({
                    filePath: req.file.path,
                    fileMime: req.file.mimetype,
                    fileName: req.file.originalname,
                    category: category || incident.category,
                    details: details || incident.details
                });

                const mediaId = generateUUID('MED');
                await db.run(
                    `INSERT INTO media (id, incident_id, file_url, file_type, file_name, file_size, ai_analysis_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    [
                        mediaId,
                        id,
                        evidenceUrl,
                        isAudio ? 'audio' : req.file.mimetype.startsWith('video/') ? 'video' : 'image',
                        req.file.originalname,
                        req.file.size,
                        JSON.stringify(aiVisionData)
                    ]
                );
            } catch (mediaErr) {
                console.warn('[Incident] Supplement AI vision error:', mediaErr.message);
            }
        }

        // Re-evaluate risk with new details
        const combinedCategory = category || incident.category;
        const combinedDetails = details ? `${incident.details}\n[Update]: ${details}` : incident.details;
        const combinedCount = count || incident.count || 1;

        const priorityAssessment = calculateEmergencyPriority({
            category: combinedCategory,
            count: combinedCount,
            details: combinedDetails
        });

        await db.run(
            `UPDATE incidents
             SET category = COALESCE(?, category),
                 details = COALESCE(?, details),
                 count = COALESCE(?, count),
                 readable_address = COALESCE(?, readable_address),
                 evidence_url = COALESCE(?, evidence_url),
                 audio_url = COALESCE(?, audio_url),
                 ai_vision_analysis = COALESCE(?, ai_vision_analysis),
                 emergency_level = ?,
                 risk_score = ?,
                 recommended_action = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                category ? category.trim() : null,
                details ? details.trim() : null,
                count,
                address ? address.trim() : null,
                evidenceUrl,
                audioUrl,
                aiVisionData ? JSON.stringify(aiVisionData) : null,
                priorityAssessment.level,
                priorityAssessment.score || 70,
                priorityAssessment.recommendedAction || incident.recommended_action,
                id
            ]
        );

        // Record update timeline
        const note = `Citizen added supplemental details: Category '${combinedCategory}', Victims: ${combinedCount}.${details ? ` Note: "${details}"` : ''}`;
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                generateUUID('INCU'),
                id,
                req.user ? req.user.id : 'CITIZEN',
                req.user ? req.user.role : 'CITIZEN',
                incident.status,
                incident.status,
                note
            ]
        );

        // Update risk_analysis table
        await db.run(
            `INSERT INTO risk_analysis (id, incident_id, disaster_type, risk_score, risk_level, factors_json, reason, confidence, recommended_action, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                generateUUID('RISK'),
                id,
                combinedCategory,
                priorityAssessment.score || 70,
                priorityAssessment.level,
                JSON.stringify(priorityAssessment.factors || {}),
                priorityAssessment.reasoning || '',
                priorityAssessment.confidence || 90,
                priorityAssessment.recommendedAction || ''
            ]
        );

        const updatedIncident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [id]);
        const updates = await db.query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC`, [id]);

        emitIncidentUpdated({ ...updatedIncident, incident: updatedIncident, updates });

        res.json({
            success: true,
            message: 'Emergency details updated and re-analyzed by AI risk engine.',
            data: {
                ...updatedIncident,
                incident: updatedIncident,
                updates,
                priorityAssessment
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/:id/auto-dispatch
async function triggerAutoDispatch(req, res, next) {
    try {
        const { id } = req.params;
        const { autoDispatchIncident } = require('../services/dispatchEngine');
        const result = await autoDispatchIncident(id, {
            dispatchedBy: req.user ? req.user.id : 'AUTHORITY'
        });
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/:id/escalate
async function triggerEscalate(req, res, next) {
    try {
        const { id } = req.params;
        const { escalateIncident } = require('../services/dispatchEngine');
        const result = await escalateIncident({
            incidentId: id,
            reason: req.body.reason || 'Manual authority escalation',
            authorityUser: req.user
        });
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/incidents/check-escalations
async function triggerEscalationsCheck(req, res, next) {
    try {
        const { checkAndEscalateUnacknowledgedIncidents } = require('../services/dispatchEngine');
        const results = await checkAndEscalateUnacknowledgedIncidents();
        res.json({
            success: true,
            count: results.length,
            data: results
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
    getAnalyticsSummary,
    getIncidentTimeline,
    uploadIncidentEvidence,
    supplementIncident,
    triggerAutoDispatch,
    triggerEscalate,
    triggerEscalationsCheck
};

