/**
 * Centralized API Client for RESCUE AI
 * Handles unified base URL resolution, JWT token lifecycle, automatic Authorization headers,
 * and standard application error formatting.
 */

function resolveApiBaseUrl() {
    if (window.API_BASE_URL !== undefined && window.API_BASE_URL !== '') {
        return window.API_BASE_URL;
    }
    const customUrl = localStorage.getItem('rescue_ai_custom_api_url');
    if (customUrl) {
        return customUrl.replace(/\/$/, '');
    }
    const isNativeCapacitor = Boolean(
        (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
        (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
    );
    if (isNativeCapacitor && window.RESCUE_CONFIG && window.RESCUE_CONFIG.SERVER_URL) {
        return window.RESCUE_CONFIG.SERVER_URL.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:') {
            return (window.RESCUE_CONFIG && window.RESCUE_CONFIG.SERVER_URL) || 'http://localhost:5000';
        }
        if (window.location.port === '5000' || window.location.port === '') {
            return '';
        }
        if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            if (isNativeCapacitor && window.RESCUE_CONFIG && window.RESCUE_CONFIG.SERVER_URL) {
                return window.RESCUE_CONFIG.SERVER_URL.replace(/\/$/, '');
            }
            return 'http://localhost:5000';
        }
        return window.location.origin;
    }
    return '';
}

const API_BASE = resolveApiBaseUrl();
const TOKEN_KEY = 'rescue_ai_auth_token';
const USER_KEY = 'rescue_ai_user_data';

const api = {
    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    setToken(token, user) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    clearAuth() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },

    isLoggedIn() {
        return Boolean(this.getToken() && this.getUser());
    },

    isAuthority() {
        const u = this.getUser();
        return Boolean(this.getToken() && u && (u.role === 'AUTHORITY' || u.role === 'ADMIN'));
    },

    isCitizen() {
        const u = this.getUser();
        return Boolean(this.getToken() && u && u.role === 'CITIZEN');
    },

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        } else if (options.body instanceof FormData) {
            delete headers['Content-Type'];
            config.body = options.body;
        }

        try {
            const response = await fetch(url, config);
            let data;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = { success: response.ok, message: await response.text() };
            }

            if (!response.ok) {
                // If 401 Unauthorized or expired token, clear stale credentials
                if (response.status === 401) {
                    this.clearAuth();
                }

                let friendlyMsg = data.message || `Request failed with status ${response.status}`;
                if (response.status === 401) {
                    friendlyMsg = data.message || 'Session expired or unauthorized. Please log in again.';
                } else if (response.status === 403) {
                    friendlyMsg = data.message || 'Permission denied: Role lacks authorization.';
                } else if (response.status === 404) {
                    friendlyMsg = data.message || 'Incident or requested resource not found.';
                } else if (response.status === 503) {
                    friendlyMsg = data.message || 'Database disconnected or backend unavailable.';
                }

                const err = new Error(friendlyMsg);
                err.status = response.status;
                err.errorCode = data.errorCode || (response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'API_ERROR');
                err.data = data;
                throw err;
            }

            return data;
        } catch (err) {
            if (err.name === 'TypeError' && err.message && err.message.toLowerCase().includes('fetch')) {
                console.error(`[API Network Error] ${options.method || 'GET'} ${endpoint}: Backend unreachable.`);
                const networkErr = new Error('Backend connection failed: Unable to connect to command server.');
                networkErr.status = 0;
                networkErr.errorCode = 'BACKEND_UNAVAILABLE';
                throw networkErr;
            }
            console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err.message);
            throw err;
        }
    },

    get(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'GET', headers });
    },

    post(endpoint, body, headers = {}) {
        return this.request(endpoint, { method: 'POST', body, headers });
    },

    postMultipart(endpoint, formData, headers = {}) {
        return this.request(endpoint, { method: 'POST', body: formData, headers });
    },

    patch(endpoint, body, headers = {}) {
        return this.request(endpoint, { method: 'PATCH', body, headers });
    },

    delete(endpoint, headers = {}) {
        return this.request(endpoint, { method: 'DELETE', headers });
    }
};

// UI Toast Notification Utility
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    let borderColor = '#334155';
    if (type === 'success') {
        icon = '✅';
        borderColor = '#10B981';
    } else if (type === 'error') {
        icon = '⚠️';
        borderColor = '#EF4444';
    } else if (type === 'warning') {
        icon = '🚨';
        borderColor = '#F59E0B';
    }

    toast.style.borderColor = borderColor;
    toast.innerHTML = `<span>${icon}</span><span class="flex-grow">${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

window.api = api;
window.showToast = showToast;
