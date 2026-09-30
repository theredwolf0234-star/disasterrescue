const db = require('../config/database');

// GET /api/notifications
async function getNotifications(req, res, next) {
    try {
        const role = req.user ? req.user.role : 'ALL';
        const userId = req.user ? req.user.id : null;

        let queryStr = `SELECT * FROM notifications WHERE (recipient_role = 'ALL' OR recipient_role = ?`;
        const params = [role];

        if (userId) {
            queryStr += ` OR user_id = ?`;
            params.push(userId);
        }
        queryStr += `) ORDER BY created_at DESC LIMIT 50`;

        const notifications = await db.query(queryStr, params);

        res.json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/notifications/:id/read
async function markNotificationAsRead(req, res, next) {
    try {
        const { id } = req.params;
        await db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id]);

        res.json({
            success: true,
            message: 'Notification marked as read.'
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getNotifications,
    markNotificationAsRead
};
