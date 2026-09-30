/**
 * Real-Time Socket.IO Client Manager for RESCUE AI
 * Maintains resilient bidirectional event flow for incident alerts, triage updates, and operational commands.
 */

let socket = null;
const socketListeners = {
    'incident:new': [],
    'incident:updated': [],
    'incident:status_changed': [],
    'alert:critical': []
};

function resolveSocketUrl() {
    if (window.API_BASE_URL !== undefined && window.API_BASE_URL !== '') {
        return window.API_BASE_URL;
    }
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:5000';
        }
        if (window.location.port === '5000' || window.location.port === '') {
            return window.location.origin;
        }
        if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            return 'http://localhost:5000';
        }
        return window.location.origin;
    }
    return 'http://localhost:5000';
}

function initRealtimeSocket(role = 'CITIZEN') {
    if (typeof io === 'undefined') {
        console.warn('[Socket.IO] io library not loaded in window. Real-time updates disabled.');
        updateConnectionBadge('OFFLINE');
        return null;
    }

    if (socket && socket.connected) {
        console.log('[Socket.IO] Reusing existing connection.');
        return socket;
    }

    const socketUrl = resolveSocketUrl();
    
    socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log(`[Socket.IO] Connected with ID: ${socket.id} to ${socketUrl}`);
        updateConnectionBadge('CONNECTED');

        if (role === 'AUTHORITY' || role === 'ADMIN') {
            socket.emit('join', 'authorities');
        } else {
            socket.emit('join', 'citizens');
        }
    });

    socket.on('reconnect_attempt', () => {
        updateConnectionBadge('RECONNECTING');
    });

    socket.on('reconnect', () => {
        console.log('[Socket.IO] Reconnected successfully.');
        updateConnectionBadge('CONNECTED');
    });

    socket.on('disconnect', (reason) => {
        console.warn(`[Socket.IO] Disconnected: ${reason}`);
        updateConnectionBadge('OFFLINE');
    });

    socket.on('connect_error', (error) => {
        console.error('[Socket.IO] Connection error:', error.message);
        updateConnectionBadge('OFFLINE');
    });

    // Wire events to subscribers
    ['incident:new', 'incident:updated', 'incident:status_changed', 'alert:critical'].forEach(evt => {
        socket.on(evt, (data) => {
            console.log(`[Socket.IO Event] ${evt}:`, data);
            if (socketListeners[evt]) {
                socketListeners[evt].forEach(cb => {
                    try { cb(data); } catch (e) { console.error(`Error in ${evt} listener:`, e); }
                });
            }
        });
    });

    return socket;
}

function onRealtimeEvent(event, callback) {
    if (socketListeners[event]) {
        socketListeners[event].push(callback);
    }
}

function subscribeToIncident(incidentId) {
    if (socket && socket.connected && incidentId) {
        socket.emit('subscribe:incident', incidentId);
    }
}

function updateConnectionBadge(status) {
    const badge = document.getElementById('socket-status-badge');
    if (!badge) return;

    if (status === 'CONNECTED') {
        badge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-emerald-400 font-bold">CONNECTED</span>
        `;
        badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-950/80 border border-emerald-600/50';
    } else if (status === 'RECONNECTING') {
        badge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span class="text-amber-400 font-bold">RECONNECTING</span>
        `;
        badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-amber-950/80 border border-amber-600/50';
    } else {
        badge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span class="text-red-400 font-bold">OFFLINE</span>
        `;
        badge.className = 'inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] bg-red-950/80 border border-red-600/50';
    }
}

window.initRealtimeSocket = initRealtimeSocket;
window.onRealtimeEvent = onRealtimeEvent;
window.subscribeToIncident = subscribeToIncident;
window.getSocket = () => socket;
