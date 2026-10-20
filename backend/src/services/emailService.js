/**
 * Email Service for Password Recovery and Emergency Notifications
 * Supports live SMTP delivery when configured via environment variables.
 * If SMTP is unconfigured, reports honest configuration status rather than false success.
 */
const nodemailer = require('nodemailer');

function isEmailConfigured() {
    return Boolean(
        process.env.SMTP_HOST &&
        (process.env.SMTP_USER || process.env.SMTP_PASS || process.env.SMTP_PORT)
    );
}

function getTransporter() {
    if (!isEmailConfigured()) {
        return null;
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const config = {
        host,
        port,
        secure,
        auth: (user && pass) ? { user, pass } : undefined,
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
    };

    return nodemailer.createTransport(config);
}

/**
 * Sends password reset email with secure token/link.
 * @param {object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.resetCode - 6-digit verification code
 * @param {string} options.resetToken - Raw cryptographic token
 * @param {string} [options.recipientName] - User's name
 * @param {string} [options.userType] - 'CITIZEN' | 'AUTHORITY'
 * @returns {Promise<{ delivered: boolean, configured: boolean, messageId?: string, error?: string }>}
 */
async function sendPasswordResetEmail({ to, resetCode, resetToken, recipientName = 'User', userType = 'CITIZEN' }) {
    if (!isEmailConfigured()) {
        return {
            delivered: false,
            configured: false,
            error: 'EMAIL_SERVICE_NOT_CONFIGURED',
            message: 'Email delivery service setup is required. SMTP server credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) are not configured on this server.'
        };
    }

    const transporter = getTransporter();
    const fromAddress = process.env.SMTP_FROM || 'AISTER Emergency Command <no-reply@aister-rescue.gov.in>';
    const appBaseUrl = process.env.APP_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://disaster-rescuecoordinator.onrender.com' : 'http://localhost:5000');
    const resetUrl = `${appBaseUrl}/index.html?reset_token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(to)}`;

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0B0F19; color: #f1f5f9; padding: 24px; border-radius: 16px; border: 1px solid #7c3aed;">
            <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
                <h1 style="color: #ffffff; font-size: 22px; font-weight: 900; margin: 0;">RESCUE<span style="color: #a855f7;">AI</span></h1>
                <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">AI Disaster Rescue Coordinator Platform</p>
            </div>
            <div style="padding: 12px 0;">
                <h2 style="color: #ffffff; font-size: 16px; margin-top: 0;">Password Recovery Request</h2>
                <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">Hello ${recipientName},</p>
                <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">A request was received to reset your password for your <strong>${userType}</strong> account on the AISTER Disaster Rescue Coordinator system.</p>
                
                <div style="background: #1e1b4b; border: 1px solid #6366f1; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
                    <span style="display: block; font-size: 11px; text-transform: uppercase; color: #c7d2fe; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px;">Your 6-Digit Single-Use Recovery Code</span>
                    <strong style="display: block; font-size: 32px; font-family: monospace; letter-spacing: 6px; color: #38bdf8;">${resetCode}</strong>
                    <span style="display: block; font-size: 10px; color: #94a3b8; margin-top: 6px;">Valid for 30 minutes. Single-use only.</span>
                </div>

                <div style="text-align: center; margin: 20px 0;">
                    <a href="${resetUrl}" style="background: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block;">
                        Reset Password Directly Online →
                    </a>
                </div>

                <p style="color: #94a3b8; font-size: 11px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 12px;">
                    Security Note: If you did not initiate this request, your account credentials remain unchanged. You may safely disregard this message. Never share this code with anyone.
                </p>
            </div>
        </div>
    `;

    const textContent = `
RESCUE AI — AI Disaster Rescue Coordinator
Password Recovery Request for ${recipientName} (${userType})

Your 6-digit recovery code: ${resetCode}
This code will expire in 30 minutes.

Direct reset link: ${resetUrl}

If you did not request this password recovery, please ignore this email.
    `;

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject: 'AISTER — Password Recovery Verification Code',
            text: textContent,
            html: htmlContent
        });

        return {
            delivered: true,
            configured: true,
            messageId: info.messageId
        };
    } catch (sendErr) {
        console.error('[EmailService] SMTP send error:', sendErr.message);
        return {
            delivered: false,
            configured: true,
            error: 'SMTP_DELIVERY_FAILED',
            message: `Email transmission failed: ${sendErr.message}`
        };
    }
}

module.exports = {
    isEmailConfigured,
    sendPasswordResetEmail
};
