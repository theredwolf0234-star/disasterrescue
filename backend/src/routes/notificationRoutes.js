const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { optionalToken } = require('../middleware/authMiddleware');

router.get('/', optionalToken, notificationController.getNotifications);
router.patch('/:id/read', optionalToken, notificationController.markNotificationAsRead);
router.post('/subscribe', optionalToken, notificationController.subscribePush);

module.exports = router;
