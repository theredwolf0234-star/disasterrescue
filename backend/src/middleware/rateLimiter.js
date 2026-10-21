const rateLimit = require('express-rate-limit');

/**
 * Multi-instance / Server-Restart Persistent Database Store for express-rate-limit
 * Uses the database table 'rate_limit_records' with automatic in-memory fallback.
 */
class DatabaseRateLimitStore {
    constructor(prefix = 'rl') {
        this.prefix = prefix;
        this.windowMs = 15 * 60 * 1000;
        this.fallbackMemory = new Map();
    }

    init(options) {
        if (options && options.windowMs) {
            this.windowMs = options.windowMs;
        }
    }

    getKey(key) {
        return this.prefix ? `${this.prefix}:${key}` : key;
    }

    async increment(rawKey) {
        const key = this.getKey(rawKey);
        const now = Date.now();
        const resetTime = new Date(now + this.windowMs);

        try {
            const db = require('../config/database');
            const row = await db.get(
                'SELECT total_hits, reset_time FROM rate_limit_records WHERE key = ?',
                [key]
            );

            if (!row) {
                // First request for this key
                await db.run(
                    'INSERT INTO rate_limit_records (key, total_hits, reset_time) VALUES (?, 1, ?)',
                    [key, resetTime.toISOString()]
                );
                return { totalHits: 1, resetTime };
            }

            const storedResetMs = new Date(row.reset_time).getTime();
            if (storedResetMs <= now) {
                // Previous window expired - reset counter
                await db.run(
                    'UPDATE rate_limit_records SET total_hits = 1, reset_time = ? WHERE key = ?',
                    [resetTime.toISOString(), key]
                );
                return { totalHits: 1, resetTime };
            }

            // Increment hits within active window
            const newHits = (row.total_hits || 0) + 1;
            await db.run(
                'UPDATE rate_limit_records SET total_hits = ? WHERE key = ?',
                [newHits, key]
            );
            return { totalHits: newHits, resetTime: new Date(row.reset_time) };
        } catch (dbErr) {
            // High-availability fallback to in-memory store if DB is initializing or undergoing migrations
            const existing = this.fallbackMemory.get(key);
            if (!existing || existing.resetTime.getTime() <= now) {
                const rec = { totalHits: 1, resetTime };
                this.fallbackMemory.set(key, rec);
                return rec;
            }
            existing.totalHits++;
            return existing;
        }
    }

    async decrement(rawKey) {
        const key = this.getKey(rawKey);
        try {
            const db = require('../config/database');
            await db.run(
                'UPDATE rate_limit_records SET total_hits = MAX(0, total_hits - 1) WHERE key = ?',
                [key]
            );
        } catch (dbErr) {
            const rec = this.fallbackMemory.get(key);
            if (rec && rec.totalHits > 0) rec.totalHits--;
        }
    }

    async resetKey(rawKey) {
        const key = this.getKey(rawKey);
        try {
            const db = require('../config/database');
            await db.run('DELETE FROM rate_limit_records WHERE key = ?', [key]);
        } catch (dbErr) {
            this.fallbackMemory.delete(key);
        }
    }
}

// General API rate limiter (500 requests per 15 minutes per genuine client IP)
// Health checks and status probes are excluded so real-time dashboards remain responsive
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    store: new DatabaseRateLimitStore('gen'),
    validate: { xForwardedForHeader: false, default: true },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path === '/api/health',
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        res.status(429).json({
            success: false,
            message: 'Too many requests originating from this IP address. Please try again after 15 minutes.',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds: retryAfter
        });
    }
});

// Dedicated Authentication rate limiter (20 failed attempts per 15 minutes per genuine client IP)
// skipSuccessfulRequests: true ensures legitimate admin and citizen logins NEVER consume quota!
// Only genuine 4xx failed attempts increment the rate limiter.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    store: new DatabaseRateLimitStore('auth'),
    validate: { xForwardedForHeader: false, default: true },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        res.status(429).json({
            success: false,
            message: 'Too many failed login attempts from this network IP address. Please wait 15 minutes before retrying.',
            errorCode: 'RATE_LIMIT_EXCEEDED',
            retryAfterSeconds: retryAfter
        });
    }
});

// Password Recovery rate limiter (10 recovery requests per 15 minutes per IP)
const recoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: new DatabaseRateLimitStore('rec'),
    validate: { xForwardedForHeader: false, default: true },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        res.status(429).json({
            success: false,
            message: 'Too many password recovery attempts from this IP address. Please wait 15 minutes before retrying.',
            errorCode: 'RECOVERY_RATE_LIMIT_EXCEEDED',
            retryAfterSeconds: retryAfter
        });
    }
});

module.exports = {
    generalLimiter,
    authLimiter,
    recoveryLimiter,
    strictLimiter: authLimiter, // Backward compatibility alias
    DatabaseRateLimitStore
};
