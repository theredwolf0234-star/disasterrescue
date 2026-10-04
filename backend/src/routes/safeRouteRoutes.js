const express = require('express');
const router = express.Router();
const safeRouteController = require('../controllers/safeRouteController');

router.get('/safe-route', safeRouteController.getSafeRoute);
router.get('/hazards', safeRouteController.getHazardZones);

module.exports = router;
