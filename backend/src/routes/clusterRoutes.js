const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', clusterController.getClusters);
router.post('/merge', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), clusterController.mergeCluster);

module.exports = router;
