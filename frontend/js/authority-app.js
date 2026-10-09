/**
 * RESCUE AI - First Responder & Authority Command Portal Logic
 * Real-time disaster triage grid, tactical mapping, live counters, and incident command.
 */

const MAPBOX_TOKEN = window.MAPBOX_ACCESS_TOKEN || 'pk.eyJ1Ijoic2F0eWFtMjM0IiwiYSI6ImNtdWpqaWF5cTBkcGQyeHNmaG5hM3VoNzgifQ.oxZ2qpAYw6XwTFy39JuWnQ';

let authorityMap = null;
let authorityMapMarkers = [];
let incidentMarkerMap = {};
let allIncidents = [];
let allShelters = [];
let allRescueTeams = [];
let activeFilter = 'all';
let currentInspectedIncident = null;
let audioSirenEnabled = true;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 1. Check Authentication Gate
    const user = api.getUser();
    const token = api.getToken();

    if (!token || !user) {
        showAuthorityLoginModal();
        return;
    }

    // Role check: If citizen attempts to open authority dashboard, show Access Denied screen
    if (user.role !== 'AUTHORITY' && user.role !== 'ADMIN') {
        showAccessDeniedScreen(user);
        return;
    }

    // Verify session validity against backend
    try {
        await api.get('/api/auth/me');
    } catch (authErr) {
        if (authErr.status === 401 || authErr.errorCode === 'INVALID_TOKEN' || authErr.errorCode === 'UNAUTHORIZED') {
            api.clearAuth();
            showAuthorityLoginModal('Your session has expired. Please log in again with Authority credentials.');
            return;
        }
    }

    // Initialize Authority Dashboard
    await initAuthorityDashboard();
});

async function initAuthorityDashboard() {
    updateOfficerBadge();

    // 1. Initialize Real-Time Socket Connection with AUTHORITY room
    initRealtimeSocket('AUTHORITY');

    // 2. Check Backend Health
    try {
        const health = await api.get('/api/health');
        if (health.status !== 'ok' || health.database !== 'connected') {
            showToast('Warning: Backend database status reported anomalous.', 'warning');
        }
    } catch (hErr) {
        showToast('Unable to connect to backend command server. Retrying...', 'error');
        displayDashboardConnectionError('Unable to connect to backend');
    }

    // 3. Initialize Mapbox Tactical Map
    initAuthorityMapbox();

    // 4. Fetch Initial Data with proper loading indicators
    await Promise.all([
        fetchOverviewStats(),
        fetchIncidentsList(),
        fetchSheltersList(),
        fetchRescueTeamsList(),
        loadDatabaseOverview(false)
    ]);

    // 5. Wire Real-Time Socket Listeners
    onRealtimeEvent('incident:new', (newIncident) => {
        handleIncomingSOSAlert(newIncident);
    });

    onRealtimeEvent('incident:updated', (updatedIncident) => {
        handleIncidentUpdated(updatedIncident);
    });

    onRealtimeEvent('incident:location_updated', (locData) => {
        handleIncidentLocationUpdated(locData);
    });

    onRealtimeEvent('alert:critical', (data) => {
        showToast(`🚨 CRITICAL EMERGENCY ALERT: ${data.title || 'New SOS Beacon'}`, 'error');
        if (audioSirenEnabled) playAlertChirp();
    });
}

function updateOfficerBadge() {
    const user = api.getUser();
    const badgeEl = document.getElementById('duty-officer-badge');
    if (badgeEl && user) {
        const org = user.organization ? ` • ${user.organization}` : '';
        const badgeNum = user.badgeNumber || user.badge_number || 'HQ-CMD';
        badgeEl.innerText = `Duty Officer: ${user.username || user.fullName || 'NDRF Officer'} (${badgeNum})${org}`;
    }
}

function displayDashboardConnectionError(msg) {
    ['stat-total', 'stat-active', 'stat-critical', 'stat-resolved', 'stat-people'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<span class="text-xs text-red-400 font-normal">Offline</span>`;
    });
    const syncEl = document.getElementById('last-sync-time');
    if (syncEl) syncEl.innerHTML = `<span class="text-red-400 font-bold">${msg}</span>`;
}

// Access Denied Screen shown when Citizen visits authority.html
function showAccessDeniedScreen(user) {
    let screen = document.getElementById('access-denied-screen');
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'access-denied-screen';
        screen.className = 'fixed inset-0 z-50 bg-[#0B0F19] flex items-center justify-center p-4';
        document.body.appendChild(screen);
    }

    screen.innerHTML = `
        <div class="bg-slate-900 border border-red-800/80 rounded-2xl max-w-lg w-full p-8 shadow-2xl text-center space-y-6">
            <div class="w-16 h-16 rounded-2xl bg-red-950 border border-red-600/50 flex items-center justify-center text-red-400 mx-auto shadow-lg shadow-red-950/50">
                <i data-lucide="shield-x" class="w-8 h-8"></i>
            </div>
            
            <div class="space-y-2">
                <span class="text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-red-950 text-red-300 border border-red-800">
                    RESTRICTED ACCESS
                </span>
                <h2 class="text-2xl font-black text-white">Authority Clearance Required</h2>
                <p class="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                    You are currently authenticated as <strong class="text-white">${user.fullName || user.username || user.email}</strong> with role <span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-800 text-purple-300">${user.role}</span>.
                </p>
                <p class="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                    The Authority Command Portal is strictly restricted to certified NDRF officers, emergency dispatch commanders, and administrative personnel.
                </p>
            </div>

            <div class="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                <button onclick="switchAuthorityAccount()" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-5 py-3 rounded-xl text-xs uppercase shadow-lg transition">
                    Log In With Authority Credentials
                </button>
                <a href="index.html" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-5 py-3 rounded-xl text-xs uppercase transition flex items-center justify-center">
                    Return to Citizen Portal
                </a>
            </div>
        </div>
    `;
    screen.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function switchAuthorityAccount() {
    api.clearAuth();
    const denied = document.getElementById('access-denied-screen');
    if (denied) denied.remove();
    showAuthorityLoginModal();
}

// Authentication Modal for Authority
function showAuthorityLoginModal(customMessage = null) {
    let modal = document.getElementById('auth-login-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'auth-login-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800/80 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 text-slate-200">
            <div class="flex items-center space-x-3 border-b border-slate-800 pb-4">
                <div class="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-950">
                    <i data-lucide="shield-alert" class="w-6 h-6"></i>
                </div>
                <div>
                    <h3 class="font-black text-white text-lg tracking-tight">Authority Command Login</h3>
                    <p class="text-xs text-slate-400">Authorized NDRF / First Responder Access Only</p>
                </div>
            </div>

            ${customMessage ? `
                <div class="p-3 bg-amber-950/60 border border-amber-800 text-amber-200 rounded-xl text-xs font-semibold">
                    ${customMessage}
                </div>
            ` : ''}

            <form onsubmit="handleAuthorityLogin(event)" class="space-y-4 text-xs">
                <div>
                    <label class="block text-slate-800 dark:text-slate-200 font-bold uppercase mb-1">Badge ID or Admin Username</label>
                    <input type="text" id="auth-username" required autocomplete="username" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:outline-none" placeholder="e.g. ndrf_commander or AISTER23">
                </div>

                <div>
                    <label class="block text-slate-800 dark:text-slate-200 font-bold uppercase mb-1">Passcode / Key</label>
                    <input type="password" id="auth-password" required autocomplete="current-password" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white text-sm focus:border-purple-500 focus:outline-none" placeholder="••••••••">
                </div>

                <div id="auth-login-error" class="hidden p-3 bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs"></div>

                <button type="submit" id="auth-login-submit" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold py-3 rounded-xl uppercase text-xs shadow-lg transition">
                    Authenticate & Access Command Grid
                </button>

                <div class="pt-2 text-center border-t border-slate-200 dark:border-slate-800">
                    <a href="index.html" class="inline-flex items-center space-x-1 text-slate-500 hover:text-purple-600 text-xs font-semibold">
                        <span>← Return to Citizen App</span>
                    </a>
                </div>
            </form>
        </div>
    `;
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleAuthorityLogin(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errBox = document.getElementById('auth-login-error');
    const submitBtn = document.getElementById('auth-login-submit');

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Verifying Credentials...';
        errBox.classList.add('hidden');

        const res = await api.post('/api/auth/authority-login', { username, password });
        if (!res.success || !res.data) throw new Error(res.message || 'Authentication failed');

        const { token, user } = res.data;

        if (user.role !== 'AUTHORITY' && user.role !== 'ADMIN') {
            throw new Error('Access denied: User account lacks Authority / Admin permissions.');
        }

        api.setToken(token, user);

        const modal = document.getElementById('auth-login-modal');
        if (modal) modal.classList.add('hidden');

        showToast(`Welcome, Officer ${user.username}. Authority clearance verified.`, 'success');
        await initAuthorityDashboard();
    } catch (err) {
        errBox.innerText = err.message || 'Login failed. Please check badge ID and passcode.';
        errBox.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Authenticate & Access Command Grid';
    }
}

function authorityLogout() {
    if (confirm('Log out from Authority Command HQ?')) {
        api.clearAuth();
        window.location.reload();
    }
}

// Mapbox Tactical Map Initialization
function initAuthorityMapbox() {
    const container = document.getElementById('authority-map');
    if (!container || authorityMap) return;

    if (typeof mapboxgl === 'undefined') {
        console.warn('[Mapbox] mapboxgl not loaded.');
        return;
    }

    try {
        mapboxgl.accessToken = MAPBOX_TOKEN;

        authorityMap = new mapboxgl.Map({
            container: 'authority-map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [80.9462, 26.8467], // Lucknow HQ [Lng, Lat]
            zoom: 12
        });

        authorityMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        authorityMap.on('load', () => {
            renderMapMarkers();
        });

    } catch (err) {
        console.error('[Mapbox Authority] Map init error:', err);
    }
}

// Fetch Overview Metrics with proper loading & error states
async function fetchOverviewStats() {
    const counterIds = ['stat-total', 'stat-active', 'stat-critical', 'stat-resolved', 'stat-people'];
    
    try {
        const res = await api.get('/api/incidents/stats/overview');
        if (res.success && res.data) {
            const s = res.data;
            document.getElementById('stat-total').innerText = s.total !== undefined ? s.total : 0;
            document.getElementById('stat-active').innerText = s.active !== undefined ? s.active : 0;
            document.getElementById('stat-critical').innerText = s.critical !== undefined ? s.critical : 0;
            document.getElementById('stat-resolved').innerText = s.resolved !== undefined ? s.resolved : 0;
            document.getElementById('stat-people').innerText = s.people !== undefined ? s.people : (s.peopleAffected || 0);

            const syncEl = document.getElementById('last-sync-time');
            if (syncEl) syncEl.innerText = 'Last Sync: ' + new Date().toLocaleTimeString();
        } else {
            throw new Error(res.message || 'Invalid stats payload');
        }
    } catch (e) {
        console.warn('Failed to fetch stats overview:', e.message);
        counterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<span class="text-xs text-red-400 font-normal">Offline</span>`;
        });
        const syncEl = document.getElementById('last-sync-time');
        if (syncEl) syncEl.innerHTML = `<span class="text-red-400 font-bold">Unable to connect to backend</span>`;
    }
}

// Fetch Incidents List from backend
async function fetchIncidentsList() {
    const queueContainer = document.getElementById('queue-container');
    if (queueContainer && allIncidents.length === 0) {
        queueContainer.innerHTML = `
            <div class="text-center py-10 text-slate-400 text-xs flex flex-col items-center">
                <div class="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                <span>Fetching incidents from command server...</span>
            </div>
        `;
    }

    try {
        const res = await api.get('/api/incidents?status=all&limit=100');
        if (res.success && res.data) {
            allIncidents = res.data;
            renderIncidentQueue();
            renderMapMarkers();
        }
    } catch (e) {
        console.warn('Failed to load incident queue:', e.message);
        if (queueContainer) {
            queueContainer.innerHTML = `
                <div class="text-center py-8 bg-slate-950 p-4 rounded-xl border border-red-900/50 text-xs space-y-2">
                    <p class="text-red-400 font-bold">Unable to connect to backend</p>
                    <p class="text-slate-400 text-[11px]">${e.message || 'Could not retrieve incident triage queue.'}</p>
                    <button onclick="fetchIncidentsList()" class="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1 rounded-lg text-xs font-bold">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

// Fetch Shelters & Resources
async function fetchSheltersList() {
    try {
        const res = await api.get('/api/shelters');
        if (res.success && res.data) {
            allShelters = res.data;
            renderShelterAdminView();
            renderMapMarkers();
        }
    } catch (e) {
        console.warn('Failed to load shelters:', e.message);
    }
}

// Fetch Rescue Teams
async function fetchRescueTeamsList() {
    try {
        const res = await api.get('/api/rescue-teams');
        if (res.success && res.data) {
            allRescueTeams = res.data;
            renderMapMarkers();
        }
    } catch (e) {
        console.warn('Failed to load rescue teams:', e.message);
    }
}

// Force Sync Button
async function syncData() {
    showToast('Synchronizing tactical command state...', 'info');
    await Promise.all([
        fetchOverviewStats(),
        fetchIncidentsList(),
        fetchSheltersList(),
        fetchRescueTeamsList()
    ]);
    showToast('Command grid synchronized with backend.', 'success');
}

// Render Tactical Markers on Mapbox Authority Map
function renderMapMarkers() {
    if (!authorityMap) return;

    authorityMapMarkers.forEach(m => m.remove());
    authorityMapMarkers = [];
    incidentMarkerMap = {};

    // 1. Incidents
    allIncidents.forEach(item => {
        if (!item.latitude || !item.longitude) return;

        let color = '#3b82f6';
        if (item.emergency_level === 'CRITICAL') color = '#ef4444';
        else if (item.emergency_level === 'HIGH') color = '#f97316';
        else if (item.emergency_level === 'MEDIUM') color = '#f59e0b';
        if (item.status === 'RESOLVED') color = '#10b981';

        const isLiveActive = item.status !== 'RESOLVED' && item.status !== 'CANCELLED';

        const el = document.createElement('div');
        el.className = 'authority-incident-marker cursor-pointer';
        el.innerHTML = `
            <div style="background-color:${color}; width:22px; height:22px; border-radius:50%; border:2.5px solid white; box-shadow:0 0 16px ${color}; cursor:pointer; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:bold;" class="${isLiveActive ? 'radar-ping' : ''}" title="${item.id}">
                <span>●</span>
            </div>
        `;

        const latVal = Number(item.latitude).toFixed(5);
        const lngVal = Number(item.longitude).toFixed(5);

        const popupHTML = `
            <div style="color:#0f172a; font-family:sans-serif; padding:6px; min-width:240px; max-width:290px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:10px; font-weight:bold; color:#ef4444; display:flex; align-items:center;">
                        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444; margin-right:4px;" class="animate-pulse"></span>
                        LIVE CITIZEN SOS LOCATION
                    </span>
                    <span style="background:${color}22; color:${color}; font-size:9px; font-weight:bold; padding:2px 5px; border-radius:4px; text-transform:uppercase;">${item.emergency_level}</span>
                </div>
                <strong style="color:#6d28d9; font-family:monospace; font-size:12px;">${item.id}</strong>
                <p style="margin:2px 0; font-size:12px; font-weight:bold; color:#1e293b;">${item.category}</p>
                <p style="margin:2px 0 4px 0; font-size:11px; color:#475569;">${item.details || ''}</p>
                
                <div style="background:#f1f5f9; padding:5px 8px; border-radius:6px; margin:4px 0; font-size:11px; font-family:monospace; color:#334155;">
                    <div><strong>GPS:</strong> ${latVal}, ${lngVal}</div>
                    ${item.readable_address ? `<div style="font-family:sans-serif; font-size:10px; color:#64748b; margin-top:2px;">📍 ${item.readable_address}</div>` : ''}
                </div>

                <div style="margin-top:4px; font-size:10px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:4px;">
                    Status: <strong>${item.status}</strong> • Victims: <strong>${item.count || 1}</strong>
                </div>
                ${item.assigned_rescue_team ? `<p style="margin:2px 0 0 0; font-size:10px; color:#059669; font-weight:bold;">Assigned: ${item.assigned_rescue_team}</p>` : ''}

                <div style="display:flex; gap:4px; margin-top:6px;">
                    <a href="https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}" target="_blank" style="flex:1; background:#0f172a; color:#c084fc; text-align:center; font-weight:bold; font-size:10px; padding:5px 6px; border-radius:6px; text-decoration:none; display:flex; align-items:center; justify-content:center;">
                        🧭 Maps ↗
                    </a>
                    <button onclick="inspectIncident('${item.id}')" style="flex:1.4; background:#7c3aed; color:white; font-weight:bold; font-size:10px; padding:5px 8px; border:none; border-radius:6px; cursor:pointer;">
                        Command Details →
                    </button>
                </div>
            </div>
        `;

        const marker = new mapboxgl.Marker(el)
            .setLngLat([item.longitude, item.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupHTML))
            .addTo(authorityMap);

        authorityMapMarkers.push(marker);
        incidentMarkerMap[item.id] = marker;
    });

    // 2. Shelters with Resource Telemetry
    allShelters.forEach(s => {
        if (!s.latitude || !s.longitude) return;

        const el = document.createElement('div');
        el.innerHTML = `<div style="background-color:#8b5cf6; width:15px; height:15px; border-radius:4px; border:2px solid white; box-shadow:0 0 10px #8b5cf6; cursor:pointer;"></div>`;

        const popupHTML = `
            <div style="color:#0f172a; font-family:sans-serif; padding:4px; max-width:240px;">
                <strong style="color:#6d28d9; font-size:12px; display:block;">${s.title}</strong>
                <p style="margin:3px 0; font-size:10px; color:#475569;">${s.address || 'Relief Facility'}</p>
                <div style="font-size:10px; border-top:1px solid #e2e8f0; padding-top:3px;">
                    Cap: <strong>${s.current_occupancy}/${s.capacity}</strong> • <strong style="color:#059669;">${Math.max(0, s.capacity - s.current_occupancy)} Free</strong>
                </div>
                <div style="font-size:9px; color:#64748b; margin-top:2px;">
                    🍞 Food: <strong>${s.food_packets || 0}</strong> • 💧 Water: <strong>${s.water_liters || 0}L</strong> • 🩹 Kits: <strong>${s.medical_kits || 0}</strong>
                </div>
                <button onclick="openEditShelterModal('${s.id}')" style="margin-top:5px; width:100%; background:#0f172a; color:#cbd5e1; font-weight:bold; font-size:10px; padding:3px 6px; border:1px solid #94a3b8; border-radius:4px; cursor:pointer;">
                    Edit Shelter & Resources
                </button>
            </div>
        `;

        const marker = new mapboxgl.Marker(el)
            .setLngLat([s.longitude, s.latitude])
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(popupHTML))
            .addTo(authorityMap);

        authorityMapMarkers.push(marker);
    });
}

// Render Queue Cards with defensive null checks and live search
function renderIncidentQueue() {
    const container = document.getElementById('queue-container');
    const noMsg = document.getElementById('no-incidents-msg');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('queue-search-input');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let filtered = allIncidents.filter(inc => {
        if (!inc) return false;

        // Status filters
        if (activeFilter === 'Active' && (inc.status === 'RESOLVED' || inc.status === 'CANCELLED')) return false;
        if (activeFilter === 'Critical' && inc.emergency_level !== 'CRITICAL') return false;
        if (activeFilter === 'Resolved' && inc.status !== 'RESOLVED') return false;

        // Search filter with safe null checks
        if (searchTerm) {
            const matchesId = (inc.id || '').toLowerCase().includes(searchTerm);
            const matchesCat = (inc.category || '').toLowerCase().includes(searchTerm);
            const matchesDetails = (inc.details || '').toLowerCase().includes(searchTerm);
            const matchesLoc = (inc.readable_address || '').toLowerCase().includes(searchTerm);
            if (!matchesId && !matchesCat && !matchesDetails && !matchesLoc) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        if (noMsg) noMsg.classList.remove('hidden');
        return;
    } else if (noMsg) {
        noMsg.classList.add('hidden');
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        const isCritical = item.emergency_level === 'CRITICAL';
        const isResolved = item.status === 'RESOLVED';
        const levelBadgeClass = `badge-${(item.emergency_level || 'HIGH').toLowerCase()}`;

        card.className = `p-3.5 rounded-xl border text-xs space-y-2.5 transition ${isCritical && !isResolved ? 'bg-red-950/20 border-red-800/80 shadow-lg shadow-red-950/20' : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'}`;
        
        const latNum = typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude);
        const lngNum = typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude);
        const latStr = !isNaN(latNum) ? latNum.toFixed(4) : item.latitude;
        const lngStr = !isNaN(lngNum) ? lngNum.toFixed(4) : item.longitude;

        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <span class="font-mono font-bold text-purple-400">${item.id}</span>
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${levelBadgeClass}">${item.emergency_level}</span>
                </div>
                <span class="font-extrabold uppercase text-[10px] px-2 py-0.5 rounded-full ${isResolved ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-purple-950 text-purple-200 border border-purple-700'}">
                    ${item.status}
                </span>
            </div>

            <div>
                <p class="font-bold text-white text-sm leading-snug">${item.category}</p>
                <p class="text-slate-300 text-xs leading-relaxed mt-1 line-clamp-2">${item.details || 'Emergency assistance requested.'}</p>
            </div>

            <div class="flex items-center justify-between text-slate-400 text-[11px] pt-1.5 border-t border-slate-800/80">
                <span><i data-lucide="users" class="w-3 h-3 inline text-purple-400 mr-1"></i>${item.count || 1} Victims</span>
                <span class="text-emerald-400 font-mono font-bold flex items-center">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                    <span>${latStr}, ${lngStr}</span>
                </span>
            </div>

            ${item.readable_address ? `
                <div class="text-[11px] text-slate-400 truncate flex items-center space-x-1" title="${item.readable_address}">
                    <i data-lucide="map-pin" class="w-3 h-3 text-purple-400 shrink-0"></i>
                    <span class="truncate">${item.readable_address}</span>
                </div>
            ` : ''}

            ${item.assigned_rescue_team ? `
                <div class="text-[11px] text-purple-300 bg-purple-950/50 p-1.5 rounded-lg border border-purple-800/50 flex items-center justify-between">
                    <span>Squad: <strong>${item.assigned_rescue_team}</strong></span>
                </div>
            ` : ''}

            <div class="grid grid-cols-2 gap-2 pt-2">
                <button onclick="focusAuthorityMap(${item.latitude}, ${item.longitude}, '${item.id}')" class="bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-800/80 px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center space-x-1.5 transition shadow">
                    <i data-lucide="crosshair" class="w-3.5 h-3.5 text-purple-400"></i>
                    <span>Live Location</span>
                </button>
                <button onclick="inspectIncident('${item.id}')" class="bg-purple-700 hover:bg-purple-600 text-white px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center space-x-1 transition shadow">
                    <span>Command Details →</span>
                </button>
            </div>
        `;

        container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function focusAuthorityMap(lat, lng, incidentId) {
    if (!authorityMap || lat === undefined || lng === undefined) return;
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (isNaN(nLat) || isNaN(nLng)) return;

    authorityMap.flyTo({ center: [nLng, nLat], zoom: 16, duration: 1200, essential: true });

    if (incidentMarkerMap && incidentId && incidentMarkerMap[incidentId]) {
        setTimeout(() => {
            incidentMarkerMap[incidentId].togglePopup();
        }, 600);
    }

    const mapContainer = document.getElementById('authority-map');
    if (mapContainer && window.innerWidth < 1024) {
        mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    showToast(`Targeting live citizen coordinates: [${nLat.toFixed(5)}, ${nLng.toFixed(5)}]`, 'info');
}

function setQueueFilter(filter) {
    activeFilter = filter;
    document.querySelectorAll('.q-tab').forEach(b => {
        b.classList.remove('bg-purple-700', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
    });

    let btnId = 'qtab-all';
    if (filter === 'Active') btnId = 'qtab-active';
    if (filter === 'Critical') btnId = 'qtab-critical';
    if (filter === 'Resolved') btnId = 'qtab-resolved';

    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.classList.remove('bg-slate-800', 'text-slate-300');
        activeBtn.classList.add('bg-purple-700', 'text-white');
    }

    renderIncidentQueue();
}

// -------------------------------------------------------------
// SHELTER & RESOURCE INVENTORY ADMIN MANAGEMENT
// -------------------------------------------------------------
function renderShelterAdminView() {
    const container = document.getElementById('shelter-admin-list');
    if (!container) return;

    container.innerHTML = '';

    if (allShelters.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-xs py-4 text-center col-span-full">No relief shelters currently registered.</p>`;
        return;
    }

    allShelters.forEach(s => {
        const freeSpots = Math.max(0, s.capacity - s.current_occupancy);
        const pctOccupied = Math.min(100, Math.round((s.current_occupancy / s.capacity) * 100));

        const card = document.createElement('div');
        card.className = 'bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3';
        card.innerHTML = `
            <div class="flex items-start justify-between">
                <div>
                    <h4 class="font-bold text-white text-sm">${s.title}</h4>
                    <p class="text-slate-400 text-xs mt-0.5">${s.address || 'Operational Zone'}</p>
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded ${s.status === 'Operational' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-amber-950 text-amber-300 border border-amber-700'}">
                    ${s.status}
                </span>
            </div>

            <!-- Capacity progress bar -->
            <div class="space-y-1">
                <div class="flex justify-between text-[11px] text-slate-400">
                    <span>Occupancy: <strong>${s.current_occupancy} / ${s.capacity}</strong></span>
                    <span class="${freeSpots > 20 ? 'text-emerald-400' : 'text-amber-400'} font-bold">${freeSpots} Free</span>
                </div>
                <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full ${pctOccupied > 90 ? 'bg-red-500' : (pctOccupied > 60 ? 'bg-amber-500' : 'bg-purple-500')}" style="width: ${pctOccupied}%"></div>
                </div>
            </div>

            <!-- Resource Rations Telemetry -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-300">
                <div class="bg-slate-900 p-2 rounded-lg">🍞 Food: <strong class="text-white">${s.food_packets || 0}</strong></div>
                <div class="bg-slate-900 p-2 rounded-lg">💧 Water: <strong class="text-white">${s.water_liters || 0}L</strong></div>
                <div class="bg-slate-900 p-2 rounded-lg">🩹 Kits: <strong class="text-white">${s.medical_kits || 0}</strong></div>
                <div class="bg-slate-900 p-2 rounded-lg">🛏️ Blankets: <strong class="text-white">${s.blankets || 0}</strong></div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-900">
                <button onclick="openEditShelterModal('${s.id}')" class="bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs px-3 py-1.5 rounded-lg font-bold transition">
                    Edit Stock & Capacity
                </button>
                <button onclick="deleteShelterConfirm('${s.id}', '${s.title.replace(/'/g, "\\'")}')" class="text-red-400 hover:text-red-300 text-xs">
                    Delete
                </button>
            </div>
        `;
        container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openEditShelterModal(shelterId) {
    const shelter = allShelters.find(s => s.id === shelterId);
    if (!shelter) return;

    let modal = document.getElementById('shelter-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shelter-edit-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800 rounded-2xl max-w-lg w-full p-6 text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 class="font-black text-white text-base">Edit Shelter & Resources: ${shelter.title}</h3>
                <button onclick="document.getElementById('shelter-edit-modal').classList.add('hidden')" class="text-slate-400 hover:text-white">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <form onsubmit="saveShelterEditChanges(event, '${shelter.id}')" class="space-y-3 text-xs">
                <div>
                    <label class="block text-slate-300 font-bold mb-1">Shelter Title / Facility Name</label>
                    <input type="text" id="edit-sh-title" value="${shelter.title}" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-slate-300 font-bold mb-1">Physical Location Address</label>
                    <input type="text" id="edit-sh-address" value="${shelter.address || ''}" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Latitude</label>
                        <input type="number" step="any" id="edit-sh-lat" value="${shelter.latitude}" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Longitude</label>
                        <input type="number" step="any" id="edit-sh-lng" value="${shelter.longitude}" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Max Capacity</label>
                        <input type="number" id="edit-sh-capacity" value="${shelter.capacity}" min="1" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Current Occupancy</label>
                        <input type="number" id="edit-sh-occupancy" value="${shelter.current_occupancy}" min="0" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Status</label>
                        <select id="edit-sh-status" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                            <option value="Operational" ${shelter.status === 'Operational' ? 'selected' : ''}>Operational</option>
                            <option value="Full" ${shelter.status === 'Full' ? 'selected' : ''}>Full</option>
                            <option value="Evacuating" ${shelter.status === 'Evacuating' ? 'selected' : ''}>Evacuating</option>
                            <option value="Closed" ${shelter.status === 'Closed' ? 'selected' : ''}>Closed</option>
                        </select>
                    </div>
                </div>

                <div class="border-t border-slate-800 pt-3">
                    <p class="font-bold text-purple-300 uppercase text-[11px] mb-2">Live Stocked Resources</p>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-400 mb-1">Food Packets Count</label>
                            <input type="number" id="edit-sh-food" value="${shelter.food_packets || 0}" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Water Supply (Liters)</label>
                            <input type="number" id="edit-sh-water" value="${shelter.water_liters || 0}" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Trauma Medical Kits</label>
                            <input type="number" id="edit-sh-kits" value="${shelter.medical_kits || 0}" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Thermal Blankets</label>
                            <input type="number" id="edit-sh-blankets" value="${shelter.blankets || 0}" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-slate-300 font-bold mb-1">Resources Description Note</label>
                    <textarea id="edit-sh-summary" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">${shelter.resources_summary || ''}</textarea>
                </div>

                <div class="pt-2">
                    <button type="submit" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                        Save Shelter & Resource Updates
                    </button>
                </div>
            </form>
        </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function saveShelterEditChanges(e, shelterId) {
    e.preventDefault();

    const payload = {
        title: document.getElementById('edit-sh-title').value.trim(),
        address: document.getElementById('edit-sh-address').value.trim(),
        latitude: parseFloat(document.getElementById('edit-sh-lat').value),
        longitude: parseFloat(document.getElementById('edit-sh-lng').value),
        capacity: parseInt(document.getElementById('edit-sh-capacity').value, 10),
        currentOccupancy: parseInt(document.getElementById('edit-sh-occupancy').value, 10),
        status: document.getElementById('edit-sh-status').value,
        foodPackets: parseInt(document.getElementById('edit-sh-food').value, 10) || 0,
        waterLiters: parseInt(document.getElementById('edit-sh-water').value, 10) || 0,
        medicalKits: parseInt(document.getElementById('edit-sh-kits').value, 10) || 0,
        blankets: parseInt(document.getElementById('edit-sh-blankets').value, 10) || 0,
        resourcesSummary: document.getElementById('edit-sh-summary').value.trim()
    };

    try {
        const res = await api.patch(`/api/shelters/${shelterId}`, payload);
        if (!res.success) throw new Error(res.message || 'Shelter update failed');

        showToast('Shelter capacity and resources updated successfully.', 'success');
        document.getElementById('shelter-edit-modal').classList.add('hidden');
        await fetchSheltersList();
    } catch (err) {
        showToast(err.message || 'Failed to update shelter', 'error');
    }
}

function openNewShelterModal() {
    let modal = document.getElementById('shelter-new-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shelter-new-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800 rounded-2xl max-w-lg w-full p-6 text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 class="font-black text-white text-base">Register New Emergency Relief Shelter</h3>
                <button onclick="document.getElementById('shelter-new-modal').classList.add('hidden')" class="text-slate-400 hover:text-white">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <form onsubmit="handleCreateNewShelter(event)" class="space-y-3 text-xs">
                <div>
                    <label class="block text-slate-300 font-bold mb-1">Shelter Title / Facility Name</label>
                    <input type="text" id="new-sh-title" placeholder="e.g. Gomti Nagar Evacuation Relief Camp #4" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                </div>

                <div>
                    <label class="block text-slate-300 font-bold mb-1">Physical Location Address</label>
                    <input type="text" id="new-sh-address" placeholder="e.g. Sector 5 Community Centre, Lucknow" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Latitude</label>
                        <input type="number" step="any" id="new-sh-lat" value="26.8500" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Longitude</label>
                        <input type="number" step="any" id="new-sh-lng" value="80.9400" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Max Capacity (People)</label>
                        <input type="number" id="new-sh-capacity" value="200" min="1" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Initial Occupancy</label>
                        <input type="number" id="new-sh-occupancy" value="0" min="0" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                </div>

                <div class="border-t border-slate-800 pt-3">
                    <p class="font-bold text-purple-300 uppercase text-[11px] mb-2">Initial Resource Stock</p>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-slate-400 mb-1">Food Packets</label>
                            <input type="number" id="new-sh-food" value="500" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Water Supply (Liters)</label>
                            <input type="number" id="new-sh-water" value="1500" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Trauma Medical Kits</label>
                            <input type="number" id="new-sh-kits" value="50" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Thermal Blankets</label>
                            <input type="number" id="new-sh-blankets" value="250" min="0" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                        </div>
                    </div>
                </div>

                <div class="pt-2">
                    <button type="submit" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                        Register Shelter in Tactical Database
                    </button>
                </div>
            </form>
        </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function handleCreateNewShelter(e) {
    e.preventDefault();

    const payload = {
        title: document.getElementById('new-sh-title').value.trim(),
        address: document.getElementById('new-sh-address').value.trim(),
        latitude: parseFloat(document.getElementById('new-sh-lat').value),
        longitude: parseFloat(document.getElementById('new-sh-lng').value),
        capacity: parseInt(document.getElementById('new-sh-capacity').value, 10),
        currentOccupancy: parseInt(document.getElementById('new-sh-occupancy').value, 10),
        status: 'Operational',
        foodPackets: parseInt(document.getElementById('new-sh-food').value, 10) || 0,
        waterLiters: parseInt(document.getElementById('new-sh-water').value, 10) || 0,
        medicalKits: parseInt(document.getElementById('new-sh-kits').value, 10) || 0,
        blankets: parseInt(document.getElementById('new-sh-blankets').value, 10) || 0,
        resourcesSummary: 'Standard emergency relief rations'
    };

    try {
        const res = await api.post('/api/shelters', payload);
        if (!res.success) throw new Error(res.message || 'Creation failed');

        showToast('New shelter registered successfully.', 'success');
        document.getElementById('shelter-new-modal').classList.add('hidden');
        await fetchSheltersList();
    } catch (err) {
        showToast(err.message || 'Failed to create shelter', 'error');
    }
}

async function deleteShelterConfirm(shelterId, title) {
    if (!confirm(`Are you sure you want to delete shelter '${title}'?`)) return;

    try {
        const res = await api.delete(`/api/shelters/${shelterId}`);
        if (!res.success) throw new Error(res.message || 'Delete failed');

        showToast(`Shelter '${title}' deleted.`, 'success');
        await fetchSheltersList();
    } catch (err) {
        showToast(err.message || 'Failed to delete shelter', 'error');
    }
}

// -------------------------------------------------------------
// INCIDENT INSPECT & COMMAND MODAL
// -------------------------------------------------------------
async function inspectIncident(id) {
    try {
        showToast(`Loading details for incident ${id}...`, 'info');
        const res = await api.get(`/api/incidents/${id}`);
        if (!res.success || !res.data) throw new Error(res.message || 'Incident lookup failed');

        const incData = res.data.incident || res.data;
        const updatesData = res.data.updates || incData.updates || [];

        currentInspectedIncident = {
            ...incData,
            updates: updatesData
        };

        renderIncidentInspectModal(currentInspectedIncident);
    } catch (e) {
        showToast(e.message || 'Failed to open incident details', 'error');
    }
}

function renderIncidentInspectModal(inc) {
    let modal = document.getElementById('incident-inspect-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'incident-inspect-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    const updatesHTML = (inc.updates && inc.updates.length > 0)
        ? inc.updates.map(u => `
            <div class="text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <div class="flex items-center justify-between text-slate-400">
                    <span class="font-bold text-purple-300">${u.updated_by_role || 'OPERATOR'}:</span>
                    <span>${new Date(u.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <p class="text-slate-200 leading-snug">${u.note}</p>
                ${u.status_to ? `<span class="inline-block text-[9px] font-mono text-emerald-400">→ Status: ${u.status_to}</span>` : ''}
            </div>
        `).join('')
        : '<p class="text-slate-500 text-xs">No prior activity logged.</p>';

    const teamOptions = allRescueTeams.map(t => `
        <option value="${t.name}" ${inc.assigned_rescue_team === t.name ? 'selected' : ''}>
            ${t.name} (${t.status}) - ${t.type || 'General Squad'}
        </option>
    `).join('');

    // Evidence media rendering
    let evidenceHTML = '<span class="text-slate-500 italic text-xs">No media uploaded</span>';
    if (inc.evidence_url) {
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(inc.evidence_url);
        const isAudio = /\.(wav|mp3|ogg|webm)$/i.test(inc.evidence_url) && !isVideo;
        if (isVideo) {
            evidenceHTML = `
                <div class="space-y-1">
                    <video src="${inc.evidence_url}" controls class="max-h-48 rounded-lg border border-slate-700 w-full bg-black"></video>
                    <a href="${inc.evidence_url}" target="_blank" class="text-purple-400 underline font-bold text-xs inline-flex items-center space-x-1">
                        <span>Open Video Evidence ↗</span>
                    </a>
                </div>
            `;
        } else if (isAudio) {
            evidenceHTML = `
                <div class="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <span class="text-xs font-bold text-purple-300 flex items-center space-x-1"><i data-lucide="headphones" class="w-3.5 h-3.5"></i><span>Voice SOS Recording</span></span>
                    <audio src="${inc.evidence_url}" controls class="w-full h-8 rounded mt-1"></audio>
                </div>
            `;
        } else {
            evidenceHTML = `
                <div class="space-y-1">
                    <img src="${inc.evidence_url}" alt="Incident Evidence" class="max-h-48 rounded-lg border border-slate-700 object-cover">
                    <a href="${inc.evidence_url}" target="_blank" class="text-purple-400 underline font-bold text-xs inline-flex items-center space-x-1">
                        <span>Open Full Resolution Evidence ↗</span>
                    </a>
                </div>
            `;
        }
    }

    const createdTimeStr = inc.created_at ? new Date(inc.created_at).toLocaleString() : 'Recent';
    const updatedTimeStr = inc.updated_at ? new Date(inc.updated_at).toLocaleString() : createdTimeStr;
    const resolvedTimeStr = inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : null;

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800 rounded-2xl max-w-2xl w-full p-6 text-slate-200 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <!-- Modal Header -->
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div class="flex items-center space-x-2">
                    <span class="font-mono text-base font-black text-purple-400">${inc.id}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase badge-${(inc.emergency_level || 'HIGH').toLowerCase()}">${inc.emergency_level}</span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">Risk: ${inc.risk_score || 75}/100</span>
                </div>
                <button onclick="document.getElementById('incident-inspect-modal').classList.add('hidden')" class="text-slate-400 hover:text-white">
                    <i data-lucide="x" class="w-6 h-6"></i>
                </button>
            </div>

            <!-- MANDATORY ACTION BUTTONS (SECTION 13) -->
            <div class="bg-slate-950 p-3 rounded-xl border border-purple-800/60 flex flex-wrap gap-2">
                <button onclick="acknowledgeIncident('${inc.id}')" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1 transition shadow">
                    <i data-lucide="check" class="w-3.5 h-3.5"></i>
                    <span>ACKNOWLEDGE</span>
                </button>
                <button onclick="document.getElementById('modal-team-select').focus()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1 transition shadow">
                    <i data-lucide="truck" class="w-3.5 h-3.5"></i>
                    <span>ASSIGN TEAM</span>
                </button>
                <button onclick="openContactCitizenDrawer('${inc.id}')" class="bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition">
                    <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                    <span>CONTACT USER</span>
                </button>
                <button onclick="viewIncidentSafeRoute('${inc.id}', ${inc.latitude}, ${inc.longitude})" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1 transition shadow">
                    <i data-lucide="navigation-2" class="w-3.5 h-3.5"></i>
                    <span>VIEW ROUTE</span>
                </button>
                <button onclick="promptChangePriority('${inc.id}', '${inc.emergency_level}')" class="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition">
                    <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
                    <span>CHANGE PRIORITY</span>
                </button>
                <button onclick="quickResolveIncident('${inc.id}')" class="bg-emerald-800 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1 transition shadow">
                    <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
                    <span>MARK RESOLVED</span>
                </button>
                <button onclick="generateIncidentReport('${inc.id}')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 transition">
                    <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                    <span>GENERATE REPORT</span>
                </button>
            </div>

            <!-- Incident Overview Details -->
            <div class="grid sm:grid-cols-2 gap-4 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                    <strong class="text-white text-sm">${inc.category}</strong>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Current Status</span>
                    <span class="text-emerald-400 font-bold uppercase text-sm">${inc.status}</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">People Affected</span>
                    <span class="text-white font-bold">${inc.count || 1} Person(s)</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Assigned Squad</span>
                    <span class="text-purple-300 font-semibold">${inc.assigned_rescue_team || 'Pending Team Dispatch'}</span>
                </div>

                <!-- Live Citizen GPS Telemetry Card -->
                <div class="sm:col-span-2 bg-slate-900 p-4 rounded-xl border border-purple-800/80 space-y-3 shadow-lg">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <span class="relative flex h-3 w-3">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            <span class="font-extrabold text-white text-xs uppercase tracking-wider">Citizen Live Location Telemetry</span>
                        </div>
                        <span class="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-700 font-bold flex items-center space-x-1">
                            <span>●</span>
                            <span>GPS Active</span>
                        </span>
                    </div>

                    <div class="grid sm:grid-cols-2 gap-3">
                        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Exact Coordinates</span>
                            <span class="text-emerald-400 font-mono text-sm font-bold block mt-0.5">
                                <span id="inspect-live-lat">${typeof inc.latitude === 'number' ? inc.latitude.toFixed(6) : inc.latitude}</span>, 
                                <span id="inspect-live-lng">${typeof inc.longitude === 'number' ? inc.longitude.toFixed(6) : inc.longitude}</span>
                            </span>
                        </div>
                        <div class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Landmark / Geocoded Address</span>
                            <span class="text-slate-200 text-xs font-semibold block mt-0.5 truncate" title="${inc.readable_address || ''}">
                                ${inc.readable_address || 'Lucknow Regional Coordinates'}
                            </span>
                        </div>
                    </div>

                    <!-- Live Actions Bar -->
                    <div class="flex flex-wrap items-center gap-2 pt-1">
                        <button onclick="trackLiveLocationOnMap('${inc.id}', ${inc.latitude}, ${inc.longitude})" class="bg-purple-700 hover:bg-purple-600 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center space-x-1.5 shadow transition">
                            <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                            <span>Track on Tactical Map</span>
                        </button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${inc.latitude},${inc.longitude}" target="_blank" class="bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-700/60 font-bold py-2 px-3.5 rounded-xl text-xs flex items-center space-x-1.5 transition shadow">
                            <i data-lucide="navigation" class="w-3.5 h-3.5 text-purple-400"></i>
                            <span>Google Maps ↗</span>
                        </a>
                        <button onclick="navigator.clipboard.writeText('${inc.latitude}, ${inc.longitude}'); showToast('GPS Coordinates copied!', 'success');" class="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 py-2 px-3 rounded-xl text-xs flex items-center space-x-1 transition">
                            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            <span>Copy GPS</span>
                        </button>
                    </div>

                    <!-- Embedded Interactive Radar Mini-Map -->
                    <div id="modal-live-minimap" class="w-full h-44 rounded-xl overflow-hidden border border-slate-800 relative bg-slate-950">
                    </div>
                </div>

                <div class="sm:col-span-2">
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Emergency Situation Report</span>
                    <p class="text-slate-200 text-xs mt-1 leading-relaxed bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">${inc.details || 'No details provided.'}</p>
                </div>

                ${inc.priority_explanation ? `
                    <div class="sm:col-span-2 bg-slate-900 p-3 rounded-lg border border-purple-800/40 space-y-1">
                        <span class="text-purple-300 font-bold block text-[10px] uppercase">AI Risk Engine Analysis</span>
                        <p class="text-slate-200 text-xs leading-relaxed">${inc.priority_explanation}</p>
                        ${inc.recommended_action ? `<p class="text-emerald-300 text-xs font-semibold mt-1">💡 Action: ${inc.recommended_action}</p>` : ''}
                    </div>
                ` : ''}

                <div class="sm:col-span-2">
                    <span class="text-slate-400 block text-[10px] uppercase font-bold mb-1">Attached Incident Evidence</span>
                    ${evidenceHTML}
                </div>

                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Reported At</span>
                    <span class="text-slate-400 text-[11px]">${createdTimeStr}</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Last Updated</span>
                    <span class="text-slate-400 text-[11px]">${updatedTimeStr}</span>
                </div>

                ${resolvedTimeStr ? `
                    <div class="sm:col-span-2 bg-emerald-950/40 p-2 rounded border border-emerald-800 text-emerald-300">
                        <span class="font-bold">Resolved At:</span> ${resolvedTimeStr}
                        ${inc.resolution_notes ? `<p class="mt-0.5 text-xs text-emerald-200">${inc.resolution_notes}</p>` : ''}
                    </div>
                ` : ''}
            </div>

            <!-- Authority Status & Team Transition Controls (Section 14) -->
            <div class="space-y-4 border-t border-slate-800 pt-4">
                <h4 class="font-bold text-white text-xs uppercase tracking-wider">Status Lifecycle & Dispatch Override</h4>

                <div class="grid sm:grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Incident Lifecycle Status</label>
                        <select id="modal-status-select" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:border-purple-500 focus:outline-none">
                            <option value="NEW" ${inc.status === 'NEW' ? 'selected' : ''}>NEW (Beacon Received)</option>
                            <option value="ACKNOWLEDGED" ${inc.status === 'ACKNOWLEDGED' ? 'selected' : ''}>ACKNOWLEDGED</option>
                            <option value="ANALYZING" ${inc.status === 'ANALYZING' ? 'selected' : ''}>ANALYZING (Risk Triage)</option>
                            <option value="ASSIGNED" ${inc.status === 'ASSIGNED' ? 'selected' : ''}>ASSIGNED</option>
                            <option value="TEAM_DISPATCHED" ${inc.status === 'TEAM_DISPATCHED' ? 'selected' : ''}>TEAM_DISPATCHED</option>
                            <option value="TEAM_APPROACHING" ${inc.status === 'TEAM_APPROACHING' ? 'selected' : ''}>TEAM_APPROACHING</option>
                            <option value="ON_SCENE" ${inc.status === 'ON_SCENE' ? 'selected' : ''}>ON_SCENE</option>
                            <option value="RESOLVED" ${inc.status === 'RESOLVED' ? 'selected' : ''}>RESOLVED</option>
                            <option value="CANCELLED" ${inc.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-slate-300 font-bold mb-1">Assign Rescue Squad</label>
                        <select id="modal-team-select" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:border-purple-500 focus:outline-none">
                            <option value="">-- Select Rescue Squad --</option>
                            ${teamOptions}
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-slate-300 text-xs font-bold mb-1">Append Timeline Triage Note</label>
                    <textarea id="modal-note-input" rows="2" placeholder="Enter tactical update or dispatch instruction..." class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"></textarea>
                </div>

                <div class="flex items-center space-x-3 pt-2">
                    <button onclick="saveIncidentModalChanges('${inc.id}')" class="bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 px-5 rounded-xl text-xs shadow-lg transition">
                        Save Command Updates
                    </button>
                    ${inc.status !== 'RESOLVED' ? `
                        <button onclick="quickResolveIncident('${inc.id}')" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow transition">
                            Mark Case Resolved ✓
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- Activity Audit Trail -->
            <div class="border-t border-slate-800 pt-4 space-y-2">
                <h4 class="font-bold text-slate-300 text-xs uppercase tracking-wider">Incident Activity & Audit History</h4>
                <div class="space-y-2 max-h-40 overflow-y-auto pr-1">
                    ${updatesHTML}
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Render interactive live radar mini-map centered on citizen position
    setTimeout(() => {
        const miniEl = document.getElementById('modal-live-minimap');
        if (miniEl && typeof L !== 'undefined' && inc.latitude && inc.longitude) {
            miniEl.innerHTML = '';
            try {
                const miniMap = L.map('modal-live-minimap', {
                    zoomControl: false,
                    attributionControl: false
                }).setView([inc.latitude, inc.longitude], 15);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    maxZoom: 19
                }).addTo(miniMap);

                const icon = L.divIcon({
                    className: 'live-citizen-marker',
                    html: `<div style="background-color:#ef4444; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 16px #ef4444;" class="radar-ping"></div>`,
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                });

                L.marker([inc.latitude, inc.longitude], { icon })
                    .bindPopup(`<strong style="color:#ef4444;">📍 Live Citizen Location</strong><br><span style="font-size:11px;color:#333;">${inc.category} • ${inc.id}</span>`)
                    .addTo(miniMap)
                    .openPopup();

                L.circle([inc.latitude, inc.longitude], {
                    radius: 200,
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.15,
                    weight: 1
                }).addTo(miniMap);

                setTimeout(() => miniMap.invalidateSize(), 200);
            } catch (err) {
                console.warn('Mini-map init warning:', err.message);
            }
        }
    }, 150);
}

// -------------------------------------------------------------
// ACTION BUTTON HANDLERS (SECTION 13)
// -------------------------------------------------------------
async function acknowledgeIncident(id) {
    try {
        const res = await api.patch(`/api/incidents/${id}`, {
            status: 'ACKNOWLEDGED',
            note: 'Incident acknowledged by commanding officer.'
        });
        if (!res.success) throw new Error(res.message || 'Acknowledge failed');

        showToast(`Incident [${id}] ACKNOWLEDGED by Command HQ.`, 'success');
        await inspectIncident(id);
        await fetchOverviewStats();
        await fetchIncidentsList();
    } catch (e) {
        showToast(e.message || 'Failed to acknowledge incident', 'error');
    }
}

function openContactCitizenDrawer(id) {
    const inc = allIncidents.find(i => i.id === id) || currentInspectedIncident;
    const phone = (inc && (inc.phone || inc.contact_phone)) || '+91 9876543210';

    const msg = prompt(`Contact Citizen for SOS [${id}]\nEnter message or dial directly at ${phone}:`, `Emergency dispatch update for incident ${id}: First responder squad has been deployed.`);
    if (msg) {
        showToast(`Dispatch message queued to citizen at ${phone}: "${msg}"`, 'success');
    }
}

async function viewIncidentSafeRoute(incidentId, lat, lng) {
    const modal = document.getElementById('incident-inspect-modal');
    if (modal) modal.classList.add('hidden');

    switchAuthorityView('tactical');

    try {
        showToast(`Calculating safe tactical route for incident ${incidentId}...`, 'info');
        const res = await api.get(`/api/routes/safe-route?destLat=${lat}&destLng=${lng}&incidentId=${incidentId}`);
        if (!res.success) throw new Error(res.message || 'Route calculation failed');

        const routeData = res.data || res;

        // Fly authority map to destination
        if (authorityMap) {
            authorityMap.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 });

            const geojson = {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: routeData.waypoints
                }
            };

            if (authorityMap.getSource('authority-safe-route')) {
                authorityMap.getSource('authority-safe-route').setData(geojson);
            } else {
                authorityMap.addSource('authority-safe-route', {
                    type: 'geojson',
                    data: geojson
                });
                authorityMap.addLayer({
                    id: 'authority-safe-route-line',
                    type: 'line',
                    source: 'authority-safe-route',
                    paint: { 'line-color': '#a855f7', 'line-width': 5 }
                });
            }
        }

        showToast(`Safe route computed: ${routeData.distanceKm} km • ETA: ${routeData.etaMinutes} mins • Risk: ${routeData.routeRisk}`, 'success');
    } catch (e) {
        showToast(e.message || 'Failed to compute route', 'error');
    }
}

async function promptChangePriority(id, currentPriority) {
    const newPriority = prompt(`Change Priority for [${id}]\nEnter priority (CRITICAL, HIGH, MEDIUM, LOW):`, currentPriority || 'HIGH');
    if (!newPriority) return;

    const upper = newPriority.trim().toUpperCase();
    if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(upper)) {
        showToast('Invalid priority. Choose CRITICAL, HIGH, MEDIUM, or LOW.', 'error');
        return;
    }

    try {
        const res = await api.patch(`/api/incidents/${id}`, {
            emergency_level: upper,
            note: `Priority changed to ${upper} by authority officer.`
        });
        if (!res.success) throw new Error(res.message || 'Priority update failed');

        showToast(`Priority for incident [${id}] set to ${upper}.`, 'success');
        await inspectIncident(id);
        await fetchOverviewStats();
        await fetchIncidentsList();
    } catch (e) {
        showToast(e.message || 'Failed to update priority', 'error');
    }
}

async function generateIncidentReport(id) {
    try {
        showToast(`Generating official report dossier for ${id}...`, 'info');
        const res = await api.get(`/api/incidents/${id}/report`);
        if (!res.success && !res.data) throw new Error(res.message || 'Report generation failed');
        const data = res.data || res;

        // Open in printable window if supported, or inform user
        const reportWindow = window.open('', '_blank');
        if (reportWindow) {
            reportWindow.document.write(`
                <html>
                    <head>
                        <title>Emergency Incident Dossier - ${escapeHtml(id)}</title>
                        <style>
                            body { font-family: monospace; padding: 24px; background: #fff; color: #000; line-height: 1.5; }
                            h1 { color: #7e22ce; }
                            pre { background: #f4f4f4; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
                            button { padding: 8px 16px; background: #7e22ce; color: white; border: none; border-radius: 4px; cursor: pointer; }
                        </style>
                    </head>
                    <body>
                        <button onclick="window.print()">Print Dossier (PDF)</button>
                        <pre>${escapeHtml(data.markdownReport || JSON.stringify(data, null, 2))}</pre>
                    </body>
                </html>
            `);
            reportWindow.document.close();
        }
        showToast(`Report dossier for ${id} generated!`, 'success');
    } catch (e) {
        showToast(e.message || 'Failed to generate incident report', 'error');
    }
}

async function saveIncidentModalChanges(id) {
    const statusSelect = document.getElementById('modal-status-select');
    const teamSelect = document.getElementById('modal-team-select');
    const noteInput = document.getElementById('modal-note-input');

    const status = statusSelect ? statusSelect.value : null;
    const team = teamSelect ? teamSelect.value : null;
    const note = noteInput ? noteInput.value.trim() : '';

    try {
        const payload = {};
        if (status) payload.status = status;
        if (team) payload.assignedRescueTeam = team;
        if (note) payload.note = note;

        const res = await api.patch(`/api/incidents/${id}`, payload);
        if (!res.success) throw new Error(res.message || 'Update failed');

        showToast(`Incident [${id}] updated successfully.`, 'success');
        document.getElementById('incident-inspect-modal').classList.add('hidden');

        await fetchOverviewStats();
        await fetchIncidentsList();
    } catch (e) {
        showToast(e.message || 'Failed to update incident', 'error');
    }
}

async function quickResolveIncident(id) {
    const notes = prompt(`Mark incident ${id} as RESOLVED?\nEnter resolution notes:`, 'Incident resolved by on-scene commanding officer.');
    if (notes === null) return;

    try {
        const res = await api.patch(`/api/incidents/${id}`, {
            status: 'RESOLVED',
            resolutionNotes: notes || 'Incident resolved by Duty Officer.',
            note: notes || 'Incident marked resolved by Duty Officer.'
        });
        if (!res.success) throw new Error(res.message || 'Resolve failed');

        showToast(`Incident [${id}] marked RESOLVED.`, 'success');
        document.getElementById('incident-inspect-modal').classList.add('hidden');

        await fetchOverviewStats();
        await fetchIncidentsList();
    } catch (e) {
        showToast(e.message || 'Failed to resolve incident', 'error');
    }
}

function handleIncomingSOSAlert(incident) {
    allIncidents.unshift(incident);
    renderIncidentQueue();
    renderMapMarkers();
    fetchOverviewStats();

    showToast(`🚨 NEW EMERGENCY SOS: [${incident.id}] ${incident.category}`, 'error');
    if (audioSirenEnabled) playAlertChirp();
}

function handleIncidentUpdated(updatedIncident) {
    const targetId = updatedIncident.id || (updatedIncident.incident && updatedIncident.incident.id);
    const updatedData = updatedIncident.incident || updatedIncident;

    const idx = allIncidents.findIndex(i => i.id === targetId);
    if (idx !== -1) {
        allIncidents[idx] = { ...allIncidents[idx], ...updatedData };
        renderIncidentQueue();
        renderMapMarkers();
        fetchOverviewStats();
    }

    if (currentInspectedIncident && currentInspectedIncident.id === targetId) {
        inspectIncident(targetId);
    }
}

function handleIncidentLocationUpdated(data) {
    if (!data || !data.id) return;
    const item = allIncidents.find(i => i.id === data.id);
    if (item) {
        item.latitude = data.latitude;
        item.longitude = data.longitude;
        item.updated_at = data.updated_at || new Date().toISOString();

        // Dynamically update marker on Mapbox Tactical Grid
        if (incidentMarkerMap && incidentMarkerMap[data.id]) {
            incidentMarkerMap[data.id].setLngLat([data.longitude, data.latitude]);
        }

        // Dynamically update coordinates in modal if open
        if (currentInspectedIncident && currentInspectedIncident.id === data.id) {
            currentInspectedIncident.latitude = data.latitude;
            currentInspectedIncident.longitude = data.longitude;
            const latEl = document.getElementById('inspect-live-lat');
            const lngEl = document.getElementById('inspect-live-lng');
            if (latEl) latEl.innerText = Number(data.latitude).toFixed(6);
            if (lngEl) lngEl.innerText = Number(data.longitude).toFixed(6);
        }

        renderIncidentQueue();
        showToast(`🛰️ Live GPS coordinates updated for SOS [${data.id}]: ${Number(data.latitude).toFixed(4)}, ${Number(data.longitude).toFixed(4)}`, 'info');
    }
}

function trackLiveLocationOnMap(id, lat, lng) {
    const modal = document.getElementById('incident-inspect-modal');
    if (modal) modal.classList.add('hidden');
    focusAuthorityMap(lat, lng, id);
}

function playAlertChirp() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
        // AudioContext may be blocked before first user gesture
    }
}

// Global Exports
window.syncData = syncData;
window.authorityLogout = authorityLogout;
window.handleAuthorityLogin = handleAuthorityLogin;
window.setQueueFilter = setQueueFilter;
window.inspectIncident = inspectIncident;
window.saveIncidentModalChanges = saveIncidentModalChanges;
window.quickResolveIncident = quickResolveIncident;
window.openNewShelterModal = openNewShelterModal;
window.handleCreateNewShelter = handleCreateNewShelter;
window.openEditShelterModal = openEditShelterModal;
window.saveShelterEditChanges = saveShelterEditChanges;
window.deleteShelterConfirm = deleteShelterConfirm;
window.focusAuthorityMap = focusAuthorityMap;
window.renderIncidentQueue = renderIncidentQueue;
window.switchAuthorityAccount = switchAuthorityAccount;
window.trackLiveLocationOnMap = trackLiveLocationOnMap;
window.handleIncidentLocationUpdated = handleIncidentLocationUpdated;

// =========================================================================
// MASTER DATABASE EXPLORER CONTROLLER (AUTHORITY & ADMIN)
// =========================================================================
let currentAuthorityView = 'tactical';
let currentDbTable = 'incidents';
let currentDbPage = 1;
let currentDbPageSize = 25;
let currentDbSearch = '';
let dbOverviewData = null;
let currentTableData = null;
let dbSearchDebounceTimer = null;
let currentInspectedDbRecord = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function switchAuthorityView(viewName) {
    currentAuthorityView = viewName;

    // Hide all subviews
    document.querySelectorAll('.authority-subview').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Reset all nav button classes (desktop & mobile)
    const viewNames = ['tactical', 'teams', 'resources', 'clusters', 'analytics', 'database'];
    viewNames.forEach(v => {
        const btn = document.getElementById(`nav-btn-${v}`);
        if (btn) {
            btn.className = "px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition text-slate-400 hover:text-slate-200";
        }
        const mobBtn = document.getElementById(`mob-auth-${v}`);
        if (mobBtn) {
            mobBtn.className = "auth-mob-btn px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold whitespace-nowrap flex items-center space-x-1";
        }
    });

    const activeBtn = document.getElementById(`nav-btn-${viewName}`);
    if (activeBtn) {
        activeBtn.className = "px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition bg-purple-700 text-white shadow-md";
    }
    const activeMobBtn = document.getElementById(`mob-auth-${viewName}`);
    if (activeMobBtn) {
        activeMobBtn.className = "auth-mob-btn px-3 py-1.5 rounded-full bg-purple-700 text-white font-bold whitespace-nowrap shadow flex items-center space-x-1";
    }

    if (viewName === 'database') {
        if (!dbOverviewData) {
            loadDatabaseOverview(true);
        } else {
            loadTableData();
        }
    } else if (viewName === 'teams') {
        renderRescueTeamsFleet();
    } else if (viewName === 'resources') {
        renderResourcesInventory();
    } else if (viewName === 'clusters') {
        fetchIncidentClusters();
    } else if (viewName === 'analytics') {
        fetchAnalyticsSummary();
    } else if (viewName === 'tactical') {
        if (authorityMap && typeof authorityMap.resize === 'function') {
            setTimeout(() => authorityMap.resize(), 100);
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// -------------------------------------------------------------
// RESCUE FLEET MANAGEMENT (SECTION 15)
// -------------------------------------------------------------
async function renderRescueTeamsFleet() {
    const container = document.getElementById('rescue-teams-list-grid');
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full text-center py-10 text-slate-400 text-xs">
            <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <span>Loading rescue team fleet...</span>
        </div>
    `;

    try {
        const res = await api.get('/api/rescue-teams');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch teams');

        allRescueTeams = res.data;
        container.innerHTML = '';

        allRescueTeams.forEach(t => {
            const isAvail = t.status === 'AVAILABLE';
            const isBusy = t.status === 'BUSY';
            const statusClass = isAvail 
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700' 
                : (isBusy ? 'bg-amber-950 text-amber-300 border-amber-700' : 'bg-slate-800 text-slate-400 border-slate-700');

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-3";
            card.innerHTML = `
                <div>
                    <div class="flex items-start justify-between">
                        <div>
                            <span class="text-[10px] font-mono text-purple-400 font-bold block">${t.id}</span>
                            <h3 class="font-bold text-white text-base">${t.name}</h3>
                            <p class="text-xs text-purple-300 font-semibold">${t.type || 'Rescue Squad'}</p>
                        </div>
                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded border ${statusClass}">
                            ${t.status}
                        </span>
                    </div>

                    <div class="space-y-1.5 text-xs text-slate-300 mt-3 pt-3 border-t border-slate-800">
                        <div class="flex justify-between">
                            <span class="text-slate-400">Squad Members:</span>
                            <strong class="text-white">${t.members || 6} personnel</strong>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-400">Assigned Vehicle:</span>
                            <strong class="text-white">${t.vehicle || 'Standard Emergency Transit'}</strong>
                        </div>
                        <div>
                            <span class="text-slate-400 block mb-0.5">Tactical Gear:</span>
                            <span class="text-slate-200 text-[11px]">${t.equipment || 'Trauma medical kits, satellite radio, cutting gear'}</span>
                        </div>
                        ${t.current_incident ? `
                            <div class="p-2 bg-red-950/40 border border-red-800/40 rounded-lg text-red-300 font-bold text-[11px]">
                                Current Target: ${t.current_incident}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Status Update Control -->
                <div class="pt-3 border-t border-slate-800 space-y-1.5">
                    <label class="block text-[10px] text-slate-400 font-bold uppercase">Change Team Status</label>
                    <div class="grid grid-cols-3 gap-1 text-[10px] font-bold">
                        <button onclick="updateRescueTeamStatus('${t.id}', 'AVAILABLE')" class="py-1 px-1.5 rounded transition ${isAvail ? 'bg-emerald-700 text-white font-extrabold' : 'bg-slate-950 text-slate-400 hover:text-white'}">Available</button>
                        <button onclick="updateRescueTeamStatus('${t.id}', 'BUSY')" class="py-1 px-1.5 rounded transition ${isBusy ? 'bg-amber-700 text-white font-extrabold' : 'bg-slate-950 text-slate-400 hover:text-white'}">Busy</button>
                        <button onclick="updateRescueTeamStatus('${t.id}', 'OFFLINE')" class="py-1 px-1.5 rounded transition ${t.status === 'OFFLINE' ? 'bg-slate-700 text-white font-extrabold' : 'bg-slate-950 text-slate-400 hover:text-white'}">Offline</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">Failed to load rescue teams: ${e.message}</p>`;
    }
}

async function updateRescueTeamStatus(teamId, status) {
    try {
        const res = await api.patch(`/api/rescue-teams/${teamId}/status`, { status });
        if (!res.success) throw new Error(res.message || 'Status update failed');

        showToast(`Team [${teamId}] status set to ${status}.`, 'success');
        await renderRescueTeamsFleet();
    } catch (e) {
        showToast(e.message || 'Failed to update team status', 'error');
    }
}

// -------------------------------------------------------------
// EMERGENCY RESOURCES INVENTORY (SECTION 16)
// -------------------------------------------------------------
async function renderResourcesInventory() {
    const container = document.getElementById('resources-inventory-grid');
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full text-center py-10 text-slate-400 text-xs">
            <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <span>Loading resource logistics inventory...</span>
        </div>
    `;

    try {
        const res = await api.get('/api/resources');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch resources');

        container.innerHTML = '';
        res.data.forEach(r => {
            const avail = Math.max(0, r.total_units - r.deployed_units);
            const pct = r.total_units > 0 ? Math.round((r.deployed_units / r.total_units) * 100) : 0;

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-3";
            card.innerHTML = `
                <div>
                    <div class="flex items-start justify-between">
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">${r.category}</span>
                            <h3 class="font-bold text-white text-base">${r.name}</h3>
                        </div>
                        <span class="text-xs font-mono font-bold bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                            ${avail} Avail
                        </span>
                    </div>

                    <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">Total</span>
                            <strong class="text-white text-sm">${r.total_units}</strong>
                        </div>
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">Deployed</span>
                            <strong class="text-amber-400 text-sm">${r.deployed_units}</strong>
                        </div>
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">Available</span>
                            <strong class="text-emerald-400 text-sm">${avail}</strong>
                        </div>
                    </div>

                    <div class="mt-3 space-y-1">
                        <div class="flex justify-between text-[11px] text-slate-400">
                            <span>Deployment Rate</span>
                            <span>${pct}% deployed</span>
                        </div>
                        <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                            <div class="h-2 rounded-full ${pct > 80 ? 'bg-red-500' : 'bg-blue-500'}" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>

                <button onclick="updateResourceCount('${r.id}', ${r.total_units}, ${r.deployed_units})" class="w-full bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold py-2 rounded-xl text-xs transition">
                    Update Fleet Stock & Deployment
                </button>
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">Failed to load resources: ${e.message}</p>`;
    }
}

async function updateResourceCount(resId, currentTotal, currentDeployed) {
    const newTotal = prompt('Update Total Units in Inventory:', currentTotal);
    if (newTotal === null) return;
    const newDeployed = prompt('Update Deployed Units in Field:', currentDeployed);
    if (newDeployed === null) return;

    try {
        const res = await api.patch(`/api/resources/${resId}`, {
            totalUnits: parseInt(newTotal, 10),
            deployedUnits: parseInt(newDeployed, 10)
        });
        if (!res.success) throw new Error(res.message || 'Update failed');

        showToast('Resource allocation updated.', 'success');
        await renderResourcesInventory();
    } catch (e) {
        showToast(e.message || 'Failed to update resource', 'error');
    }
}

// -------------------------------------------------------------
// INCIDENT CLUSTERS & MERGE (SECTION 19 & 20)
// -------------------------------------------------------------
async function fetchIncidentClusters() {
    const container = document.getElementById('clusters-container');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-10 text-slate-400 text-xs">
            <div class="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <span>Analyzing spatial telemetry for incident clusters (&le; 2 km)...</span>
        </div>
    `;

    try {
        const res = await api.get('/api/clusters');
        if (!res.success || !res.data) throw new Error(res.message || 'Cluster lookup failed');

        const clusters = res.data;
        if (clusters.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    <i data-lucide="check-circle-2" class="w-10 h-10 text-emerald-400 mx-auto mb-2"></i>
                    <h4 class="font-bold text-white text-base">No Critical Duplicate Clusters Detected</h4>
                    <p class="text-xs text-slate-400 mt-1">Incoming emergency beacons are spatially isolated and being triaged individually.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = '';
        clusters.forEach(c => {
            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-amber-800/80 rounded-2xl p-6 shadow-xl space-y-4";
            card.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                        <div class="flex items-center space-x-2">
                            <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                            <span class="font-bold text-amber-300 text-xs uppercase tracking-wider">POSSIBLE INCIDENT CLUSTER</span>
                            <span class="text-xs font-mono font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-700">${c.incidentCount} Reports</span>
                        </div>
                        <h3 class="text-lg font-black text-white mt-1">Likely Disaster: ${c.likelyDisaster}</h3>
                        <p class="text-xs text-slate-400">Epicenter: ${Number(c.centroid.lat).toFixed(4)}°, ${Number(c.centroid.lng).toFixed(4)}° • Cluster Priority: <span class="text-red-400 font-bold">${c.suggestedPriority}</span></p>
                    </div>

                    <button onclick="mergeIncidentCluster('${c.id}')" class="bg-amber-600 hover:bg-amber-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-lg transition">
                        <i data-lucide="merge" class="w-4 h-4"></i>
                        <span>MERGE AS MAJOR INCIDENT</span>
                    </button>
                </div>

                <div class="space-y-2">
                    <span class="text-[10px] uppercase font-bold text-slate-400">Grouped Incident Signals:</span>
                    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        ${c.incidents.map(inc => `
                            <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                                <div class="flex justify-between items-center font-mono">
                                    <strong class="text-purple-300">${inc.id}</strong>
                                    <span class="text-[10px] text-amber-400">${inc.count || 1} victim(s)</span>
                                </div>
                                <p class="text-[11px] text-slate-300 truncate mt-1">${inc.details}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<p class="text-center text-red-400 text-xs py-8">Cluster detection failed: ${e.message}</p>`;
    }
}

async function mergeIncidentCluster(clusterId) {
    if (!confirm('Merge these grouped reports into one major command incident? Individual reports will be preserved.')) return;

    try {
        const res = await api.post('/api/clusters/merge', { clusterId });
        if (!res.success) throw new Error(res.message || 'Cluster merge failed');

        showToast(`Cluster merged successfully into master incident [${res.data.masterIncidentId}]!`, 'success');
        await fetchIncidentClusters();
        await fetchIncidentsList();
    } catch (e) {
        showToast(e.message || 'Failed to merge cluster', 'error');
    }
}

// -------------------------------------------------------------
// ANALYTICS & CSV EXPORT (SECTION 26 & 27)
// -------------------------------------------------------------
async function fetchAnalyticsSummary() {
    const container = document.getElementById('analytics-content-holder');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-10 text-slate-400 text-xs">
            <div class="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <span>Aggregating incident triage statistics and response times...</span>
        </div>
    `;

    try {
        const res = await api.get('/api/incidents/analytics/summary');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to load analytics');

        const d = res.data;
        container.innerHTML = `
            <!-- Top KPI Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Avg Response Time</span>
                    <strong class="text-2xl font-black text-emerald-400">${d.avgResponseTimeMinutes} mins</strong>
                    <span class="text-[10px] text-slate-500 block mt-1">From beacon to triage dispatch</span>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Avg Resolution Time</span>
                    <strong class="text-2xl font-black text-purple-400">${d.avgResolutionTimeHours} hrs</strong>
                    <span class="text-[10px] text-slate-500 block mt-1">Mean duration to case closure</span>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Fleet Utilization</span>
                    <strong class="text-2xl font-black text-amber-400">${d.resourceUtilization}%</strong>
                    <span class="text-[10px] text-slate-500 block mt-1">${d.fleetSummary.teamsDeployed} / ${d.fleetSummary.teamsTotal} squads deployed</span>
                </div>
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Total Rescued Victims</span>
                    <strong class="text-2xl font-black text-white">${d.totalVictims}</strong>
                    <span class="text-[10px] text-slate-500 block mt-1">Cumulative registered count</span>
                </div>
            </div>

            <!-- Breakdown Tables -->
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 class="font-bold text-white text-sm uppercase tracking-wider">Incidents by Disaster Category</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs text-left text-slate-300">
                            <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th class="py-2">Category</th>
                                    <th class="py-2 text-right">Incidents</th>
                                    <th class="py-2 text-right">Victims</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                ${(d.byDisaster || []).map(row => `
                                    <tr>
                                        <td class="py-2 font-bold text-white">${row.category}</td>
                                        <td class="py-2 text-right font-mono text-purple-300">${row.count}</td>
                                        <td class="py-2 text-right font-mono text-amber-400">${row.victims || row.count}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 class="font-bold text-white text-sm uppercase tracking-wider">Lifecycle Status Distribution</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs text-left text-slate-300">
                            <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th class="py-2">Lifecycle Stage</th>
                                    <th class="py-2 text-right">Active Count</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                ${(d.byStatus || []).map(row => `
                                    <tr>
                                        <td class="py-2 font-bold text-white">${row.status}</td>
                                        <td class="py-2 text-right font-mono text-emerald-400">${row.count}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<p class="text-center text-red-400 text-xs py-8">Analytics aggregation failed: ${e.message}</p>`;
    }
}

async function exportIncidentsCsv() {
    try {
        showToast('Exporting incident logs as CSV...', 'info');
        const filename = `rescue_ai_incidents_${Date.now()}.csv`;
        await api.downloadFile('/api/incidents/export/csv', filename);
        showToast('CSV export downloaded successfully!', 'success');
    } catch (e) {
        showToast(e.message || 'CSV export failed', 'error');
    }
}

async function loadDatabaseOverview(autoLoadFirstTable = true) {
    try {
        const res = await api.get('/api/database/overview');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to load database overview');

        dbOverviewData = res.data;

        // Update header badges
        const engineBadge = document.getElementById('db-engine-badge');
        if (engineBadge) engineBadge.innerText = `${dbOverviewData.engine}`;

        const totalRecordsBadge = document.getElementById('db-total-records-badge');
        if (totalRecordsBadge) totalRecordsBadge.innerText = `${dbOverviewData.totalRecords.toLocaleString()} rows`;

        const sizeBadge = document.getElementById('db-size-badge');
        if (sizeBadge) sizeBadge.innerText = `${dbOverviewData.sizeFormatted}`;

        const tablesCountBadge = document.getElementById('db-tables-count-badge');
        if (tablesCountBadge) tablesCountBadge.innerText = `${dbOverviewData.totalTables} Tables`;

        const navBadge = document.getElementById('nav-db-badge');
        if (navBadge) navBadge.innerText = `${dbOverviewData.totalRecords.toLocaleString()} rows`;

        // Render table selector pills
        renderDatabaseTablePills();

        if (autoLoadFirstTable) {
            await selectDatabaseTable(currentDbTable || 'incidents');
        }
    } catch (err) {
        console.error('[Database] Overview load error:', err);
    }
}


function renderDatabaseTablePills() {
    const container = document.getElementById('db-table-pills');
    if (!container || !dbOverviewData || !dbOverviewData.tables) return;

    container.innerHTML = dbOverviewData.tables.map(tbl => {
        const isActive = tbl.name === currentDbTable;
        return `
            <button onclick="selectDatabaseTable('${tbl.name}')" 
                    id="db-pill-${tbl.name}" 
                    class="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 whitespace-nowrap transition border ${
                        isActive 
                            ? 'bg-purple-700 text-white border-purple-500 shadow-md shadow-purple-950' 
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700 hover:bg-slate-900'
                    }">
                <i data-lucide="${tbl.icon || 'table'}" class="w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-purple-400'}"></i>
                <span>${tbl.label}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-purple-950/80 text-purple-200' : 'bg-slate-800 text-slate-400'
                }">${tbl.rowCount}</span>
            </button>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function selectDatabaseTable(tableName) {
    currentDbTable = tableName;
    currentDbPage = 1;
    currentDbSearch = '';

    const searchInput = document.getElementById('db-search-input');
    if (searchInput) searchInput.value = '';

    renderDatabaseTablePills();

    const activeConf = dbOverviewData?.tables?.find(t => t.name === tableName);
    const titleEl = document.getElementById('db-table-title');
    const descEl = document.getElementById('db-table-desc');
    const activeBadge = document.getElementById('db-active-table-badge');

    if (titleEl && activeConf) {
        titleEl.innerHTML = `<span>${activeConf.label}</span> <span class="text-xs text-purple-400 font-mono font-normal">(${tableName})</span>`;
    }
    if (descEl && activeConf) {
        descEl.innerText = activeConf.description;
    }
    if (activeBadge) {
        activeBadge.innerText = `TABLE: ${tableName.toUpperCase()}`;
    }

    await loadTableData();
}

async function loadTableData() {
    const loadingEl = document.getElementById('db-table-loading');
    const emptyEl = document.getElementById('db-table-empty');
    const headEl = document.getElementById('db-table-head');
    const bodyEl = document.getElementById('db-table-body');

    try {
        loadingEl?.classList.remove('hidden');
        emptyEl?.classList.add('hidden');
        if (bodyEl) bodyEl.innerHTML = '';

        const params = new URLSearchParams({
            page: currentDbPage,
            limit: currentDbPageSize,
            search: currentDbSearch
        });

        const res = await api.get(`/api/database/table/${currentDbTable}?${params.toString()}`);
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch table records');

        currentTableData = res.data;
        const { columns, rows, pagination } = currentTableData;

        // Render Table Headers
        if (headEl) {
            headEl.innerHTML = `
                <tr>
                    <th class="px-3.5 py-3 border-r border-slate-800/80 w-12 text-center">#</th>
                    ${columns.map(col => `
                        <th class="px-3.5 py-3 border-r border-slate-800/80 whitespace-nowrap">
                            <div class="flex items-center space-x-1.5">
                                <span>${col.replace(/_/g, ' ')}</span>
                            </div>
                        </th>
                    `).join('')}
                    <th class="px-3.5 py-3 text-center sticky right-0 bg-slate-950/95 shadow-md">Action</th>
                </tr>
            `;
        }

        // Render Rows
        if (!rows || rows.length === 0) {
            emptyEl?.classList.remove('hidden');
        } else if (bodyEl) {
            bodyEl.innerHTML = rows.map((row, idx) => {
                const rowNum = (pagination.page - 1) * pagination.limit + idx + 1;
                return `
                    <tr class="hover:bg-purple-950/20 transition-colors border-b border-slate-800/60">
                        <td class="px-3.5 py-2.5 border-r border-slate-800/60 text-center text-slate-500 font-mono">${rowNum}</td>
                        ${columns.map(col => {
                            const val = row[col];
                            return `<td class="px-3.5 py-2.5 border-r border-slate-800/60 max-w-xs truncate">${formatDbCellValue(col, val, row)}</td>`;
                        }).join('')}
                        <td class="px-3.5 py-2.5 text-center sticky right-0 bg-slate-900/90 backdrop-blur-sm shadow-md">
                            <button onclick="inspectDbRow(${idx})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-purple-700 text-slate-300 hover:text-white transition font-sans text-[10px] font-bold inline-flex items-center space-x-1">
                                <i data-lucide="eye" class="w-3 h-3"></i>
                                <span>Inspect</span>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Update Pagination Footer
        updateDbPagination(pagination);
    } catch (err) {
        console.error('[Database] Load table data error:', err);
        showToast(`Table error: ${err.message}`, 'error');
    } finally {
        loadingEl?.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function formatDbCellValue(colName, val, row) {
    if (val === null || val === undefined) {
        return '<span class="text-slate-600 italic">null</span>';
    }

    // Status Badges
    if (colName === 'status') {
        const str = String(val).toUpperCase();
        if (str === 'RESOLVED') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">${val}</span>`;
        if (str === 'CRITICAL' || str === 'ACTIVE') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">${val}</span>`;
        if (str.includes('ASSIGNED') || str === 'DISPATCHED') return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">${val}</span>`;
        return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">${val}</span>`;
    }

    // Emergency Level
    if (colName === 'emergency_level') {
        const str = String(val).toUpperCase();
        if (str === 'CRITICAL') return `<span class="px-2 py-0.5 rounded font-black text-[10px] bg-red-600 text-white animate-pulse">CRITICAL</span>`;
        if (str === 'HIGH') return `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-amber-500 text-slate-950">HIGH</span>`;
        return `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 text-slate-300">${val}</span>`;
    }

    // Role
    if (colName === 'role' || colName === 'user_role' || colName === 'updated_by_role') {
        const str = String(val).toUpperCase();
        if (str === 'ADMIN') return `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-purple-900 text-purple-200 border border-purple-700">ADMIN</span>`;
        if (str === 'AUTHORITY') return `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-950 text-blue-300 border border-blue-800">AUTHORITY</span>`;
        return `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-800 text-slate-300">CITIZEN</span>`;
    }

    // Coordinates (Lat/Lng)
    if (colName === 'latitude' && row.longitude !== undefined) {
        return `<a href="https://www.google.com/maps?q=${val},${row.longitude}" target="_blank" class="text-purple-400 hover:text-purple-300 underline inline-flex items-center space-x-1" title="Open in Google Maps"><span>${Number(val).toFixed(4)}</span><i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>`;
    }
    if (colName === 'longitude' && row.latitude !== undefined) {
        return `<a href="https://www.google.com/maps?q=${row.latitude},${val}" target="_blank" class="text-purple-400 hover:text-purple-300 underline inline-flex items-center space-x-1" title="Open in Google Maps"><span>${Number(val).toFixed(4)}</span><i data-lucide="external-link" class="w-2.5 h-2.5"></i></a>`;
    }

    // Evidence URL
    if (colName === 'evidence_url' && val) {
        return `<a href="${val}" target="_blank" class="text-purple-400 hover:text-purple-300 underline inline-flex items-center space-x-1"><span>View Evidence</span><i data-lucide="image" class="w-3 h-3"></i></a>`;
    }

    // Timestamps
    if (colName.includes('_at') && val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return `<span class="text-slate-400 font-sans text-[11px]" title="${val}">${d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`;
        }
    }

    return `<span title="${String(val).replace(/"/g, '&quot;')}">${escapeHtml(String(val))}</span>`;
}

function updateDbPagination(pagination) {
    const { page, limit, total, totalPages } = pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(total, page * limit);

    const infoEl = document.getElementById('db-pagination-info');
    if (infoEl) infoEl.innerText = `Showing ${start} - ${end} of ${total} records`;

    const counterEl = document.getElementById('db-page-counter');
    if (counterEl) counterEl.innerText = `Page ${page} of ${Math.max(1, totalPages)}`;

    const prevBtn = document.getElementById('db-prev-btn');
    if (prevBtn) prevBtn.disabled = page <= 1;

    const nextBtn = document.getElementById('db-next-btn');
    if (nextBtn) nextBtn.disabled = page >= totalPages;
}

function handleDatabaseSearch(e) {
    currentDbSearch = e.target.value.trim();
    clearTimeout(dbSearchDebounceTimer);
    dbSearchDebounceTimer = setTimeout(() => {
        currentDbPage = 1;
        loadTableData();
    }, 280);
}

function changeDatabasePageSize(newSize) {
    currentDbPageSize = parseInt(newSize, 10) || 25;
    currentDbPage = 1;
    loadTableData();
}

function prevDatabasePage() {
    if (currentDbPage > 1) {
        currentDbPage--;
        loadTableData();
    }
}

function nextDatabasePage() {
    if (currentTableData && currentDbPage < currentTableData.pagination.totalPages) {
        currentDbPage++;
        loadTableData();
    }
}

async function exportCurrentTable(format = 'csv') {
    if (!currentDbTable) return;
    try {
        showToast(`Generating ${currentDbTable} export (${format.toUpperCase()})...`, 'info');
        const filename = `${currentDbTable}_export_${Date.now()}.${format}`;
        await api.downloadFile(`/api/database/export/${currentDbTable}?format=${format}`, filename);
        showToast(`Exported ${currentDbTable} (${format.toUpperCase()}) successfully!`, 'success');
    } catch (err) {
        showToast(`Export failed: ${err.message}`, 'error');
    }
}

async function refreshDatabaseView() {
    showToast('Refreshing master database tables...', 'info');
    await loadDatabaseOverview(false);
    await loadTableData();
    showToast('Database synchronized successfully.', 'success');
}

function inspectDbRow(rowIndex) {
    if (!currentTableData || !currentTableData.rows || !currentTableData.rows[rowIndex]) return;
    const row = currentTableData.rows[rowIndex];
    currentInspectedDbRecord = row;

    const modal = document.getElementById('db-record-modal');
    const titleEl = document.getElementById('db-modal-title');
    const subtitleEl = document.getElementById('db-modal-subtitle');
    const fieldsEl = document.getElementById('db-modal-fields');
    const jsonEl = document.getElementById('db-modal-json');

    if (titleEl) titleEl.innerText = `Record: ${row.id || `#${rowIndex + 1}`}`;
    if (subtitleEl) subtitleEl.innerText = `Table: ${currentDbTable} (${currentTableData.label || ''})`;

    if (fieldsEl) {
        fieldsEl.innerHTML = Object.entries(row).map(([key, val]) => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
                <span class="font-bold text-slate-400 font-mono uppercase text-[10px] sm:w-1/3">${key}</span>
                <span class="text-white font-mono break-all sm:w-2/3">${val === null || val === undefined ? '<span class="text-slate-600 italic">null</span>' : escapeHtml(String(val))}</span>
            </div>
        `).join('');
    }

    if (jsonEl) {
        jsonEl.innerText = JSON.stringify(row, null, 2);
    }

    modal?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDbRecordModal() {
    const modal = document.getElementById('db-record-modal');
    modal?.classList.add('hidden');
}

function copyDbModalJson() {
    if (!currentInspectedDbRecord) return;
    const jsonStr = JSON.stringify(currentInspectedDbRecord, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
        const label = document.getElementById('copy-json-label');
        if (label) {
            label.innerText = 'Copied!';
            setTimeout(() => { label.innerText = 'Copy JSON'; }, 2000);
        }
        showToast('Record JSON copied to clipboard.', 'success');
    }).catch(() => {
        showToast('Unable to copy to clipboard.', 'warning');
    });
}

// Global Database View Exports
window.switchAuthorityView = switchAuthorityView;
window.selectDatabaseTable = selectDatabaseTable;
window.handleDatabaseSearch = handleDatabaseSearch;
window.changeDatabasePageSize = changeDatabasePageSize;
window.prevDatabasePage = prevDatabasePage;
window.nextDatabasePage = nextDatabasePage;
window.exportCurrentTable = exportCurrentTable;
window.refreshDatabaseView = refreshDatabaseView;
window.inspectDbRow = inspectDbRow;
window.closeDbRecordModal = closeDbRecordModal;
window.copyDbModalJson = copyDbModalJson;

// Smartphone Back Navigation for Authority Portal
function handleSmartphoneBack() {
    const openModals = Array.from(document.querySelectorAll('.fixed.inset-0:not(.hidden)'));
    if (openModals.length > 0) {
        openModals.forEach(m => m.classList.add('hidden'));
        return true;
    }
    // Navigate back to Citizen Portal (index.html)
    window.location.href = 'index.html';
    return true;
}
window.handleSmartphoneBack = handleSmartphoneBack;

if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
        handleSmartphoneBack();
    });
}
window.addEventListener('popstate', () => {
    handleSmartphoneBack();
});

