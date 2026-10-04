const db = require('../config/database');
const { haversineDistanceKm } = require('../services/clusterService');

// GET /api/hospitals
async function getHospitals(req, res, next) {
    try {
        const { lat, lng } = req.query;
        let hospitals = await db.query(`SELECT * FROM hospitals ORDER BY available_beds DESC`);

        if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            hospitals = hospitals.map(h => {
                const distanceKm = haversineDistanceKm(userLat, userLng, Number(h.latitude), Number(h.longitude));
                return {
                    ...h,
                    distanceKm: Number(distanceKm.toFixed(2))
                };
            }).sort((a, b) => a.distanceKm - b.distanceKm);
        }

        res.json({
            success: true,
            count: hospitals.length,
            data: hospitals
        });
    } catch (err) {
        next(err);
    }
}

// GET /api/hospitals/:id
async function getHospitalById(req, res, next) {
    try {
        const hospital = await db.get(`SELECT * FROM hospitals WHERE id = ?`, [req.params.id]);
        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Hospital not found.' });
        }
        res.json({ success: true, data: hospital });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getHospitals,
    getHospitalById
};
