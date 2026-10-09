const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/register', authController.registerCitizen);
router.post('/login', authController.loginCitizen);
router.post('/authority-login', authController.loginAuthority);
router.get('/me', verifyToken, authController.getMe);
router.put('/profile', verifyToken, authController.updateProfile);
router.delete('/account', verifyToken, authController.deleteAccount);
router.post('/logout', authController.logout);

module.exports = router;
