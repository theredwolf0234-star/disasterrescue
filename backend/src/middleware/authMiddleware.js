const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'rescue_ai_super_secret_jwt_key_2026_dev_mode';

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Missing or malformed authorization token.',
            errorCode: 'AUTH_REQUIRED'
        });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired session token. Please log in again.',
            errorCode: 'INVALID_TOKEN'
        });
    }
}

/**
 * Optional token verification: if present, decodes user; if not, proceeds as guest
 */
function optionalToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (err) {
            // Ignore token error for optional auth
        }
    }
    next();
}

/**
 * Restricts route access to specific roles
 * @param {string[]} allowedRoles 
 */
function requireRoles(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token is required for this action.',
                errorCode: 'AUTH_REQUIRED'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: Access restricted. Role '${req.user.role}' lacks permission.`,
                errorCode: 'FORBIDDEN'
            });
        }

        next();
    };
}

module.exports = {
    verifyToken,
    optionalToken,
    requireRoles,
    JWT_SECRET
};
