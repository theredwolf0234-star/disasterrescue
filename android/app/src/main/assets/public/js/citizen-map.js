/**
 * Mapbox GL JS & Live Geocoding / Directions API Integration for RESCUE AI
 * Powered by Mapbox GL JS with Dark Disaster Grid & Live Geolocation
 */

const MAPBOX_TOKEN = window.MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoic2F0eWFtMjM0IiwiYSI6ImNtdWpqaWF5cTBkcGQyeHNmaG5hM3VoNzgifQ.oxZ2qpAYw6XwTFy39JuWnQ';

let mapboxMap = null;
let userMarker = null;
let incidentMapMarkers = [];
let shelterMapMarkers = [];
let liveUserCoordinates = [80.9462, 26.8467]; // [Lng, Lat] for Mapbox (Lucknow default)
let gpsAccuracyMeters = null;
let isRealGpsActive = false;
let riskZonesActive = false;

function initCitizenMap() {
    const container = document.getElementById('main-map');
    if (!container || mapboxMap) return;

    if (typeof mapboxgl === 'undefined') {
        console.warn('[Mapbox] mapboxgl library not detected in window.');
        return;
    }

    try {
        mapboxgl.accessToken = MAPBOX_TOKEN;

        mapboxMap = new mapboxgl.Map({
            container: 'main-map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: liveUserCoordinates,
            zoom: 13
        });

        mapboxMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        mapboxMap.on('load', () => {
            renderUserGpsMarker();
            loadSheltersOnMapbox();
            loadIncidentsOnMapbox();
        });

        startCitizenLocationTracking();

    } catch (err) {
        console.error('[Mapbox] Initialization error:', err);
    }
}

function renderUserGpsMarker() {
    if (!mapboxMap) return;

    if (userMarker) userMarker.remove();

    const el = document.createElement('div');
    el.className = 'user-marker-container';

    userMarker = new mapboxgl.Marker(el)
        .setLngLat(liveUserCoordinates)
        .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <div style="color:#0f172a; font-family:sans-serif; padding:4px;">
                    <strong style="color:#2563eb; display:block; margin-bottom:2px;">📍 Your Current Position</strong>
                    <p style="margin:0; font-size:11px; color:#475569;">Lat: ${liveUserCoordinates[1].toFixed(5)}, Lng: ${liveUserCoordinates[0].toFixed(5)}</p>
                    ${gpsAccuracyMeters ? `<p style="margin:2px 0 0 0; font-size:10px; color:#64748b;">Accuracy: ±${Math.round(gpsAccuracyMeters)}m</p>` : ''}
                    <p style="margin:3px 0 0 0; font-size:10px; color:#10b981; font-weight:bold;">${isRealGpsActive ? '✓ Live GPS Connected' : 'Default Coordinate Baseline'}</p>
                </div>
            `)
        )
        .addTo(mapboxMap);
}

function startCitizenLocationTracking() {
    const statusText = document.getElementById('gps-status-text');
    const heroText = document.getElementById('live-hero-location');

    if (!("geolocation" in navigator)) {
        if (statusText) statusText.innerText = "Geolocation not supported by browser. Using default Lucknow baseline.";
        if (heroText) heroText.innerText = "Lucknow Central Zone";
        return;
    }

    if (statusText) statusText.innerText = "Connecting to Mapbox & GPS satellite telemetry...";

    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            liveUserCoordinates = [longitude, latitude];
            gpsAccuracyMeters = accuracy;
            isRealGpsActive = true;

            if (userMarker) userMarker.setLngLat(liveUserCoordinates);
            else renderUserGpsMarker();

            if (statusText) {
                statusText.innerHTML = `<span class="text-emerald-400 font-bold">✓ Live Mapbox GPS Active:</span> ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}° (±${Math.round(accuracy)}m)`;
            }
            if (heroText) {
                heroText.innerText = `${latitude.toFixed(3)}°N, ${longitude.toFixed(3)}°E`;
            }

            // Real Reverse Geocoding via backend proxy (Mapbox / Nominatim)
            if (typeof api !== 'undefined' && api.get) {
                api.get(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`)
                    .then(geo => {
                        if (geo && geo.success && geo.text && heroText) {
                            heroText.innerText = `${geo.text} (${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°)`;
                        }
                        if (geo && geo.success && geo.placeName && statusText) {
                            statusText.innerHTML = `<span class="text-emerald-400 font-bold">✓ GPS:</span> ${geo.placeName} (±${Math.round(accuracy)}m)`;
                        }
                    })
                    .catch(() => {});
            }

            if (typeof fetchRealtimeWeatherData === 'function') {
                fetchRealtimeWeatherData(latitude, longitude);
            }

            // Real-time GPS Telemetry Streaming to Authority Command Grid
            if (window.activeIncidentId) {
                const s = (typeof getSocket === 'function') ? getSocket() : (typeof socket !== 'undefined' ? socket : null);
                if (s && s.connected) {
                    s.emit('incident:location_update', {
                        incidentId: window.activeIncidentId,
                        latitude,
                        longitude,
                        accuracy
                    });
                }
            }
        },
        (error) => {
            isRealGpsActive = false;
            let msg = 'GPS Access Denied. Using Lucknow Regional Coordinates.';
            if (error.code === error.TIMEOUT) msg = 'GPS Query Timed Out. Using Default Regional Coordinates.';

            if (statusText) statusText.innerText = msg;
            if (heroText) heroText.innerText = "Lucknow Regional Grid";

            if (typeof fetchRealtimeWeatherData === 'function') {
                fetchRealtimeWeatherData(liveUserCoordinates[1], liveUserCoordinates[0]);
            }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
}

async function loadSheltersOnMapbox() {
    if (!mapboxMap) return;

    try {
        const res = await api.get('/api/shelters');
        if (!res.success || !res.data) return;

        shelterMapMarkers.forEach(m => m.remove());
        shelterMapMarkers = [];

        res.data.forEach(shelter => {
            const el = document.createElement('div');
            el.className = 'custom-shelter-pin';
            el.innerHTML = `<div style="background-color:#8b5cf6; width:16px; height:16px; border-radius:4px; border:2px solid white; box-shadow:0 0 10px #8b5cf6; cursor:pointer;"></div>`;

            const popupContent = `
                <div style="color:#0f172a; font-family:sans-serif; padding:4px; max-width:240px;">
                    <strong style="color:#6d28d9; font-size:13px; display:block;">${shelter.title}</strong>
                    <p style="margin:4px 0; font-size:11px; color:#475569;">${shelter.address || 'Emergency Camp'}</p>
                    <div style="font-size:11px; border-top:1px solid #e2e8f0; padding-top:4px; margin-top:4px;">
                        <span>Cap: <strong>${shelter.current_occupancy}/${shelter.capacity}</strong></span>
                        <span style="color:#10b981; margin-left:8px;">${shelter.status}</span>
                    </div>
                    <div style="font-size:10px; color:#64748b; margin-top:2px;">
                        📦 Food: <strong>${shelter.food_packets || 0}</strong> • Water: <strong>${shelter.water_liters || 0}L</strong>
                    </div>
                    <button onclick="drawMapboxRoute(${shelter.longitude}, ${shelter.latitude}, '${shelter.title.replace(/'/g, "\\'")}')" style="margin-top:6px; width:100%; background:#7c3aed; color:white; font-weight:bold; font-size:11px; padding:4px 8px; border:none; border-radius:6px; cursor:pointer;">
                        Calculate Safe Route Here →
                    </button>
                </div>
            `;

            const marker = new mapboxgl.Marker(el)
                .setLngLat([shelter.longitude, shelter.latitude])
                .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupContent))
                .addTo(mapboxMap);

            shelterMapMarkers.push(marker);
        });
    } catch (e) {
        console.warn('[Mapbox] Failed to load shelters:', e.message);
    }
}

async function loadIncidentsOnMapbox() {
    if (!mapboxMap) return;

    try {
        const currentUser = typeof api !== 'undefined' ? api.getUser() : null;
        const res = await api.get('/api/incidents?mine=true&status=all&limit=5');
        if (!res.success || !res.data) return;

        let incidents = Array.isArray(res.data) ? res.data : [];
        if (currentUser && currentUser.id) {
            incidents = incidents.filter(inc => inc.user_id === currentUser.id);
        }
        incidents = incidents.slice(0, 5);

        incidentMapMarkers.forEach(m => m.remove());
        incidentMapMarkers = [];

        incidents.forEach(inc => {
            let color = '#3b82f6';
            if (inc.emergency_level === 'CRITICAL') color = '#ef4444';
            else if (inc.emergency_level === 'HIGH') color = '#f97316';
            else if (inc.emergency_level === 'MEDIUM') color = '#f59e0b';
            if (inc.status === 'RESOLVED') color = '#10b981';

            const el = document.createElement('div');
            el.innerHTML = `<div style="background-color:${color}; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px ${color}; cursor:pointer;"></div>`;

            const popupContent = `
                <div style="color:#0f172a; font-family:sans-serif; padding:4px; max-width:240px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="color:#6d28d9; font-family:monospace;">${inc.id}</strong>
                        <span style="background:${color}22; color:${color}; font-size:9px; font-weight:bold; padding:2px 4px; border-radius:4px; text-transform:uppercase;">${inc.emergency_level}</span>
                    </div>
                    <strong style="display:block; font-size:12px; margin-bottom:2px;">${inc.category}</strong>
                    <p style="margin:0; font-size:11px; color:#475569;">${inc.details}</p>
                    <div style="margin-top:4px; font-size:10px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:4px;">
                        Status: <strong>${inc.status}</strong> • Victims: <strong>${inc.count}</strong>
                    </div>
                </div>
            `;

            const marker = new mapboxgl.Marker(el)
                .setLngLat([inc.longitude, inc.latitude])
                .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupContent))
                .addTo(mapboxMap);

            incidentMapMarkers.push(marker);
        });
    } catch (e) {
        console.warn('[Mapbox] Failed to load incidents:', e.message);
    }
}

/**
 * Mapbox Directions API Integration
 * Calculates live driving/evacuation route and renders geojson geometry line
 */
async function drawMapboxRoute(destLng, destLat, destTitle = 'Shelter') {
    clearRoute();

    if (!mapboxMap || !liveUserCoordinates) return;

    try {
        const start = `${liveUserCoordinates[0]},${liveUserCoordinates[1]}`;
        const destination = `${destLng},${destLat}`;

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${start};${destination}?alternatives=true&geometries=geojson&overview=full&steps=true&annotations=duration,distance,speed&access_token=${mapboxgl.accessToken}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Mapbox Directions API error');

        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error('No route found.');

        const route = data.routes[0];
        const routeData = {
            type: 'Feature',
            properties: {},
            geometry: route.geometry
        };

        if (mapboxMap.getSource('route')) {
            mapboxMap.getSource('route').setData(routeData);
        } else {
            mapboxMap.addSource('route', { type: 'geojson', data: routeData });
            mapboxMap.addLayer({
                id: 'route-casing',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#111827', 'line-width': 8, 'line-opacity': 0.8 }
            });
            mapboxMap.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#a855f7', 'line-width': 5, 'line-opacity': 1 }
            });
        }

        const distanceKm = route.distance / 1000;
        const durationMinutes = Math.round(route.duration / 60);

        const infoBox = document.getElementById('route-info-box');
        const distText = document.getElementById('route-distance');
        const clearBtn = document.getElementById('btn-clear-route');

        if (distText) distText.innerHTML = `Safe Corridor to <strong>${destTitle}</strong>: ${distanceKm.toFixed(2)} km (~${durationMinutes} mins)`;
        if (infoBox) infoBox.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.remove('hidden');

        const bounds = new mapboxgl.LngLatBounds();
        route.geometry.coordinates.forEach((coord) => bounds.extend(coord));
        mapboxMap.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });

        showToast(`Mapbox Directions API calculated safe route: ${distanceKm.toFixed(2)} km`, 'success');

    } catch (error) {
        console.error('Route error:', error);
        showToast('Mapbox route calculation failed. Showing straight trajectory.', 'warning');
    }
}

function clearRoute() {
    if (mapboxMap) {
        if (mapboxMap.getLayer('route-line')) mapboxMap.removeLayer('route-line');
        if (mapboxMap.getLayer('route-casing')) mapboxMap.removeLayer('route-casing');
        if (mapboxMap.getSource('route')) mapboxMap.removeSource('route');
    }
    const infoBox = document.getElementById('route-info-box');
    const clearBtn = document.getElementById('btn-clear-route');
    if (infoBox) infoBox.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
}

/**
 * Mapbox Geocoding API Integration
 * Real-time city and landmark search
 */
async function searchLiveLocation() {
    const query = document.getElementById('map-search-input') ? document.getElementById('map-search-input').value.trim() : '';
    if (!query) return;

    try {
        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}`);
        if (!response.ok) throw new Error('Mapbox Geocoding request failed');
        const data = await response.json();

        if (data.features && data.features.length > 0) {
            const place = data.features[0];
            liveUserCoordinates = place.center; // [Lng, Lat]

            if (mapboxMap) {
                mapboxMap.flyTo({ center: liveUserCoordinates, zoom: 14, duration: 1500 });
                if (userMarker) userMarker.setLngLat(liveUserCoordinates);
            }

            const statusText = document.getElementById('gps-status-text');
            const heroText = document.getElementById('live-hero-location');

            if (statusText) statusText.innerText = `Mapbox Geocoded Zone: ${place.place_name}`;
            if (heroText) heroText.innerText = place.text;

            showToast(`Mapbox Geocoding found: ${place.place_name}`, 'info');

            if (typeof fetchRealtimeWeatherData === 'function') {
                fetchRealtimeWeatherData(liveUserCoordinates[1], liveUserCoordinates[0]);
            }
        } else {
            showToast('Location not found. Please try another query.', 'warning');
        }
    } catch (err) {
        console.error('Geocoding search error:', err);
        showToast('Mapbox Geocoding search failed. Check network.', 'error');
    }
}

function recenterMap() {
    if (mapboxMap && liveUserCoordinates) {
        mapboxMap.flyTo({ center: liveUserCoordinates, zoom: 14, duration: 1000 });
    }
}

function toggleRiskZones() {
    if (!mapboxMap) return;

    if (!riskZonesActive) {
        if (!mapboxMap.getSource('risk-heatmap')) {
            mapboxMap.addSource('risk-heatmap', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[[liveUserCoordinates[0] + 0.005, liveUserCoordinates[1] + 0.005], [liveUserCoordinates[0] + 0.015, liveUserCoordinates[1] + 0.005], [liveUserCoordinates[0] + 0.015, liveUserCoordinates[1] + 0.015], [liveUserCoordinates[0] + 0.005, liveUserCoordinates[1] + 0.015], [liveUserCoordinates[0] + 0.005, liveUserCoordinates[1] + 0.005]]]
                        }
                    }]
                }
            });
            mapboxMap.addLayer({
                id: 'risk-layer',
                type: 'fill',
                source: 'risk-heatmap',
                paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.35 }
            });
        } else {
            mapboxMap.setLayoutProperty('risk-layer', 'visibility', 'visible');
        }
        riskZonesActive = true;
        showToast('Mapbox Hazard Inundation Overlay Activated.', 'warning');
    } else {
        if (mapboxMap.getLayer('risk-layer')) {
            mapboxMap.setLayoutProperty('risk-layer', 'visibility', 'none');
        }
        riskZonesActive = false;
        showToast('Mapbox Hazard overlay deactivated.', 'info');
    }
}

window.initCitizenMap = initCitizenMap;
window.startCitizenLocationTracking = startCitizenLocationTracking;
window.drawMapboxRoute = drawMapboxRoute;
window.clearRoute = clearRoute;
window.searchLiveLocation = searchLiveLocation;
window.recenterMap = recenterMap;
window.toggleRiskZones = toggleRiskZones;
window.getUserCoordinates = () => [liveUserCoordinates[1], liveUserCoordinates[0]]; // returns [Lat, Lng]
window.setLiveUserCoordinates = (lng, lat, accuracy) => {
    liveUserCoordinates = [lng, lat];
    if (accuracy) gpsAccuracyMeters = accuracy;
    isRealGpsActive = true;
};
