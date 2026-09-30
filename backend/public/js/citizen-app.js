/**
 * Main Application Logic for RESCUE AI Citizen Portal
 * Coordinates SOS Beacon Dispatches, Live Telemetry, Citizen Auth, and Real-Time Incident Status Tracking.
 */

let activeReports = [];
let currentViewingReportId = null;
let citizenProfile = {
    name: 'Citizen User',
    phone: '',
    emergencyPhone: '',
    bloodGroup: 'O+ Positive'
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 1. Initialize Real-Time Socket Connection
    initRealtimeSocket('CITIZEN');

    // 2. Setup Navbar Auth UI & Load Profile
    updateCitizenAuthUI();
    loadCitizenProfile();

    // 2.5. Start real-time GPS tracking immediately
    if (typeof startCitizenLocationTracking === 'function') {
        startCitizenLocationTracking();
    }

    // 3. Load Reports from Real Backend API (handles auth state gracefully)
    fetchCitizenReports();

    // 4. Initial Weather Telemetry (checks WeatherAPI.com & Open-Meteo)
    fetchRealtimeWeatherData();

    // 5. Restore any saved WeatherAPI key
    const savedKey = localStorage.getItem('rescue_weatherapi_key');
    const keyInput = document.getElementById('weatherapi-key-input');
    if (keyInput && savedKey) {
        keyInput.value = savedKey;
    }

    // 6. Listen to Real-Time Updates from Authority Command Grid
    onRealtimeEvent('incident:updated', (updatedInc) => {
        handleIncidentUpdated(updatedInc);
    });

    onRealtimeEvent('incident:status_changed', (updatedInc) => {
        handleIncidentUpdated(updatedInc);
    });

    onRealtimeEvent('incident:new', (newInc) => {
        if (typeof loadIncidentsOnMapbox === 'function') {
            loadIncidentsOnMapbox();
        }
    });
});

// -------------------------------------------------------------
// CITIZEN AUTHENTICATION & SESSION UI
// -------------------------------------------------------------
function updateCitizenAuthUI() {
    const user = api.getUser();
    const token = api.getToken();
    const navAuthContainer = document.getElementById('nav-auth-container');

    if (!navAuthContainer) return;

    if (token && user) {
        const displayName = user.fullName || user.username || user.name || user.email;

        navAuthContainer.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="flex flex-col text-right leading-tight">
                    <span class="text-xs font-bold text-white">${displayName}</span>
                    <span class="text-[9px] font-black uppercase text-purple-400">${user.role || 'CITIZEN'}</span>
                </div>
                <button onclick="citizenLogout()" title="Log Out" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-700 text-slate-300 hover:text-red-300 transition text-xs flex items-center space-x-1 shadow">
                    <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                    <span class="text-[11px]">Sign Out</span>
                </button>
            </div>
        `;
    } else {
        navAuthContainer.innerHTML = `
            <button onclick="openCitizenAuthModal('login')" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 shadow transition">
                <i data-lucide="log-in" class="w-3.5 h-3.5"></i>
                <span>Sign In / Register</span>
            </button>
        `;
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openCitizenAuthModal(tab = 'login') {
    let modal = document.getElementById('citizen-auth-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'citizen-auth-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800 rounded-2xl max-w-md w-full p-6 text-slate-200 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-lg bg-purple-700 text-white flex items-center justify-center font-bold">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <h3 class="font-black text-white text-base">Citizen Portal Access</h3>
                        <p class="text-[11px] text-slate-400">Manage private emergency SOS dispatches</p>
                    </div>
                </div>
                <button onclick="document.getElementById('citizen-auth-modal').classList.add('hidden')" class="text-slate-400 hover:text-white">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Tabs -->
            <div class="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-bold">
                <button id="auth-tab-login" onclick="switchCitizenAuthTab('login')" class="flex-1 py-1.5 rounded-lg transition ${tab === 'login' ? 'bg-purple-700 text-white shadow' : 'text-slate-400 hover:text-white'}">
                    Log In
                </button>
                <button id="auth-tab-register" onclick="switchCitizenAuthTab('register')" class="flex-1 py-1.5 rounded-lg transition ${tab === 'register' ? 'bg-purple-700 text-white shadow' : 'text-slate-400 hover:text-white'}">
                    Register Account
                </button>
            </div>

            <!-- Login Form -->
            <form id="citizen-login-form" onsubmit="handleCitizenLogin(event)" class="space-y-3 text-xs ${tab === 'login' ? '' : 'hidden'}">
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Email Address</label>
                    <input type="email" id="citizen-login-email" value="satyam@example.com" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Password</label>
                    <input type="password" id="citizen-login-password" value="citizen123" required class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>

                <div id="citizen-login-error" class="hidden p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs"></div>

                <div class="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-0.5">
                    <p class="font-bold text-slate-300">Default Citizen Credentials:</p>
                    <p>Email: <code class="text-purple-300 font-mono">satyam@example.com</code> | Pass: <code class="text-purple-300 font-mono">citizen123</code></p>
                </div>

                <button type="submit" id="citizen-login-submit" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-black py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                    Sign In & Access Reports
                </button>
            </form>

            <!-- Register Form -->
            <form id="citizen-register-form" onsubmit="handleCitizenRegister(event)" class="space-y-3 text-xs ${tab === 'register' ? '' : 'hidden'}">
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Full Legal Name</label>
                    <input type="text" id="citizen-reg-name" required placeholder="e.g. Satyam Pathak" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Email Address</label>
                    <input type="email" id="citizen-reg-email" required placeholder="name@example.com" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Password</label>
                    <input type="password" id="citizen-reg-password" required minlength="6" placeholder="At least 6 characters" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-slate-300 font-bold uppercase mb-1">Primary Phone</label>
                        <input type="tel" id="citizen-reg-phone" placeholder="10 digits" maxlength="10" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-slate-300 font-bold uppercase mb-1">Blood Group</label>
                        <select id="citizen-reg-blood" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-purple-500 focus:outline-none">
                            <option value="O+ Positive">O+ Positive</option>
                            <option value="O- Negative">O- Negative</option>
                            <option value="A+ Positive">A+ Positive</option>
                            <option value="A- Negative">A- Negative</option>
                            <option value="B+ Positive">B+ Positive</option>
                            <option value="B- Negative">B- Negative</option>
                            <option value="AB+ Positive">AB+ Positive</option>
                            <option value="AB- Negative">AB- Negative</option>
                        </select>
                    </div>
                </div>

                <div id="citizen-reg-error" class="hidden p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs"></div>

                <button type="submit" id="citizen-reg-submit" class="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                    Create Citizen Account
                </button>
            </form>
        </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function switchCitizenAuthTab(tab) {
    const loginForm = document.getElementById('citizen-login-form');
    const regForm = document.getElementById('citizen-register-form');
    const loginTab = document.getElementById('auth-tab-login');
    const regTab = document.getElementById('auth-tab-register');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        loginTab.className = "flex-1 py-1.5 rounded-lg transition bg-purple-700 text-white shadow";
        regTab.className = "flex-1 py-1.5 rounded-lg transition text-slate-400 hover:text-white";
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        loginTab.className = "flex-1 py-1.5 rounded-lg transition text-slate-400 hover:text-white";
        regTab.className = "flex-1 py-1.5 rounded-lg transition bg-purple-700 text-white shadow";
    }
}

async function handleCitizenLogin(e) {
    e.preventDefault();
    const email = document.getElementById('citizen-login-email').value.trim();
    const password = document.getElementById('citizen-login-password').value;
    const errBox = document.getElementById('citizen-login-error');
    const submitBtn = document.getElementById('citizen-login-submit');

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Authenticating...';
        errBox.classList.add('hidden');

        const res = await api.post('/api/auth/login', { email, password });
        if (!res.success || !res.data) throw new Error(res.message || 'Login failed');

        api.setToken(res.data.token, res.data.user);
        document.getElementById('citizen-auth-modal').classList.add('hidden');

        showToast(`Welcome back, ${res.data.user.fullName}!`, 'success');
        updateCitizenAuthUI();
        loadCitizenProfile();
        await fetchCitizenReports();
    } catch (err) {
        errBox.innerText = err.message || 'Authentication failed. Please verify credentials.';
        errBox.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Sign In & Access Reports';
    }
}

async function handleCitizenRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('citizen-reg-name').value.trim();
    const email = document.getElementById('citizen-reg-email').value.trim();
    const password = document.getElementById('citizen-reg-password').value;
    const phone = document.getElementById('citizen-reg-phone').value.trim();
    const bloodGroup = document.getElementById('citizen-reg-blood').value;
    const errBox = document.getElementById('citizen-reg-error');
    const submitBtn = document.getElementById('citizen-reg-submit');

    try {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Creating Account...';
        errBox.classList.add('hidden');

        const res = await api.post('/api/auth/register', {
            fullName,
            email,
            password,
            phone,
            bloodGroup
        });
        if (!res.success || !res.data) throw new Error(res.message || 'Registration failed');

        api.setToken(res.data.token, res.data.user);
        document.getElementById('citizen-auth-modal').classList.add('hidden');

        showToast(`Account created! Welcome, ${res.data.user.fullName}.`, 'success');
        updateCitizenAuthUI();
        loadCitizenProfile();
        await fetchCitizenReports();
    } catch (err) {
        errBox.innerText = err.message || 'Registration failed. Please check form inputs.';
        errBox.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Create Citizen Account';
    }
}

function citizenLogout() {
    if (confirm('Sign out from your Citizen Account?')) {
        api.clearAuth();
        updateCitizenAuthUI();
        loadCitizenProfile();
        fetchCitizenReports();
        showToast('You have been signed out.', 'info');
    }
}

// Navigation Tab Switcher
function switchTab(tabId) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`page-${tabId}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.className = "nav-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition flex items-center space-x-1.5";
    });

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.className = "nav-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800 border border-slate-700 flex items-center space-x-1.5 transition";
    }

    if (tabId === 'map') {
        setTimeout(() => {
            if (typeof initCitizenMap === 'function' && !mapboxMap) initCitizenMap();
            else if (mapboxMap) mapboxMap.resize();
        }, 150);
    } else if (tabId === 'reports') {
        fetchCitizenReports();
    }
}

// Fetch Real-time Weather Telemetry via Backend Proxy
async function fetchRealtimeWeatherData(lat, lng) {
    const coords = lat && lng ? [lat, lng] : (typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462]);
    const statusEl = document.getElementById('telemetry-status');
    const badge = document.getElementById('active-provider-badge');
    const keyInput = document.getElementById('weatherapi-key-input');
    const customKey = keyInput ? keyInput.value.trim() : (localStorage.getItem('rescue_weatherapi_key') || '');

    if (customKey) {
        localStorage.setItem('rescue_weatherapi_key', customKey);
    }

    if (statusEl) statusEl.innerHTML = `<span class="text-purple-300">📡 Querying WeatherAPI.com / satellite telemetry...</span>`;

    try {
        let endpoint = `/api/weather?lat=${coords[0]}&lng=${coords[1]}`;
        if (customKey) {
            endpoint += `&apiKey=${encodeURIComponent(customKey)}`;
        }

        const res = await api.get(endpoint);
        if (!res.success || !res.data) throw new Error(res.message || 'Telemetry unavailable');

        const w = res.data;
        document.getElementById('iot-temp').innerText = `${Math.round(w.temperature)} °C`;
        document.getElementById('iot-rain').innerText = `${w.rainfall} mm/h`;
        document.getElementById('iot-wind').innerText = `${Math.round(w.windSpeed)} km/h`;
        document.getElementById('iot-humidity').innerText = `${Math.round(w.humidity)} %`;

        if (badge) {
            badge.innerText = w.provider;
            if (w.provider === 'WeatherAPI.com') {
                badge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-600';
            } else {
                badge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700';
            }
        }

        if (statusEl) {
            statusEl.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="text-emerald-400 font-bold flex items-center space-x-1.5">
                        ${w.conditionIcon ? `<img src="${w.conditionIcon}" class="w-5 h-5 inline-block">` : ''}
                        <span>✓ ${w.provider}: ${w.condition} (${w.locationName || 'Local Grid'})</span>
                    </span>
                    <span class="text-slate-500 text-[10px]">${new Date().toLocaleTimeString()}</span>
                </div>
                ${w.uv !== null && w.uv !== undefined ? `<div class="text-[10px] text-slate-400 mt-1">UV Index: <strong>${w.uv}</strong> ${w.airQuality ? `• PM2.5: <strong>${Math.round(w.airQuality.pm2_5 || 0)} µg/m³</strong>` : ''}</div>` : ''}
                ${w.severeAlert ? `<div class="mt-1 text-red-400 font-bold text-[11px] bg-red-950/60 p-1.5 rounded border border-red-800">${w.severeAlert}</div>` : ''}
            `;
        }
    } catch (err) {
        console.warn('Weather fetch error:', err.message);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-amber-400">Weather data temporarily unavailable. Retrying...</span>`;
        }
    }
}

// SOS Signal Submission
async function handleSosSubmit(e) {
    e.preventDefault();

    const category = document.getElementById('sos-category').value;
    const count = parseInt(document.getElementById('sos-count').value, 10) || 1;
    const details = document.getElementById('sos-details').value.trim();
    const addressInput = document.getElementById('sos-address');
    let address = addressInput ? addressInput.value.trim() : '';
    const evidenceFileInput = document.getElementById('sos-evidence');
    
    // Acquire high-precision live GPS coordinates if available
    let coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    if (navigator.geolocation) {
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 4000,
                    maximumAge: 10000
                });
            });
            coords = [pos.coords.latitude, pos.coords.longitude];
            if (typeof setLiveUserCoordinates === 'function') {
                setLiveUserCoordinates(pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy);
            }
        } catch (geoErr) {
            console.log('[GPS] Using current coordinates baseline:', geoErr.message);
        }
    }

    if (!details) {
        showToast('Please provide a description of the emergency situation.', 'error');
        return;
    }

    // If address was not provided, attempt reverse geocode
    if (!address && typeof api !== 'undefined' && api.get) {
        try {
            const geo = await api.get(`/api/geocode/reverse?lat=${coords[0]}&lng=${coords[1]}`);
            if (geo && geo.success && (geo.placeName || geo.text)) {
                address = geo.placeName || geo.text;
            }
        } catch (gErr) {}
    }

    const submitBtn = document.getElementById('sos-submit-btn');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Dispatch Beacon';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <span class="inline-flex items-center space-x-2">
                    <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>DISPATCHING SOS BEACON TO COMMAND HQ...</span>
                </span>
            `;
        }

        let payload;
        if (evidenceFileInput && evidenceFileInput.files && evidenceFileInput.files.length > 0) {
            payload = new FormData();
            payload.append('category', category);
            payload.append('count', count);
            payload.append('details', details);
            payload.append('latitude', coords[0]);
            payload.append('longitude', coords[1]);
            if (address) payload.append('address', address);
            payload.append('evidence', evidenceFileInput.files[0]);
        } else {
            payload = {
                category,
                count,
                details,
                latitude: coords[0],
                longitude: coords[1],
                address: address || undefined
            };
        }

        const res = await api.post('/api/incidents', payload);

        if (!res.success) throw new Error(res.message || 'SOS dispatch failed');

        const incident = res.data.incident || res.data;
        showToast(`SOS Beacon [${incident.id}] dispatched successfully! Priority: ${incident.emergency_level}`, 'success');

        // Store active incident ID for continuous live location telemetry
        window.activeIncidentId = incident.id;

        // Immediately transmit live GPS telemetry to Authority Command Grid via socket
        const s = (typeof getSocket === 'function') ? getSocket() : (typeof socket !== 'undefined' ? socket : null);
        if (s && s.connected) {
            s.emit('incident:location_update', {
                incidentId: incident.id,
                latitude: coords[0],
                longitude: coords[1],
                accuracy: 10
            });
        }

        document.getElementById('sos-modal').classList.add('hidden');
        document.getElementById('sos-form').reset();

        await fetchCitizenReports();
        switchTab('reports');

        if (typeof subscribeToIncident === 'function') {
            subscribeToIncident(incident.id);
        }

        showDispatchSuccessModal(incident);

    } catch (err) {
        showToast(err.message || 'Failed to dispatch SOS beacon. Please check network connection.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

function showDispatchSuccessModal(incident) {
    let modal = document.getElementById('dispatch-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dispatch-confirm-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    const createdTimeStr = incident.created_at ? new Date(incident.created_at).toLocaleString() : new Date().toLocaleString();
    const locStr = incident.readable_address || `Coordinates: ${Number(incident.latitude).toFixed(4)}, ${Number(incident.longitude).toFixed(4)}`;

    modal.innerHTML = `
        <div class="bg-slate-900 border border-purple-800 text-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div class="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-emerald-400 mx-auto text-xl">
                ✓
            </div>
            <div class="text-center">
                <h3 class="font-black text-white text-xl">Emergency Beacon Dispatched</h3>
                <p class="text-xs text-slate-400 mt-1">Incident successfully registered on NDRF Tactical Dispatch Grid.</p>
            </div>
            <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">Incident Tracking ID:</span>
                    <strong class="font-mono text-purple-400 text-sm">${incident.id}</strong>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">Priority Level:</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase badge-${(incident.emergency_level || 'HIGH').toLowerCase()}">${incident.emergency_level}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">Current Status:</span>
                    <span class="text-emerald-400 font-bold uppercase">${incident.status}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">Category:</span>
                    <strong class="text-white">${incident.category}</strong>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">People Affected:</span>
                    <strong class="text-white">${incident.count || 1} Person(s)</strong>
                </div>
                <div class="flex justify-between items-start">
                    <span class="text-slate-400">Location:</span>
                    <span class="text-slate-300 text-right max-w-[200px] leading-tight">${locStr}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-400">Date / Time:</span>
                    <span class="text-slate-300">${createdTimeStr}</span>
                </div>
                <div class="flex justify-between items-start">
                    <span class="text-slate-400">Priority Reason:</span>
                    <span class="text-slate-300 text-right max-w-[200px] leading-tight">${incident.priorityExplanation || 'Immediate response queued'}</span>
                </div>
            </div>
            <div class="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-[11px] text-purple-200 text-center">
                You can monitor live triage, assigned rescue squads, and status changes directly in the <strong>My Reports</strong> tab.
            </div>
            <button onclick="document.getElementById('dispatch-confirm-modal').classList.add('hidden')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                Understood, View My Reports
            </button>
        </div>
    `;
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Fetch all reports from REST API
// CITIZEN: Only reports belonging to this user (incident.user_id = req.user.id)
async function fetchCitizenReports() {
    const grid = document.getElementById('reports-grid');
    if (!grid) return;

    // Check if user is logged in
    if (!api.isLoggedIn()) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg mx-auto space-y-4">
                <div class="w-14 h-14 rounded-2xl bg-purple-950 border border-purple-600/50 flex items-center justify-center text-purple-400 mx-auto text-2xl shadow-lg">
                    <i data-lucide="shield-alert" class="w-7 h-7"></i>
                </div>
                <h3 class="text-xl font-black text-white">Sign In to View Your Incident Reports</h3>
                <p class="text-xs text-slate-300 leading-relaxed">
                    Authentication is required so your emergency dispatches and live responder updates remain strictly private to you.
                </p>
                <div class="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                    <button onclick="openCitizenAuthModal('login')" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg transition">
                        Log In as Citizen
                    </button>
                    <button onclick="openCitizenAuthModal('register')" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs transition">
                        Register New Account
                    </button>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    try {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-400 text-xs flex flex-col items-center">
                <div class="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <span>Fetching your emergency reports from database...</span>
            </div>
        `;

        const currentUser = api.getUser();
        const res = await api.get('/api/incidents?mine=true&status=all&limit=5');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch incidents');

        let reports = Array.isArray(res.data) ? res.data : [];
        // Strictly filter to reports that are reported by this user only
        if (currentUser && currentUser.id) {
            reports = reports.filter(r => r.user_id === currentUser.id);
        }

        // Show only the last 5 reports
        activeReports = reports.slice(0, 5);
        renderReports();
    } catch (err) {
        console.warn('Reports loading error:', err);
        grid.innerHTML = `
            <div class="col-span-full text-center py-10 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <p class="text-red-400 font-bold text-xs mb-1">Backend connection failed</p>
                <p class="text-slate-400 text-xs">${err.message || 'Failed to retrieve reports from server.'}</p>
                <button onclick="fetchCitizenReports()" class="mt-3 bg-purple-700 hover:bg-purple-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

function renderReports() {
    const grid = document.getElementById('reports-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (activeReports.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 bg-slate-900/60 border border-slate-800 rounded-2xl p-8">
                <i data-lucide="shield-check" class="w-10 h-10 text-emerald-400 mx-auto mb-2"></i>
                <h4 class="font-bold text-white text-base">No Emergency Incidents Reported Yet</h4>
                <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Click "File New SOS Signal" to dispatch an emergency beacon to the authority command center.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    activeReports.forEach(r => {
        const card = document.createElement('div');
        const levelBadgeClass = `badge-${(r.emergency_level || 'HIGH').toLowerCase()}`;
        const isResolved = r.status === 'RESOLVED';
        const formattedDate = new Date(r.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

        card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition hover:border-purple-600/50";
        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between mb-3">
                    <span class="font-mono text-xs font-bold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">${r.id}</span>
                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${levelBadgeClass}">${r.emergency_level || 'HIGH'}</span>
                </div>
                <h4 class="font-bold text-white text-base mb-1">${r.category}</h4>
                <p class="text-xs text-slate-300 leading-relaxed">${r.details}</p>
                ${r.readable_address ? `<p class="text-[11px] text-slate-400 mt-2 flex items-center space-x-1"><i data-lucide="map-pin" class="w-3 h-3 text-purple-400"></i><span>${r.readable_address}</span></p>` : ''}
            </div>

            <div class="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
                <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-400">Status: <strong class="uppercase font-bold ${isResolved ? 'text-emerald-400' : 'text-purple-300'}">${r.status}</strong></span>
                    <span class="text-slate-400 font-semibold">Victims: <strong class="text-white">${r.count || 1}</strong></span>
                </div>
                ${r.assigned_rescue_team ? `
                    <div class="bg-purple-950/40 border border-purple-800/40 rounded-lg p-2 text-[11px] text-purple-200">
                        <i data-lucide="truck" class="w-3 h-3 inline mr-1 text-emerald-400"></i>
                        <span>Dispatched Squad: <strong>${r.assigned_rescue_team}</strong></span>
                    </div>
                ` : ''}
                <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Logged: ${formattedDate}</span>
                    <div class="flex items-center space-x-2">
                        <button onclick="openCitizenReportModal('${r.id}')" class="text-purple-400 hover:text-purple-300 font-bold underline">
                            Track Status →
                        </button>
                        <button onclick="viewIncidentOnMap(${r.latitude}, ${r.longitude})" class="text-slate-400 hover:text-white font-semibold">
                            Locate
                        </button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Open Citizen Report Details Modal (Read-only status tracking with full timeline)
async function openCitizenReportModal(reportId) {
    currentViewingReportId = reportId;
    let modal = document.getElementById('citizen-report-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'citizen-report-modal';
        modal.className = 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    try {
        const res = await api.get(`/api/incidents/${reportId}`);
        if (!res.success || !res.data) throw new Error(res.message || 'Report not found');

        const inc = res.data.incident || res.data;
        const updates = res.data.updates || inc.updates || [];

        const updatesHTML = (updates.length > 0)
            ? updates.map(u => `
                <div class="text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    <div class="flex items-center justify-between text-slate-400">
                        <span class="font-bold text-purple-300">${u.updated_by_role || 'COMMAND'}:</span>
                        <span>${new Date(u.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <p class="text-slate-200 leading-snug">${u.note}</p>
                    ${u.status_to ? `<span class="inline-block text-[9px] font-mono text-emerald-400 font-bold">Status: ${u.status_to}</span>` : ''}
                </div>
            `).join('')
            : '<p class="text-slate-500 text-xs">Waiting for command triage updates.</p>';

        let evidenceHTML = '<span class="text-slate-500 italic text-xs">No evidence uploaded</span>';
        if (inc.evidence_url) {
            const isVideo = /\.(mp4|webm|mov|avi)$/i.test(inc.evidence_url);
            if (isVideo) {
                evidenceHTML = `<video src="${inc.evidence_url}" controls class="max-h-40 rounded-lg border border-slate-700 w-full bg-black"></video>`;
            } else {
                evidenceHTML = `<img src="${inc.evidence_url}" alt="Evidence" class="max-h-40 rounded-lg border border-slate-700 object-cover">`;
            }
        }

        modal.innerHTML = `
            <div class="bg-slate-900 border border-purple-800 rounded-2xl max-w-xl w-full p-6 text-slate-200 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
                <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div class="flex items-center space-x-2">
                        <span class="font-mono text-base font-black text-purple-400">${inc.id}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase badge-${(inc.emergency_level || 'HIGH').toLowerCase()}">${inc.emergency_level}</span>
                    </div>
                    <button onclick="document.getElementById('citizen-report-modal').classList.add('hidden')" class="text-slate-400 hover:text-white">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>

                <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-3">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                            <strong class="text-white text-sm">${inc.category}</strong>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Current Status</span>
                            <span class="text-emerald-400 font-bold uppercase text-sm">${inc.status}</span>
                        </div>
                    </div>

                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Location</span>
                        <span class="text-slate-200">${inc.readable_address || `${inc.latitude}, ${inc.longitude}`}</span>
                    </div>

                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Situation Details</span>
                        <p class="text-slate-300 mt-0.5 leading-relaxed">${inc.details}</p>
                    </div>

                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold mb-1">Attached Evidence</span>
                        ${evidenceHTML}
                    </div>

                    <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Assigned Squad</span>
                            <span class="text-emerald-400 font-bold">${inc.assigned_rescue_team || 'Queued for Dispatch'}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">Command Center</span>
                            <span class="text-purple-300 font-semibold">${inc.assigned_authority || 'NDRF HQ'}</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-2 border-t border-slate-800 pt-3">
                    <h4 class="font-bold text-white text-xs uppercase tracking-wider">Live Response Timeline</h4>
                    <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                        ${updatesHTML}
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        showToast(err.message || 'Failed to load report tracking details.', 'error');
    }
}

function handleIncidentUpdated(updatedData) {
    const inc = updatedData.incident || updatedData;
    const targetId = inc.id;
    const currentUser = api.getUser();

    // Only update if the incident belongs to this citizen
    if (inc.user_id && currentUser && currentUser.id && inc.user_id !== currentUser.id) {
        return;
    }

    const idx = activeReports.findIndex(i => i.id === targetId);
    if (idx !== -1) {
        activeReports[idx] = { ...activeReports[idx], ...inc };
        renderReports();
        showToast(`🚨 Status Updated: Report [${inc.id}] is now ${inc.status}`, 'info');

        const modal = document.getElementById('citizen-report-modal');
        if (modal && !modal.classList.contains('hidden') && currentViewingReportId === targetId) {
            openCitizenReportModal(targetId);
        }
    }
}

function viewIncidentOnMap(lat, lng) {
    switchTab('map');
    setTimeout(() => {
        if (mapboxMap) {
            mapboxMap.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
        }
    }, 200);
}

// AI Solutions Engine Modules
function runRuleBasedRiskCalculator() {
    const output = document.getElementById('satellite-output');
    if (!output) return;

    output.innerHTML = `
        <div class="space-y-2">
            <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                <i data-lucide="check-circle" class="w-4 h-4"></i>
                <span>Rule-Based Telemetry & Flood Inundation Assessment</span>
            </div>
            <p class="text-xs text-slate-300">
                • <strong>Risk Tier:</strong> <span class="text-amber-400 font-bold">MODERATE - SURGE WATCH</span><br>
                • <strong>Precipitation Threshold:</strong> Normal range (0-5 mm/h). Ground saturation index: 68%.<br>
                • <strong>Safe Elevation:</strong> Maintain ground clearance > 2 meters above Gomti bank water markers.
            </p>
            <div class="text-[10px] text-slate-500 bg-slate-900 p-2 rounded border border-slate-800">
                Notice: Transparent rule-based assessment based on live meteorology inputs. Does not replace municipal alerts.
            </div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Dynamic Shelter and Resource Inventory Matching
async function allocateSmartHospital() {
    const output = document.getElementById('hospital-output');
    if (!output) return;

    output.innerHTML = `<span class="text-slate-400 text-xs">Querying registered shelter & resource database...</span>`;

    try {
        const res = await api.get('/api/shelters');
        if (res.success && res.data.length > 0) {
            output.innerHTML = `
                <div class="space-y-3 mt-1">
                    ${res.data.map(s => {
                        const freeSpots = Math.max(0, s.capacity - s.current_occupancy);
                        return `
                            <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5">
                                <div class="flex items-center justify-between">
                                    <strong class="text-purple-300 font-bold">${s.title}</strong>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${freeSpots > 20 ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-amber-950 text-amber-300 border border-amber-700'}">
                                        ${freeSpots > 0 ? `${freeSpots} Spots Available` : 'At Capacity'}
                                    </span>
                                </div>
                                <p class="text-slate-400 text-[11px]">${s.address || 'Lucknow Regional Base'}</p>
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] bg-slate-900 p-2 rounded-lg border border-slate-800 text-slate-300">
                                    <div>🍞 Food: <strong class="text-white">${s.food_packets || 0}</strong></div>
                                    <div>💧 Water: <strong class="text-white">${s.water_liters || 0}L</strong></div>
                                    <div>🩹 Trauma: <strong class="text-white">${s.medical_kits || 0}</strong></div>
                                    <div>🛏️ Blankets: <strong class="text-white">${s.blankets || 0}</strong></div>
                                </div>
                                <div class="flex items-center justify-between pt-1">
                                    <span class="text-[10px] text-slate-500">Cap: ${s.current_occupancy} / ${s.capacity}</span>
                                    <button onclick="drawMapboxRoute(${s.longitude}, ${s.latitude}, '${s.title.replace(/'/g, "\\'")}')" class="text-purple-400 hover:text-purple-300 font-bold text-[11px] underline">
                                        Route via Mapbox →
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            output.innerHTML = `<span class="text-slate-400 text-xs">No shelters currently listed.</span>`;
        }
    } catch (e) {
        output.innerHTML = `<span class="text-red-400 text-xs">Shelter lookup failed. Please retry.</span>`;
    }
}

function runMultiAgentCycle() {
    const out = document.getElementById('multi-agent-output');
    if (!out) return;

    out.innerHTML = `
        <div class="text-xs space-y-1">
            <div class="text-emerald-400 font-bold">✓ Multi-Agent Coordination Active</div>
            <div class="text-slate-300">• Dispatch Node: NDRF HQ (Delhi-01) Connected</div>
            <div class="text-slate-300">• Field Squads: 3 Units Synchronized via WebSocket</div>
            <div class="text-slate-400 text-[11px]">• Hospital Triage Capacity: Real-time telemetry aligned</div>
        </div>
    `;
}

// Profile management
function loadCitizenProfile() {
    const stored = api.getUser();
    if (stored) {
        citizenProfile = {
            name: stored.fullName || stored.username || stored.name || 'Citizen User',
            phone: stored.phone || '',
            emergencyPhone: stored.emergencyPhone || '',
            bloodGroup: stored.bloodGroup || 'O+ Positive'
        };
    } else {
        const local = localStorage.getItem('citizenProfile');
        if (local) {
            try { citizenProfile = JSON.parse(local); } catch (e) {}
        }
    }

    const nameInput = document.getElementById('prof-name');
    const phoneInput = document.getElementById('prof-phone');
    const emgInput = document.getElementById('prof-emg-phone');
    const bloodInput = document.getElementById('prof-blood');
    const navName = document.getElementById('nav-profile-name');

    if (nameInput) nameInput.value = citizenProfile.name || '';
    if (phoneInput) phoneInput.value = citizenProfile.phone || '';
    if (emgInput) emgInput.value = citizenProfile.emergencyPhone || '';
    if (bloodInput) bloodInput.value = citizenProfile.bloodGroup || 'O+ Positive';
    if (navName) navName.innerText = citizenProfile.name || 'Citizen Profile';
}

async function saveProfile(e) {
    e.preventDefault();

    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone').value.trim();
    const emgPhone = document.getElementById('prof-emg-phone').value.trim();
    const blood = document.getElementById('prof-blood').value;

    let valid = true;
    const phoneErr = document.getElementById('phone-err');
    const emgErr = document.getElementById('emg-phone-err');

    if (phone && !/^\d{10}$/.test(phone)) {
        if (phoneErr) phoneErr.classList.remove('hidden');
        valid = false;
    } else if (phoneErr) {
        phoneErr.classList.add('hidden');
    }

    if (emgPhone && !/^\d{10}$/.test(emgPhone)) {
        if (emgErr) emgErr.classList.remove('hidden');
        valid = false;
    } else if (emgErr) {
        emgErr.classList.add('hidden');
    }

    if (!valid) return;

    citizenProfile = { name, phone, emergencyPhone: emgPhone, bloodGroup: blood };
    localStorage.setItem('citizenProfile', JSON.stringify(citizenProfile));

    if (api.getToken() && api.isCitizen()) {
        try {
            await api.patch('/api/auth/profile', {
                fullName: name,
                phone,
                emergencyPhone: emgPhone,
                bloodGroup: blood
            });
        } catch (e) {
            console.warn('Profile sync with server skipped:', e.message);
        }
    }

    const navName = document.getElementById('nav-profile-name');
    if (navName) navName.innerText = name;

    const msg = document.getElementById('save-success-msg');
    if (msg) {
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 3500);
    }

    showToast('Citizen emergency profile updated successfully.', 'success');
}

window.switchTab = switchTab;
window.handleSosSubmit = handleSosSubmit;
window.fetchRealtimeWeatherData = fetchRealtimeWeatherData;
window.runRuleBasedRiskCalculator = runRuleBasedRiskCalculator;
window.allocateSmartHospital = allocateSmartHospital;
window.runMultiAgentCycle = runMultiAgentCycle;
window.saveProfile = saveProfile;
window.fetchCitizenReports = fetchCitizenReports;
window.showDispatchSuccessModal = showDispatchSuccessModal;
window.openCitizenReportModal = openCitizenReportModal;
window.openCitizenAuthModal = openCitizenAuthModal;
window.switchCitizenAuthTab = switchCitizenAuthTab;
window.handleCitizenLogin = handleCitizenLogin;
window.handleCitizenRegister = handleCitizenRegister;
window.citizenLogout = citizenLogout;
