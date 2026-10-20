const https = require('https');
const { computeTacticalGridId } = require('../utils/tacticalGrid');

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoic2F0eWFtMjM0IiwiYSI6ImNtdWpqaWF5cTBkcGQyeHNmaG5hM3VoNzgifQ.oxZ2qpAYw6XwTFy39JuWnQ';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'RescueAI/1.0 (Emergency Coordination Platform)' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, json: JSON.parse(data) });
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// GET /api/geocode/reverse?lat=...&lng=...
async function reverseGeocode(req, res, next) {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
        }

        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);

        if (isNaN(numLat) || isNaN(numLng)) {
            return res.status(400).json({ success: false, message: 'Invalid latitude or longitude values' });
        }

        const tacticalGridId = computeTacticalGridId(numLat, numLng);

        // 1. Try Mapbox Geocoding
        if (MAPBOX_TOKEN) {
            try {
                const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${numLng},${numLat}.json?types=address,neighborhood,locality,place&access_token=${MAPBOX_TOKEN}`;
                const result = await fetchJson(mapboxUrl);
                if (result.status === 200 && result.json.features && result.json.features.length > 0) {
                    const feature = result.json.features[0];
                    return res.json({
                        success: true,
                        placeName: feature.place_name,
                        text: feature.text,
                        locality: feature.text,
                        coordinates: { lat: numLat, lng: numLng },
                        tacticalGridId,
                        provider: 'Mapbox'
                    });
                }
            } catch (err) {
                console.warn('[Geocode] Mapbox reverse failed, falling back:', err.message);
            }
        }

        // 2. Fallback to OpenStreetMap Nominatim
        try {
            const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat}&lon=${numLng}&zoom=14&addressdetails=1`;
            const osmRes = await fetchJson(osmUrl);
            if (osmRes.status === 200 && osmRes.json) {
                const addr = osmRes.json.address || {};
                const localName = addr.suburb || addr.neighbourhood || addr.city || addr.town || addr.county || 'Local Region';
                return res.json({
                    success: true,
                    placeName: osmRes.json.display_name,
                    text: localName,
                    locality: localName,
                    coordinates: { lat: numLat, lng: numLng },
                    tacticalGridId,
                    provider: 'OpenStreetMap'
                });
            }
        } catch (e) {
            console.warn('[Geocode] Nominatim reverse failed:', e.message);
        }

        // 3. Fallback baseline
        res.json({
            success: true,
            placeName: `Coordinates: ${numLat.toFixed(4)}, ${numLng.toFixed(4)}`,
            text: `${numLat.toFixed(3)}°N, ${numLng.toFixed(3)}°E`,
            locality: 'Regional Grid',
            coordinates: { lat: numLat, lng: numLng },
            tacticalGridId,
            provider: 'Coordinates'
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/geocode/search?q=...
async function searchGeocode(req, res, next) {
    try {
        const { q } = req.query;
        if (!q || !q.trim()) {
            return res.status(400).json({ success: false, message: 'Search query is required' });
        }

        const queryStr = q.trim();

        // 1. Try Mapbox Geocoding Search
        if (MAPBOX_TOKEN) {
            try {
                const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryStr)}.json?access_token=${MAPBOX_TOKEN}`;
                const result = await fetchJson(mapboxUrl);
                if (result.status === 200 && result.json.features && result.json.features.length > 0) {
                    const features = result.json.features.map(f => ({
                        place_name: f.place_name,
                        placeName: f.place_name,
                        text: f.text,
                        center: f.center, // [lng, lat]
                        latitude: f.center[1],
                        longitude: f.center[0],
                        tacticalGridId: computeTacticalGridId(f.center[1], f.center[0])
                    }));
                    return res.json({
                        success: true,
                        provider: 'Mapbox',
                        features,
                        results: features
                    });
                }
            } catch (err) {
                console.warn('[Geocode] Mapbox search failed:', err.message);
            }
        }

        // 2. Fallback to OpenStreetMap Nominatim Search
        try {
            const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=5&addressdetails=1`;
            const osmRes = await fetchJson(osmUrl);
            if (osmRes.status === 200 && Array.isArray(osmRes.json) && osmRes.json.length > 0) {
                const features = osmRes.json.map(item => {
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    const localName = item.name || item.display_name.split(',')[0];
                    return {
                        place_name: item.display_name,
                        placeName: item.display_name,
                        text: localName,
                        center: [lon, lat],
                        latitude: lat,
                        longitude: lon,
                        tacticalGridId: computeTacticalGridId(lat, lon)
                    };
                });
                return res.json({
                    success: true,
                    provider: 'OpenStreetMap',
                    features,
                    results: features
                });
            }
        } catch (e) {
            console.warn('[Geocode] Nominatim search failed:', e.message);
        }

        res.json({ success: true, features: [], results: [] });
    } catch (err) {
        next(err);
    }
}

module.exports = { reverseGeocode, searchGeocode };
