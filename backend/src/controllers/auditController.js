const { getRecentLogs } = require('../services/auditService');

// GET /api/audit-logs
async function getAuditLogs(req, res, next) {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const logs = await getRecentLogs(limit);

        res.json({
            success: true,
            count: logs.length,
            data: logs
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAuditLogs
};
