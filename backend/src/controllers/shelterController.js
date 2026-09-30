const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');
const { logAction } = require('../services/auditService');

// GET /api/shelters
async function getShelters(req, res, next) {
    try {
        const shelters = await db.query(
            `SELECT * FROM shelters ORDER BY title ASC`
        );
        const mapped = shelters.map(s => ({
            ...s,
            occupancy: s.current_occupancy !== undefined ? s.current_occupancy : 0
        }));
        res.json({
            success: true,
            count: mapped.length,
            data: mapped
        });
    } catch (err) {
        next(err);
    }
}

// POST /api/shelters (Authority / Admin only)
async function createShelter(req, res, next) {
    try {
        const { 
            title, 
            capacity, 
            currentOccupancy, 
            latitude, 
            longitude, 
            address, 
            contactPhone,
            foodPackets,
            waterLiters,
            medicalKits,
            blankets,
            resourcesSummary
        } = req.body;

        if (!title || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Title, latitude, and longitude are required to register a shelter.',
                errorCode: 'VALIDATION_ERROR'
            });
        }

        const id = generateUUID('SHELTER');
        await db.run(
            `INSERT INTO shelters (
                id, title, status, capacity, current_occupancy,
                food_packets, water_liters, medical_kits, blankets, resources_summary,
                latitude, longitude, address, contact_phone, created_at, updated_at
            ) VALUES (?, ?, 'Operational', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
                id,
                title.trim(),
                parseInt(capacity, 10) || 100,
                parseInt(currentOccupancy, 10) || 0,
                parseInt(foodPackets, 10) || 0,
                parseInt(waterLiters, 10) || 0,
                parseInt(medicalKits, 10) || 0,
                parseInt(blankets, 10) || 0,
                resourcesSummary || 'Standard Relief Supplies',
                parseFloat(latitude),
                parseFloat(longitude),
                address || null,
                contactPhone || null
            ]
        );

        const newShelter = await db.get(`SELECT * FROM shelters WHERE id = ?`, [id]);

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'CREATE_SHELTER',
            entityType: 'SHELTER',
            entityId: id,
            details: { title, capacity, address },
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'Shelter registered successfully.',
            data: newShelter
        });
    } catch (err) {
        next(err);
    }
}

// PATCH /api/shelters/:id
async function updateShelter(req, res, next) {
    try {
        const { id } = req.params;
        const { 
            title,
            status, 
            capacity, 
            currentOccupancy, 
            latitude,
            longitude,
            address,
            contactPhone,
            foodPackets,
            waterLiters,
            medicalKits,
            blankets,
            resourcesSummary
        } = req.body;

        const shelter = await db.get(`SELECT * FROM shelters WHERE id = ?`, [id]);
        if (!shelter) {
            return res.status(404).json({ success: false, message: 'Shelter not found.' });
        }

        await db.run(
            `UPDATE shelters
             SET title = COALESCE(?, title),
                 status = COALESCE(?, status),
                 capacity = COALESCE(?, capacity),
                 current_occupancy = COALESCE(?, current_occupancy),
                 latitude = COALESCE(?, latitude),
                 longitude = COALESCE(?, longitude),
                 address = COALESCE(?, address),
                 contact_phone = COALESCE(?, contact_phone),
                 food_packets = COALESCE(?, food_packets),
                 water_liters = COALESCE(?, water_liters),
                 medical_kits = COALESCE(?, medical_kits),
                 blankets = COALESCE(?, blankets),
                 resources_summary = COALESCE(?, resources_summary),
                 updated_at = datetime('now')
             WHERE id = ?`,
            [
                title || null,
                status || null,
                capacity !== undefined ? parseInt(capacity, 10) : null,
                currentOccupancy !== undefined ? parseInt(currentOccupancy, 10) : null,
                latitude !== undefined ? parseFloat(latitude) : null,
                longitude !== undefined ? parseFloat(longitude) : null,
                address || null,
                contactPhone || null,
                foodPackets !== undefined ? parseInt(foodPackets, 10) : null,
                waterLiters !== undefined ? parseInt(waterLiters, 10) : null,
                medicalKits !== undefined ? parseInt(medicalKits, 10) : null,
                blankets !== undefined ? parseInt(blankets, 10) : null,
                resourcesSummary || null,
                id
            ]
        );

        const updated = await db.get(`SELECT * FROM shelters WHERE id = ?`, [id]);

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'UPDATE_SHELTER',
            entityType: 'SHELTER',
            entityId: id,
            details: { title: updated.title, capacity: updated.capacity, occupancy: updated.current_occupancy },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Shelter and resource inventory updated successfully.',
            data: updated
        });
    } catch (err) {
        next(err);
    }
}

// DELETE /api/shelters/:id
async function deleteShelter(req, res, next) {
    try {
        const { id } = req.params;
        const shelter = await db.get(`SELECT * FROM shelters WHERE id = ?`, [id]);
        if (!shelter) {
            return res.status(404).json({ success: false, message: 'Shelter not found.' });
        }

        await db.run(`DELETE FROM shelters WHERE id = ?`, [id]);

        await logAction({
            userId: req.user ? req.user.id : 'AUTHORITY',
            userRole: req.user ? req.user.role : 'AUTHORITY',
            action: 'DELETE_SHELTER',
            entityType: 'SHELTER',
            entityId: id,
            details: { title: shelter.title },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `Shelter '${shelter.title}' deleted successfully.`
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getShelters,
    createShelter,
    updateShelter,
    deleteShelter
};
