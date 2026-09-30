const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { logAction } = require('../services/auditService');

// Citizen Registration
async function registerCitizen(req, res, next) {
    try {
        const { fullName, email, password, phone, emergencyPhone, bloodGroup } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Full name, email, and password are required fields.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists
        const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]);
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email address already exists.',
                errorCode: 'USER_EXISTS'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = generateUUID('USR');

        await db.run(
            `INSERT INTO users (id, full_name, email, password_hash, phone, emergency_phone, blood_group, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'CITIZEN', datetime('now'), datetime('now'))`,
            [userId, fullName.trim(), normalizedEmail, passwordHash, phone || null, emergencyPhone || null, bloodGroup || 'O+ Positive']
        );

        const token = jwt.sign(
            { id: userId, email: normalizedEmail, role: 'CITIZEN', name: fullName.trim() },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Citizen account registered successfully.',
            data: {
                token,
                user: {
                    id: userId,
                    fullName: fullName.trim(),
                    email: normalizedEmail,
                    phone: phone || null,
                    emergencyPhone: emergencyPhone || null,
                    bloodGroup: bloodGroup || 'O+ Positive',
                    role: 'CITIZEN'
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

// Citizen Login
async function loginCitizen(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role || 'CITIZEN', name: user.full_name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Citizen logged in successfully.',
            data: {
                token,
                user: {
                    id: user.id,
                    fullName: user.full_name,
                    email: user.email,
                    phone: user.phone,
                    emergencyPhone: user.emergency_phone,
                    bloodGroup: user.blood_group,
                    role: user.role || 'CITIZEN'
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

// Authority Login
async function loginAuthority(req, res, next) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Authority username and password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const authUser = await db.get(
            `SELECT * FROM authority_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(badge_number) = LOWER(?)`,
            [username.trim(), username.trim(), username.trim()]
        );

        if (!authUser) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authority credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const match = await bcrypt.compare(password, authUser.password_hash);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authority credentials.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        const token = jwt.sign(
            {
                id: authUser.id,
                username: authUser.username,
                role: authUser.role || 'AUTHORITY',
                organization: authUser.organization,
                badgeNumber: authUser.badge_number
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await logAction({
            userId: authUser.id,
            userRole: authUser.role || 'AUTHORITY',
            action: 'AUTHORITY_LOGIN',
            entityType: 'AUTH',
            entityId: authUser.id,
            details: `Authority ${authUser.username} logged into Command HQ`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Authority authenticated successfully.',
            data: {
                token,
                user: {
                    id: authUser.id,
                    username: authUser.username,
                    email: authUser.email,
                    badgeNumber: authUser.badge_number,
                    organization: authUser.organization,
                    role: authUser.role || 'AUTHORITY'
                }
            }
        });
    } catch (err) {
        next(err);
    }
}

// Get current profile
async function getMe(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        if (req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN') {
            const authUser = await db.get(
                `SELECT id, username, email, badge_number, organization, role, created_at FROM authority_users WHERE id = ?`,
                [req.user.id]
            );
            if (!authUser) {
                return res.status(404).json({ success: false, message: 'Authority user not found.' });
            }
            return res.json({ success: true, data: { user: authUser } });
        } else {
            const user = await db.get(
                `SELECT id, full_name, email, phone, emergency_phone, blood_group, role, created_at FROM users WHERE id = ?`,
                [req.user.id]
            );
            if (!user) {
                return res.status(404).json({ success: false, message: 'Citizen user not found.' });
            }
            return res.json({ success: true, data: { user } });
        }
    } catch (err) {
        next(err);
    }
}

// Update Citizen Profile
async function updateProfile(req, res, next) {
    try {
        if (!req.user || req.user.role !== 'CITIZEN') {
            return res.status(403).json({ success: false, message: 'Only citizen users can update citizen profile.' });
        }

        const { fullName, phone, emergencyPhone, bloodGroup } = req.body;

        await db.run(
            `UPDATE users 
             SET full_name = COALESCE(?, full_name),
                 phone = COALESCE(?, phone),
                 emergency_phone = COALESCE(?, emergency_phone),
                 blood_group = COALESCE(?, blood_group),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [fullName || null, phone || null, emergencyPhone || null, bloodGroup || null, req.user.id]
        );

        const updated = await db.get(
            `SELECT id, full_name, email, phone, emergency_phone, blood_group, role, updated_at FROM users WHERE id = ?`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully.',
            data: { user: updated }
        });
    } catch (err) {
        next(err);
    }
}

// Logout
function logout(req, res) {
    res.json({
        success: true,
        message: 'Logged out successfully.'
    });
}

module.exports = {
    registerCitizen,
    loginCitizen,
    loginAuthority,
    getMe,
    updateProfile,
    logout
};
