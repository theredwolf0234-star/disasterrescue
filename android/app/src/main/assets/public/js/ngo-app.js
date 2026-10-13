/**
 * AISTER NGO COLLABORATIVE DISASTER RELIEF APPLICATION LOGIC
 * Coordinates NGO partner authentication, assigned incident triage,
 * task progression, volunteer rosters, supply tracking, and inter-agency chat.
 */

let ngoMap = null;
let ngoMapMarkers = [];
let currentNgoData = null;
let activeTasksList = [];
let activeEditingTaskId = null;
let currentNgoTab = 'tasks';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 1. Initialize Real-Time Socket Connection
    if (typeof initRealtimeSocket === 'function') {
        initRealtimeSocket('NGO');
    }

    // 2. Wire Socket Listeners
    if (typeof onRealtimeEvent === 'function') {
        onRealtimeEvent('incident:updated', () => {
            if (api.isLoggedIn()) refreshNgoDashboard(false);
        });
        onRealtimeEvent('incident:new', () => {
            if (api.isLoggedIn()) refreshNgoDashboard(false);
        });
        onRealtimeEvent('alert:new_government_alert', (alt) => {
            showToast(`⚠️ NEW GOVERNMENT DISASTER ALERT: ${alt.hazardType || 'Advisory'}`, 'warning');
            loadGovernmentAlerts();
        });
    }

    // 3. Check Session Authentication
    updateNgoAuthUI();
    if (isNgoAuthenticated()) {
        initNgoMap();
        refreshNgoDashboard();
    } else {
        initNgoMap();
        openNgoAuthModal();
    }

    // 4. Load Government Alerts on startup
    loadGovernmentAlerts();
});

function isNgoAuthenticated() {
    const user = api.getUser();
    const token = api.getToken();
    return Boolean(token && user && (user.role === 'NGO' || user.role === 'ADMIN'));
}

function updateNgoAuthUI() {
    const user = api.getUser();
    const authBtnText = document.getElementById('ngo-auth-btn-text');
    const authBtn = document.getElementById('ngo-auth-btn');
    const orgPill = document.getElementById('ngo-org-pill');
    const orgNameLabel = document.getElementById('ngo-name-label');

    if (isNgoAuthenticated() && user) {
        if (authBtnText) authBtnText.innerText = 'Logout';
        if (authBtn) {
            authBtn.className = "bg-slate-800 hover:bg-red-950/60 border border-slate-700 hover:border-red-500 text-slate-300 hover:text-red-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 transition shadow";
            authBtn.onclick = handleNgoLogout;
        }
        if (orgPill) orgPill.classList.remove('hidden');
        if (orgNameLabel) orgNameLabel.innerText = user.organization || user.name || 'Verified NGO';
    } else {
        if (authBtnText) authBtnText.innerText = 'NGO Login';
        if (authBtn) {
            authBtn.className = "bg-purple-700 hover:bg-purple-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 transition shadow";
            authBtn.onclick = openNgoAuthModal;
        }
        if (orgPill) orgPill.classList.add('hidden');
    }
}

function handleNgoLogout() {
    api.clearAuth();
    showToast('Logged out of NGO operations portal.', 'info');
    updateNgoAuthUI();
    openNgoAuthModal();
}

// -------------------------------------------------------------
// TAB NAVIGATION
// -------------------------------------------------------------
function switchNgoTab(tabName) {
    currentNgoTab = tabName;

    document.querySelectorAll('.ngo-subview').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`ngo-view-${tabName}`);
    if (target) target.classList.remove('hidden');

    const tabs = ['tasks', 'volunteers', 'inventory', 'alerts', 'messages'];
    tabs.forEach(t => {
        const desktopBtn = document.getElementById(`ngo-tab-${t}`);
        if (desktopBtn) {
            desktopBtn.className = "ngo-nav-btn px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 transition";
        }
        const mobBtn = document.getElementById(`mob-ngo-${t}`);
        if (mobBtn) {
            mobBtn.className = "mob-ngo-btn px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 font-semibold whitespace-nowrap flex items-center space-x-1";
        }
    });

    const activeDeskBtn = document.getElementById(`ngo-tab-${tabName}`);
    if (activeDeskBtn) {
        activeDeskBtn.className = "ngo-nav-btn px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 bg-purple-700 text-white shadow";
    }
    const activeMobBtn = document.getElementById(`mob-ngo-${tabName}`);
    if (activeMobBtn) {
        activeMobBtn.className = "mob-ngo-btn px-3 py-1.5 rounded-full bg-purple-700 text-white font-bold whitespace-nowrap shadow flex items-center space-x-1";
    }

    if (tabName === 'tasks') {
        if (ngoMap) setTimeout(() => ngoMap.invalidateSize(), 150);
    } else if (tabName === 'volunteers') {
        fetchVolunteers();
    } else if (tabName === 'inventory') {
        fetchInventory();
    } else if (tabName === 'alerts') {
        loadGovernmentAlerts();
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// -------------------------------------------------------------
// LEAFLET GIS MAPPING
// -------------------------------------------------------------
function initNgoMap() {
    const container = document.getElementById('ngo-map');
    if (!container || ngoMap) return;

    try {
        ngoMap = L.map('ngo-map', {
            zoomControl: true,
            scrollWheelZoom: false
        }).setView([26.8467, 80.9462], 12);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        }).addTo(ngoMap);

    } catch (err) {
        console.warn('Leaflet map init warning:', err.message);
    }
}

function updateMapMarkers(tasks = []) {
    if (!ngoMap) return;

    // Clear existing markers
    ngoMapMarkers.forEach(m => ngoMap.removeLayer(m));
    ngoMapMarkers = [];

    const bounds = [];

    tasks.forEach(t => {
        if (!t.latitude || !t.longitude) return;
        const lat = parseFloat(t.latitude);
        const lng = parseFloat(t.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        bounds.push([lat, lng]);

        const markerHtml = `
            <div style="background:#7C3AED; color:white; border:2px solid #ffffff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; box-shadow:0 0 10px rgba(124,58,237,0.7);">
                !
            </div>
        `;
        const icon = L.divIcon({
            html: markerHtml,
            className: 'custom-ngo-pin',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([lat, lng], { icon }).addTo(ngoMap);
        marker.bindPopup(`
            <div style="font-family:'Outfit',sans-serif; font-size:12px; color:#1e293b; line-height:1.4;">
                <strong style="color:#6D28D9; font-size:13px;">${t.category || 'Emergency'}</strong><br/>
                Task #${t.task_id} &bull; ${t.emergency_level || 'HIGH'}<br/>
                Status: <strong>${t.task_status}</strong><br/>
                Headcount: <strong>${t.people_affected || 1}</strong> person(s)<br/>
                <span style="font-size:11px; color:#64748b;">${t.readable_address || 'Reported Location'}</span>
            </div>
        `);

        ngoMapMarkers.push(marker);
    });

    if (bounds.length > 0) {
        try { ngoMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 }); } catch(e) {}
    }
}

// -------------------------------------------------------------
// NGO DASHBOARD DATA SYNC
// -------------------------------------------------------------
async function refreshNgoDashboard(showToastFeedback = true) {
    if (!isNgoAuthenticated()) return;

    try {
        const res = await api.get('/api/ngo/dashboard');
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to load dashboard data');

        currentNgoData = res.data;
        const s = res.data.stats || {};

        document.getElementById('kpi-total-tasks').innerText = s.totalAssignedTasks || 0;
        document.getElementById('kpi-active-tasks').innerText = s.activeTasks || 0;
        document.getElementById('kpi-avail-volunteers').innerText = s.availableVolunteers || 0;
        document.getElementById('kpi-completed-tasks').innerText = s.completedTasks || 0;
        document.getElementById('badge-active-tasks').innerText = s.activeTasks || 0;

        activeTasksList = res.data.tasks || [];
        renderTasks(activeTasksList);
        updateMapMarkers(activeTasksList);

        if (res.data.volunteers) renderVolunteers(res.data.volunteers);
        if (res.data.inventory) renderInventory(res.data.inventory);
        if (res.data.messages) renderCoordinationMessages(res.data.messages);

        if (showToastFeedback) showToast('NGO relief dashboard updated.', 'success');
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.warn('Dashboard sync warning:', err.message);
        if (showToastFeedback) showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// RENDER ASSIGNED RELIEF TASKS
// -------------------------------------------------------------
function renderTasks(tasks = []) {
    const container = document.getElementById('ngo-tasks-container');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="py-14 text-center text-slate-400 text-xs bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
                <i data-lucide="inbox" class="w-8 h-8 text-slate-600 mx-auto"></i>
                <p class="font-bold text-slate-300">No disaster assistance tasks currently assigned.</p>
                <p class="text-[11px] text-slate-500">Tasks shared by Disaster Management Authorities will appear here in real time.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    container.innerHTML = '';

    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-800 hover:border-purple-600/50 rounded-2xl p-5 text-slate-200 space-y-3.5 transition shadow-lg";

        // Status badge styling
        let statusBadgeClass = 'bg-purple-950 text-purple-300 border-purple-800';
        if (task.task_status === 'COMPLETED') statusBadgeClass = 'bg-blue-950 text-blue-300 border-blue-800';
        else if (task.task_status === 'DECLINED') statusBadgeClass = 'bg-red-950 text-red-300 border-red-800';
        else if (task.task_status.includes('PROGRESS')) statusBadgeClass = 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse';

        // Parse AI recommendations if present
        let aiRecsHtml = '';
        if (task.ai_recommended_assistance) {
            try {
                const recs = typeof task.ai_recommended_assistance === 'string' ? JSON.parse(task.ai_recommended_assistance) : task.ai_recommended_assistance;
                if (Array.isArray(recs) && recs.length > 0) {
                    aiRecsHtml = `
                        <div class="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl text-xs space-y-1">
                            <div class="flex items-center space-x-1.5 font-bold text-purple-300 text-[11px]">
                                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-400"></i>
                                <span>AI RECOMMENDED RELIEF CATEGORIES (Advisory Only — Coordinator Review Required):</span>
                            </div>
                            <ul class="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                                ${recs.map(r => `<li><strong>${r.title}</strong> &bull; Est. Qty: ${r.estimatedQuantity || 'As Needed'}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                }
            } catch(e) {}
        }

        const isPendingAcceptance = task.task_status === 'ASSIGNED';

        card.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div class="flex items-center space-x-2.5">
                    <span class="w-2.5 h-2.5 rounded-full ${task.task_status === 'COMPLETED' ? 'bg-blue-400' : 'bg-emerald-400 animate-ping'}"></span>
                    <div>
                        <h4 class="font-black text-white text-base">${task.category || 'Emergency Disaster SOS'}</h4>
                        <span class="text-[10px] text-slate-400 font-mono">Task Ref: #${task.task_id} &bull; Incident: #${task.incident_id}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="px-2.5 py-0.5 rounded text-[10px] font-black uppercase border ${statusBadgeClass}">
                        ${task.task_status.replace(/_/g, ' ')}
                    </span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-300">
                        ${task.emergency_level || 'HIGH'} PRIORITY
                    </span>
                </div>
            </div>

            <!-- Details & Location -->
            <div class="grid sm:grid-cols-2 gap-3 text-xs bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                <div>
                    <span class="text-slate-400 text-[10px] uppercase block">Location & Landmark</span>
                    <strong class="text-white text-xs">${task.readable_address || 'Reported Coordinates'}</strong>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5">${Number(task.latitude).toFixed(4)}° N, ${Number(task.longitude).toFixed(4)}° E</div>
                </div>
                <div>
                    <span class="text-slate-400 text-[10px] uppercase block">Affected Citizens & Services</span>
                    <strong class="text-amber-400 text-xs">~${task.people_affected || 1} Person(s) Reported in Danger</strong>
                    <div class="text-[10px] text-slate-300 mt-0.5">Assistance: <em>${task.requested_services || 'General Emergency Relief'}</em></div>
                </div>
            </div>

            <p class="text-xs text-slate-300 leading-relaxed">${task.details || 'Emergency distress beacon initiated.'}</p>

            ${aiRecsHtml}

            ${task.assistance_notes ? `
                <div class="p-2.5 bg-slate-900 rounded-xl text-xs text-slate-300 border border-slate-800">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Relief Mission Notes:</span>
                    ${task.assistance_notes}
                </div>
            ` : ''}

            <!-- ACTION BUTTONS -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                <div class="flex items-center space-x-2 text-xs">
                    <span class="text-slate-400 text-[10px]">People Aided:</span>
                    <strong class="text-emerald-400 font-mono">${task.people_assisted || 0}</strong>
                </div>

                <div class="flex items-center space-x-2">
                    ${isPendingAcceptance ? `
                        <button onclick="respondToTask('${task.task_id}', 'ACCEPT')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 transition shadow">
                            <i data-lucide="check" class="w-3.5 h-3.5"></i>
                            <span>Accept Task</span>
                        </button>
                        <button onclick="promptDeclineTask('${task.task_id}')" class="bg-slate-800 hover:bg-red-950/70 border border-slate-700 hover:border-red-500 text-slate-300 hover:text-red-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 transition">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                            <span>Decline</span>
                        </button>
                    ` : `
                        <button onclick="openTaskProgressModal('${task.task_id}', '${task.task_status}', '${encodeURIComponent(task.assistance_notes || '')}', ${task.people_assisted || 0})" class="bg-purple-700 hover:bg-purple-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1.5 transition shadow">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                            <span>Update Progress</span>
                        </button>
                    `}
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function applyTaskFilters() {
    const statusVal = document.getElementById('filter-task-status')?.value || 'ALL';
    if (!activeTasksList) return;

    if (statusVal === 'ALL') {
        renderTasks(activeTasksList);
    } else {
        const filtered = activeTasksList.filter(t => t.task_status === statusVal);
        renderTasks(filtered);
    }
}

// -------------------------------------------------------------
// TASK ACCEPT / DECLINE ACTIONS
// -------------------------------------------------------------
async function respondToTask(taskId, action, declineReason = null) {
    try {
        const body = { action };
        if (declineReason) body.declineReason = declineReason;

        const res = await api.post(`/api/ngo/tasks/${taskId}/respond`, body);
        if (!res.success) throw new Error(res.message || 'Action failed');

        showToast(`Task ${action === 'ACCEPT' ? 'accepted' : 'declined'} successfully.`, 'success');
        refreshNgoDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to update task response', 'error');
    }
}

function promptDeclineTask(taskId) {
    const reason = prompt('Please specify reason for declining this assistance task:');
    if (reason && reason.trim().length > 3) {
        respondToTask(taskId, 'DECLINE', reason.trim());
    } else if (reason !== null) {
        showToast('A specific reason is required to decline a task.', 'error');
    }
}

// -------------------------------------------------------------
// TASK PROGRESS MODAL
// -------------------------------------------------------------
function openTaskProgressModal(taskId, currentStatus, currentNotesEncoded, peopleAssisted) {
    activeEditingTaskId = taskId;
    const modal = document.getElementById('task-progress-modal');
    if (!modal) return;

    document.getElementById('progress-task-id').innerText = `Task #${taskId}`;
    
    // Normalize status selector value
    const statusSelect = document.getElementById('modal-progress-status');
    if (statusSelect) {
        const cleanStatus = currentStatus.replace(/_/g, ' ');
        for (let i = 0; i < statusSelect.options.length; i++) {
            if (statusSelect.options[i].value.toLowerCase() === cleanStatus.toLowerCase()) {
                statusSelect.selectedIndex = i;
                break;
            }
        }
    }

    document.getElementById('modal-progress-people').value = peopleAssisted || 0;
    document.getElementById('modal-progress-notes').value = decodeURIComponent(currentNotesEncoded || '');

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeTaskProgressModal() {
    activeEditingTaskId = null;
    document.getElementById('task-progress-modal')?.classList.add('hidden');
}

async function handleTaskProgressSubmit(e) {
    e.preventDefault();
    if (!activeEditingTaskId) return;

    const status = document.getElementById('modal-progress-status').value;
    const peopleAssisted = parseInt(document.getElementById('modal-progress-people').value, 10) || 0;
    const notes = document.getElementById('modal-progress-notes').value.trim();

    try {
        const res = await api.patch(`/api/ngo/tasks/${activeEditingTaskId}/progress`, {
            status,
            peopleAssisted,
            notes
        });

        if (!res.success) throw new Error(res.message || 'Update failed');

        showToast(`✓ Relief task updated to "${status}".`, 'success');
        closeTaskProgressModal();
        refreshNgoDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to save progress update', 'error');
    }
}

// -------------------------------------------------------------
// VOLUNTEER MANAGEMENT
// -------------------------------------------------------------
async function fetchVolunteers() {
    try {
        const res = await api.get('/api/ngo/volunteers');
        if (res.success && res.data) {
            renderVolunteers(res.data.volunteers || []);
        }
    } catch (e) {
        console.warn('Volunteers load error:', e.message);
    }
}

function renderVolunteers(volunteers = []) {
    const tbody = document.getElementById('volunteers-table-body');
    if (!tbody) return;

    if (volunteers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">No registered volunteers found. Click "Register Volunteer" to add personnel.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    volunteers.forEach(v => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/40 transition";
        tr.innerHTML = `
            <td class="p-3 font-bold text-white">${v.fullName}</td>
            <td class="p-3 text-slate-300 font-normal">${v.skills}</td>
            <td class="p-3 text-slate-400 font-normal">${v.serviceAreas}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${v.availabilityStatus === 'AVAILABLE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}">
                    ${v.availabilityStatus}
                </span>
            </td>
            <td class="p-3 text-purple-300 font-normal">${v.assignedTask || 'Unassigned'}</td>
            <td class="p-3 text-right">
                <span class="text-[10px] text-slate-500 font-mono">Protected</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAddVolunteerModal() {
    document.getElementById('add-volunteer-modal')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAddVolunteerModal() {
    document.getElementById('add-volunteer-modal')?.classList.add('hidden');
}

async function handleSaveVolunteer(e) {
    e.preventDefault();
    const fullName = document.getElementById('vol-name').value.trim();
    const phone = document.getElementById('vol-phone').value.trim();
    const email = document.getElementById('vol-email').value.trim();
    const skills = document.getElementById('vol-skills').value.trim();
    const serviceAreas = document.getElementById('vol-areas').value.trim();

    try {
        const res = await api.post('/api/ngo/volunteers', { fullName, phone, email, skills, serviceAreas });
        if (!res.success) throw new Error(res.message || 'Failed to add volunteer');

        showToast(`✓ Volunteer ${fullName} added to roster.`, 'success');
        closeAddVolunteerModal();
        fetchVolunteers();
    } catch (err) {
        showToast(err.message || 'Failed to save volunteer', 'error');
    }
}

// -------------------------------------------------------------
// RELIEF SUPPLIES & INVENTORY
// -------------------------------------------------------------
async function fetchInventory() {
    try {
        const res = await api.get('/api/ngo/inventory');
        if (res.success && res.data) {
            renderInventory(res.data.inventory || []);
        }
    } catch(e) {}
}

function renderInventory(inventory = []) {
    const grid = document.getElementById('ngo-inventory-grid');
    if (!grid) return;

    if (inventory.length === 0) {
        grid.innerHTML = `<p class="col-span-full py-8 text-center text-slate-500 text-xs">No relief inventory recorded yet. Click Update Supplies to record capacity.</p>`;
        return;
    }

    grid.innerHTML = '';
    inventory.forEach(item => {
        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2";
        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <span class="text-[10px] uppercase font-bold text-slate-400 font-mono">${item.resource_type}</span>
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            </div>
            <div>
                <h4 class="font-bold text-white text-sm">${item.resource_name}</h4>
                <div class="text-xl font-black text-blue-400 font-mono mt-1">${item.available_quantity.toLocaleString()} <span class="text-xs font-normal text-slate-400">${item.unit_measure}</span></div>
            </div>
            <div class="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                Staging Hub: <strong class="text-slate-300">${item.location_hub || 'Central Depot'}</strong>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openUpdateInventoryModal() {
    document.getElementById('update-inventory-modal')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeUpdateInventoryModal() {
    document.getElementById('update-inventory-modal')?.classList.add('hidden');
}

async function handleSaveInventory(e) {
    e.preventDefault();
    const resourceType = document.getElementById('inv-type').value;
    const resourceName = document.getElementById('inv-name').value.trim();
    const availableQuantity = document.getElementById('inv-qty').value;
    const unitMeasure = document.getElementById('inv-unit').value.trim();
    const locationHub = document.getElementById('inv-hub').value.trim();

    try {
        const res = await api.post('/api/ngo/inventory', {
            resourceType, resourceName, availableQuantity, unitMeasure, locationHub
        });
        if (!res.success) throw new Error(res.message || 'Failed to update supplies');

        showToast('✓ Relief inventory capacity recorded.', 'success');
        closeUpdateInventoryModal();
        fetchInventory();
    } catch (err) {
        showToast(err.message || 'Failed to save inventory', 'error');
    }
}

// -------------------------------------------------------------
// GOVERNMENT DISASTER ALERTS (NDMA SACHET)
// -------------------------------------------------------------
async function loadGovernmentAlerts() {
    try {
        const res = await api.get('/api/alerts');
        if (res.success && res.data) {
            const alerts = res.data.alerts || [];
            const meta = res.data.metadata || {};

            const lastSyncBadge = document.getElementById('alerts-last-sync-badge');
            if (lastSyncBadge) {
                lastSyncBadge.innerText = meta.isCacheOutdated 
                    ? `⚠️ Cached (${meta.cacheAgeMinutes} mins ago)` 
                    : `Last Sync: ${new Date(meta.lastSyncAt).toLocaleTimeString()}`;
            }

            // Top ticker
            const banner = document.getElementById('ngo-gov-alert-banner');
            if (alerts.length > 0 && banner) {
                const first = alerts[0];
                banner.classList.remove('hidden');
                document.getElementById('alert-banner-source').innerText = `${first.source_agency} &bull; ${first.hazard_type}`;
                document.getElementById('alert-banner-text').innerText = `${first.severity} ADVISORY for ${first.affected_area}`;
                document.getElementById('alert-banner-instructions').innerText = `Official Guidance: ${first.official_instructions}`;
                document.getElementById('alert-banner-time').innerText = `Expires: ${new Date(first.expires_at).toLocaleDateString()}`;
            }

            renderGovernmentAlerts(alerts, meta);
        }
    } catch (e) {
        console.warn('Government alerts load error:', e.message);
    }
}

function renderGovernmentAlerts(alerts = [], meta = {}) {
    const list = document.getElementById('ngo-alerts-list');
    if (!list) return;

    if (alerts.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">No active extreme meteorological alerts currently in effect.</div>`;
        return;
    }

    list.innerHTML = '';
    alerts.forEach(a => {
        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2 text-xs";
        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <div class="flex items-center space-x-2">
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <strong class="text-amber-300 font-bold">${a.source_agency}</strong>
                    <span class="text-[10px] text-slate-500 font-mono">Ref: ${a.alert_identifier}</span>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-950 text-amber-300 border border-amber-800">${a.severity}</span>
            </div>
            <div>
                <h4 class="font-black text-white text-sm">${a.hazard_type}</h4>
                <p class="text-slate-300 text-xs mt-0.5">Affected Zone: <strong>${a.affected_area}</strong> (~${a.radius_km || 25}km radius)</p>
            </div>
            <div class="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-300 text-[11px] leading-relaxed">
                <strong class="text-white block mb-0.5">Official Directives:</strong>
                ${a.official_instructions}
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                <span>Effective: ${new Date(a.effective_from).toLocaleString()}</span>
                <span>Expiry: ${new Date(a.expires_at).toLocaleString()}</span>
            </div>
        `;
        list.appendChild(card);
    });
}

// -------------------------------------------------------------
// INTER-AGENCY COORDINATION MESSAGES
// -------------------------------------------------------------
function renderCoordinationMessages(messages = []) {
    const container = document.getElementById('ngo-messages-stream');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `<div class="py-8 text-center text-slate-500 text-xs">No coordination messages logged yet.</div>`;
        return;
    }

    container.innerHTML = '';
    messages.forEach(m => {
        const item = document.createElement('div');
        item.className = "bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1";
        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-1.5 font-bold">
                    <span class="text-purple-400 font-mono">[#${m.incident_id}]</span>
                    <span class="text-white">${m.sender_name}</span>
                    <span class="text-[9px] uppercase px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">${m.sender_role}</span>
                </div>
                <span class="text-[10px] text-slate-500 font-mono">${new Date(m.created_at).toLocaleTimeString()}</span>
            </div>
            <p class="text-slate-300">${m.message}</p>
        `;
        container.appendChild(item);
    });
}

// -------------------------------------------------------------
// AUTH MODAL & REGISTRATION HANDLERS
// -------------------------------------------------------------
function openNgoAuthModal() {
    document.getElementById('ngo-auth-modal')?.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeNgoAuthModal() {
    document.getElementById('ngo-auth-modal')?.classList.add('hidden');
}

function switchNgoAuthMode(mode) {
    const loginForm = document.getElementById('ngo-login-form');
    const regForm = document.getElementById('ngo-register-form');
    const btnLogin = document.getElementById('btn-ngo-auth-login');
    const btnReg = document.getElementById('btn-ngo-auth-register');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        btnLogin.className = "flex-1 py-3 text-center text-purple-400 border-b-2 border-purple-500 font-bold";
        btnReg.className = "flex-1 py-3 text-center text-slate-400 hover:text-slate-200 font-bold";
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        btnLogin.className = "flex-1 py-3 text-center text-slate-400 hover:text-slate-200 font-bold";
        btnReg.className = "flex-1 py-3 text-center text-purple-400 border-b-2 border-purple-500 font-bold";
    }
}

async function handleNgoLogin(e) {
    e.preventDefault();
    const email = document.getElementById('ngo-login-email').value.trim();
    const password = document.getElementById('ngo-login-pass').value;
    const errBox = document.getElementById('ngo-login-error');

    try {
        errBox.classList.add('hidden');
        const res = await api.post('/api/ngo/login', { email, password });

        if (!res.success || !res.data) throw new Error(res.message || 'Login failed');

        api.setToken(res.data.token, res.data.user);
        showToast('✓ Authenticated to NGO Operations Grid!', 'success');
        closeNgoAuthModal();
        updateNgoAuthUI();
        refreshNgoDashboard();

    } catch (err) {
        errBox.classList.remove('hidden');
        errBox.innerText = err.message || 'Authentication error. Please check credentials.';
    }
}

async function handleNgoRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('reg-ngo-name').value.trim();
    const registrationNumber = document.getElementById('reg-ngo-regno').value.trim();
    const darpanId = document.getElementById('reg-ngo-darpan').value.trim();
    const contactPerson = document.getElementById('reg-ngo-contact').value.trim();
    const phone = document.getElementById('reg-ngo-phone').value.trim();
    const officialEmail = document.getElementById('reg-ngo-email').value.trim();
    const operationalAreas = document.getElementById('reg-ngo-areas').value.trim();
    const emergencyCapabilities = document.getElementById('reg-ngo-capabilities').value.trim();
    const password = document.getElementById('reg-ngo-password').value;
    const fileInput = document.getElementById('reg-ngo-doc');

    const errBox = document.getElementById('ngo-reg-error');
    const succBox = document.getElementById('ngo-reg-success');
    const submitBtn = document.getElementById('reg-submit-btn');

    // Collect checked services
    const checkedServices = Array.from(document.querySelectorAll('input[name="services"]:checked')).map(cb => cb.value);

    try {
        errBox.classList.add('hidden');
        succBox.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.innerText = 'Submitting Application to Command HQ...';

        const formData = new FormData();
        formData.append('name', name);
        formData.append('registrationNumber', registrationNumber);
        if (darpanId) formData.append('darpanId', darpanId);
        formData.append('contactPerson', contactPerson);
        formData.append('phone', phone);
        formData.append('officialEmail', officialEmail);
        formData.append('operationalAreas', operationalAreas);
        formData.append('servicesOffered', JSON.stringify(checkedServices));
        if (emergencyCapabilities) formData.append('emergencyCapabilities', emergencyCapabilities);
        formData.append('password', password);

        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            formData.append('verificationDoc', fileInput.files[0]);
        }

        const res = await api.postMultipart('/api/ngo/register', formData);
        if (!res.success) throw new Error(res.message || 'Registration failed');

        succBox.classList.remove('hidden');
        succBox.innerHTML = `
            <strong>Application Submitted Successfully!</strong><br/>
            Status: <span class="text-amber-300 font-bold">PENDING ADMINISTRATOR VERIFICATION</span><br/>
            <p class="mt-1">Disaster Response Administration will verify your DARPAN ID and credentials. Once approved, coordinator access will activate immediately.</p>
        `;
        document.getElementById('ngo-register-form').reset();

    } catch (err) {
        errBox.classList.remove('hidden');
        errBox.innerText = err.message || 'Failed to submit NGO application.';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Application for Admin Verification';
    }
}

// -------------------------------------------------------------
// TOAST NOTIFICATIONS
// -------------------------------------------------------------
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-emerald-950 border-emerald-600 text-emerald-200',
        error: 'bg-red-950 border-red-600 text-red-200',
        warning: 'bg-amber-950 border-amber-600 text-amber-200',
        info: 'bg-purple-950 border-purple-600 text-purple-200'
    };

    toast.className = `${colors[type] || colors.info} border px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center space-x-2 transition-all transform translate-y-2 pointer-events-auto`;
    toast.innerHTML = `<span>${msg}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Global window bindings
window.switchNgoTab = switchNgoTab;
window.openNgoAuthModal = openNgoAuthModal;
window.closeNgoAuthModal = closeNgoAuthModal;
window.switchNgoAuthMode = switchNgoAuthMode;
window.handleNgoLogin = handleNgoLogin;
window.handleNgoRegistration = handleNgoRegistration;
window.refreshNgoDashboard = refreshNgoDashboard;
window.applyTaskFilters = applyTaskFilters;
window.respondToTask = respondToTask;
window.promptDeclineTask = promptDeclineTask;
window.openTaskProgressModal = openTaskProgressModal;
window.closeTaskProgressModal = closeTaskProgressModal;
window.handleTaskProgressSubmit = handleTaskProgressSubmit;
window.openAddVolunteerModal = openAddVolunteerModal;
window.closeAddVolunteerModal = closeAddVolunteerModal;
window.handleSaveVolunteer = handleSaveVolunteer;
window.openUpdateInventoryModal = openUpdateInventoryModal;
window.closeUpdateInventoryModal = closeUpdateInventoryModal;
window.handleSaveInventory = handleSaveInventory;
window.showToast = showToast;
