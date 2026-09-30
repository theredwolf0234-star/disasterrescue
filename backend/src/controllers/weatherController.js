const { fetchRealWeather } = require('../services/weatherService');

// GET /api/weather?lat=...&lng=...&apiKey=...
async function getWeather(req, res, next) {
    try {
        const lat = req.query.lat || 26.8467; // Default Lucknow region
        const lng = req.query.lng || 80.9462;
        const customApiKey = req.query.apiKey || req.query.key || null;

        const weatherData = await fetchRealWeather(lat, lng, customApiKey);

        res.json({
            success: true,
            data: weatherData
        });
    } catch (err) {
        res.status(503).json({
            success: false,
            message: 'Weather data temporarily unavailable.',
            errorCode: 'WEATHER_UNAVAILABLE'
        });
    }
}

module.exports = {
    getWeather
};
