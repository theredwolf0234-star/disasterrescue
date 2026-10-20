const db = require('../config/database');
const { evaluateDisasterRisk } = require('../services/riskEngine');

// POST /api/risk/evaluate
async function evaluateRisk(req, res, next) {
    try {
        const category = req.body.category || req.body.disasterType || req.body.disaster_type || 'General Emergency';
        const count = req.body.count !== undefined ? req.body.count : (req.body.peopleAffected !== undefined ? req.body.peopleAffected : (req.body.people_affected || 1));
        const { details, weather } = req.body;
        const location = req.body.location || (req.body.latitude !== undefined ? { latitude: req.body.latitude, longitude: req.body.longitude } : null);
        const evaluation = evaluateDisasterRisk({
            category,
            count,
            details,
            weather,
            location
        });

        res.json({
            success: true,
            data: evaluation
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/risk/:incidentId
async function getIncidentRisk(req, res, next) {
    try {
        const { incidentId } = req.params;
        const existing = await db.get(`SELECT * FROM risk_analysis WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1`, [incidentId]);

        if (existing) {
            let factors = {};
            try { factors = JSON.parse(existing.factors_json); } catch (e) {}
            return res.json({
                success: true,
                data: {
                    ...existing,
                    factors
                }
            });
        }

        // Otherwise generate on the fly
        const inc = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
        if (!inc) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const evaluation = evaluateDisasterRisk({
            category: inc.category,
            count: inc.count,
            details: inc.details,
            location: { latitude: inc.latitude, longitude: inc.longitude }
        });

        res.json({
            success: true,
            data: evaluation
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    evaluateRisk,
    getIncidentRisk
};
