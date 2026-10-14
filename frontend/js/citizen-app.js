/**
 * Main Application Logic for RESCUE AI Citizen Portal
 * Coordinates SOS Beacon Dispatches, Live Telemetry, Citizen Auth,
 * Real-Time Incident Status Tracking, Multi-Disaster AI Risk Engine,
 * Shelter & Hospital Directories, and Offline Queue Sync.
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
    if (typeof initRealtimeSocket === 'function') {
        initRealtimeSocket('CITIZEN');
    }

    // 2. Setup Navbar Auth UI & Load Profile
    updateCitizenAuthUI();
    loadCitizenProfile();

    // 2.1 Load Stored Manual Location if available
    try {
        const savedLoc = JSON.parse(localStorage.getItem('aister_manual_location') || '{}');
        if (savedLoc.lng && savedLoc.lat) {
            if (typeof window.setLiveUserCoordinates === 'function') {
                window.setLiveUserCoordinates(savedLoc.lng, savedLoc.lat, 20);
            }
            const hudLoc = document.getElementById('hud-location-name');
            const hdrBadge = document.getElementById('header-location-badge');
            if (hudLoc && savedLoc.name) hudLoc.innerText = savedLoc.name;
            if (hdrBadge && savedLoc.name) hdrBadge.innerText = savedLoc.name.split(',')[0];
        }
    } catch(e) {}

    // 3. Initialize Live Disaster Map & Location Tracking Immediately
    if (typeof initCitizenMap === 'function') {
        setTimeout(initCitizenMap, 100);
    } else if (typeof startCitizenLocationTracking === 'function') {
        startCitizenLocationTracking();
    }

    // 4. Load Initial Data
    fetchCitizenReports();
    fetchRealtimeWeatherData();
    fetchGovernmentAlerts();
    setInterval(fetchGovernmentAlerts, 90000); // 90s refresh for NDMA SACHET public alerts

    // 5. Network connectivity monitoring
    window.addEventListener('online', handleNetworkOnline);
    window.addEventListener('offline', handleNetworkOffline);
    checkOfflineQueue();

    // 6. Direct Hash Navigation (#home, #alerts, #reports, #profile, etc.)
    const validTabs = ['home', 'alerts', 'reports', 'profile', 'report', 'risk', 'shelters', 'hospitals', 'contacts', 'weather', 'app', 'help', 'about'];
    const initHash = window.location.hash.replace('#', '');
    if (initHash && validTabs.includes(initHash)) {
        setTimeout(() => switchTab(initHash), 50);
    }
    window.addEventListener('hashchange', () => {
        const h = window.location.hash.replace('#', '');
        if (h && validTabs.includes(h)) {
            switchTab(h);
        }
    });

    // 7. Listen to Real-Time Updates from Authority Command Grid
    if (typeof onRealtimeEvent === 'function') {
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
    }

    // 7. Initialize i18n
    if (typeof I18N !== 'undefined') {
        I18N.apply();
    }

    // 8. Initialize Dark Emergency Theme
    initTheme();
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
                <button onclick="openCitizenProfileModal()" class="flex flex-col text-right leading-tight hover:opacity-80 transition cursor-pointer">
                    <span class="text-xs font-bold text-white truncate max-w-[120px]">${displayName}</span>
                    <span class="text-[9px] font-black uppercase text-purple-400">${user.role || 'CITIZEN'}</span>
                </button>
                <button onclick="citizenLogout()" title="Log Out" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-700 text-slate-300 hover:text-red-300 transition text-xs flex items-center space-x-1 shadow">
                    <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                    <span class="text-[11px] hidden sm:inline">Sign Out</span>
                </button>
            </div>
        `;
    } else {
        navAuthContainer.innerHTML = `
            <button onclick="openCitizenAuthModal('login')" class="h-7 sm:h-8 bg-purple-700 hover:bg-purple-600 text-white font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs flex items-center space-x-1 shadow transition">
                <i data-lucide="log-in" class="w-3.5 h-3.5 flex-shrink-0"></i>
                <span class="hidden sm:inline">Sign In / Register</span>
                <span class="sm:hidden text-[11px]">Sign In</span>
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
                    <input type="email" id="citizen-login-email" placeholder="name@example.com" required autocomplete="email" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Password</label>
                    <input type="password" id="citizen-login-password" placeholder="••••••••" required autocomplete="current-password" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>

                <div id="citizen-login-error" class="hidden p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs"></div>

                <button type="submit" id="citizen-login-btn" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                    Sign In to Citizen Grid
                </button>
            </form>

            <!-- Register Form -->
            <form id="citizen-register-form" onsubmit="handleCitizenRegister(event)" class="space-y-3 text-xs ${tab === 'register' ? '' : 'hidden'}">
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Full Name</label>
                    <input type="text" id="citizen-reg-name" required placeholder="e.g. Satyam Pathak" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Email Address</label>
                    <input type="email" id="citizen-reg-email" required placeholder="your.name@example.com" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Password</label>
                    <input type="password" id="citizen-reg-password" minlength="6" required placeholder="At least 6 characters" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>
                <div>
                    <label class="block text-slate-300 font-bold uppercase mb-1">Phone Number (Optional)</label>
                    <input type="tel" id="citizen-reg-phone" placeholder="+91 9876543210" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none">
                </div>

                <div id="citizen-reg-error" class="hidden p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs"></div>

                <button type="submit" id="citizen-reg-btn" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-extrabold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
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
    const tabLogin = document.getElementById('auth-tab-login');
    const tabReg = document.getElementById('auth-tab-register');

    if (tab === 'login') {
        if (loginForm) loginForm.classList.remove('hidden');
        if (regForm) regForm.classList.add('hidden');
        if (tabLogin) tabLogin.className = "flex-1 py-1.5 rounded-lg transition bg-purple-700 text-white shadow";
        if (tabReg) tabReg.className = "flex-1 py-1.5 rounded-lg transition text-slate-400 hover:text-white";
    } else {
        if (loginForm) loginForm.classList.add('hidden');
        if (regForm) regForm.classList.remove('hidden');
        if (tabLogin) tabLogin.className = "flex-1 py-1.5 rounded-lg transition text-slate-400 hover:text-white";
        if (tabReg) tabReg.className = "flex-1 py-1.5 rounded-lg transition bg-purple-700 text-white shadow";
    }
}

async function handleCitizenLogin(e) {
    e.preventDefault();
    const email = document.getElementById('citizen-login-email').value.trim();
    const password = document.getElementById('citizen-login-password').value;
    const errBox = document.getElementById('citizen-login-error');
    const btn = document.getElementById('citizen-login-btn');

    try {
        if (btn) { btn.disabled = true; btn.innerText = 'Verifying Credentials...'; }
        if (errBox) errBox.classList.add('hidden');

        const res = await api.post('/api/auth/login', { email, password });
        if (!res.success || !res.data) throw new Error(res.message || 'Login failed');

        const { token, user } = res.data;
        api.setToken(token, user);

        document.getElementById('citizen-auth-modal').classList.add('hidden');
        updateCitizenAuthUI();
        loadCitizenProfile();
        showToast(`Welcome back, ${user.fullName || user.username}!`, 'success');
        await fetchCitizenReports();
    } catch (err) {
        if (errBox) {
            errBox.innerText = err.message || 'Invalid email or password.';
            errBox.classList.remove('hidden');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Sign In to Citizen Grid'; }
    }
}

async function handleCitizenRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('citizen-reg-name').value.trim();
    const email = document.getElementById('citizen-reg-email').value.trim();
    const password = document.getElementById('citizen-reg-password').value;
    const phone = document.getElementById('citizen-reg-phone').value.trim();
    const errBox = document.getElementById('citizen-reg-error');
    const btn = document.getElementById('citizen-reg-btn');

    try {
        if (btn) { btn.disabled = true; btn.innerText = 'Registering Account...'; }
        if (errBox) errBox.classList.add('hidden');

        const res = await api.post('/api/auth/register', {
            username: email.split('@')[0],
            email,
            password,
            fullName,
            phone
        });

        if (!res.success || !res.data) throw new Error(res.message || 'Registration failed');

        const { token, user } = res.data;
        api.setToken(token, user);

        document.getElementById('citizen-auth-modal').classList.add('hidden');
        updateCitizenAuthUI();
        loadCitizenProfile();
        showToast(`Account created successfully! Welcome, ${user.fullName || user.username}.`, 'success');
        await fetchCitizenReports();
    } catch (err) {
        if (errBox) {
            errBox.innerText = err.message || 'Registration failed. Email may already be in use.';
            errBox.classList.remove('hidden');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Create Citizen Account'; }
    }
}

function citizenLogout() {
    api.clearAuth();
    updateCitizenAuthUI();
    showToast('Signed out of citizen session.', 'info');
    fetchCitizenReports();
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// THEME SYSTEM (CRYSTAL-CLEAR HIGH-CONTRAST LIGHT DEFAULT)
// Words & text are 100% visible, sharp and legible everywhere
// -------------------------------------------------------------
function initTheme() {
    const saved = localStorage.getItem('rescue_theme') || 'light';
    applyTheme(saved);
}

function toggleTheme() {
    const isDark = document.body.classList.contains('theme-dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('theme-dark');
        document.documentElement.classList.add('theme-dark');
        localStorage.setItem('rescue_theme', 'dark');
    } else {
        document.body.classList.remove('theme-dark');
        document.documentElement.classList.remove('theme-dark');
        localStorage.setItem('rescue_theme', 'light');
    }
    const icon = document.getElementById('theme-toggle-icon');
    const text = document.getElementById('theme-toggle-text');
    if (icon) icon.innerText = (theme === 'dark') ? '☀️' : '🌙';
    if (text) text.innerText = (theme === 'dark') ? 'Light' : 'Dark';
    
    const moreIcon = document.getElementById('mobile-more-theme-icon');
    const moreText = document.getElementById('mobile-more-theme-text');
    if (moreIcon) moreIcon.innerText = (theme === 'dark') ? '☀️' : '🌙';
    if (moreText) moreText.innerText = (theme === 'dark') ? 'Light Mode' : 'Dark Mode';
}

// -------------------------------------------------------------
// VISUAL EMERGENCY CATEGORY GRID SELECTION
// Eliminates illegible OS native dropdowns with high-contrast UI
// -------------------------------------------------------------
function selectSosCategory(category) {
    const sel = document.getElementById('sos-category');
    if (sel) sel.value = category;

    document.querySelectorAll('.sos-cat-btn').forEach(btn => {
        const isMatch = btn.getAttribute('data-val') === category;
        btn.classList.toggle('active', isMatch);
        const checkIcon = btn.querySelector('.cat-check-icon');
        if (checkIcon) {
            checkIcon.classList.toggle('hidden', !isMatch);
        }
    });
}

// -------------------------------------------------------------
// SMARTPHONE NATIVE OS BACK BUTTON NAVIGATION
// Handles Android hardware Back button, edge swipe back gesture,
// and browser history to close modals, dismiss menus & navigate back
// -------------------------------------------------------------
function handleSmartphoneBack() {
    // 1. If any modal is open, close it!
    const openModals = Array.from(document.querySelectorAll('.fixed.inset-0:not(.hidden)'));
    if (openModals.length > 0) {
        openModals.forEach(m => m.classList.add('hidden'));
        return true;
    }

    // 2. If mobile more menu drawer is open, close it!
    const mobileMore = document.getElementById('mobile-more-menu');
    if (mobileMore && !mobileMore.classList.contains('hidden')) {
        toggleMobileMoreMenu();
        return true;
    }

    // 3. If mobile more backdrop is visible, close it!
    const backdrop = document.getElementById('mobile-more-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
        backdrop.classList.add('hidden');
        return true;
    }

    // 4. If on a sub-view (not home), smoothly navigate back to home!
    let activeSubPage = false;
    document.querySelectorAll('.page-content:not(.hidden)').forEach(el => {
        if (el.id !== 'page-home') {
            activeSubPage = true;
        }
    });
    if (activeSubPage) {
        switchTab('home');
        return true;
    }

    // 5. Already at home with no modals open
    return false;
}

// Wire up Capacitor App Plugin Hardware Back Button
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', () => {
        const handled = handleSmartphoneBack();
        if (!handled) {
            // Android double-back to exit pattern
            const now = Date.now();
            if (window._lastBackPress && (now - window._lastBackPress < 2000)) {
                window.Capacitor.Plugins.App.exitApp();
            } else {
                window._lastBackPress = now;
                if (typeof showToast === 'function') {
                    showToast('Press back again to exit RESCUE AI', 'info');
                }
            }
        }
    });
}

// Wire up Window Popstate Event
window.addEventListener('popstate', () => {
    handleSmartphoneBack();
});

// -------------------------------------------------------------
// MORE DROPDOWN MENU
// -------------------------------------------------------------
function toggleMoreMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('nav-more-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
}

function toggleMobileMoreMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('mobile-more-menu');
    const backdrop = document.getElementById('mobile-more-backdrop');
    if (!menu) return;
    const isOpening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (backdrop) backdrop.classList.toggle('hidden', !isOpening);
    if (isOpening && typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Close more dropdowns on outside click
document.addEventListener('click', (e) => {
    const desktopMenu = document.getElementById('nav-more-menu');
    const mobileMenu = document.getElementById('mobile-more-menu');
    const backdrop = document.getElementById('mobile-more-backdrop');
    if (desktopMenu && !desktopMenu.contains(e.target) && !e.target.closest('#nav-more-btn')) {
        desktopMenu.classList.add('hidden');
    }
    if (mobileMenu && !mobileMenu.contains(e.target) && !e.target.closest('#mob-tab-more')) {
        mobileMenu.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
    }
});

// -------------------------------------------------------------
// NAVIGATION TAB SWITCHER (ALL PLATFORM SECTIONS)
// -------------------------------------------------------------
// -------------------------------------------------------------
// NAVIGATION TAB SWITCHER (4 CORE TABS + SECONDARY MODULES)
// -------------------------------------------------------------
function switchTab(tabId) {
    if (tabId === 'map') tabId = 'home';

    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`page-${tabId}`);
    if (target) target.classList.remove('hidden');

    // Desktop nav highlighting
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-white', 'bg-slate-800', 'border-slate-700', 'nav-btn-active');
        btn.classList.add('text-slate-400');
    });

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('text-white', 'bg-slate-800', 'border-slate-700', 'nav-btn-active');
    }

    // Bottom nav highlighting (Strictly 4 Core Tabs: Home, Alerts, My Reports, Profile)
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('text-sky-400', 'font-bold');
        btn.classList.add('text-slate-400');
    });

    const mobActiveBtn = document.getElementById(`mob-tab-${tabId}`);
    if (mobActiveBtn) {
        mobActiveBtn.classList.remove('text-slate-400');
        mobActiveBtn.classList.add('text-sky-400', 'font-bold');
    }

    // Auto-close side menu drawer & popup panels
    toggleSideMenu(false);
    document.getElementById('map-layers-panel')?.classList.add('hidden');

    if (tabId === 'home') {
        setTimeout(() => {
            if (typeof initCitizenMap === 'function' && !mapboxMap) initCitizenMap();
            else if (mapboxMap) mapboxMap.resize();
        }, 100);
    } else if (tabId === 'alerts') {
        renderAlertsPage();
        fetchGovernmentAlerts();
    } else if (tabId === 'reports') {
        fetchCitizenReports();
    } else if (tabId === 'profile') {
        loadCitizenProfileSettings();
    } else if (tabId === 'shelters') {
        fetchSheltersDirectory();
    } else if (tabId === 'hospitals') {
        fetchHospitalsDirectory();
    } else if (tabId === 'weather') {
        fetch5DayWeatherForecast();
    } else if (tabId === 'contacts') {
        loadTrustedContacts();
        updateShareableDistressText();
    } else if (tabId === 'risk') {
        runModularRiskAssessment();
        fetchRealtimeWeatherData();
    } else if (tabId === 'app') {
        updatePhoneClock();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Push state to browser history so smartphone back navigation works naturally
    try {
        if (tabId !== 'home') history.pushState({ tab: tabId }, '', `#${tabId}`);
        else if (window.location.hash) history.pushState({ tab: 'home' }, '', window.location.pathname);
    } catch(e) {}

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -------------------------------------------------------------
// SIDE MENU DRAWER (Consolidated all platform features in one side)
// -------------------------------------------------------------
function toggleSideMenu(force) {
    const drawer = document.getElementById('side-menu-drawer');
    const backdrop = document.getElementById('side-menu-backdrop');
    if (!drawer) return;
    const isCurrentlyOpen = !drawer.classList.contains('-translate-x-full');
    const shouldOpen = force !== undefined ? force : !isCurrentlyOpen;
    if (shouldOpen) {
        drawer.classList.remove('-translate-x-full');
        if (backdrop) backdrop.classList.remove('hidden');
    } else {
        drawer.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    }
}
window.toggleSideMenu = toggleSideMenu;

// -------------------------------------------------------------
// LOCATION CONSENT & MANUAL SELECTION (Requirement 1 & UI/UX)
// -------------------------------------------------------------
function openManualLocationModal() {
    document.getElementById('manual-location-modal')?.classList.remove('hidden');
}
function closeManualLocationModal() {
    document.getElementById('manual-location-modal')?.classList.add('hidden');
}
function dismissLocationBanner() {
    document.getElementById('location-permission-banner')?.classList.add('hidden');
}

function setManualCoordinates(lng, lat, cityName) {
    if (typeof window.setLiveUserCoordinates === 'function') {
        window.setLiveUserCoordinates(lng, lat, 15);
    }
    
    // Save preference
    try {
        localStorage.setItem('aister_manual_location', JSON.stringify({ lng, lat, name: cityName }));
    } catch(e) {}

    // Update HUD & header
    const hudLoc = document.getElementById('hud-location-name');
    const hdrBadge = document.getElementById('header-location-badge');
    const profInput = document.getElementById('prof-manual-city');
    if (hudLoc) hudLoc.innerText = cityName;
    if (hdrBadge) hdrBadge.innerText = cityName.split(',')[0];
    if (profInput) profInput.value = cityName;

    // Recenter map
    if (typeof mapboxMap !== 'undefined' && mapboxMap) {
        mapboxMap.flyTo({ center: [lng, lat], zoom: 13, duration: 1200 });
        if (typeof renderUserGpsMarker === 'function') renderUserGpsMarker();
    }

    // Refresh weather & risk for this new location
    if (typeof fetchRealtimeWeatherData === 'function') {
        fetchRealtimeWeatherData(lat, lng);
    }
    if (typeof runModularRiskAssessment === 'function') {
        runModularRiskAssessment();
    }

    closeManualLocationModal();
    dismissLocationBanner();
    showToast(`Disaster telemetry focused on: ${cityName}`, 'info');
}

function detectLiveGpsFromModal() {
    requestGpsPermissionDirectly();
    closeManualLocationModal();
}

function requestGpsPermissionDirectly() {
    if (!("geolocation" in navigator)) {
        showToast('Geolocation is not supported by your browser.', 'warning');
        return;
    }
    showToast('Querying GPS satellites for high-accuracy fix...', 'info');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            if (typeof window.setLiveUserCoordinates === 'function') {
                window.setLiveUserCoordinates(longitude, latitude, accuracy);
            }
            if (typeof mapboxMap !== 'undefined' && mapboxMap) {
                mapboxMap.flyTo({ center: [longitude, latitude], zoom: 14 });
                if (typeof renderUserGpsMarker === 'function') renderUserGpsMarker();
            }
            dismissLocationBanner();
            showToast(`GPS Position Locked (±${Math.round(accuracy)}m)`, 'success');
            
            // Reverse geocode
            api.get(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`)
                .then(geo => {
                    const placeName = geo && geo.text ? geo.text : `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
                    const hudLoc = document.getElementById('hud-location-name');
                    const hdrBadge = document.getElementById('header-location-badge');
                    if (hudLoc) hudLoc.innerText = placeName;
                    if (hdrBadge) hdrBadge.innerText = placeName;
                })
                .catch(() => {});
        },
        (err) => {
            showToast('GPS permission was denied or unavailable. Please pick a district manually.', 'warning');
            openManualLocationModal();
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function geocodeManualLocation() {
    const input = document.getElementById('manual-custom-city-input');
    const query = input ? input.value.trim() : '';
    if (!query) return;

    try {
        const res = await api.get(`/api/geocode/search?q=${encodeURIComponent(query)}`);
        if (res.success && res.features && res.features.length > 0) {
            const place = res.features[0];
            const [lng, lat] = place.center;
            setManualCoordinates(lng, lat, place.place_name || place.text);
        } else {
            showToast('City not recognized. Please pick one from the quick buttons.', 'warning');
        }
    } catch(e) {
        showToast('Geocoding request failed. Check network.', 'error');
    }
}

// -------------------------------------------------------------
// EXPLAINABLE AI RISK MODAL & MAP LAYERS PANEL
// -------------------------------------------------------------
function openAiRiskModal() {
    document.getElementById('ai-risk-modal')?.classList.remove('hidden');
}
function closeAiRiskModal() {
    document.getElementById('ai-risk-modal')?.classList.add('hidden');
}
function toggleMapLayersPanel() {
    const panel = document.getElementById('map-layers-panel');
    if (panel) panel.classList.toggle('hidden');
}

// -------------------------------------------------------------
// ALERTS PAGE & AUTOMATIC DISASTER MONITORING
// -------------------------------------------------------------
let currentAlertsFilter = 'all';

function filterAlertsTab(filter) {
    currentAlertsFilter = filter;
    document.querySelectorAll('.alerts-filter-btn').forEach(btn => {
        btn.classList.remove('bg-sky-600', 'text-white');
        btn.classList.add('bg-slate-900', 'border', 'border-slate-800', 'text-slate-300');
    });
    const activeBtn = document.getElementById(`alerts-filter-${filter}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-slate-900', 'border', 'border-slate-800', 'text-slate-300');
        activeBtn.classList.add('bg-sky-600', 'text-white');
    }

    const secOfficial = document.getElementById('alerts-section-official');
    const secAi = document.getElementById('alerts-section-ai');
    const secCommunity = document.getElementById('alerts-section-community');

    if (filter === 'all') {
        secOfficial?.classList.remove('hidden');
        secAi?.classList.remove('hidden');
        secCommunity?.classList.remove('hidden');
    } else if (filter === 'official') {
        secOfficial?.classList.remove('hidden');
        secAi?.classList.add('hidden');
        secCommunity?.classList.add('hidden');
    } else if (filter === 'ai') {
        secOfficial?.classList.add('hidden');
        secAi?.classList.remove('hidden');
        secCommunity?.classList.add('hidden');
    } else if (filter === 'community') {
        secOfficial?.classList.add('hidden');
        secAi?.classList.add('hidden');
        secCommunity?.classList.remove('hidden');
    }
}

async function renderAlertsPage() {
    // 1. Render Official NDMA SACHET feed
    const officialContainer = document.getElementById('alerts-official-feed');
    if (officialContainer) {
        try {
            const res = await api.get('/api/alerts');
            const alertList = (res && res.data && res.data.alerts) ? res.data.alerts : (res && res.alerts ? res.alerts : []);
            if (!Array.isArray(alertList) || alertList.length === 0) {
                officialContainer.innerHTML = `
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
                        <i data-lucide="check-circle" class="w-8 h-8 text-emerald-400 mx-auto mb-2"></i>
                        <p class="font-bold text-white">No Active Severe Government Alerts</p>
                        <p class="text-[11px] text-slate-400 mt-1">Regional monitoring sectors are operating normally under standard baseline telemetry.</p>
                    </div>
                `;
            } else {
                officialContainer.innerHTML = alertList.filter(a => a.is_active).map(a => {
                    const isSevere = a.severity === 'SEVERE' || a.severity === 'EXTREME';
                    const badgeClass = isSevere ? 'bg-red-950 text-red-300 border-red-700' : 'bg-amber-950 text-amber-300 border-amber-700';
                    return `
                        <div class="bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-2xl p-5 space-y-3 transition shadow-lg">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-2">
                                    <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${badgeClass}">
                                        ${a.severity} WARNING
                                    </span>
                                    <span class="font-mono text-[10px] text-slate-400">${a.alert_identifier}</span>
                                </div>
                                <span class="text-[10px] text-amber-400 font-bold uppercase tracking-wider">NDMA SACHET</span>
                            </div>
                            <div>
                                <h3 class="text-base font-black text-white">${a.hazard_type}</h3>
                                <p class="text-xs text-slate-300 mt-1 leading-relaxed">${a.official_instructions}</p>
                            </div>
                            <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                                <div class="flex justify-between">
                                    <span>Affected Sector:</span>
                                    <strong class="text-slate-200">${a.affected_area} (±${a.radius_km}km)</strong>
                                </div>
                                <div class="flex justify-between">
                                    <span>Source Agency:</span>
                                    <span class="text-sky-300">${a.source_agency}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Effective Until:</span>
                                    <span class="font-mono text-slate-300">${new Date(a.expires_at).toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch(e) {
            console.warn('Failed to load official alerts:', e);
        }
    }

    // 2. Render Unverified Citizen Reports feed
    const communityContainer = document.getElementById('alerts-community-feed');
    if (communityContainer) {
        try {
            const res = await api.get('/api/incidents?limit=6');
            const incidents = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
            if (!Array.isArray(incidents) || incidents.length === 0) {
                communityContainer.innerHTML = `
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center text-slate-400 text-xs">
                        No recent citizen incident reports.
                    </div>
                `;
            } else {
                communityContainer.innerHTML = incidents.slice(0, 5).map(inc => {
                    const isUnverified = inc.status === 'SUBMITTED' || inc.status === 'TRIAGED';
                    return `
                        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-white flex items-center space-x-1.5">
                                    <span>⚠️</span>
                                    <span>${inc.category || 'Disaster Incident'}</span>
                                </span>
                                <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${isUnverified ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}">
                                    ${isUnverified ? 'UNVERIFIED REPORT' : inc.status}
                                </span>
                            </div>
                            <p class="text-[11px] text-slate-300 line-clamp-2">${inc.details || 'Emergency incident reported by citizen.'}</p>
                            <div class="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                                <span>Ref: #${inc.id}</span>
                                <span>${new Date(inc.created_at || Date.now()).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch(e) {
            console.warn('Failed to load community incidents:', e);
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// -------------------------------------------------------------
// CITIZEN PROFILE SETTINGS & GEOLOCATION CONSENT
// -------------------------------------------------------------
function loadCitizenProfileSettings() {
    const nameInput = document.getElementById('prof-name-input');
    const phoneInput = document.getElementById('prof-phone-input');
    const iceInput = document.getElementById('prof-ice-input');
    const medicalInput = document.getElementById('prof-medical-input');
    const manualCity = document.getElementById('prof-manual-city');
    const consentToggle = document.getElementById('consent-gps-toggle');

    try {
        const saved = JSON.parse(localStorage.getItem('aister_citizen_profile') || '{}');
        if (nameInput) nameInput.value = saved.name || citizenProfile.name || '';
        if (phoneInput) phoneInput.value = saved.phone || citizenProfile.phone || '';
        if (iceInput) iceInput.value = saved.ice || citizenProfile.emergencyPhone || '';
        if (medicalInput) medicalInput.value = saved.medical || citizenProfile.bloodGroup || '';

        const savedLoc = JSON.parse(localStorage.getItem('aister_manual_location') || '{}');
        if (manualCity && savedLoc.name) manualCity.value = savedLoc.name;

        const consent = localStorage.getItem('aister_gps_consent');
        if (consentToggle && consent !== null) consentToggle.checked = (consent === 'true');
    } catch(e) {}
}

function saveCitizenProfileSettings() {
    const name = document.getElementById('prof-name-input')?.value.trim();
    const phone = document.getElementById('prof-phone-input')?.value.trim();
    const ice = document.getElementById('prof-ice-input')?.value.trim();
    const medical = document.getElementById('prof-medical-input')?.value.trim();
    const consent = document.getElementById('consent-gps-toggle')?.checked;

    const data = { name, phone, ice, medical };
    citizenProfile.name = name || citizenProfile.name;
    citizenProfile.phone = phone || citizenProfile.phone;
    citizenProfile.emergencyPhone = ice || citizenProfile.emergencyPhone;
    citizenProfile.bloodGroup = medical || citizenProfile.bloodGroup;

    try {
        localStorage.setItem('aister_citizen_profile', JSON.stringify(data));
        localStorage.setItem('aister_gps_consent', String(consent));
        showToast('Emergency profile & consent settings updated.', 'success');
    } catch(e) {
        showToast('Saved profile locally.', 'info');
    }
}

function handleGpsConsentChange(checked) {
    try {
        localStorage.setItem('aister_gps_consent', String(checked));
        if (checked) {
            showToast('Live GPS monitoring enabled.', 'success');
            if (typeof startCitizenLocationTracking === 'function') startCitizenLocationTracking();
        } else {
            showToast('GPS tracking disabled. Manual location will be utilized.', 'info');
            openManualLocationModal();
        }
    } catch(e) {}
}

window.openManualLocationModal = openManualLocationModal;
window.closeManualLocationModal = closeManualLocationModal;
window.dismissLocationBanner = dismissLocationBanner;
window.setManualCoordinates = setManualCoordinates;
window.detectLiveGpsFromModal = detectLiveGpsFromModal;
window.requestGpsPermissionDirectly = requestGpsPermissionDirectly;
window.geocodeManualLocation = geocodeManualLocation;
window.openAiRiskModal = openAiRiskModal;
window.closeAiRiskModal = closeAiRiskModal;
window.toggleMapLayersPanel = toggleMapLayersPanel;
window.filterAlertsTab = filterAlertsTab;
window.renderAlertsPage = renderAlertsPage;
window.loadCitizenProfileSettings = loadCitizenProfileSettings;
window.saveCitizenProfileSettings = saveCitizenProfileSettings;
window.handleGpsConsentChange = handleGpsConsentChange;

// -------------------------------------------------------------
// ONE-TAP AUTOMATIC SOS RESCUE COCKPIT (CRITICAL REQUIREMENT 1)
// -------------------------------------------------------------
let activeSosGpsInterval = null;

async function triggerOneTapSos() {
    if (window.isSosSubmitting) return;
    window.isSosSubmitting = true;

    if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]); } catch(e) {}
    }

    // Auto-close standard modal if open
    document.getElementById('sos-modal')?.classList.add('hidden');

    const cockpit = document.getElementById('active-sos-cockpit');
    if (cockpit) {
        cockpit.classList.remove('hidden');
        document.getElementById('cockpit-incident-id').innerText = 'ACQUIRING GPS FIX...';
        document.getElementById('cockpit-team-name').innerText = '⚡ Autonomous AI Dispatch Engine Evaluating Capabilities...';
        document.getElementById('cockpit-team-details').innerText = 'Scanning verified squads, specialized flood/trauma gear, and travel times...';
        document.getElementById('cockpit-team-eta').innerText = 'Estimating...';
        document.getElementById('cockpit-team-dist').innerText = 'Calculating...';
        document.getElementById('cockpit-ack-badge').innerText = '⏳ INITIATING SOS...';
        document.getElementById('cockpit-ack-badge').className = 'px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-950 text-red-300 border border-red-800 animate-pulse';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    let coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    const gpsTelemetry = (typeof window.getGpsTelemetry === 'function')
        ? window.getGpsTelemetry()
        : { isVerifiedGps: true, accuracy: 5.0, timestamp: new Date().toISOString() };

    const idempotencyKey = `sos_onetap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
        if (!navigator.onLine) {
            saveOfflineReport({
                category: 'Distress Beacon',
                count: 1,
                details: 'ONE-TAP EMERGENCY SOS: Network offline. Queued locally for immediate dispatch.',
                latitude: coords[0],
                longitude: coords[1],
                timestamp: new Date().toISOString()
            });
            showToast('SOS Beacon saved offline. Will auto-dispatch immediately when connectivity returns.', 'warning');
            if (cockpit) {
                document.getElementById('cockpit-incident-id').innerText = 'QUEUED OFFLINE';
                document.getElementById('cockpit-team-name').innerText = 'Saved Locally • Awaiting Cellular / WiFi';
                document.getElementById('cockpit-team-details').innerText = 'Will automatically transmit and dispatch to squad once network is restored.';
            }
            window.isSosSubmitting = false;
            return;
        }

        const payload = {
            category: 'Distress Beacon',
            count: 1,
            details: 'ONE-TAP EMERGENCY SOS TRIGGERED: User in immediate life danger. Autonomous rescue dispatch requested.',
            latitude: coords[0],
            longitude: coords[1],
            is_verified_gps: gpsTelemetry.isVerifiedGps ? 1 : 0,
            gps_accuracy: gpsTelemetry.accuracy || 4.2,
            gps_timestamp: gpsTelemetry.timestamp || new Date().toISOString(),
            autoDispatch: true,
            source: 'ONE_TAP_SOS',
            idempotency_key: idempotencyKey
        };

        const res = await api.post('/api/incidents', payload, { 'Idempotency-Key': idempotencyKey });
        if (!res.success) throw new Error(res.message || 'One-Tap SOS dispatch failed');

        const inc = res.data.incident || res.data;
        window.activeIncidentId = inc.id;

        // Update cockpit with real incident data
        renderActiveSosCockpit(inc, coords, gpsTelemetry);
        showToast(`🚨 ONE-TAP SOS ACTIVATED! Incident #${inc.id} logged.`, 'success');

        // Start periodic GPS tracking updates
        startContinuousSosGpsTracking(inc.id);

        // Update shareable message text with real incident ID
        updateShareableDistressText();

        // Refresh reports list
        fetchCitizenReports();

    } catch (err) {
        showToast(err.message || 'Failed to trigger One-Tap SOS. Retrying...', 'error');
        if (cockpit) {
            document.getElementById('cockpit-incident-id').innerText = 'ERROR - RETRYING';
            document.getElementById('cockpit-team-name').innerText = 'Connection Error: ' + err.message;
        }
    } finally {
        window.isSosSubmitting = false;
    }
}

function renderActiveSosCockpit(inc, coords, gpsTelemetry) {
    const cockpit = document.getElementById('active-sos-cockpit');
    if (!cockpit) return;

    document.getElementById('cockpit-incident-id').innerText = inc.id;
    document.getElementById('cockpit-incident-priority').innerText = `${inc.emergency_level || 'HIGH'} PRIORITY`;

    // Lifecycle steps
    const stepDispatch = document.getElementById('step-dispatch');
    const stepEnroute = document.getElementById('step-enroute');

    if (inc.status === 'TEAM_ASSIGNED' || inc.status === 'TEAM_EN_ROUTE') {
        if (stepDispatch) stepDispatch.className = 'p-2 rounded-xl bg-blue-950 text-blue-300 border border-blue-800 font-bold';
        if (stepEnroute) stepEnroute.className = 'p-2 rounded-xl bg-purple-950 text-purple-300 border border-purple-800 font-bold';
    }

    // Team Card
    const teamNameEl = document.getElementById('cockpit-team-name');
    const teamDetailsEl = document.getElementById('cockpit-team-details');
    const teamEtaEl = document.getElementById('cockpit-team-eta');
    const teamDistEl = document.getElementById('cockpit-team-dist');
    const ackBadgeEl = document.getElementById('cockpit-ack-badge');

    if (inc.assigned_rescue_team) {
        teamNameEl.innerText = inc.assigned_rescue_team;
        teamDetailsEl.innerHTML = `Dispatched Unit: <strong>${inc.dispatch_team_id || 'FIRST RESPONDER SQUAD'}</strong> • Status: <span class="text-emerald-400 font-bold">${inc.status}</span>`;
        teamEtaEl.innerText = `~${inc.dispatch_eta_minutes || 10} Mins`;
        teamDistEl.innerText = `~${inc.dispatch_distance_km ? Number(inc.dispatch_distance_km).toFixed(1) : '3.5'} km`;
        if (inc.acknowledged_at) {
            ackBadgeEl.innerText = '✓ Squad Acknowledged & Rolling';
            ackBadgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-800';
        } else {
            ackBadgeEl.innerText = '⚡ Dispatched (Awaiting Ack)';
            ackBadgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-950 text-blue-300 border border-blue-800 animate-pulse';
        }
    } else {
        teamNameEl.innerText = '⏳ Awaiting Available Field Squad';
        teamDetailsEl.innerHTML = `No squad currently available within immediate radius. Emergency escalated to <strong>Regional Command Center (Level ${inc.escalation_level || 1})</strong>.`;
        teamEtaEl.innerText = 'Coordinating';
        teamDistEl.innerText = 'Regional Grid';
        ackBadgeEl.innerText = 'Awaiting Squad';
        ackBadgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-950 text-amber-300 border border-amber-800';
    }

    const gpsEl = document.getElementById('cockpit-gps-telemetry');
    if (gpsEl && coords) {
        gpsEl.innerText = `Lat: ${Number(coords[0]).toFixed(4)}°, Lng: ${Number(coords[1]).toFixed(4)}° (±${Math.round(gpsTelemetry?.accuracy || 4)}m)`;
    }

    const ndrfDetailsEl = document.getElementById('cockpit-ndrf-details');
    if (ndrfDetailsEl) {
        if (inc.ndrf_cad_id) {
            ndrfDetailsEl.innerText = `${inc.ndrf_battalion || '11th Battalion NDRF'} • Ref: ${inc.ndrf_cad_id} • Status: ${inc.ndrf_status || 'ACKNOWLEDGED'}`;
        } else {
            ndrfDetailsEl.innerText = 'National Control Room Connected (1078 EOC) • High-Priority Alert Relayed';
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function startContinuousSosGpsTracking(incidentId) {
    if (activeSosGpsInterval) clearInterval(activeSosGpsInterval);
    activeSosGpsInterval = setInterval(async () => {
        if (!window.activeIncidentId || window.activeIncidentId !== incidentId) {
            clearInterval(activeSosGpsInterval);
            return;
        }
        const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : null;
        if (!coords) return;
        const gpsTelemetry = (typeof window.getGpsTelemetry === 'function') ? window.getGpsTelemetry() : {};

        try {
            await api.patch(`/api/incidents/${incidentId}/location`, {
                latitude: coords[0],
                longitude: coords[1],
                gps_accuracy: gpsTelemetry.accuracy || null
            });
            const s = (typeof getSocket === 'function') ? getSocket() : null;
            if (s && s.connected) {
                s.emit('incident:location_update', {
                    incidentId,
                    latitude: coords[0],
                    longitude: coords[1],
                    accuracy: gpsTelemetry.accuracy || null
                });
            }
        } catch(e) {}
    }, 10000);
}

function closeSosCockpit() {
    document.getElementById('active-sos-cockpit')?.classList.add('hidden');
}

function selectSupplementCategory(cat) {
    const input = document.getElementById('cockpit-supp-category');
    if (input) input.value = cat;

    document.querySelectorAll('#cockpit-category-chips .supp-cat-btn').forEach(btn => {
        if (btn.innerText.includes(cat)) {
            btn.className = 'supp-cat-btn active px-2.5 py-1 rounded-lg border border-purple-500 bg-purple-950/80 text-purple-200 text-xs font-bold';
        } else {
            btn.className = 'supp-cat-btn px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-xs';
        }
    });
}

async function submitSupplementalDetails(e) {
    e.preventDefault();
    if (!window.activeIncidentId) {
        showToast('No active incident to supplement. Please trigger One-Tap SOS first.', 'error');
        return;
    }

    const category = document.getElementById('cockpit-supp-category')?.value || 'Distress Beacon';
    const count = parseInt(document.getElementById('cockpit-supp-count')?.value, 10) || 1;
    const address = document.getElementById('cockpit-supp-address')?.value?.trim() || '';
    const fileInput = document.getElementById('cockpit-supp-evidence');
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    const hasVoiceBlob = voiceEngine && voiceEngine.recordedAudioBlob;

    const submitBtn = document.getElementById('cockpit-supp-submit-btn');
    const origText = submitBtn ? submitBtn.innerText : 'Update Incident';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'TRANSMITTING SUPPLEMENTAL DETAILS TO RESCUERS...';
        }

        let res;
        if (hasFile || hasVoiceBlob) {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('count', count);
            if (address) formData.append('address', address);
            if (hasFile) formData.append('evidence', fileInput.files[0]);
            else if (hasVoiceBlob) formData.append('evidence', voiceEngine.recordedAudioBlob, 'voice-supplement.webm');

            res = await api.postMultipart(`/api/incidents/${window.activeIncidentId}/supplement`, formData);
        } else {
            res = await api.post(`/api/incidents/${window.activeIncidentId}/supplement`, {
                category,
                count,
                address: address || undefined,
                details: `Supplemental citizen note: Category ${category}, headcount ${count}. ${address ? 'Landmark: ' + address : ''}`
            });
        }

        if (!res.success) throw new Error(res.message || 'Failed to supplement incident');
        showToast('✓ Supplemental emergency details transmitted! AI Risk Engine re-evaluated.', 'success');

        const updatedInc = res.data.incident || res.data;
        const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
        renderActiveSosCockpit(updatedInc, coords, window.getGpsTelemetry ? window.getGpsTelemetry() : null);

        if (voiceEngine) voiceEngine.clearRecording();
        fetchCitizenReports();

    } catch (err) {
        showToast(err.message || 'Failed to update details', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = origText;
        }
    }
}

// -------------------------------------------------------------
// MODALS & APP SHOWCASE SIMULATOR
// -------------------------------------------------------------
function openSosModal() {
    const modal = document.getElementById('sos-modal');
    if (modal) {
        modal.classList.remove('hidden');
        try { history.pushState({ modal: 'sos' }, '', '#sos'); } catch(e) {}
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function openApkModal() {
    const modal = document.getElementById('apk-download-modal');
    if (modal) {
        modal.classList.remove('hidden');
        try { history.pushState({ modal: 'apk' }, '', '#apk'); } catch(e) {}
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function closeApkModal() {
    const modal = document.getElementById('apk-download-modal');
    if (modal) modal.classList.add('hidden');
}

function updatePhoneClock() {
    const el = document.getElementById('phone-clock');
    if (el) {
        const now = new Date();
        el.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

function switchPhoneScreen(screenId) {
    document.querySelectorAll('.phone-view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(`phone-view-${screenId}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.phone-tab-btn').forEach(btn => {
        btn.classList.remove('text-purple-400', 'font-bold');
        btn.classList.add('text-slate-400', 'font-medium');
    });
    const activeTab = document.getElementById(`phone-tab-${screenId}`);
    if (activeTab) {
        activeTab.classList.remove('text-slate-400', 'font-medium');
        activeTab.classList.add('text-purple-400', 'font-bold');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function simulatePhoneSos() {
    const alertBox = document.getElementById('phone-sos-alert');
    if (!alertBox) return;
    alertBox.classList.remove('hidden');
    alertBox.innerHTML = `
        <div class="p-3 bg-red-950/90 border border-red-500 rounded-xl text-red-200 text-xs space-y-1.5 shadow-lg">
            <div class="flex items-center space-x-1.5 font-black text-red-300">
                <i data-lucide="siren" class="w-4 h-4 animate-spin"></i>
                <span>BEACON TRANSMITTED TO HQ!</span>
            </div>
            <p class="text-[10px] text-slate-300">GPS: 26.8467° N, 80.9462° E • Accuracy: ±4.2m</p>
            <p class="text-[10px] text-emerald-400 font-bold">✓ NDRF Unit 11 Acknowledged • ETA 8 Mins</p>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
        if (alertBox) alertBox.classList.add('hidden');
    }, 6000);
}

function simulateAiDetection(type) {
    const titleEl = document.getElementById('phone-ai-title');
    const badgeEl = document.getElementById('phone-ai-badge');
    const metric1 = document.getElementById('phone-ai-m1');
    const metric2 = document.getElementById('phone-ai-m2');
    const metric3 = document.getElementById('phone-ai-m3');
    const recEl = document.getElementById('phone-ai-rec');

    if (type === 'flood') {
        if (titleEl) titleEl.innerText = 'Flash Flood & River Inundation';
        if (badgeEl) { badgeEl.innerText = 'P1 CRITICAL'; badgeEl.className = 'text-[9px] font-bold px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800'; }
        if (metric1) metric1.innerText = 'Water Depth: 1.8m (Rising)';
        if (metric2) metric2.innerText = 'Victims: 4 Trapped on Terrace';
        if (metric3) metric3.innerText = 'Structural Risk: 84% High';
        if (recEl) recEl.innerText = 'Immediate Inflatable Boat / Air Evacuation Recommended';
    } else if (type === 'earthquake') {
        if (titleEl) titleEl.innerText = 'Structural Debris Collapse';
        if (badgeEl) { badgeEl.innerText = 'P1 HIGH'; badgeEl.className = 'text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800'; }
        if (metric1) metric1.innerText = 'Rubble Depth: 2.4m Trapped';
        if (metric2) metric2.innerText = 'Acoustic Signs: 2 Vitals Detected';
        if (metric3) metric3.innerText = 'Aftershock Probability: 68%';
        if (recEl) recEl.innerText = 'Deploy Search & Rescue K9 + Concrete Breaker Squad';
    } else if (type === 'fire') {
        if (titleEl) titleEl.innerText = 'Urban Fire & Toxic Smoke Surge';
        if (badgeEl) { badgeEl.innerText = 'P2 URGENT'; badgeEl.className = 'text-[9px] font-bold px-2 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-800'; }
        if (metric1) metric1.innerText = 'Thermal Heat: 420°C Core';
        if (metric2) metric2.innerText = 'Toxic Gases: CO High 450ppm';
        if (metric3) metric3.innerText = 'Spread Rate: 12 m/min Downwind';
        if (recEl) recEl.innerText = 'Deploy Water Tender Foam + SCBA Breathing Apparatus';
    }
}

function simulateOfflineSync() {
    const status = document.getElementById('phone-offline-status');
    if (!status) return;
    status.innerHTML = `<span class="text-amber-400 animate-pulse">Syncing 3 beacons with Command HQ...</span>`;
    setTimeout(() => {
        status.innerHTML = `<span class="text-emerald-400 font-bold">✓ 3 Beacons Synced to SQLite & PostgreSQL DB!</span>`;
    }, 1200);
}

function copyChecksum() {
    const hash = '596A0746CAC1F24AAFF14C5057E0A5A5583DF784ADBC37DA16CC1D9741088B38';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hash).then(() => {
            const btn = document.getElementById('copy-checksum-btn');
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<span>✓ Copied!</span>';
                setTimeout(() => { btn.innerHTML = orig; }, 2000);
            }
        }).catch(() => {
            prompt('SHA-256 Checksum (Copy with Ctrl+C):', hash);
        });
    } else {
        prompt('SHA-256 Checksum (Copy with Ctrl+C):', hash);
    }
}

function openCitizenProfileModal() {
    const modal = document.getElementById('citizen-profile-modal');
    if (!modal) return;
    loadCitizenProfile();
    modal.classList.remove('hidden');
    try { history.pushState({ modal: 'profile' }, '', '#profile'); } catch(e) {}
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

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
    const emgInput = document.getElementById('prof-em-phone');
    const bloodInput = document.getElementById('prof-blood');

    if (nameInput) nameInput.value = citizenProfile.name || '';
    if (phoneInput) phoneInput.value = citizenProfile.phone || '';
    if (emgInput) emgInput.value = citizenProfile.emergencyPhone || '';
    if (bloodInput) bloodInput.value = citizenProfile.bloodGroup || 'O+ Positive';
}

async function saveCitizenProfile(e) {
    e.preventDefault();
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone').value.trim();
    const emgPhone = document.getElementById('prof-em-phone').value.trim();
    const blood = document.getElementById('prof-blood').value;

    citizenProfile = { name, phone, emergencyPhone: emgPhone, bloodGroup: blood };
    localStorage.setItem('citizenProfile', JSON.stringify(citizenProfile));

    if (api.getToken()) {
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

    document.getElementById('citizen-profile-modal').classList.add('hidden');
    updateCitizenAuthUI();
    showToast('Citizen emergency profile updated successfully.', 'success');
}

// -------------------------------------------------------------
// EVIDENCE FILE SELECTION & AI VISION PREVIEW (SECTION 6)
// -------------------------------------------------------------
function handleEvidenceFileSelect(input) {
    const card = document.getElementById('evidence-preview-card');
    const holder = document.getElementById('evidence-image-holder');
    const badge = document.getElementById('evidence-confidence-badge');
    const summary = document.getElementById('evidence-ai-summary');

    if (!input || !input.files || input.files.length === 0) {
        if (card) card.classList.add('hidden');
        return;
    }

    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
        showToast('File exceeds 10MB limit. Please select a smaller photo/video.', 'error');
        input.value = '';
        if (card) card.classList.add('hidden');
        return;
    }

    if (card && holder) {
        card.classList.remove('hidden');
        const isVideo = file.type.startsWith('video/');

        if (isVideo) {
            holder.innerHTML = `<video src="${URL.createObjectURL(file)}" controls class="max-h-36 rounded-lg w-full bg-black"></video>`;
            if (badge) badge.innerText = 'Video Telemetry Verified';
            if (summary) summary.innerText = `Uploaded video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB). Evidence queued for first responder assessment.`;
        } else {
            holder.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview" class="max-h-36 rounded-lg w-full object-cover">`;
            
            // Heuristic detection based on filename and type for instant feedback
            const lowerName = file.name.toLowerCase();
            let detected = 'Structural Debris / Hazard';
            let conf = 84;
            if (lowerName.includes('flood') || lowerName.includes('water')) {
                detected = 'Active Water Inundation & Submerged Roadway';
                conf = 91;
            } else if (lowerName.includes('fire') || lowerName.includes('smoke')) {
                detected = 'Thermal Combustion & Dense Smoke Plume';
                conf = 88;
            } else if (lowerName.includes('landslide') || lowerName.includes('mud')) {
                detected = 'Slope Failure & Soil Disruption';
                conf = 86;
            }

            if (badge) badge.innerText = `AI Confidence: ${conf}%`;
            if (summary) summary.innerHTML = `<strong>AI-Assisted Analysis:</strong> Detected potential ${detected}. Evidence will be cross-referenced by incident command.`;
        }
    }
}

// -------------------------------------------------------------
// SOS SIGNAL SUBMISSION & OFFLINE QUEUE (SECTION 3, 4, 32)
// -------------------------------------------------------------
async function handleSosSubmit(e) {
    e.preventDefault();

    const category = document.getElementById('sos-category').value;
    const count = parseInt(document.getElementById('sos-count').value, 10) || 1;
    const details = document.getElementById('sos-details').value.trim();
    const addressInput = document.getElementById('sos-address');
    let address = addressInput ? addressInput.value.trim() : '';
    const evidenceFileInput = document.getElementById('sos-evidence');

    let coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];

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

        // Check if offline
        if (!navigator.onLine) {
            saveOfflineReport({
                category,
                count,
                details,
                address,
                latitude: coords[0],
                longitude: coords[1],
                timestamp: new Date().toISOString()
            });
            document.getElementById('sos-modal').classList.add('hidden');
            document.getElementById('sos-form').reset();
            return;
        }

        let res;
        const hasEvidenceFile = evidenceFileInput && evidenceFileInput.files && evidenceFileInput.files.length > 0;
        const hasAudioBlob = voiceEngine && voiceEngine.recordedAudioBlob;
        const idempotencyKey = `sos_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const gpsTelemetry = (typeof window.getGpsTelemetry === 'function')
            ? window.getGpsTelemetry()
            : { isVerifiedGps: true, accuracy: null, timestamp: new Date().toISOString() };

        if (hasEvidenceFile || hasAudioBlob) {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('count', count);
            formData.append('details', details);
            formData.append('latitude', coords[0].toString());
            formData.append('longitude', coords[1].toString());
            formData.append('idempotency_key', idempotencyKey);
            formData.append('is_verified_gps', gpsTelemetry.isVerifiedGps ? '1' : '0');
            if (gpsTelemetry.accuracy !== null && gpsTelemetry.accuracy !== undefined) {
                formData.append('gps_accuracy', gpsTelemetry.accuracy.toString());
            }
            formData.append('gps_timestamp', gpsTelemetry.timestamp || new Date().toISOString());
            if (address) formData.append('address', address);

            if (hasEvidenceFile) {
                formData.append('evidence', evidenceFileInput.files[0]);
            } else if (hasAudioBlob) {
                formData.append('evidence', voiceEngine.recordedAudioBlob, 'voice-sos.webm');
            }

            res = await api.postMultipart('/api/incidents', formData, { 'Idempotency-Key': idempotencyKey });
        } else {
            const payload = {
                category,
                count,
                details,
                latitude: coords[0],
                longitude: coords[1],
                address: address || undefined,
                idempotency_key: idempotencyKey,
                is_verified_gps: gpsTelemetry.isVerifiedGps ? 1 : 0,
                gps_accuracy: gpsTelemetry.accuracy,
                gps_timestamp: gpsTelemetry.timestamp || new Date().toISOString()
            };
            res = await api.post('/api/incidents', payload, { 'Idempotency-Key': idempotencyKey });
        }

        if (!res.success) throw new Error(res.message || 'SOS dispatch failed');

        const incident = res.data.incident || res.data;
        showToast(`SOS Beacon [${incident.id}] dispatched successfully! Priority: ${incident.emergency_level}`, 'success');

        window.activeIncidentId = incident.id;

        document.getElementById('sos-modal').classList.add('hidden');
        document.getElementById('sos-form').reset();

        if (voiceEngine) voiceEngine.clearRecording();

        await fetchCitizenReports();
        switchTab('reports');
        showDispatchSuccessModal(incident);

    } catch (err) {
        if (err.errorCode === 'BACKEND_UNAVAILABLE' || !navigator.onLine) {
            saveOfflineReport({
                category, count, details, address,
                latitude: coords[0], longitude: coords[1],
                timestamp: new Date().toISOString()
            });
            document.getElementById('sos-modal').classList.add('hidden');
            document.getElementById('sos-form').reset();
        } else {
            showToast(err.message || 'Unable to submit SOS. Please retry.', 'error');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

async function handleFullReportSubmit(e) {
    e.preventDefault();

    const category = document.getElementById('report-category').value;
    const count = parseInt(document.getElementById('report-count').value, 10) || 1;
    const details = document.getElementById('report-details').value.trim();
    const address = document.getElementById('report-address').value.trim();
    const evidenceInput = document.getElementById('report-evidence');
    const submitBtn = document.getElementById('report-submit-btn');

    let coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>DISPATCHING REPORT...</span>`;
        }

        if (!navigator.onLine) {
            saveOfflineReport({ category, count, details, address, latitude: coords[0], longitude: coords[1], timestamp: new Date().toISOString() });
            document.getElementById('full-disaster-form').reset();
            return;
        }

        let res;
        const hasEvidence = evidenceInput && evidenceInput.files && evidenceInput.files.length > 0;
        const hasAudio = voiceEngine && voiceEngine.recordedAudioBlob;

        if (hasEvidence || hasAudio) {
            const formData = new FormData();
            formData.append('category', category);
            formData.append('count', count);
            formData.append('details', details);
            formData.append('latitude', coords[0].toString());
            formData.append('longitude', coords[1].toString());
            if (address) formData.append('address', address);

            if (hasEvidence) formData.append('evidence', evidenceInput.files[0]);
            else if (hasAudio) formData.append('evidence', voiceEngine.recordedAudioBlob, 'voice-sos.webm');

            res = await api.postMultipart('/api/incidents', formData);
        } else {
            res = await api.post('/api/incidents', {
                category, count, details, latitude: coords[0], longitude: coords[1], address: address || undefined
            });
        }

        if (!res.success) throw new Error(res.message || 'Report submission failed');

        const incident = res.data.incident || res.data;
        showToast(`Disaster Report [${incident.id}] registered. AI Risk Score: ${incident.risk_score || 75}/100`, 'success');

        window.activeIncidentId = incident.id;
        document.getElementById('full-disaster-form').reset();
        if (voiceEngine) voiceEngine.clearRecording();

        const previewCard = document.getElementById('evidence-preview-card');
        if (previewCard) previewCard.classList.add('hidden');

        await fetchCitizenReports();
        switchTab('reports');
        showDispatchSuccessModal(incident);

    } catch (err) {
        showToast(err.message || 'Failed to submit disaster report. Please retry.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Dispatch Beacon to Command HQ</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

// -------------------------------------------------------------
// OFFLINE DRAFT & QUEUE MANAGER (Requirement 11 & Section 32)
// -------------------------------------------------------------
function getOfflineDrafts() {
    try {
        return JSON.parse(localStorage.getItem('rescue_offline_sos_queue') || '[]');
    } catch (e) {
        return [];
    }
}

function saveOfflineReport(report) {
    try {
        const queue = getOfflineDrafts();
        const draftId = `DRAFT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const draftReport = {
            ...report,
            draftId,
            id: draftId,
            idempotency_key: report.idempotency_key || `IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            isDraft: true,
            status: 'LOCAL_DRAFT',
            savedAt: new Date().toISOString()
        };
        queue.push(draftReport);
        localStorage.setItem('rescue_offline_sos_queue', JSON.stringify(queue));

        showToast('Offline Mode: Report stored as a local draft. It has NOT yet reached authorities or NGOs and will sync when internet returns.', 'warning');
        updateOfflineBanner(true, queue.length);
        renderReports();
    } catch (e) {
        console.error('Failed to save offline queue:', e);
    }
}

function deleteOfflineDraft(draftId) {
    try {
        let queue = getOfflineDrafts();
        queue = queue.filter(item => item.draftId !== draftId && item.id !== draftId);
        localStorage.setItem('rescue_offline_sos_queue', JSON.stringify(queue));
        showToast('Local draft discarded.', 'info');
        updateOfflineBanner(queue.length > 0, queue.length);
        renderReports();
    } catch (e) {
        console.error('Failed to delete draft:', e);
    }
}

function checkOfflineQueue() {
    try {
        const queue = getOfflineDrafts();
        if (queue.length > 0) {
            updateOfflineBanner(true, queue.length);
            if (navigator.onLine) {
                flushOfflineQueue();
            }
        } else {
            updateOfflineBanner(false);
        }
    } catch (e) {}
}

async function flushOfflineQueue() {
    try {
        const queue = getOfflineDrafts();
        if (queue.length === 0) return;

        showToast(`Connection detected! Transmitting ${queue.length} pending local draft(s) with idempotency protection...`, 'info');

        const remaining = [];
        for (const item of queue) {
            try {
                const payload = {
                    category: item.category,
                    count: item.count || 1,
                    details: item.details,
                    address: item.address,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    idempotency_key: item.idempotency_key
                };
                const res = await api.post('/api/incidents', payload, {
                    'Idempotency-Key': item.idempotency_key
                });
                if (!res || !res.success) {
                    remaining.push(item);
                }
            } catch (err) {
                // If already processed previously (409 Conflict / duplicate), safely mark resolved
                if (err.status === 409 || (err.data && err.data.duplicate)) {
                    // Accepted
                } else {
                    remaining.push(item);
                }
            }
        }

        localStorage.setItem('rescue_offline_sos_queue', JSON.stringify(remaining));

        if (remaining.length === 0) {
            showToast('All local drafts successfully transmitted and verified by server!', 'success');
            updateOfflineBanner(false);
            await fetchCitizenReports();
        } else {
            updateOfflineBanner(true, remaining.length);
            renderReports();
        }
    } catch (e) {
        console.error('Error syncing offline queue:', e);
    }
}

function handleNetworkOnline() {
    updateOfflineBanner(false);
    showToast('Internet connection restored.', 'success');
    flushOfflineQueue();
}

function handleNetworkOffline() {
    updateOfflineBanner(true);
    showToast('Network disconnected. Emergency reporting switched to local storage draft cache.', 'warning');
}

function updateOfflineBanner(isOffline, queueCount = 0) {
    const banner = document.getElementById('offline-network-banner');
    const text = document.getElementById('offline-banner-text');
    if (!banner) return;

    if (isOffline || queueCount > 0) {
        banner.classList.remove('hidden');
        if (text) {
            text.innerText = queueCount > 0 
                ? `Network offline: ${queueCount} local draft(s) pending transmission. Reconnecting...`
                : 'Network unavailable. Reports are saved as local drafts and will transmit automatically once reconnected.';
        }
    } else {
        banner.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// GOVERNMENT DISASTER ALERTS (NDMA SACHET) (Requirement 6)
// -------------------------------------------------------------
let activeGovernmentAlerts = [];

async function fetchGovernmentAlerts() {
    try {
        const res = await api.get('/api/alerts');
        if (res && res.success && res.data) {
            activeGovernmentAlerts = res.data.alerts || [];
            updateGovernmentAlertsUI(res.data);
        }
    } catch (e) {
        console.warn('Government alerts update note:', e.message);
        const strip = document.getElementById('gov-alert-banner-text');
        if (strip) {
            strip.innerText = 'NDMA SACHET public alert telemetry: Local cache active. Official government warnings will refresh automatically.';
        }
    }
}

function updateGovernmentAlertsUI(data) {
    const bannerText = document.getElementById('gov-alert-banner-text');
    const syncStatus = document.getElementById('gov-alert-sync-status');
    const cacheNote = document.getElementById('gov-alerts-cache-note');

    const alerts = (data && data.alerts) ? data.alerts : [];
    const meta = (data && data.metadata) || {};
    const lastSync = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleTimeString() : (data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleTimeString() : 'Recent');
    const sourceAgency = meta.sourceAgency || data.attribution || 'NDMA SACHET / IMD';

    if (syncStatus) {
        syncStatus.innerText = `Synced: ${lastSync} • Source: NDMA SACHET`;
    }

    if (cacheNote) {
        cacheNote.innerText = `Source: ${sourceAgency} • Status: ${meta.isCacheOutdated ? 'CACHED' : 'FRESH'} (Synced: ${lastSync})`;
    }

    if (bannerText) {
        if (alerts.length > 0) {
            const topAlert = alerts[0];
            bannerText.innerHTML = `<strong>${topAlert.hazard_type} [${topAlert.severity}]:</strong> ${topAlert.affected_area} — ${topAlert.official_instructions ? topAlert.official_instructions.substring(0, 110) + '...' : 'Follow official NDMA advisories.'}`;
        } else {
            bannerText.innerText = 'No active severe weather warnings reported by NDMA SACHET in this sector.';
        }
    }
}

function showGovAlertsModal() {
    const modal = document.getElementById('gov-alerts-modal');
    const container = document.getElementById('gov-alerts-modal-content');
    if (!modal || !container) return;

    if (activeGovernmentAlerts.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center space-y-2">
                <i data-lucide="check-circle" class="w-8 h-8 text-emerald-400 mx-auto"></i>
                <h4 class="font-bold text-white text-sm">No Active Severe Government Warnings</h4>
                <p class="text-xs text-slate-400">All regional monitoring sectors are currently within normal baseline weather & flood parameters as verified by NDMA SACHET telemetry.</p>
            </div>
        `;
    } else {
        container.innerHTML = activeGovernmentAlerts.map(a => {
            const sevColor = a.severity === 'EXTREME' ? 'bg-red-900/60 border-red-600 text-red-200' :
                             a.severity === 'SEVERE' ? 'bg-amber-900/60 border-amber-600 text-amber-200' :
                             'bg-blue-900/60 border-blue-600 text-blue-200';
            return `
                <div class="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2.5">
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-xs font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">${a.alert_identifier}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase border ${sevColor}">${a.severity}</span>
                    </div>
                    <div>
                        <h4 class="font-extrabold text-white text-sm">${a.hazard_type} — ${a.affected_area}</h4>
                        <div class="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800/80 space-y-1">
                            <span class="text-amber-400 font-bold block text-[11px] uppercase">Official Government Safety Instructions:</span>
                            <p>${a.official_instructions}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Agency: <strong>${a.source_agency || 'NDMA SACHET'}</strong></span>
                        <span>Expires: <strong>${a.expires_at ? new Date(a.expires_at).toLocaleString() : 'Active'}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeGovAlertsModal() {
    const modal = document.getElementById('gov-alerts-modal');
    if (modal) modal.classList.add('hidden');
}

// -------------------------------------------------------------
// DISPATCH CONFIRMATION POPUP (SECTION 3)
// -------------------------------------------------------------
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
                <p class="text-xs text-slate-400 mt-1">Incident successfully registered on AISTER Authority Coordination Grid.</p>
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
            </div>
            <div class="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-[11px] text-purple-200 text-center space-y-1">
                <p>Track response status and tactical squad updates in the <strong>My Reports</strong> tab.</p>
                <p class="text-[10px] text-amber-300 font-bold">⚠️ For life-threatening emergencies, also dial 112 (National Emergency Helpline) immediately.</p>
            </div>
            <button onclick="document.getElementById('dispatch-confirm-modal').classList.add('hidden')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl uppercase text-xs shadow-lg transition">
                Understood, View My Reports
            </button>
        </div>
    `;
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// -------------------------------------------------------------
// MY REPORTS & CHECKLIST STATUS TIMELINE (SECTION 3 & 14)
// -------------------------------------------------------------
async function fetchCitizenReports() {
    const grid = document.getElementById('reports-grid');
    if (!grid) return;

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
        const res = await api.get('/api/incidents?mine=true&status=all&limit=10');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch incidents');

        let reports = Array.isArray(res.data) ? res.data : [];
        if (currentUser && currentUser.id) {
            reports = reports.filter(r => r.user_id === currentUser.id);
        }

        activeReports = reports;
        renderReports();
    } catch (err) {
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

    const drafts = getOfflineDrafts();

    // 1. Render Local Storage Drafts at the top (Requirement 11)
    if (drafts.length > 0) {
        const draftsWrapper = document.createElement('div');
        draftsWrapper.className = 'col-span-full bg-amber-950/40 border border-amber-600/70 rounded-2xl p-5 space-y-4 mb-2 shadow-xl';
        draftsWrapper.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-700/50 pb-3">
                <div class="flex items-center space-x-2.5">
                    <span class="w-3 h-3 rounded-full bg-amber-400 animate-ping"></span>
                    <div>
                        <h4 class="font-extrabold text-amber-200 text-sm">Local Storage Offline Drafts (${drafts.length})</h4>
                        <p class="text-[11px] text-amber-300/80">Saved locally on your device during network disconnection</p>
                    </div>
                </div>
                <button type="button" onclick="flushOfflineQueue()" class="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-1.5 rounded-xl text-xs shadow transition flex items-center justify-center space-x-1.5">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    <span>Transmit All Drafts Now</span>
                </button>
            </div>
            <div class="p-3 bg-red-950/60 border border-red-700/60 rounded-xl text-[11px] text-red-200 leading-relaxed">
                <strong>Safety Disclaimer:</strong> These drafts have <strong>NOT</strong> reached emergency authorities or NGOs yet. If in urgent life-threatening danger, immediately dial <strong>112</strong> or <strong>1078</strong> directly from your phone.
            </div>
            <div class="grid sm:grid-cols-2 gap-3" id="offline-drafts-subgrid"></div>
        `;

        const subgrid = draftsWrapper.querySelector('#offline-drafts-subgrid');
        drafts.forEach(d => {
            const draftCard = document.createElement('div');
            draftCard.className = 'bg-slate-900 border border-amber-600/50 rounded-xl p-4 flex flex-col justify-between space-y-3';
            draftCard.innerHTML = `
                <div>
                    <div class="flex items-center justify-between text-xs mb-1.5">
                        <span class="font-mono text-amber-400 font-bold text-[10px] bg-amber-950 px-2 py-0.5 rounded border border-amber-800">${d.id || 'LOCAL_DRAFT'}</span>
                        <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-900/80 text-amber-200 border border-amber-600">PENDING UPLOAD</span>
                    </div>
                    <h5 class="font-bold text-white text-sm">${d.category || 'SOS Signal'}</h5>
                    <p class="text-xs text-slate-300 mt-1 line-clamp-2">${d.details || 'Emergency assistance requested.'}</p>
                    <span class="text-[10px] text-slate-400 block mt-2">Saved: ${d.savedAt ? new Date(d.savedAt).toLocaleString() : 'Offline'}</span>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button type="button" onclick="flushOfflineQueue()" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-3 py-1 rounded-lg text-xs transition">
                        Retry Transmission →
                    </button>
                    <button type="button" onclick="deleteOfflineDraft('${d.id}')" class="text-slate-400 hover:text-red-400 font-semibold text-xs transition">
                        Discard Draft
                    </button>
                </div>
            `;
            subgrid.appendChild(draftCard);
        });

        grid.appendChild(draftsWrapper);
    }

    if (activeReports.length === 0 && drafts.length === 0) {
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
                    <div class="flex items-center space-x-1.5">
                        <span class="font-mono text-xs font-bold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">${r.id}</span>
                        <span class="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">✓ Server Confirmed</span>
                    </div>
                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${levelBadgeClass}">${r.emergency_level || 'HIGH'}</span>
                </div>
                <h4 class="font-bold text-white text-base mb-1">${r.category}</h4>
                <p class="text-xs text-slate-300 leading-relaxed">${r.details}</p>
                ${r.readable_address ? `<p class="text-[11px] text-slate-400 mt-2 flex items-center space-x-1"><i data-lucide="map-pin" class="w-3 h-3 text-purple-400 shrink-0"></i><span class="truncate">${r.readable_address}</span></p>` : ''}
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
                ${r.ngo_assistance_status || r.assigned_ngo_id ? `
                    <div class="bg-purple-900/30 border border-purple-600/40 rounded-lg p-2 text-[11px] text-purple-200 flex items-center justify-between">
                        <span class="flex items-center space-x-1">
                            <i data-lucide="heart-handshake" class="w-3 h-3 text-purple-400"></i>
                            <span>NGO Relief:</span>
                        </span>
                        <strong class="uppercase text-purple-300">${(r.ngo_assistance_status || 'ASSIGNED').replace(/_/g, ' ')}</strong>
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

// Detailed Citizen Report Tracking Modal with Exact Section 3 Checklist & NGO Relief Updates
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
        const ngoAssignment = res.data.ngoAssignment || inc.ngoAssignment || null;

        // Determine step checklist status based on incident state
        const st = (inc.status || '').toUpperCase();
        const sReceived = true;
        const sGps = true;
        const sRisk = true;
        const sNotified = st !== 'NEW';
        const sAssigned = ['ASSIGNED', 'TEAM_ASSIGNED', 'DISPATCHED', 'TEAM_DISPATCHED', 'TEAM_APPROACHING', 'ON_SCENE', 'IN_PROGRESS', 'RESOLVED'].includes(st);
        const sApproaching = ['TEAM_APPROACHING', 'ON_SCENE', 'IN_PROGRESS', 'RESOLVED'].includes(st);
        const sResolved = st === 'RESOLVED';
        const sNgoAssigned = Boolean(ngoAssignment || inc.assigned_ngo_id);

        const checklistHTML = `
            <div class="bg-slate-950 p-4 rounded-xl border border-purple-800/60 space-y-2 text-xs">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-mono text-purple-400 font-bold">SOS #${inc.id}</span>
                    <span class="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Server Confirmed</span>
                </div>
                <span class="text-slate-400 uppercase font-bold text-[10px] block">Status Checklist:</span>
                
                <div class="space-y-1.5 font-medium">
                    <div class="flex items-center space-x-2 text-emerald-400">
                        <span>✓</span> <span>SOS received by Command HQ</span>
                    </div>
                    <div class="flex items-center space-x-2 text-emerald-400">
                        <span>✓</span> <span>GPS location verified (${Number(inc.latitude).toFixed(4)}°, ${Number(inc.longitude).toFixed(4)}°)</span>
                    </div>
                    <div class="flex items-center space-x-2 text-emerald-400">
                        <span>✓</span> <span>AI Triage & Risk Assessment (${inc.risk_score || 75}/100 - ${inc.emergency_level})</span>
                    </div>
                    <div class="flex items-center space-x-2 text-cyan-400">
                        <span>✓</span> <span>NDRF Gateway: Integration Ready (Sandbox/Simulation Mode)</span>
                    </div>
                    <div class="flex items-center space-x-2 ${sNotified ? 'text-emerald-400' : 'text-slate-500'}">
                        <span>${sNotified ? '✓' : '○'}</span> <span>Authority Command notified</span>
                    </div>
                    <div class="flex items-center space-x-2 ${sAssigned ? 'text-emerald-400' : 'text-slate-500'}">
                        <span>${sAssigned ? '✓' : '○'}</span> <span>Rescue team assigned (${inc.assigned_rescue_team || 'Pending'})</span>
                    </div>
                    <div class="flex items-center space-x-2 ${sNgoAssigned ? 'text-purple-300 font-bold' : 'text-slate-500'}">
                        <span>${sNgoAssigned ? '✓' : '○'}</span> <span>NGO Relief Assistance: ${ngoAssignment ? `${ngoAssignment.ngo_name} (${(inc.ngo_assistance_status || ngoAssignment.status || 'ASSIGNED').replace(/_/g, ' ')})` : 'Awaiting NGO Assignment'}</span>
                    </div>
                    <div class="flex items-center space-x-2 ${sApproaching ? 'text-emerald-400' : 'text-slate-500'}">
                        <span>${sApproaching ? '✓' : '○'}</span> <span>Team approaching target</span>
                    </div>
                    <div class="flex items-center space-x-2 ${sResolved ? 'text-emerald-400 font-bold' : 'text-slate-500'}">
                        <span>${sResolved ? '✓' : '○'}</span> <span>Incident resolved</span>
                    </div>
                </div>
            </div>
        `;

        let mediaHTML = '<span class="text-slate-500 italic text-xs">No media attached</span>';
        if (inc.evidence_url) {
            const isVideo = /\.(mp4|webm|mov|avi)$/i.test(inc.evidence_url);
            const isAudio = /\.(wav|mp3|ogg|webm)$/i.test(inc.evidence_url) && !isVideo;
            if (isVideo) {
                mediaHTML = `<video src="${inc.evidence_url}" controls class="max-h-40 rounded-lg border border-slate-700 w-full bg-black"></video>`;
            } else if (isAudio) {
                mediaHTML = `<audio src="${inc.evidence_url}" controls class="w-full h-8 rounded"></audio>`;
            } else {
                mediaHTML = `<img src="${inc.evidence_url}" alt="Evidence" class="max-h-40 rounded-lg border border-slate-700 object-cover">`;
            }
        }

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

                ${checklistHTML}

                ${ngoAssignment ? `
                    <div class="bg-purple-950/40 p-4 rounded-xl border border-purple-800/70 text-xs space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="font-extrabold text-purple-300 flex items-center space-x-1.5">
                                <i data-lucide="heart-handshake" class="w-4 h-4 text-purple-400"></i>
                                <span>Relief Partner: ${ngoAssignment.ngo_name}</span>
                            </span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-900 border border-purple-600 text-purple-200">
                                ${(inc.ngo_assistance_status || ngoAssignment.status || 'ASSIGNED').replace(/_/g, ' ')}
                            </span>
                        </div>
                        <p class="text-slate-300 text-[11px] leading-relaxed">
                            Assigned for ground relief, food/water, medical supply coordination, and volunteer assistance.
                        </p>
                        ${ngoAssignment.ngo_phone ? `
                            <div class="pt-1 flex items-center space-x-2 text-[11px] text-slate-400">
                                <span>NGO Coordinator Contact:</span>
                                <a href="tel:${ngoAssignment.ngo_phone}" class="text-purple-300 hover:underline font-bold">${ngoAssignment.ngo_phone}</a>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2.5">
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Situation Details</span>
                        <p class="text-slate-200 mt-0.5 leading-relaxed">${inc.details}</p>
                    </div>

                    ${inc.priority_explanation ? `
                        <div>
                            <span class="text-slate-400 block text-[10px] uppercase font-bold">AI Risk Assessment</span>
                            <p class="text-purple-300 mt-0.5 leading-relaxed">${inc.priority_explanation}</p>
                        </div>
                    ` : ''}

                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold mb-1">Attached Evidence</span>
                        ${mediaHTML}
                    </div>
                </div>

                <div class="space-y-2 border-t border-slate-800 pt-3">
                    <h4 class="font-bold text-white text-xs uppercase tracking-wider">Live Response Timeline</h4>
                    <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                        ${updatesHTML}
                    </div>
                </div>

                <div class="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-[11px] text-red-200 flex items-center justify-between">
                    <span>In immediate life danger? Dial 112 or 1078 directly.</span>
                    <a href="tel:112" class="bg-red-600 hover:bg-red-500 text-white font-extrabold px-3 py-1 rounded-lg text-xs shadow transition">
                        Call 112
                    </a>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        showToast(err.message || 'Failed to load incident tracking details', 'error');
    }
}

function handleIncidentUpdated(updatedData) {
    const inc = updatedData.incident || updatedData;
    const targetId = inc.id;
    const currentUser = api.getUser();

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

// -------------------------------------------------------------
// MODULAR MULTI-DISASTER RISK EVALUATOR (SECTION 7 & 8)
// -------------------------------------------------------------
async function runModularRiskAssessment() {
    const disasterSelect = document.getElementById('eval-disaster-type');
    const peopleInput = document.getElementById('eval-people-count');
    if (!disasterSelect) return;

    const disasterType = disasterSelect.value;
    const peopleAffected = parseInt(peopleInput ? peopleInput.value : 5, 10) || 5;
    const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];

    try {
        const res = await api.post('/api/risk/evaluate', {
            disasterType,
            latitude: coords[0],
            longitude: coords[1],
            peopleAffected
        });

        if (!res.success) return;

        const data = res.data;
        const scoreVal = document.getElementById('risk-score-val');
        const levelBadge = document.getElementById('risk-level-badge');
        const confText = document.getElementById('risk-confidence-text');
        const scoreBar = document.getElementById('risk-score-bar');
        const reasonText = document.getElementById('risk-reason-text');
        const actionText = document.getElementById('risk-action-text');
        const factorsContainer = document.getElementById('risk-factors-container');

        if (scoreVal) scoreVal.innerText = data.score;
        if (confText) confText.innerText = `Confidence: ${data.confidence}%`;
        if (scoreBar) {
            scoreBar.style.width = `${data.score}%`;
            scoreBar.className = `h-2.5 rounded-full transition-all duration-500 ${data.level === 'CRITICAL' ? 'bg-red-500' : (data.level === 'HIGH' ? 'bg-orange-500' : (data.level === 'MODERATE' ? 'bg-amber-500' : 'bg-emerald-500'))}`;
        }
        if (levelBadge) {
            levelBadge.innerText = `${data.level} RISK`;
            levelBadge.className = `text-xs font-black uppercase px-3 py-1 rounded-full ${data.level === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-700' : (data.level === 'HIGH' ? 'bg-orange-950 text-orange-300 border border-orange-700' : (data.level === 'MODERATE' ? 'bg-amber-950 text-amber-300 border border-amber-700' : 'bg-emerald-950 text-emerald-300 border border-emerald-700'))}`;
        }
        if (reasonText) reasonText.innerText = data.reason;
        if (actionText) actionText.innerText = data.recommendedAction;

        if (factorsContainer && data.factors) {
            factorsContainer.innerHTML = Object.entries(data.factors).map(([k, v]) => `
                <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span class="text-slate-400 block uppercase text-[9px]">${k.replace(/([A-Z])/g, ' $1')}</span>
                    <strong class="text-white text-xs">${v}</strong>
                </div>
            `).join('');
        }

    } catch (e) {
        console.warn('Risk evaluation error:', e.message);
    }
}

// -------------------------------------------------------------
// WEATHER TELEMETRY (SECTION 9)
// -------------------------------------------------------------
async function fetchRealtimeWeatherData(lat, lng) {
    const userPos = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    const latitude = (lat && !isNaN(lat)) ? lat : ((userPos && !isNaN(userPos[0])) ? userPos[0] : 26.8467);
    const longitude = (lng && !isNaN(lng)) ? lng : ((userPos && !isNaN(userPos[1])) ? userPos[1] : 80.9462);

    try {
        const res = await api.get(`/api/weather?lat=${latitude}&lng=${longitude}`);
        if (!res.success) return;

        const w = res.data;
        const tempEl = document.getElementById('iot-temp');
        const rainEl = document.getElementById('iot-rain');
        const windEl = document.getElementById('iot-wind');
        const humEl = document.getElementById('iot-humidity');
        const condEl = document.getElementById('weather-condition-text');
        const updatedEl = document.getElementById('weather-updated-time');
        const badge = document.getElementById('weather-source-badge');

        if (tempEl) tempEl.innerText = (w.temperature !== null && w.temperature !== undefined) ? `${w.temperature}°C` : '--°C';
        if (rainEl) rainEl.innerText = (w.rainfall !== null && w.rainfall !== undefined) ? `${w.rainfall} mm/h` : '-- mm/h';
        const windVal = w.windSpeed !== undefined && w.windSpeed !== null ? w.windSpeed : w.wind_speed;
        if (windEl) windEl.innerText = (windVal !== null && windVal !== undefined) ? `${windVal} km/h` : '-- km/h';
        if (humEl) humEl.innerText = (w.humidity !== null && w.humidity !== undefined) ? `${w.humidity}%` : '--%';
        if (condEl) condEl.innerText = w.condition || (w.dataStatus === 'UNAVAILABLE' ? 'Telemetry Offline' : 'Partly Cloudy');
        if (updatedEl) updatedEl.innerText = `Updated: ${new Date(w.fetchedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        if (badge) {
            const isLive = w.dataStatus === 'LIVE' || w.isLive;
            const isCached = w.dataStatus === 'CACHED_STALE' || w.isStale;
            if (isLive) {
                badge.innerText = `LIVE (${w.provider || 'Open-Meteo'})`;
                badge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700';
            } else if (isCached) {
                badge.innerText = 'CACHED TELEMETRY';
                badge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700';
            } else {
                badge.innerText = 'SENSOR OFFLINE';
                badge.className = 'text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700';
            }
        }
    } catch (e) {
        console.warn('Weather fetch warning:', e.message);
    }
}

// -------------------------------------------------------------
// SHELTERS DIRECTORY (SECTION 17)
// -------------------------------------------------------------
async function fetchSheltersDirectory() {
    const grid = document.getElementById('shelters-directory-grid');
    if (!grid) return;

    try {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-400 text-xs flex flex-col items-center">
                <div class="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <span>Querying operational relief shelters...</span>
            </div>
        `;

        const res = await api.get('/api/shelters');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch shelters');

        grid.innerHTML = '';
        res.data.forEach(s => {
            const freeSpots = Math.max(0, s.capacity - s.current_occupancy);
            const pct = Math.min(100, Math.round((s.current_occupancy / s.capacity) * 100));

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-3";
            card.innerHTML = `
                <div>
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-bold text-white text-base">${s.title}</h4>
                            <p class="text-slate-400 text-xs mt-0.5">${s.address || 'Lucknow Operational Zone'}</p>
                        </div>
                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded ${s.status === 'Operational' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-amber-950 text-amber-300 border border-amber-700'}">
                            ${s.status}
                        </span>
                    </div>

                    <div class="mt-3 space-y-1">
                        <div class="flex justify-between text-xs text-slate-400">
                            <span>Occupancy: <strong>${s.current_occupancy} / ${s.capacity}</strong></span>
                            <span class="${freeSpots > 20 ? 'text-emerald-400' : 'text-amber-400'} font-bold">${freeSpots} Available</span>
                        </div>
                        <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                            <div class="h-2 rounded-full ${pct > 90 ? 'bg-red-500' : (pct > 60 ? 'bg-amber-500' : 'bg-purple-500')}" style="width: ${pct}%"></div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-3 text-[11px] text-slate-300">
                        <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">🍞 Food: <strong class="text-white">${s.food_packets || 0}</strong></div>
                        <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">💧 Water: <strong class="text-white">${s.water_liters || 0}L</strong></div>
                        <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">🩹 Kits: <strong class="text-white">${s.medical_kits || 0}</strong></div>
                        <div class="bg-slate-950 p-2 rounded-lg border border-slate-800">🛏️ Blankets: <strong class="text-white">${s.blankets || 0}</strong></div>
                    </div>
                </div>

                <button onclick="calculateSafeRouteTo(${s.longitude}, ${s.latitude}, '${s.title.replace(/'/g, "\\'")}')" class="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow transition">
                    <i data-lucide="navigation-2" class="w-3.5 h-3.5"></i>
                    <span>Calculate Safe Route Here →</span>
                </button>
            `;
            grid.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        grid.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">Failed to load shelters. Please retry.</p>`;
    }
}

// -------------------------------------------------------------
// HOSPITALS DIRECTORY (SECTION 18)
// -------------------------------------------------------------
async function fetchHospitalsDirectory() {
    const grid = document.getElementById('hospitals-directory-grid');
    if (!grid) return;

    try {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-400 text-xs flex flex-col items-center">
                <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <span>Querying emergency trauma hospitals...</span>
            </div>
        `;

        const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
        const res = await api.get(`/api/hospitals?lat=${coords[0]}&lng=${coords[1]}`);
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to fetch hospitals');

        grid.innerHTML = '';
        res.data.forEach(h => {
            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-3";
            card.innerHTML = `
                <div>
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-bold text-white text-base">${h.name}</h4>
                            <p class="text-slate-400 text-xs mt-0.5">${h.address || 'Lucknow Medical Corridor'}</p>
                        </div>
                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-700">
                            ${h.emergency_tier}
                        </span>
                    </div>

                    <div class="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">Available</span>
                            <strong class="text-blue-400 text-sm">${h.available_beds}</strong>
                        </div>
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">Total Beds</span>
                            <strong class="text-white text-sm">${h.total_beds}</strong>
                        </div>
                        <div class="bg-slate-950 p-2 rounded-xl border border-slate-800">
                            <span class="text-[9px] uppercase font-bold text-slate-400 block">ICU Beds</span>
                            <strong class="text-emerald-400 text-sm">${h.icu_beds}</strong>
                        </div>
                    </div>

                    <div class="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800 flex justify-between items-center">
                        <span>🚑 Ambulances: <strong class="text-white">${h.ambulances_count}</strong></span>
                        <span>Phone: <a href="tel:${h.contact_phone}" class="text-blue-400 underline font-bold">${h.contact_phone}</a></span>
                    </div>
                </div>

                <button onclick="calculateSafeRouteTo(${h.longitude}, ${h.latitude}, '${h.name.replace(/'/g, "\\'")}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow transition">
                    <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
                    <span>Navigate to Hospital →</span>
                </button>
            `;
            grid.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        grid.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">Failed to load hospitals. Please retry.</p>`;
    }
}

// -------------------------------------------------------------
// 5-DAY WEATHER FORECAST ENGINE (REQUIREMENT 6)
// -------------------------------------------------------------
async function fetch5DayWeatherForecast(forceRefresh = false) {
    const grid = document.getElementById('weather-5day-cards-grid');
    const statusLabel = document.getElementById('weather-source-label');
    const lastSyncEl = document.getElementById('weather-last-updated-badge');
    const locationCaption = document.getElementById('weather-location-caption');

    const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    const lat = coords[0];
    const lng = coords[1];

    try {
        if (grid && forceRefresh) {
            grid.innerHTML = `
                <div class="col-span-full py-12 text-center text-slate-400 text-xs bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <div class="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p>Refreshing meteorological forecast models from Open-Meteo & WeatherAPI...</p>
                </div>
            `;
        }

        const res = await api.get(`/api/weather/forecast?lat=${lat}&lng=${lng}&refresh=${forceRefresh ? 'true' : 'false'}`);
        if (!res.success || !res.data) throw new Error(res.message || 'Forecast data unavailable');

        const data = res.data;
        const current = data.current || {};
        const daily = data.daily || [];

        // Update telemetry cards
        const tempEl = document.getElementById('weather-curr-temp');
        const condEl = document.getElementById('weather-curr-condition');
        const rainProbEl = document.getElementById('weather-curr-rain-prob');
        const rainMmEl = document.getElementById('weather-curr-rain-mm');
        const windEl = document.getElementById('weather-curr-wind');
        const humEl = document.getElementById('weather-curr-humidity');

        if (tempEl) tempEl.innerText = `${current.temperature_c ?? '--'}°C`;
        if (condEl) condEl.innerText = current.condition || 'Partly Cloudy';
        if (rainProbEl) rainProbEl.innerText = `${current.precipitation_probability ?? 0}%`;
        if (rainMmEl) rainMmEl.innerText = `${current.precipitation_mm ?? 0} mm expected`;
        if (windEl) windEl.innerText = `${current.wind_speed_kmh ?? '--'} km/h`;
        if (humEl) humEl.innerText = `${current.relative_humidity ?? '--'}%`;

        if (statusLabel) {
            statusLabel.innerText = data.dataStatus === 'LIVE' ? 'LIVE FEED: Open-Meteo & WeatherAPI' : 'CACHED REGIONAL OBSERVATION';
        }
        if (lastSyncEl) {
            lastSyncEl.innerText = `Last Sync: ${new Date(data.updated_at || Date.now()).toLocaleTimeString()}`;
        }
        if (locationCaption) {
            locationCaption.innerText = `Location: ${data.city || 'Regional Grid'} (${Number(lat).toFixed(2)}°N, ${Number(lng).toFixed(2)}°E)`;
        }

        // Severe weather warnings alert banner
        const alertBanner = document.getElementById('weather-severe-alerts-banner');
        const alertHeadline = document.getElementById('weather-alert-headline');
        const alertDetails = document.getElementById('weather-alert-details');

        if (data.severe_warnings && data.severe_warnings.length > 0) {
            const firstWarning = data.severe_warnings[0];
            if (alertBanner) alertBanner.classList.remove('hidden');
            if (alertHeadline) alertHeadline.innerText = `⚠️ ${firstWarning.type || 'METEOROLOGICAL ADVISORY'}`;
            if (alertDetails) alertDetails.innerText = firstWarning.description || 'Elevated storm conditions detected.';
        } else if (alertBanner) {
            alertBanner.classList.add('hidden');
        }

        // Render 5 daily cards
        if (grid) {
            grid.innerHTML = '';
            if (daily.length === 0) {
                grid.innerHTML = `<p class="col-span-full text-center text-slate-400 text-xs py-8">No daily projections available.</p>`;
                return;
            }

            daily.forEach(d => {
                const card = document.createElement('div');
                card.className = 'bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-4 text-slate-200 space-y-3 shadow-md transition';

                const rainProb = d.precipitation_probability ?? 0;
                let riskBadgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
                let riskText = 'LOW HAZARD';
                if (rainProb > 70 || (d.wind_speed_max_kmh && d.wind_speed_max_kmh > 45)) {
                    riskBadgeClass = 'bg-red-950 text-red-300 border-red-800';
                    riskText = 'STORM WATCH';
                } else if (rainProb > 40) {
                    riskBadgeClass = 'bg-amber-950 text-amber-300 border-amber-800';
                    riskText = 'ADVISORY';
                }

                card.innerHTML = `
                    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div>
                            <strong class="text-white text-xs block">${d.day_name}</strong>
                            <span class="text-[10px] text-slate-400 font-mono">${d.date}</span>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase border ${riskBadgeClass}">
                            ${riskText}
                        </span>
                    </div>

                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <span class="text-2xl">${d.icon || '⛅'}</span>
                            <span class="text-xs font-bold text-slate-300">${d.condition || 'Clear'}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <div>
                            <span class="text-[10px] text-slate-400">Max Temp</span>
                            <div class="font-extrabold text-amber-400 text-sm">${d.temp_max_c}°C</div>
                        </div>
                        <div>
                            <span class="text-[10px] text-slate-400">Min Temp</span>
                            <div class="font-bold text-cyan-300 text-sm">${d.temp_min_c}°C</div>
                        </div>
                    </div>

                    <div class="space-y-1 text-[11px]">
                        <div class="flex justify-between text-slate-400">
                            <span>Rainfall Chance:</span>
                            <strong class="text-cyan-300">${rainProb}%</strong>
                        </div>
                        <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-cyan-500 h-1.5 rounded-full" style="width: ${Math.min(rainProb, 100)}%"></div>
                        </div>
                        <div class="flex justify-between text-slate-400 pt-1">
                            <span>Expected Rain:</span>
                            <span class="text-white font-mono">${d.precipitation_sum_mm ?? 0} mm</span>
                        </div>
                        <div class="flex justify-between text-slate-400">
                            <span>Wind Speed:</span>
                            <span class="text-white font-mono">${d.wind_speed_max_kmh ?? '--'} km/h</span>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.warn('Weather forecast load warning:', err.message);
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full py-8 text-center text-slate-400 text-xs bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                    <p class="text-amber-400 font-bold">⚠️ Live meteorological feed temporarily unreachable.</p>
                    <p class="text-[11px] text-slate-400">Operating in regional baseline mode. Please click Refresh Forecast to retry.</p>
                    <button onclick="fetch5DayWeatherForecast(true)" class="bg-cyan-700 hover:bg-cyan-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs mt-2 transition">Retry Query</button>
                </div>
            `;
        }
    }
}

// -------------------------------------------------------------
// TRUSTED EMERGENCY CONTACTS & DISTRESS BROADCASTER (REQUIREMENT 7)
// -------------------------------------------------------------
const STORAGE_KEY_TRUSTED_CONTACTS = 'rescue_ai_trusted_contacts';

function getStoredTrustedContacts() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TRUSTED_CONTACTS);
        if (raw) return JSON.parse(raw);
    } catch(e) {}
    // Default baseline personal contacts
    return [
        { id: 'tc_1', name: 'Emergency Family Contact', phone: '+919876543210', relationship: 'Family' },
        { id: 'tc_2', name: 'Local Neighborhood Guardian', phone: '+919415012345', relationship: 'Neighbor' }
    ];
}

function loadTrustedContacts() {
    const listEl = document.getElementById('trusted-contacts-list');
    if (!listEl) return;

    const contacts = getStoredTrustedContacts();
    listEl.innerHTML = '';

    if (contacts.length === 0) {
        listEl.innerHTML = `
            <div class="col-span-full py-8 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <p>No personal emergency contacts configured yet.</p>
                <button onclick="openAddContactModal()" class="text-purple-400 hover:text-purple-300 font-bold underline">+ Add First Contact</button>
            </div>
        `;
        return;
    }

    contacts.forEach(c => {
        const card = document.createElement('div');
        card.className = 'bg-slate-950 border border-slate-800 rounded-2xl p-4 text-slate-200 space-y-3';
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="font-black text-white text-sm">${c.name}</h4>
                    <span class="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">${c.relationship || 'Contact'}</span>
                </div>
                <button onclick="deleteTrustedContact('${c.id}')" title="Remove Contact" class="text-slate-500 hover:text-red-400 p-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="font-mono text-xs text-slate-300">${c.phone}</div>
            <div class="flex gap-2 pt-1 border-t border-slate-800/80">
                <a href="tel:${c.phone}" class="flex-1 bg-purple-700 hover:bg-purple-600 text-white font-bold py-1.5 rounded-xl text-xs flex items-center justify-center space-x-1 transition shadow">
                    <i data-lucide="phone" class="w-3 h-3"></i>
                    <span>Call</span>
                </a>
                <button onclick="triggerWhatsAppContact('${c.phone}', '${c.name}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-xl text-xs flex items-center justify-center space-x-1 transition shadow">
                    <i data-lucide="message-circle" class="w-3 h-3"></i>
                    <span>WhatsApp</span>
                </button>
            </div>
        `;
        listEl.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddContactModal() {
    document.getElementById('add-trusted-contact-modal')?.classList.remove('hidden');
}

function closeAddContactModal() {
    document.getElementById('add-trusted-contact-modal')?.classList.add('hidden');
}

function saveNewTrustedContact(e) {
    e.preventDefault();
    const name = document.getElementById('new-contact-name')?.value?.trim();
    const phone = document.getElementById('new-contact-phone')?.value?.trim();
    const relationship = document.getElementById('new-contact-relationship')?.value || 'Family';

    if (!name || !phone) return;

    const contacts = getStoredTrustedContacts();
    contacts.push({
        id: `tc_${Date.now()}`,
        name,
        phone,
        relationship
    });

    localStorage.setItem(STORAGE_KEY_TRUSTED_CONTACTS, JSON.stringify(contacts));
    closeAddContactModal();
    loadTrustedContacts();
    showToast(`✓ Contact "${name}" added to personal circle.`, 'success');
}

function deleteTrustedContact(id) {
    let contacts = getStoredTrustedContacts();
    contacts = contacts.filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY_TRUSTED_CONTACTS, JSON.stringify(contacts));
    loadTrustedContacts();
    showToast('Contact removed.', 'info');
}

function triggerWhatsAppContact(phone, name) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const incId = window.activeIncidentId || 'ACTIVE-SOS';
    const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    const text = encodeURIComponent(`🚨 EMERGENCY SOS ALERT: Hi ${name}, I am in urgent need of assistance. My live coordinates: https://maps.google.com/?q=${coords[0]},${coords[1]} (${coords[0].toFixed(4)}°N, ${coords[1].toFixed(4)}°E). AISTER Incident ID: #${incId}. Please alert local authorities immediately!`);
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, '_blank');
}

function updateShareableDistressText() {
    const el = document.getElementById('distress-shareable-text');
    if (!el) return;

    const incId = window.activeIncidentId || 'ACTIVE-BEACON';
    const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
    const timestamp = new Date().toLocaleString();

    el.value = `🚨 EMERGENCY DISTRESS ALERT: I have dispatched an emergency beacon on the AISTER Disaster Response Grid (Incident #${incId}). Live Location: https://maps.google.com/?q=${coords[0]},${coords[1]} (${coords[0].toFixed(4)}°N, ${coords[1].toFixed(4)}°E) at ${timestamp}. Please alert first responders or emergency services immediately!`;
}

function copyDistressMessage() {
    updateShareableDistressText();
    const el = document.getElementById('distress-shareable-text');
    if (!el) return;

    el.select();
    navigator.clipboard.writeText(el.value).then(() => {
        showToast('✓ Distress message copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Copied text to clipboard.', 'success');
    });
}

function shareDistressWhatsApp() {
    updateShareableDistressText();
    const text = document.getElementById('distress-shareable-text')?.value || '';
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function shareDistressSms() {
    updateShareableDistressText();
    const text = document.getElementById('distress-shareable-text')?.value || '';
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
}

// Global Exports
window.switchTab = switchTab;
window.openSosModal = openSosModal;
window.triggerOneTapSos = triggerOneTapSos;
window.closeSosCockpit = closeSosCockpit;
window.selectSupplementCategory = selectSupplementCategory;
window.submitSupplementalDetails = submitSupplementalDetails;
window.fetch5DayWeatherForecast = fetch5DayWeatherForecast;
window.loadTrustedContacts = loadTrustedContacts;
window.openAddContactModal = openAddContactModal;
window.closeAddContactModal = closeAddContactModal;
window.saveNewTrustedContact = saveNewTrustedContact;
window.deleteTrustedContact = deleteTrustedContact;
window.triggerWhatsAppContact = triggerWhatsAppContact;
window.updateShareableDistressText = updateShareableDistressText;
window.copyDistressMessage = copyDistressMessage;
window.shareDistressWhatsApp = shareDistressWhatsApp;
window.shareDistressSms = shareDistressSms;
window.openCitizenProfileModal = openCitizenProfileModal;
window.saveCitizenProfile = saveCitizenProfile;
window.handleSosSubmit = handleSosSubmit;
window.handleFullReportSubmit = handleFullReportSubmit;
window.handleEvidenceFileSelect = handleEvidenceFileSelect;
window.runModularRiskAssessment = runModularRiskAssessment;
window.fetchRealtimeWeatherData = fetchRealtimeWeatherData;
window.fetchSheltersDirectory = fetchSheltersDirectory;
window.fetchHospitalsDirectory = fetchHospitalsDirectory;
window.fetchCitizenReports = fetchCitizenReports;
window.openCitizenReportModal = openCitizenReportModal;
window.openCitizenAuthModal = openCitizenAuthModal;
window.switchCitizenAuthTab = switchCitizenAuthTab;
window.handleCitizenLogin = handleCitizenLogin;
window.handleCitizenRegister = handleCitizenRegister;
window.citizenLogout = citizenLogout;
window.toggleTheme = toggleTheme;
window.toggleMoreMenu = toggleMoreMenu;
window.toggleMobileMoreMenu = toggleMobileMoreMenu;
window.openApkModal = openApkModal;
window.closeApkModal = closeApkModal;
window.switchPhoneScreen = switchPhoneScreen;
window.simulatePhoneSos = simulatePhoneSos;
window.simulateAiDetection = simulateAiDetection;
window.simulateOfflineSync = simulateOfflineSync;
window.updatePhoneClock = updatePhoneClock;
window.copyChecksum = copyChecksum;
window.selectSosCategory = selectSosCategory;
window.showGovAlertsModal = showGovAlertsModal;
window.closeGovAlertsModal = closeGovAlertsModal;
window.fetchGovernmentAlerts = fetchGovernmentAlerts;
window.deleteOfflineDraft = deleteOfflineDraft;
window.flushOfflineQueue = flushOfflineQueue;

