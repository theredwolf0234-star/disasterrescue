const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', resourceController.getResources);
router.patch('/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), resourceController.updateResource);

module.exports = router;
