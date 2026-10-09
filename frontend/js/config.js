/**
 * RESCUE AI - Mobile & Web Configuration
 * 
 * For Android APK / Play Store AAB builds:
 * Update SERVER_URL to point to your live backend server (Render, Railway, Heroku, AWS, VPS).
 * When running as a native Android app via Capacitor, all REST API and WebSocket connections
 * will seamlessly connect to this live backend.
 */
window.RESCUE_CONFIG = {
    // Production backend deployment URL:
    SERVER_URL: 'https://disaster-rescuecoordinator.onrender.com',
    APP_NAME: 'AISTER — AI Disaster Rescue Coordinator',
    VERSION: '1.0.0',
    EMERGENCY_PHONE: '112',
    NDRF_HELPLINE: '1078'
};
