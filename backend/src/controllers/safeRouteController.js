const { calculateSafeRoute, HAZARD_ZONES } = require('../services/safeRouteService');

// GET /api/routes/safe-route
async function getSafeRoute(req, res, next) {
    try {
        const { originLat, originLng, destLat, destLng, teamId, incidentId } = req.query;

        const route = await calculateSafeRoute({
            originLat,
            originLng,
            destLat,
            destLng,
            teamId,
            incidentId
        });

        res.json({
            success: true,
            data: route,
            ...route
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/routes/hazards
function getHazardZones(req, res) {
    res.json({
        success: true,
        count: HAZARD_ZONES.length,
        data: HAZARD_ZONES
    });
}

module.exports = {
    getSafeRoute,
    getHazardZones
};
