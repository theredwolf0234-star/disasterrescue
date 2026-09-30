const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

// Restricted to AUTHORITY and ADMIN roles
router.get('/overview', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), databaseController.getDatabaseOverview);
router.get('/table/:tableName', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), databaseController.getTableData);
router.get('/export/:tableName', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), databaseController.exportTableData);

// Custom safe read-only SQL query runner restricted to ADMIN
router.post('/query', verifyToken, requireRoles(['ADMIN']), databaseController.executeCustomQuery);

module.exports = router;
