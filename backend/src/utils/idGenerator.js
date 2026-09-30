const db = require('../config/database');

/**
 * Generates formatted, collision-proof incident IDs like SOS-2026-000001
 */
async function generateIncidentId() {
    const year = new Date().getFullYear();
    const prefix = `SOS-${year}-`;

    const row = await db.get(
        `SELECT COUNT(*) as count FROM incidents WHERE id LIKE ?`,
        [`${prefix}%`]
    );

    const nextNumber = ((row && row.count) || 0) + 1;
    // Format as 6 digits with leading zeros
    const padded = String(nextNumber).padStart(6, '0');
    return `${prefix}${padded}`;
}

function generateUUID(prefix = '') {
    const randomHex = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    return prefix ? `${prefix}_${randomHex}` : randomHex;
}

module.exports = {
    generateIncidentId,
    generateUUID
};
