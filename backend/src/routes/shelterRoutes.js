const express = require('express');
const router = express.Router();
const shelterController = require('../controllers/shelterController');
const { verifyToken, requireRoles } = require('../middleware/authMiddleware');

router.get('/', shelterController.getShelters);
router.post('/', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), shelterController.createShelter);
router.patch('/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), shelterController.updateShelter);
router.delete('/:id', verifyToken, requireRoles(['AUTHORITY', 'ADMIN']), shelterController.deleteShelter);

module.exports = router;
