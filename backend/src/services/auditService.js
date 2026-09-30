const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');

async function logAction({ userId, userRole, action, entityType, entityId, details, ipAddress }) {
    try {
        const id = generateUUID('AUDIT');
        await db.run(
            `INSERT INTO audit_logs (id, user_id, user_role, action, entity_type, entity_id, details, ip_address, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                id,
                userId || 'ANONYMOUS',
                userRole || 'CITIZEN',
                action,
                entityType,
                entityId || null,
                typeof details === 'object' ? JSON.stringify(details) : details,
                ipAddress || 'UNKNOWN'
            ]
        );
    } catch (err) {
        console.error('[AuditService] Failed to record audit log:', err.message);
    }
}

async function getRecentLogs(limit = 50) {
    return await db.query(
        `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
        [limit]
    );
}

module.exports = {
    logAction,
    getRecentLogs
};
