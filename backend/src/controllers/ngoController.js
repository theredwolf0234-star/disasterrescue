/**
 * NGO COLLABORATIVE DISASTER MANAGEMENT CONTROLLER
 * 
 * Handles NGO registration, admin verification/approval, task dispatches,
 * relief progress tracking, volunteer rosters, supply inventory, and inter-agency chat.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { logAction } = require('../services/auditService');
const { emitIncidentUpdated } = require('../sockets/socketHandler');

// -------------------------------------------------------------
// 1. NGO REGISTRATION & ONBOARDING
// -------------------------------------------------------------
async function registerNgo(req, res, next) {
    try {
        const {
            name,
            registrationNumber,
            darpanId,
            taxExemptionNumber,
            contactPerson,
            officialEmail,
            phone,
            operationalAreas,
            servicesOffered,
            emergencyCapabilities,
            password
        } = req.body;

        if (!name || !registrationNumber || !contactPerson || !officialEmail || !phone || !operationalAreas || !password) {
            return res.status(400).json({
                success: false,
                message: 'All core registration fields are required (Name, Reg No, Contact, Official Email, Phone, Areas, Password).',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = officialEmail.toLowerCase().trim();

        // Check if NGO email already registered
        const existingNgo = await db.get(`SELECT id FROM ngos WHERE LOWER(official_email) = ?`, [normalizedEmail]);
        if (existingNgo) {
            return res.status(409).json({
                success: false,
                message: 'An NGO application with this official email address already exists.',
                errorCode: 'NGO_EXISTS'
            });
        }

        const existingUser = await db.get(`SELECT id FROM ngo_users WHERE LOWER(email) = ?`, [normalizedEmail]);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'A coordinator account with this email already exists.',
                errorCode: 'USER_EXISTS'
            });
        }

        // Handle uploaded verification document
        let verificationDocUrl = null;
        if (req.file) {
            verificationDocUrl = `/uploads/${req.file.filename}`;
        } else if (req.body.verificationDocUrl) {
            verificationDocUrl = req.body.verificationDocUrl;
        }

        const ngoId = generateUUID('NGO');
        const userId = generateUUID('NGO_USR');
        const passwordHash = await bcrypt.hash(password, 10);

        const areas = Array.isArray(operationalAreas) ? operationalAreas.join(', ') : operationalAreas;
        const services = Array.isArray(servicesOffered) ? JSON.stringify(servicesOffered) : (typeof servicesOffered === 'string' ? servicesOffered : JSON.stringify(['FOOD_RATIONS', 'VOLUNTEERS']));

        // Insert NGO record (Status PENDING)
        await db.run(
            `INSERT INTO ngos (
                id, name, registration_number, darpan_id, tax_exemption_number,
                contact_person, official_email, phone, operational_areas,
                services_offered, emergency_capabilities, verification_doc_url,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`,
            [
                ngoId,
                name.trim(),
                registrationNumber.trim(),
                darpanId ? darpanId.trim() : null,
                taxExemptionNumber ? taxExemptionNumber.trim() : null,
                contactPerson.trim(),
                normalizedEmail,
                phone.trim(),
                areas,
                services,
                emergencyCapabilities ? emergencyCapabilities.trim() : null,
                verificationDocUrl
            ]
        );

        // Insert inactive coordinator credentials awaiting admin verification
        await db.run(
            `INSERT INTO ngo_users (id, ngo_id, full_name, email, password_hash, role, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'NGO', 0, datetime('now'), datetime('now'))`,
            [userId, ngoId, contactPerson.trim(), normalizedEmail, passwordHash]
        );

        await logAction({
            userId,
            userRole: 'NGO',
            action: 'NGO_REGISTERED',
            entityType: 'NGO',
            entityId: ngoId,
            details: `NGO "${name.trim()}" applied for disaster partnership. Status: PENDING admin review.`,
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'NGO registration submitted successfully. Your application is under Administrator verification. Dashboard access will be activated upon approval.',
            data: {
                ngoId,
                name: name.trim(),
                officialEmail: normalizedEmail,
                status: 'PENDING',
                darpanId: darpanId || null,
                verificationNotice: 'Administrator review required before dashboard login.'
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 2. NGO LOGIN
// -------------------------------------------------------------
async function loginNgo(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Official email and password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await db.get(`SELECT * FROM ngo_users WHERE LOWER(email) = ?`, [normalizedEmail]);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid NGO credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: 'Invalid NGO credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const ngo = await db.get(`SELECT * FROM ngos WHERE id = ?`, [user.ngo_id]);
        if (!ngo) {
            return res.status(404).json({
                success: false,
                message: 'Associated NGO organization record not found.',
                errorCode: 'NGO_NOT_FOUND'
            });
        }

        // Enforce administrative approval controls
        if (ngo.status === 'PENDING') {
            return res.status(403).json({
                success: false,
                message: 'Your NGO partnership application is currently PENDING review by Disaster Management Administration. Dashboard access will activate once verified.',
                errorCode: 'APPLICATION_PENDING',
                data: {
                    ngoName: ngo.name,
                    appliedAt: ngo.created_at,
                    darpanId: ngo.darpan_id
                }
            });
        }

        if (ngo.status === 'REJECTED') {
            return res.status(403).json({
                success: false,
                message: `NGO application was not approved. Reason: ${ngo.rejection_reason || 'Verification criteria not satisfied.'}`,
                errorCode: 'APPLICATION_REJECTED'
            });
        }

        if (ngo.status === 'SUSPENDED') {
            return res.status(403).json({
                success: false,
                message: `Your organization's dashboard access has been suspended. Reason: ${ngo.rejection_reason || 'Administrative hold.'} Contact Command HQ.`,
                errorCode: 'ACCOUNT_SUSPENDED'
            });
        }

        if (ngo.status !== 'APPROVED') {
            return res.status(403).json({
                success: false,
                message: 'Access restricted: NGO status must be APPROVED.',
                errorCode: 'ACCESS_RESTRICTED'
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                ngoId: ngo.id,
                email: user.email,
                name: user.full_name,
                organization: ngo.name,
                role: 'NGO'
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logAction({
            userId: user.id,
            userRole: 'NGO',
            action: 'NGO_LOGIN',
            entityType: 'NGO',
            entityId: ngo.id,
            details: `Coordinator ${user.full_name} logged into NGO Portal for ${ngo.name}`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Authenticated successfully to NGO Relief Dashboard.',
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.full_name,
                    email: user.email,
                    role: 'NGO'
                },
                ngo: {
                    id: ngo.id,
                    name: ngo.name,
                    darpanId: ngo.darpan_id,
                    operationalAreas: ngo.operational_areas,
                    servicesOffered: ngo.services_offered,
                    status: ngo.status
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 3. NGO DIRECTORY & APPLICATION MANAGEMENT (ADMIN / AUTHORITY)
// -------------------------------------------------------------
async function getNgos(req, res, next) {
    try {
        const { status } = req.query;
        let sql = `SELECT * FROM ngos`;
        const params = [];

        if (status) {
            sql += ` WHERE status = ?`;
            params.push(status.toUpperCase());
        }

        sql += ` ORDER BY created_at DESC`;
        const rows = await db.query(sql, params);

        res.json({
            success: true,
            data: {
                total: rows.length,
                ngos: rows
            }
        });
    } catch (err) {
        next(err);
    }
}

async function getNgoById(req, res, next) {
    try {
        const { id } = req.params;

        // If user is NGO, they can only view their own organization
        if (req.user.role === 'NGO' && req.user.ngoId !== id) {
            return res.status(403).json({ success: false, message: 'Forbidden: Cannot access other NGO details.' });
        }

        const ngo = await db.get(`SELECT * FROM ngos WHERE id = ?`, [id]);
        if (!ngo) {
            return res.status(404).json({ success: false, message: 'NGO organization not found.' });
        }

        const inventory = await db.query(`SELECT * FROM ngo_relief_inventory WHERE ngo_id = ?`, [id]);
        const volunteers = await db.query(`SELECT id, full_name, skills, service_areas, availability_status, assigned_task FROM volunteers WHERE ngo_id = ?`, [id]);
        const tasks = await db.query(`SELECT * FROM incident_ngo_assignments WHERE ngo_id = ? ORDER BY created_at DESC`, [id]);

        res.json({
            success: true,
            data: {
                ngo,
                inventory,
                volunteers,
                tasks
            }
        });
    } catch (err) {
        next(err);
    }
}

async function updateNgoStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'];
        const targetStatus = (status || '').toUpperCase();

        if (!validStatuses.includes(targetStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const ngo = await db.get(`SELECT * FROM ngos WHERE id = ?`, [id]);
        if (!ngo) {
            return res.status(404).json({ success: false, message: 'NGO organization not found.' });
        }

        await db.run(
            `UPDATE ngos 
             SET status = ?, 
                 reviewed_by = ?, 
                 reviewed_at = datetime('now'), 
                 rejection_reason = ?, 
                 updated_at = datetime('now')
             WHERE id = ?`,
            [targetStatus, req.user.id, reason || null, id]
        );

        // Update corresponding coordinator user active status
        const isActive = targetStatus === 'APPROVED' ? 1 : 0;
        await db.run(`UPDATE ngo_users SET is_active = ?, updated_at = datetime('now') WHERE ngo_id = ?`, [isActive, id]);

        await logAction({
            userId: req.user.id,
            userRole: req.user.role,
            action: `NGO_${targetStatus}`,
            entityType: 'NGO',
            entityId: id,
            details: `Administrator updated NGO "${ngo.name}" status to ${targetStatus}. Note: ${reason || 'N/A'}`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `NGO status updated to ${targetStatus}.`,
            data: {
                id,
                status: targetStatus,
                reviewedBy: req.user.id,
                reviewedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 4. NGO DASHBOARD (RESTRICTED TO APPROVED NGOS)
// -------------------------------------------------------------
async function getNgoDashboard(req, res, next) {
    try {
        const ngoId = req.user.ngoId;
        if (!ngoId) {
            return res.status(403).json({ success: false, message: 'User is not linked to an NGO organization.' });
        }

        const ngo = await db.get(`SELECT * FROM ngos WHERE id = ?`, [ngoId]);
        if (!ngo) {
            return res.status(404).json({ success: false, message: 'NGO organization not found.' });
        }

        // Assigned relief tasks with joined incident details
        const tasks = await db.query(
            `SELECT 
                t.id as task_id, t.status as task_status, t.requested_services, t.assistance_notes,
                t.people_assisted, t.created_at as assigned_at, t.updated_at as task_updated_at,
                i.id as incident_id, i.category, i.emergency_level, i.count as people_affected,
                i.details, i.latitude, i.longitude, i.readable_address, i.status as incident_status,
                i.ai_verification_summary, i.ai_recommended_assistance
             FROM incident_ngo_assignments t
             JOIN incidents i ON t.incident_id = i.id
             WHERE t.ngo_id = ?
             ORDER BY t.created_at DESC`,
            [ngoId]
        );

        // Relief inventory
        const inventory = await db.query(`SELECT * FROM ngo_relief_inventory WHERE ngo_id = ?`, [ngoId]);

        // Managed volunteers (sanitized)
        const volunteers = await db.query(
            `SELECT id, full_name, skills, service_areas, availability_status, assigned_incident_id, assigned_task
             FROM volunteers 
             WHERE ngo_id = ?`,
            [ngoId]
        );

        // Active Government alerts
        const alerts = await db.query(`SELECT * FROM government_alerts WHERE is_active = 1 ORDER BY effective_from DESC LIMIT 5`);

        // Recent coordination messages
        const messages = await db.query(
            `SELECT m.*, i.category as incident_category
             FROM coordination_messages m
             JOIN incident_ngo_assignments t ON m.incident_id = t.incident_id
             JOIN incidents i ON m.incident_id = i.id
             WHERE t.ngo_id = ?
             ORDER BY m.created_at DESC LIMIT 15`,
            [ngoId]
        );

        res.json({
            success: true,
            data: {
                ngo,
                stats: {
                    totalAssignedTasks: tasks.length,
                    activeTasks: tasks.filter(t => !['COMPLETED', 'DECLINED'].includes(t.task_status)).length,
                    completedTasks: tasks.filter(t => t.task_status === 'COMPLETED').length,
                    totalVolunteers: volunteers.length,
                    availableVolunteers: volunteers.filter(v => v.availability_status === 'AVAILABLE').length,
                    activeAlertsCount: alerts.length
                },
                tasks,
                inventory,
                volunteers,
                alerts,
                messages
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 5. TASK ACCEPTANCE / PROGRESS WORKFLOW
// -------------------------------------------------------------
async function respondToTask(req, res, next) {
    try {
        const { taskId } = req.params;
        const { action, declineReason, notes } = req.body;
        const ngoId = req.user.ngoId;

        const task = await db.get(`SELECT * FROM incident_ngo_assignments WHERE id = ?`, [taskId]);
        if (!task) {
            return res.status(404).json({ success: false, message: 'Assigned task not found.' });
        }

        // Authorization check
        if (req.user.role === 'NGO' && task.ngo_id !== ngoId) {
            return res.status(403).json({ success: false, message: 'Forbidden: You cannot respond to tasks assigned to other organizations.' });
        }

        const normalizedAction = (action || '').toUpperCase();
        if (!['ACCEPT', 'DECLINE'].includes(normalizedAction)) {
            return res.status(400).json({ success: false, message: 'Action must be ACCEPT or DECLINE.' });
        }

        let newStatus = 'UNDER_REVIEW';
        if (normalizedAction === 'DECLINE') {
            if (!declineReason || declineReason.trim().length < 5) {
                return res.status(400).json({ success: false, message: 'A specific reason is required when declining an emergency assistance task.' });
            }
            newStatus = 'DECLINED';
        }

        await db.run(
            `UPDATE incident_ngo_assignments 
             SET status = ?, decline_reason = ?, assistance_notes = COALESCE(?, assistance_notes), updated_at = datetime('now')
             WHERE id = ?`,
            [newStatus, declineReason || null, notes || null, taskId]
        );

        // Update incident assistance status
        await db.run(
            `UPDATE incidents 
             SET ngo_assistance_status = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [newStatus, task.incident_id]
        );

        // Append to incident updates timeline
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, 'NGO', ?, ?, ?, datetime('now'))`,
            [
                generateUUID('UPD'),
                task.incident_id,
                req.user.id,
                task.status,
                newStatus,
                normalizedAction === 'ACCEPT' 
                    ? `NGO accepted relief dispatch task: Under Review & Planning.`
                    : `NGO declined relief dispatch task. Reason: ${declineReason}`
            ]
        );

        emitIncidentUpdated({ id: task.incident_id, ngo_assistance_status: newStatus });

        res.json({
            success: true,
            message: `Task ${normalizedAction === 'ACCEPT' ? 'accepted' : 'declined'} successfully.`,
            data: {
                taskId,
                status: newStatus,
                incidentId: task.incident_id
            }
        });
    } catch (err) {
        next(err);
    }
}

async function updateTaskProgress(req, res, next) {
    try {
        const { taskId } = req.params;
        const { status, notes, peopleAssisted } = req.body;
        const ngoId = req.user.ngoId;

        const task = await db.get(`SELECT * FROM incident_ngo_assignments WHERE id = ?`, [taskId]);
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task assignment not found.' });
        }

        if (req.user.role === 'NGO' && task.ngo_id !== ngoId) {
            return res.status(403).json({ success: false, message: 'Forbidden: Access restricted.' });
        }

        const validStatuses = ['Received', 'Under Review', 'Assistance Planned', 'Assistance in Progress', 'Completed'];
        const matchedStatus = validStatuses.find(s => s.toLowerCase() === (status || '').toLowerCase().trim());

        if (!matchedStatus) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const dbStatus = matchedStatus.toUpperCase().replace(/\s+/g, '_');

        await db.run(
            `UPDATE incident_ngo_assignments 
             SET status = ?, 
                 assistance_notes = COALESCE(?, assistance_notes),
                 people_assisted = COALESCE(?, people_assisted),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [dbStatus, notes || null, peopleAssisted !== undefined ? parseInt(peopleAssisted, 10) : null, taskId]
        );

        await db.run(
            `UPDATE incidents 
             SET ngo_assistance_status = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [dbStatus, task.incident_id]
        );

        // Timeline entry
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, 'NGO', ?, ?, ?, datetime('now'))`,
            [
                generateUUID('UPD'),
                task.incident_id,
                req.user.id,
                task.status,
                dbStatus,
                `NGO Relief Update: Status changed to "${matchedStatus}". ${notes ? 'Notes: ' + notes : ''}`
            ]
        );

        emitIncidentUpdated({ id: task.incident_id, ngo_assistance_status: dbStatus });

        res.json({
            success: true,
            message: `Relief task progress updated to "${matchedStatus}".`,
            data: {
                taskId,
                status: dbStatus,
                peopleAssisted: peopleAssisted || task.people_assisted,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 6. AUTHORITY ASSIGN INCIDENT TO NGO
// -------------------------------------------------------------
async function assignIncidentToNgo(req, res, next) {
    try {
        const { incidentId, ngoId, requestedServices, notes } = req.body;

        if (!incidentId || !ngoId) {
            return res.status(400).json({
                success: false,
                message: 'incidentId and ngoId are required.'
            });
        }

        const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found.' });
        }

        const ngo = await db.get(`SELECT * FROM ngos WHERE id = ?`, [ngoId]);
        if (!ngo) {
            return res.status(404).json({ success: false, message: 'NGO organization not found.' });
        }

        if (ngo.status !== 'APPROVED') {
            return res.status(400).json({
                success: false,
                message: `Cannot assign tasks to NGO with status "${ngo.status}". Only APPROVED NGOs can accept emergency tasks.`
            });
        }

        const taskId = generateUUID('TASK');
        const servicesStr = Array.isArray(requestedServices) ? JSON.stringify(requestedServices) : (requestedServices || JSON.stringify(['FOOD_RATIONS', 'FIRST_AID']));

        await db.run(
            `INSERT INTO incident_ngo_assignments (id, incident_id, ngo_id, assigned_by_role, assigned_by_id, requested_services, status, assistance_notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, datetime('now'), datetime('now'))`,
            [taskId, incidentId, ngoId, req.user.role, req.user.id, servicesStr, notes || 'Relief assistance requested by Command HQ']
        );

        await db.run(
            `UPDATE incidents 
             SET assigned_ngo_id = ?, ngo_assistance_status = 'ASSIGNED', updated_at = datetime('now')
             WHERE id = ?`,
            [ngoId, incidentId]
        );

        // Timeline entry
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, ?, ?, 'NGO_ASSIGNED', ?, datetime('now'))`,
            [
                generateUUID('UPD'),
                incidentId,
                req.user.id,
                req.user.role,
                incident.status,
                `Assigned to NGO partner "${ngo.name}" for collaborative relief assistance.`
            ]
        );

        await logAction({
            userId: req.user.id,
            userRole: req.user.role,
            action: 'NGO_TASK_ASSIGNED',
            entityType: 'INCIDENT',
            entityId: incidentId,
            details: `Incident ${incidentId} assigned to NGO ${ngo.name}`,
            ipAddress: req.ip
        });

        emitIncidentUpdated({ id: incidentId, assigned_ngo_id: ngoId, ngo_assistance_status: 'ASSIGNED' });

        res.status(201).json({
            success: true,
            message: `Incident successfully assigned to ${ngo.name}.`,
            data: {
                taskId,
                incidentId,
                ngoId,
                ngoName: ngo.name,
                status: 'ASSIGNED'
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 7. VOLUNTEER ROSTER MANAGEMENT
// -------------------------------------------------------------
async function getVolunteers(req, res, next) {
    try {
        const ngoId = req.user.role === 'NGO' ? req.user.ngoId : req.query.ngoId;
        let sql = `SELECT * FROM volunteers`;
        const params = [];

        if (ngoId) {
            sql += ` WHERE ngo_id = ?`;
            params.push(ngoId);
        }

        sql += ` ORDER BY created_at DESC`;
        const rows = await db.query(sql, params);

        // Privacy protection: Redact precise phone and email if viewer lacks permission
        const sanitized = rows.map(v => {
            const isAuthorized = req.user.role === 'ADMIN' || (req.user.role === 'NGO' && req.user.ngoId === v.ngo_id);
            return {
                id: v.id,
                ngoId: v.ngo_id,
                fullName: v.full_name,
                skills: v.skills,
                serviceAreas: v.service_areas,
                availabilityStatus: v.availability_status,
                assignedIncidentId: v.assigned_incident_id,
                assignedTask: v.assigned_task,
                authorizedBy: v.authorized_by,
                phone: isAuthorized ? v.phone : '***-***-**** (Protected)',
                email: isAuthorized ? v.email : '***@protected.org',
                createdAt: v.created_at
            };
        });

        res.json({
            success: true,
            data: {
                total: sanitized.length,
                volunteers: sanitized
            }
        });
    } catch (err) {
        next(err);
    }
}

async function addVolunteer(req, res, next) {
    try {
        const ngoId = req.user.ngoId;
        if (!ngoId) {
            return res.status(403).json({ success: false, message: 'User is not linked to an NGO organization.' });
        }

        const { fullName, name, phone, email, skills, serviceAreas } = req.body;
        const fName = (fullName || name || '').trim();
        const fPhone = (phone || '').trim();
        const fEmail = email ? email.trim() : null;
        const fSkills = Array.isArray(skills) ? skills.join(', ') : (skills ? String(skills).trim() : '');
        const fAreas = Array.isArray(serviceAreas) ? serviceAreas.join(', ') : (serviceAreas ? String(serviceAreas).trim() : '');

        if (!fName || !fPhone || !fSkills || !fAreas) {
            return res.status(400).json({
                success: false,
                message: 'Full name, phone, skills, and service areas are required.'
            });
        }

        const volId = generateUUID('VOL');

        await db.run(
            `INSERT INTO volunteers (id, ngo_id, full_name, phone, email, skills, service_areas, availability_status, authorized_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, datetime('now'), datetime('now'))`,
            [volId, ngoId, fName, fPhone, fEmail, fSkills, fAreas, req.user.name || 'Coordinator']
        );

        res.status(201).json({
            success: true,
            message: 'Volunteer added to organization roster.',
            data: {
                id: volId,
                fullName: fName,
                skills: fSkills,
                serviceAreas: fAreas,
                availabilityStatus: 'AVAILABLE'
            }
        });
    } catch (err) {
        next(err);
    }
}

async function updateVolunteerAssignment(req, res, next) {
    try {
        const { id } = req.params;
        const { availabilityStatus, assignedIncidentId, assignedTask } = req.body;
        const ngoId = req.user.ngoId;

        const vol = await db.get(`SELECT * FROM volunteers WHERE id = ?`, [id]);
        if (!vol) {
            return res.status(404).json({ success: false, message: 'Volunteer not found.' });
        }

        if (req.user.role === 'NGO' && vol.ngo_id !== ngoId) {
            return res.status(403).json({ success: false, message: 'Forbidden: Cannot modify volunteers from other organizations.' });
        }

        await db.run(
            `UPDATE volunteers 
             SET availability_status = COALESCE(?, availability_status),
                 assigned_incident_id = ?,
                 assigned_task = ?,
                 authorized_by = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                availabilityStatus || null,
                assignedIncidentId || null,
                assignedTask || null,
                req.user.name,
                id
            ]
        );

        res.json({
            success: true,
            message: 'Volunteer assignment updated.',
            data: {
                id,
                availabilityStatus: availabilityStatus || vol.availability_status,
                assignedIncidentId: assignedIncidentId || null,
                assignedTask: assignedTask || null
            }
        });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 8. RELIEF INVENTORY & SUPPLIES
// -------------------------------------------------------------
async function getNgoInventory(req, res, next) {
    try {
        const ngoId = req.user.role === 'NGO' ? req.user.ngoId : req.params.ngoId;
        const items = await db.query(`SELECT * FROM ngo_relief_inventory WHERE ngo_id = ?`, [ngoId]);
        res.json({ success: true, data: { inventory: items } });
    } catch (err) {
        next(err);
    }
}

async function updateNgoInventory(req, res, next) {
    try {
        const ngoId = req.user.ngoId;
        const { resourceType, resourceName, availableQuantity, unitMeasure, locationHub } = req.body;

        if (!resourceType || !resourceName || availableQuantity === undefined) {
            return res.status(400).json({ success: false, message: 'resourceType, resourceName, and availableQuantity are required.' });
        }

        const existing = await db.get(
            `SELECT id FROM ngo_relief_inventory WHERE ngo_id = ? AND resource_type = ?`,
            [ngoId, resourceType]
        );

        if (existing) {
            await db.run(
                `UPDATE ngo_relief_inventory 
                 SET resource_name = ?, available_quantity = ?, unit_measure = COALESCE(?, unit_measure), location_hub = COALESCE(?, location_hub), updated_at = datetime('now')
                 WHERE id = ?`,
                [resourceName, parseInt(availableQuantity, 10), unitMeasure, locationHub, existing.id]
            );
        } else {
            const invId = generateUUID('NGO_INV');
            await db.run(
                `INSERT INTO ngo_relief_inventory (id, ngo_id, resource_type, resource_name, available_quantity, unit_measure, location_hub, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                [invId, ngoId, resourceType, resourceName, parseInt(availableQuantity, 10), unitMeasure || 'units', locationHub || 'Local Depot']
            );
        }

        res.json({ success: true, message: 'Relief inventory updated successfully.' });
    } catch (err) {
        next(err);
    }
}

// -------------------------------------------------------------
// 9. INTER-AGENCY COORDINATION MESSAGES
// -------------------------------------------------------------
async function getCoordinationMessages(req, res, next) {
    try {
        const { incidentId } = req.params;
        const messages = await db.query(
            `SELECT * FROM coordination_messages WHERE incident_id = ? ORDER BY created_at ASC`,
            [incidentId]
        );
        res.json({ success: true, data: { messages } });
    } catch (err) {
        next(err);
    }
}

async function sendCoordinationMessage(req, res, next) {
    try {
        const { incidentId } = req.params;
        const { message, isUrgent, recipientRole } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Message content is required.' });
        }

        const msgId = generateUUID('MSG');
        await db.run(
            `INSERT INTO coordination_messages (id, incident_id, sender_id, sender_role, sender_name, recipient_role, message, is_urgent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                msgId,
                incidentId,
                req.user.id,
                req.user.role,
                req.user.name || req.user.username || 'Coordinator',
                recipientRole || 'ALL',
                message.trim(),
                isUrgent ? 1 : 0
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Coordination message posted.',
            data: {
                id: msgId,
                incidentId,
                senderRole: req.user.role,
                senderName: req.user.name || req.user.username,
                message: message.trim(),
                isUrgent: isUrgent ? 1 : 0,
                createdAt: new Date().toISOString()
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    registerNgo,
    loginNgo,
    getNgos,
    getNgoById,
    updateNgoStatus,
    getNgoDashboard,
    respondToTask,
    updateTaskProgress,
    assignIncidentToNgo,
    getVolunteers,
    addVolunteer,
    updateVolunteerAssignment,
    getNgoInventory,
    updateNgoInventory,
    getCoordinationMessages,
    sendCoordinationMessage
};
