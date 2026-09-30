let ioInstance = null;

function initSocket(io) {
    ioInstance = io;

    io.on('connection', (socket) => {
        console.log(`[Socket.IO] Client connected: ${socket.id}`);

        // Join specific channel / room
        socket.on('join', (room) => {
            if (room) {
                socket.join(room);
                console.log(`[Socket.IO] Socket ${socket.id} joined room: ${room}`);
            }
        });

        // Incident specific subscription
        socket.on('subscribe:incident', (incidentId) => {
            if (incidentId) {
                socket.join(`incident:${incidentId}`);
                console.log(`[Socket.IO] Socket ${socket.id} subscribed to incident: ${incidentId}`);
            }
        });

        // Citizen live GPS telemetry streaming
        socket.on('incident:location_update', async (data) => {
            if (!data || !data.incidentId || data.latitude === undefined || data.longitude === undefined) {
                return;
            }
            try {
                const lat = parseFloat(data.latitude);
                const lng = parseFloat(data.longitude);
                if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    return;
                }
                const db = require('../config/database');
                await db.run(
                    `UPDATE incidents SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [lat, lng, data.incidentId]
                );

                const updatePayload = {
                    id: data.incidentId,
                    latitude: lat,
                    longitude: lng,
                    accuracy: data.accuracy || null,
                    updated_at: new Date().toISOString()
                };

                io.to('authorities').emit('incident:location_updated', updatePayload);
                io.to(`incident:${data.incidentId}`).emit('incident:location_updated', updatePayload);
                console.log(`[Socket.IO] Live location updated for incident ${data.incidentId}: [${lat}, ${lng}]`);
            } catch (err) {
                console.error('[Socket.IO] Error processing live location update:', err.message);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
        });
    });

    return io;
}

function getIO() {
    if (!ioInstance) {
        throw new Error('Socket.IO has not been initialized yet.');
    }
    return ioInstance;
}

/**
 * Broadcast new incident alert to authority and public rooms
 */
function emitNewIncident(incident) {
    if (ioInstance) {
        ioInstance.emit('incident:new', incident);
        ioInstance.to('authorities').emit('alert:critical', {
            title: `New SOS Beacon: ${incident.id}`,
            incident
        });
    }
}

/**
 * Broadcast incident updates (status, assigned team, notes)
 */
function emitIncidentUpdated(incident) {
    if (ioInstance) {
        ioInstance.emit('incident:updated', incident);
        ioInstance.to(`incident:${incident.id}`).emit('incident:status_changed', incident);
    }
}

module.exports = {
    initSocket,
    getIO,
    emitNewIncident,
    emitIncidentUpdated
};
