const express = require('express');
const router = express.Router();
const alertController = require('../controllers/governmentAlertController');
const { verifyToken, optionalToken, requireRoles } = require('../middleware/authMiddleware');

// Public route to view authorized active disaster warnings
router.get('/', optionalToken, alertController.getAlerts);

// Query alerts matching a specific coordinate
router.get('/match', optionalToken, alertController.matchAlerts);

// Force refresh / sync NDMA SACHET feed (Authority / Admin)
router.post('/sync', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), alertController.triggerSync);

// Publish official emergency warning notice (Authority / Admin)
router.post('/', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), alertController.createAlert);

module.exports = router;
