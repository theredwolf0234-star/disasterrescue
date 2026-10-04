const express = require('express');
const router = express.Router();
const riskController = require('../controllers/riskController');

router.post('/evaluate', riskController.evaluateRisk);
router.get('/:incidentId', riskController.getIncidentRisk);

module.exports = router;
