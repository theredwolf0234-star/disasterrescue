const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), auditController.getAuditLogs);

module.exports = router;
