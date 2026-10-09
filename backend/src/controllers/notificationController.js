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

// POST /api/notifications/subscribe
async function subscribePush(req, res, next) {
    try {
        const { generateUUID } = require('../utils/idGenerator');
        const { subscription, token, role } = req.body;
        const userId = req.user ? req.user.id : null;
        const recipientRole = role || (req.user ? req.user.role : 'CITIZEN');

        const endpoint = (subscription && subscription.endpoint) || token || null;
        const p256dh = subscription && subscription.keys ? subscription.keys.p256dh : null;
        const auth = subscription && subscription.keys ? subscription.keys.auth : null;

        if (!endpoint && !token) {
            return res.status(400).json({
                success: false,
                message: 'Valid push subscription object or device token is required.'
            });
        }

        const id = generateUUID('SUB');
        await db.run(
            `INSERT INTO push_subscriptions (id, user_id, device_token, endpoint, p256dh, auth, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            [id, userId, token || null, endpoint, p256dh, auth]
        );

        res.json({
            success: true,
            message: 'Push subscription registered securely on backend.',
            subscriptionId: id,
            role: recipientRole
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getNotifications,
    markNotificationAsRead,
    subscribePush
};
