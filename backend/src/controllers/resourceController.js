const db = require('../config/database');
const { logAction } = require('../services/auditService');

// GET /api/resources
async function getResources(req, res, next) {
    try {
        const resources = await db.query(`SELECT * FROM resources ORDER BY category ASC`);
        
        // Aggregate high-level summary counters
        const summary = {
            ambulancesAvailable: 0,
            boatsAvailable: 0,
            fireVehiclesAvailable: 0,
            rescueTeamsAvailable: 0,
            medicalKitsAvailable: 0,
            shelterCapacityTotal: 0,
            rationPacksAvailable: 0
        };

        resources.forEach(r => {
            if (r.category === 'AMBULANCE') summary.ambulancesAvailable += r.available_units;
            if (r.category === 'RESCUE_BOAT') summary.boatsAvailable += r.available_units;
            if (r.category === 'FIRE_VEHICLE') summary.fireVehiclesAvailable += r.available_units;
            if (r.category === 'RESCUE_TEAM') summary.rescueTeamsAvailable += r.available_units;
            if (r.category === 'MEDICAL_KIT') summary.medicalKitsAvailable += r.available_units;
            if (r.category === 'SHELTER_BED') summary.shelterCapacityTotal += r.total_units;
            if (r.category === 'RATION_PACK') summary.rationPacksAvailable += r.available_units;
        });

        res.json({
            success: true,
            count: resources.length,
            summary,
            data: resources
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/resources/:id
async function updateResource(req, res, next) {
    try {
        const { id } = req.params;
        const { totalUnits, availableUnits, deployedUnits, locationHub } = req.body;

        const current = await db.get(`SELECT * FROM resources WHERE id = ?`, [id]);
        if (!current) {
            return res.status(404).json({ success: false, message: 'Resource not found.' });
        }

        await db.run(
            `UPDATE resources 
             SET total_units = COALESCE(?, total_units),
                 available_units = COALESCE(?, available_units),
                 deployed_units = COALESCE(?, deployed_units),
                 location_hub = COALESCE(?, location_hub),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                totalUnits !== undefined ? parseInt(totalUnits, 10) : null,
                availableUnits !== undefined ? parseInt(availableUnits, 10) : null,
                deployedUnits !== undefined ? parseInt(deployedUnits, 10) : null,
                locationHub || null,
                id
            ]
        );

        const updated = await db.get(`SELECT * FROM resources WHERE id = ?`, [id]);

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'UPDATE_RESOURCE',
            entityType: 'RESOURCE',
            entityId: id,
            details: { updated },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Resource logistics inventory updated successfully.',
            data: updated
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getResources,
    updateResource
};
