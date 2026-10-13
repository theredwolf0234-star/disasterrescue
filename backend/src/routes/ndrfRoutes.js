const express = require('express');
const router = express.Router();
const ndrfController = require('../controllers/ndrfController');
const { verifyToken, optionalToken, requireRoles } = require('../middleware/authMiddleware');

// Public/Dashboard status & battalion grid
router.get('/status', optionalToken, ndrfController.getGatewayStatus);
router.get('/battalions', optionalToken, ndrfController.getBattalions);

// Ping test handshake
router.post('/ping', verifyToken, ndrfController.pingGateway);

// Relay emergency incident to NDRF Command EOC
router.post('/relay/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), ndrfController.relayIncident);

// Retrieve NDRF CAD transmissions
router.get('/transmissions', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), ndrfController.getTransmissions);
router.get('/transmissions/:incidentId', verifyToken, ndrfController.getTransmissions);

// Download / Inspect Common Alerting Protocol (CAP v1.2) XML/JSON
router.get('/cap/:id', verifyToken, ndrfController.getCapAlert);

// Simulate tactical status progression (e.g. from EOC CAD to scene)
router.post('/simulate-update/:cadId', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), ndrfController.simulateStatusUpdate);

module.exports = router;
