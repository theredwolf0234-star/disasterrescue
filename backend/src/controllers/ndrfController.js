const db = require('../config/database');
const ndrfService = require('../services/ndrfService');

// GET /api/ndrf/status
async function getGatewayStatus(req, res, next) {
    try {
        const status = await ndrfService.getNdrfGatewayStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/ndrf/ping
async function pingGateway(req, res, next) {
    try {
        const pingResult = await ndrfService.pingNdrfGateway();
        res.json({
            success: true,
            data: pingResult
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/ndrf/battalions
async function getBattalions(req, res, next) {
    try {
        res.json({
            success: true,
            count: ndrfService.NDRF_BATTALIONS.length,
            data: ndrfService.NDRF_BATTALIONS
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/ndrf/relay/:id
async function relayIncident(req, res, next) {
    try {
        const incidentId = req.params.id;
        const result = await ndrfService.relayIncidentToNdrf(incidentId, {
            relayedBy: req.user ? req.user.username : 'AUTHORITY_COMMANDER'
        });

        res.status(200).json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/ndrf/transmissions
// GET /api/ndrf/transmissions/:incidentId
async function getTransmissions(req, res, next) {
    try {
        const incidentId = req.params.incidentId || req.query.incidentId;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

        let queryStr = `SELECT * FROM ndrf_transmissions`;
        const params = [];

        if (incidentId) {
            queryStr += ` WHERE incident_id = ?`;
            params.push(incidentId);
        }

        queryStr += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const rows = await db.query(queryStr, params);

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/ndrf/cap/:id
async function getCapAlert(req, res, next) {
    try {
        const incidentId = req.params.id;
        const tx = await db.get(
            `SELECT * FROM ndrf_transmissions WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1`,
            [incidentId]
        );

        if (!tx) {
            // Generate on-the-fly CAP if not yet relayed
            const incident = await db.get(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
            if (!incident) {
                return res.status(404).json({ success: false, message: 'Incident not found' });
            }
            const { battalion } = ndrfService.findNearestNdrfBattalion(incident.latitude, incident.longitude, incident.category);
            const generated = ndrfService.generateCapAlert(incident, `PREVIEW-${incident.id}`, battalion);

            if (req.query.format === 'xml') {
                res.setHeader('Content-Type', 'application/xml');
                return res.send(generated.capXml);
            }
            return res.json({
                success: true,
                incidentId,
                preview: true,
                capJson: generated.capJson,
                capXml: generated.capXml
            });
        }

        if (req.query.format === 'xml') {
            res.setHeader('Content-Type', 'application/xml');
            return res.send(tx.cap_alert_xml);
        }

        let parsedJson = null;
        try {
            parsedJson = JSON.parse(tx.cap_alert_json);
        } catch (e) {
            parsedJson = tx.cap_alert_json;
        }

        res.json({
            success: true,
            incidentId,
            cadReferenceId: tx.cad_reference_id,
            status: tx.status,
            battalionName: tx.battalion_name,
            capJson: parsedJson,
            capXml: tx.cap_alert_xml
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/ndrf/simulate-update/:cadId
async function simulateStatusUpdate(req, res, next) {
    try {
        const { cadId } = req.params;
        const { status, notes } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required (e.g., MOBILIZED, EN_ROUTE, ON_SCENE, RESOLVED).' });
        }

        const result = await ndrfService.simulateNdrfStatusProgression(cadId, status, notes);
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getGatewayStatus,
    pingGateway,
    getBattalions,
    relayIncident,
    getTransmissions,
    getCapAlert,
    simulateStatusUpdate
};
