const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');

router.get('/', hospitalController.getHospitals);
router.get('/:id', hospitalController.getHospitalById);

module.exports = router;
