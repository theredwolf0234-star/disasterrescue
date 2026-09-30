const rateLimit = require('express-rate-limit');

// General API rate limiter (100 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests originating from this IP address. Please try again after 15 minutes.',
        errorCode: 'RATE_LIMIT_EXCEEDED'
    }
});

// Strict rate limiter for Authentication and SOS dispatch to prevent brute force & DoS
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30, // 30 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many dispatch or authentication attempts. Please wait before retrying.',
        errorCode: 'STRICT_RATE_LIMIT_EXCEEDED'
    }
});

module.exports = {
    generalLimiter,
    strictLimiter
};
