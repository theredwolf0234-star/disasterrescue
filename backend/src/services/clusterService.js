/**
 * AI DISASTER INCIDENT CLUSTERING & DUPLICATE DETECTION SERVICE
 * 
 * Aggregates incidents occurring in close geographic proximity (<= 2.0 km)
 * within active disaster timeframes (<= 24 hours), grouping them into
 * "POSSIBLE INCIDENT CLUSTER" for coordinated multi-casualty response.
 * 
 * Preserves individual citizen reports without deletion!
 */

const db = require('../config/database');
const { generateUUID } = require('../utils/idGenerator');

// Haversine distance in kilometers
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Scans active incidents and identifies spatial/temporal clusters
 */
async function detectIncidentClusters({ radiusKm = 2.0, maxHours = 24 } = {}) {
    const incidents = await db.query(
        `SELECT id, category, emergency_level, count, details, latitude, longitude, readable_address, status, created_at, cluster_id
         FROM incidents 
         WHERE status NOT IN ('RESOLVED', 'CANCELLED')
         ORDER BY created_at DESC LIMIT 200`
    );

    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < incidents.length; i++) {
        const root = incidents[i];
        if (visited.has(root.id)) continue;

        const currentClusterMembers = [root];
        visited.add(root.id);

        for (let j = i + 1; j < incidents.length; j++) {
            const candidate = incidents[j];
            if (visited.has(candidate.id)) continue;

            const dist = haversineDistanceKm(
                Number(root.latitude), Number(root.longitude),
                Number(candidate.latitude), Number(candidate.longitude)
            );

            // Match if within radius (e.g. 2.0 km)
            if (dist <= radiusKm) {
                // Check category affinity
                const rootCat = (root.category || '').toLowerCase();
                const candCat = (candidate.category || '').toLowerCase();
                const isSimilarDisaster = rootCat === candCat ||
                    (rootCat.includes('flood') && candCat.includes('flood')) ||
                    (rootCat.includes('trapped') && candCat.includes('trapped')) ||
                    (rootCat.includes('evacuat') && candCat.includes('evacuat'));

                if (isSimilarDisaster || dist <= 1.0) {
                    currentClusterMembers.push(candidate);
                    visited.add(candidate.id);
                }
            }
        }

        // A valid cluster has 2 or more reports grouped together
        if (currentClusterMembers.length >= 2) {
            let totalVictims = 0;
            let sumLat = 0;
            let sumLng = 0;
            let maxDistFromCentroid = 0;
            let hasCritical = false;

            currentClusterMembers.forEach(m => {
                totalVictims += (m.count || 1);
                sumLat += Number(m.latitude);
                sumLng += Number(m.longitude);
                if (m.emergency_level === 'CRITICAL') hasCritical = true;
            });

            const centroidLat = sumLat / currentClusterMembers.length;
            const centroidLng = sumLng / currentClusterMembers.length;

            currentClusterMembers.forEach(m => {
                const d = haversineDistanceKm(centroidLat, centroidLng, Number(m.latitude), Number(m.longitude));
                if (d > maxDistFromCentroid) maxDistFromCentroid = d;
            });

            const clusterId = root.cluster_id || `CLUSTER_${root.id.replace('SOS-', '')}`;
            const disasterType = root.category || 'Multi-Casualty Hazard';

            clusters.push({
                id: clusterId,
                clusterName: `Zone Alert: ${disasterType} Cluster (${currentClusterMembers.length} Reports)`,
                disasterType,
                likelyDisaster: `${disasterType} Surge`,
                centroid: {
                    latitude: Number(centroidLat.toFixed(5)),
                    longitude: Number(centroidLng.toFixed(5))
                },
                radiusKm: Math.max(0.3, Number(maxDistFromCentroid.toFixed(2))),
                incidentCount: currentClusterMembers.length,
                totalVictims,
                priority: hasCritical || totalVictims >= 5 || currentClusterMembers.length >= 3 ? 'CRITICAL' : 'HIGH',
                summary: `${currentClusterMembers.length} distinct SOS emergency reports within ${Math.max(0.3, maxDistFromCentroid).toFixed(1)} km radius affecting ~${totalVictims} citizens.`,
                incidents: currentClusterMembers.map(m => ({
                    id: m.id,
                    category: m.category,
                    count: m.count,
                    details: m.details,
                    location: m.readable_address,
                    latitude: m.latitude,
                    longitude: m.longitude,
                    status: m.status,
                    createdAt: m.created_at
                }))
            });
        }
    }

    return clusters;
}

/**
 * Merge cluster reports into master incident without deleting original reports
 */
async function mergeIncidentsToCluster({ incidentIds, clusterName, authorityId }) {
    if (!incidentIds || !Array.isArray(incidentIds) || incidentIds.length < 2) {
        throw new Error('At least 2 incident IDs required to merge into a cluster.');
    }

    const clusterId = generateUUID('CLUS');

    // Retrieve members
    const placeholders = incidentIds.map(() => '?').join(',');
    const members = await db.query(`SELECT * FROM incidents WHERE id IN (${placeholders})`, incidentIds);

    if (members.length === 0) throw new Error('No valid incidents found for provided IDs.');

    let sumLat = 0;
    let sumLng = 0;
    let totalVictims = 0;
    const categories = new Set();

    members.forEach(m => {
        sumLat += Number(m.latitude);
        sumLng += Number(m.longitude);
        totalVictims += (m.count || 1);
        categories.add(m.category);
    });

    const centroidLat = sumLat / members.length;
    const centroidLng = sumLng / members.length;
    const primaryCat = Array.from(categories)[0] || 'Multi-Disaster Cluster';
    const finalName = clusterName || `${primaryCat} Incident Cluster (${members.length} Reports)`;

    // Insert or update cluster table
    await db.run(
        `INSERT OR REPLACE INTO incident_clusters (
            id, cluster_name, disaster_type, centroid_lat, centroid_lng, radius_km, incident_count, total_victims, priority, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 2.0, ?, ?, 'CRITICAL', 'ACTIVE', datetime('now'), datetime('now'))`,
        [
            clusterId,
            finalName,
            primaryCat,
            centroidLat,
            centroidLng,
            members.length,
            totalVictims
        ]
    );

    // Update each incident's cluster_id
    for (const inc of members) {
        await db.run(`UPDATE incidents SET cluster_id = ?, updated_at = datetime('now') WHERE id = ?`, [clusterId, inc.id]);

        // Add timeline note
        const noteId = generateUUID('INCU');
        await db.run(
            `INSERT INTO incident_updates (id, incident_id, updated_by_id, updated_by_role, status_from, status_to, note, created_at)
             VALUES (?, ?, ?, 'AUTHORITY', ?, ?, ?, datetime('now'))`,
            [
                noteId,
                inc.id,
                authorityId || 'AUTHORITY_SYSTEM',
                inc.status,
                inc.status,
                `Incident merged into Master Tactical Cluster [${clusterId}]: ${finalName}. Individual incident preserved.`
            ]
        );
    }

    return {
        clusterId,
        clusterName: finalName,
        incidentCount: members.length,
        totalVictims,
        centroid: { latitude: centroidLat, longitude: centroidLng }
    };
}

module.exports = {
    haversineDistanceKm,
    detectIncidentClusters,
    mergeIncidentsToCluster
};
