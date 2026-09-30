function notFoundHandler(req, res, next) {
    res.status(404).json({
        success: false,
        message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
        errorCode: 'NOT_FOUND'
    });
}

function errorHandler(err, req, res, next) {
    console.error(`[Error Handler] ${req.method} ${req.originalUrl}:`, err);

    const statusCode = err.statusCode || (err.status ? err.status : 500);
    const message = err.message || 'An internal server error occurred.';
    const errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';

    const response = {
        success: false,
        message,
        errorCode
    };

    // Only expose stack trace in local development mode
    if (process.env.NODE_ENV !== 'production') {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
}

module.exports = {
    notFoundHandler,
    errorHandler
};
