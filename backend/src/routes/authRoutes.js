const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { authLimiter, recoveryLimiter } = require('../middleware/rateLimiter');

// Citizen authentication routes (protected by authLimiter with skipSuccessfulRequests: true)
router.post('/register', authLimiter, authController.registerCitizen);
router.post('/login', authLimiter, authController.loginCitizen);

// Authority / Admin authentication routes
router.post('/authority-login', authLimiter, authController.loginAuthority);
router.post('/authority-recovery-request', recoveryLimiter, authController.requestAuthorityRecovery);
router.post('/authority-unlock', authLimiter, authController.unlockAuthorityAccount);

// Password recovery & reset routes
router.post('/forgot-password', recoveryLimiter, authController.forgotPassword);
router.post('/verify-reset-token', authController.verifyResetToken);
router.post('/reset-password', authLimiter, authController.resetPassword);

// User profile & session routes (NOT rate-limited by login limiter)
router.get('/me', verifyToken, authController.getMe);
router.put('/profile', verifyToken, authController.updateProfile);
router.patch('/profile', verifyToken, authController.updateProfile);
router.delete('/account', verifyToken, authController.deleteAccount);
router.post('/logout', authController.logout);

module.exports = router;
