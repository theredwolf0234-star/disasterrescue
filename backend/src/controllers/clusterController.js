const { detectIncidentClusters, mergeIncidentsToCluster } = require('../services/clusterService');

// GET /api/clusters
async function getClusters(req, res, next) {
    try {
        const radiusKm = parseFloat(req.query.radiusKm) || 2.0;
        const clusters = await detectIncidentClusters({ radiusKm });
        res.json({
            success: true,
            count: clusters.length,
            data: clusters
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/clusters/merge
async function mergeCluster(req, res, next) {
    try {
        const { incidentIds, clusterName } = req.body;
        const result = await mergeIncidentsToCluster({
            incidentIds,
            clusterName,
            authorityId: req.user ? req.user.id : null
        });

        res.json({
            success: true,
            message: 'Incidents successfully merged into master disaster response cluster.',
            data: result
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getClusters,
    mergeCluster
};
