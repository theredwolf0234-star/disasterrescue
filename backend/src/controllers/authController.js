const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { logAction } = require('../services/auditService');
const emailService = require('../services/emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

// Citizen Registration
async function registerCitizen(req, res, next) {
    try {
        const { fullName, email, password, phone, emergencyPhone, bloodGroup, avatarUrl, languagePref, notificationPrefs } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Full name, email, and password are required fields.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address format.',
                errorCode: 'INVALID_EMAIL'
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters in length.',
                errorCode: 'WEAK_PASSWORD'
            });
        }

        let normalizedPhone = null;
        if (phone && String(phone).trim()) {
            const cleanPhone = String(phone).replace(/[\s\-()]/g, '');
            if (!PHONE_REGEX.test(cleanPhone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid phone number (7-15 digits).',
                    errorCode: 'INVALID_PHONE'
                });
            }
            normalizedPhone = cleanPhone;

            // Check if phone number is already registered
            const existingPhone = await db.get(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone]);
            if (existingPhone) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this phone number is already registered.',
                    errorCode: 'PHONE_EXISTS'
                });
            }
        }

        // Check if user with email already exists
        const existing = await db.get(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`, [normalizedEmail]);
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email address already exists.',
                errorCode: 'USER_EXISTS'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = generateUUID('USR');
        const notifPrefsStr = typeof notificationPrefs === 'object' ? JSON.stringify(notificationPrefs) : (notificationPrefs || '{"sms":true,"push":true,"email":true}');

        // Security: Strictly enforce role 'CITIZEN' to prevent privilege escalation
        await db.run(
            `INSERT INTO users (id, full_name, email, password_hash, phone, emergency_phone, blood_group, role, avatar_url, language_pref, notification_prefs, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'CITIZEN', ?, ?, ?, datetime('now'), datetime('now'))`,
            [
                userId,
                fullName.trim(),
                normalizedEmail,
                passwordHash,
                normalizedPhone,
                emergencyPhone ? String(emergencyPhone).trim() : null,
                bloodGroup || 'O+ Positive',
                avatarUrl || null,
                languagePref || 'en',
                notifPrefsStr
            ]
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
                    phone: normalizedPhone,
                    emergencyPhone: emergencyPhone ? String(emergencyPhone).trim() : null,
                    bloodGroup: bloodGroup || 'O+ Positive',
                    avatarUrl: avatarUrl || null,
                    languagePref: languagePref || 'en',
                    notificationPrefs: notifPrefsStr,
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
        const email = req.body.email || req.body.identifier || req.body.username;
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const user = await db.get(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`, [normalizedEmail]);

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
                    avatarUrl: user.avatar_url || null,
                    languagePref: user.language_pref || 'en',
                    notificationPrefs: user.notification_prefs || '{"sms":true,"push":true,"email":true}',
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
                message: 'Authority username/badge and password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const cleanUser = String(username).trim();
        const authUser = await db.get(
            `SELECT * FROM authority_users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(badge_number) = LOWER(?)`,
            [cleanUser, cleanUser, cleanUser]
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

        if (req.user.role === 'AUTHORITY' || req.user.role === 'ADMIN' || req.user.role === 'RESPONDER') {
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
                `SELECT id, full_name, email, phone, emergency_phone, blood_group, role, avatar_url, language_pref, notification_prefs, created_at FROM users WHERE id = ?`,
                [req.user.id]
            );
            if (!user) {
                return res.status(404).json({ success: false, message: 'Citizen user not found.' });
            }
            return res.json({
                success: true,
                data: {
                    user: {
                        ...user,
                        avatarUrl: user.avatar_url || null,
                        languagePref: user.language_pref || 'en',
                        notificationPrefs: user.notification_prefs || '{"sms":true,"push":true,"email":true}'
                    }
                }
            });
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

        const { fullName, phone, emergencyPhone, bloodGroup, avatarUrl, languagePref, notificationPrefs } = req.body;
        const notifPrefsVal = notificationPrefs !== undefined 
            ? (typeof notificationPrefs === 'object' ? JSON.stringify(notificationPrefs) : String(notificationPrefs))
            : null;

        await db.run(
            `UPDATE users 
             SET full_name = COALESCE(?, full_name),
                 phone = COALESCE(?, phone),
                 emergency_phone = COALESCE(?, emergency_phone),
                 blood_group = COALESCE(?, blood_group),
                 avatar_url = COALESCE(?, avatar_url),
                 language_pref = COALESCE(?, language_pref),
                 notification_prefs = COALESCE(?, notification_prefs),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                fullName || null,
                phone || null,
                emergencyPhone || null,
                bloodGroup || null,
                avatarUrl || null,
                languagePref || null,
                notifPrefsVal,
                req.user.id
            ]
        );

        const updated = await db.get(
            `SELECT id, full_name, email, phone, emergency_phone, blood_group, role, avatar_url, language_pref, notification_prefs, updated_at FROM users WHERE id = ?`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully.',
            data: {
                user: {
                    ...updated,
                    avatarUrl: updated.avatar_url,
                    languagePref: updated.language_pref,
                    notificationPrefs: updated.notification_prefs
                }
            }
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

// DELETE /api/auth/account
async function deleteAccount(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token required.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        if (req.user.role !== 'CITIZEN') {
            return res.status(403).json({
                success: false,
                message: 'Authority and Admin accounts cannot be deleted through citizen self-service. Please contact Central Administration.',
                errorCode: 'FORBIDDEN'
            });
        }

        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password confirmation is required to delete your account.',
                errorCode: 'PASSWORD_REQUIRED'
            });
        }

        const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User account not found.',
                errorCode: 'NOT_FOUND'
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password. Account deletion aborted.',
                errorCode: 'INVALID_CREDENTIALS'
            });
        }

        // Anonymize user reference on operational emergency incidents
        await db.run(
            `UPDATE incidents 
             SET user_id = 'DELETED_CITIZEN' 
             WHERE user_id = ?`,
            [user.id]
        );

        try {
            await db.run(`DELETE FROM push_subscriptions WHERE user_id = ?`, [user.id]);
        } catch (e) {}

        await db.run(`DELETE FROM users WHERE id = ?`, [user.id]);

        await logAction({
            userId: user.id,
            userRole: 'CITIZEN',
            action: 'CITIZEN_ACCOUNT_DELETED',
            entityType: 'USER',
            entityId: user.id,
            details: 'Citizen requested account deletion. Personal data purged; operational incident records anonymized.',
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Your citizen account and personal data have been permanently deleted. Emergency operational incident records have been anonymized.',
            errorCode: 'ACCOUNT_DELETED'
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/forgot-password - Generate expiring password reset token
async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;
        if (!email || !EMAIL_REGEX.test(String(email).trim())) {
            return res.status(400).json({
                success: false,
                message: 'A valid email address is required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const isEmailSetup = emailService.isEmailConfigured();
        const isTestEnv = process.env.NODE_ENV === 'test' || process.env.ALLOW_DEV_RESET_CODE === 'true';

        // Check if email delivery is configured. If not configured and not in test mode, report honestly.
        if (!isEmailSetup && !isTestEnv) {
            return res.status(503).json({
                success: false,
                emailConfigured: false,
                message: 'Password recovery email delivery service setup is required. SMTP configuration (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) is not configured on this server.',
                errorCode: 'EMAIL_SERVICE_NOT_CONFIGURED'
            });
        }

        // Check if citizen or authority user exists
        let user = await db.get(`SELECT id, full_name as name, 'CITIZEN' as user_type FROM users WHERE LOWER(email) = LOWER(?)`, [normalizedEmail]);
        if (!user) {
            user = await db.get(`SELECT id, username as name, 'AUTHORITY' as user_type FROM authority_users WHERE LOWER(email) = LOWER(?)`, [normalizedEmail]);
        }

        // Generate 6-digit numeric OTP code and cryptographically secure reset token
        const resetCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const codeHash = crypto.createHash('sha256').update(resetCode).digest('hex');
        const resetId = generateUUID('RST');
        // Token expires in 30 minutes
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        if (user) {
            // Invalidate any older unused reset tokens for this email
            await db.run(`UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0`, [normalizedEmail]);

            // Store reset record with both raw code and SHA-256 hash for secure verification
            await db.run(
                `INSERT INTO password_resets (id, user_id, user_type, email, token, token_hash, code_hash, expires_at, used, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
                [resetId, user.id, user.user_type, normalizedEmail, resetCode, tokenHash, codeHash, expiresAt]
            );

            // Attempt email dispatch if email service is configured
            if (isEmailSetup) {
                await emailService.sendPasswordResetEmail({
                    to: normalizedEmail,
                    resetCode,
                    resetToken: rawToken,
                    recipientName: user.name,
                    userType: user.user_type
                });
            }

            await logAction({
                userId: user.id,
                userRole: user.user_type,
                action: 'PASSWORD_RESET_REQUESTED',
                entityType: 'AUTH',
                entityId: user.id,
                details: `Password reset verification token generated for ${normalizedEmail}`,
                ipAddress: req.ip
            });
        }

        // Never reveal whether the email exists in production
        // In test mode, return test code so automated testing can verify token acceptance
        const responseData = {
            email: normalizedEmail,
            emailConfigured: isEmailSetup,
            expiresAt
        };

        if (isTestEnv && user) {
            responseData.resetCode = resetCode;
            responseData.resetToken = rawToken;
        }

        res.json({
            success: true,
            emailConfigured: isEmailSetup,
            message: 'If this email is registered in our disaster coordinator system, a recovery link and verification code have been transmitted.',
            data: responseData
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/verify-reset-token - Validate token
async function verifyResetToken(req, res, next) {
    try {
        const { email, token } = req.body;
        if (!email || !token) {
            return res.status(400).json({
                success: false,
                message: 'Email and reset token/code are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const normalizedEmail = String(email).toLowerCase().trim();
        const cleanToken = String(token).trim();
        const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

        // Look up by matching token directly, or matching token_hash / code_hash
        const resetRecord = await db.get(
            `SELECT * FROM password_resets 
             WHERE email = ? 
               AND (token = ? OR token_hash = ? OR code_hash = ?) 
               AND used = 0 
             ORDER BY created_at DESC LIMIT 1`,
            [normalizedEmail, cleanToken, tokenHash, tokenHash]
        );

        if (!resetRecord) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or previously used password reset code.',
                errorCode: 'INVALID_TOKEN'
            });
        }

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Password reset code has expired. Please request a new one.',
                errorCode: 'TOKEN_EXPIRED'
            });
        }

        res.json({
            success: true,
            valid: true,
            message: 'Password reset code verified successfully.',
            data: {
                email: normalizedEmail,
                token: cleanToken
            }
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/auth/reset-password - Complete password change
async function resetPassword(req, res, next) {
    try {
        const token = req.body.token || req.body.code;
        const newPassword = req.body.newPassword || req.body.password;
        const rawEmail = req.body.email;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Reset token/code and new password are required.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters in length.',
                errorCode: 'WEAK_PASSWORD'
            });
        }

        const cleanToken = String(token).trim();
        const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

        let resetRecord = null;
        if (rawEmail) {
            const normalizedEmail = String(rawEmail).toLowerCase().trim();
            resetRecord = await db.get(
                `SELECT * FROM password_resets 
                 WHERE email = ? 
                   AND (token = ? OR token_hash = ? OR code_hash = ?) 
                   AND used = 0 
                 ORDER BY created_at DESC LIMIT 1`,
                [normalizedEmail, cleanToken, tokenHash, tokenHash]
            );
        } else {
            resetRecord = await db.get(
                `SELECT * FROM password_resets 
                 WHERE (token = ? OR token_hash = ? OR code_hash = ?) 
                   AND used = 0 
                 ORDER BY created_at DESC LIMIT 1`,
                [cleanToken, tokenHash, tokenHash]
            );
        }

        if (!resetRecord) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired password reset verification code.',
                errorCode: 'INVALID_TOKEN'
            });
        }

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Password reset verification code has expired.',
                errorCode: 'TOKEN_EXPIRED'
            });
        }

        const newHash = await bcrypt.hash(newPassword, 10);

        if (resetRecord.user_type === 'CITIZEN') {
            await db.run(
                `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
                [newHash, resetRecord.user_id]
            );
        } else if (resetRecord.user_type === 'AUTHORITY') {
            await db.run(
                `UPDATE authority_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`,
                [newHash, resetRecord.user_id]
            );
        }

        // Mark reset token as used immediately to prevent token reuse
        await db.run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [resetRecord.id]);

        const targetEmail = resetRecord.email || (rawEmail ? String(rawEmail).toLowerCase().trim() : 'USER');
        await logAction({
            userId: resetRecord.user_id,
            userRole: resetRecord.user_type,
            action: 'PASSWORD_RESET_COMPLETED',
            entityType: 'AUTH',
            entityId: resetRecord.user_id,
            details: `Password successfully updated via verified reset code for ${targetEmail}`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Password has been successfully updated. You may now log in.'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    registerCitizen,
    loginCitizen,
    loginAuthority,
    getMe,
    updateProfile,
    deleteAccount,
    logout,
    forgotPassword,
    verifyResetToken,
    resetPassword
};
