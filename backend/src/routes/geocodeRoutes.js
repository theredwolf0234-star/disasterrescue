const express = require('express');
const router = express.Router();
const geocodeController = require('../controllers/geocodeController');

router.get('/reverse', geocodeController.reverseGeocode);
router.get('/search', geocodeController.searchGeocode);

module.exports = router;
