/**
 * RESCUE AI - Internationalization (i18n) Engine
 * Seamless bilingual support: English & Hindi (हिंदी)
 */

const I18N_TRANSLATIONS = {
    en: {
        appName: "RESCUE AI",
        tagline: "AI Disaster Rescue Coordinator",
        motto: "BE READY • STAY SAFE • RECOVER TOGETHER",
        grid247: "24/7 Grid",
        navHome: "Home",
        navSos: "Emergency SOS",
        navReport: "Report Disaster",
        navLiveRisk: "Live Risk",
        navWeather: "Weather",
        navMap: "Tactical Map",
        navShelters: "Shelters",
        navHospitals: "Hospitals",
        navContacts: "Emergency Contacts",
        navReports: "My Reports",
        navAbout: "About",
        navHelp: "Help & Guide",
        commandPortal: "Command Portal",
        dispatchSosBtn: "DISPATCH SOS BEACON",
        aiSolutionsBtn: "AI SOLUTIONS ENGINE",
        heroQuerying: "Querying Regional Grid...",
        heroActive: "Live Telemetry Active",
        demoNotice: "Demo Emergency Coordination System • Not connected to real 112/NDRF dispatch",
        langToggle: "हिंदी",
        offlineNotice: "Network unavailable. Retrying...",
        offlineQueued: "Saved locally. Will sync immediately when connection returns.",
        voiceSosTitle: "Voice SOS Intake",
        startVoiceRec: "Record Voice SOS",
        stopVoiceRec: "Stop Recording",
        playVoiceAudio: "Play Recording",
        instantVoiceSos: "⚡ SEND INSTANT VOICE SOS (ZERO DELAY)",
        sosModalTitle: "Dispatch Emergency SOS Beacon",
        categoryLabel: "Emergency Category",
        victimsLabel: "Victims / People Affected",
        detailsLabel: "Situation Details & Landmarks",
        landmarkLabel: "Physical Address / Landmark",
        evidenceLabel: "Attach Photo / Video Evidence",
        submitBeacon: "Dispatch Beacon to Command HQ",
        trackingTitle: "Emergency Beacon Tracking",
        step1: "SOS received",
        step2: "GPS location verified",
        step3: "Risk analysis completed",
        step4: "Authority notified",
        step5: "Rescue team assigned",
        step6: "Team approaching",
        step7: "Incident resolved",
        sheltersTitle: "Emergency Relief Shelters",
        hospitalsTitle: "Emergency Hospitals & Trauma Centers",
        weatherTitle: "Live Meteorology Telemetry",
        riskTitle: "Multi-Disaster Risk Engine",
        overallRisk: "OVERALL RISK",
        critical: "CRITICAL",
        high: "HIGH",
        moderate: "MODERATE",
        low: "LOW",
        safeRouteTitle: "Recommended Safe Route",
        routeAvoids: "Avoids hazards",
        eta: "ETA",
        distance: "Distance"
    },
    hi: {
        appName: "रेस्क्यू एआई (RESCUE AI)",
        tagline: "एआई आपदा बचाव समन्वयक",
        motto: "तैयार रहें • सुरक्षित रहें • मिलकर उबरें",
        grid247: "24/7 ग्रिड",
        navHome: "होम",
        navSos: "आपातकालीन एसओएस",
        navReport: "आपदा रिपोर्ट करें",
        navLiveRisk: "लाइव जोखिम",
        navWeather: "मौसम",
        navMap: "रणनीतिक मानचित्र",
        navShelters: "राहत शिविर",
        navHospitals: "अस्पताल",
        navContacts: "आपातकालीन संपर्क",
        navReports: "मेरी रिपोर्ट",
        navAbout: "हमारे बारे में",
        navHelp: "सहायता एवं गाइड",
        commandPortal: "कमांड पोर्टल",
        dispatchSosBtn: "एसओएस बीकन भेजें",
        aiSolutionsBtn: "एआई समाधान इंजन",
        heroQuerying: "क्षेत्रीय ग्रिड की जांच हो रही है...",
        heroActive: "लाइव टेलीमेट्री सक्रिय",
        demoNotice: "डेमो आपातकालीन समन्वय प्रणाली • वास्तविक 112/एनडीआरएफ से संबद्ध नहीं",
        langToggle: "English",
        offlineNotice: "नेटवर्क उपलब्ध नहीं है। पुनः प्रयास हो रहा है...",
        offlineQueued: "स्थानीय रूप से सुरक्षित। इंटरनेट आते ही स्वतः प्रेषित होगा।",
        voiceSosTitle: "वॉयस एसओएस इनपुट",
        startVoiceRec: "आवाज़ रिकॉर्ड करें",
        stopVoiceRec: "रिकॉर्डिंग रोकें",
        playVoiceAudio: "रिकॉर्डिंग सुनें",
        instantVoiceSos: "⚡ त्वरित वॉयस एसओएस भेजें (बिना देरी)",
        sosModalTitle: "आपातकालीन एसओएस बीकन प्रेषित करें",
        categoryLabel: "आपातकालीन श्रेणी",
        victimsLabel: "प्रभावित लोगों की संख्या",
        detailsLabel: "स्थिति का विवरण एवं लैंडमार्क",
        landmarkLabel: "स्थान का पता / प्रमुख लैंडमार्क",
        evidenceLabel: "फोटो / वीडियो साक्ष्य संलग्न करें",
        submitBeacon: "कमांड मुख्यालय को बीकन भेजें",
        trackingTitle: "आपातकालीन बीकन लाइव ट्रैकिंग",
        step1: "एसओएस प्राप्त हुआ",
        step2: "जीपीएस स्थान सत्यापित",
        step3: "जोखिम विश्लेषण पूर्ण",
        step4: "अधिकारियों को सूचित किया गया",
        step5: "बचाव दल नियुक्त किया गया",
        step6: "बचाव दल मार्ग में है",
        step7: "घटना का समाधान पूर्ण",
        sheltersTitle: "आपातकालीन राहत शिविर",
        hospitalsTitle: "आपातकालीन अस्पताल एवं ट्रॉमा सेंटर",
        weatherTitle: "लाइव मौसम विज्ञान टेलीमेट्री",
        riskTitle: "मल्टी-आपदा जोखिम इंजन",
        overallRisk: "कुल जोखिम स्कोर",
        critical: "अति गंभीर (CRITICAL)",
        high: "उच्च (HIGH)",
        moderate: "मध्यम (MODERATE)",
        low: "निम्न (LOW)",
        safeRouteTitle: "अनुशंसित सुरक्षित मार्ग",
        routeAvoids: "खतरों से सुरक्षित",
        eta: "अनुमानित समय",
        distance: "दूरी"
    }
};

let currentLanguage = localStorage.getItem('rescue_language') || 'en';

function getTranslation(key) {
    const langObj = I18N_TRANSLATIONS[currentLanguage] || I18N_TRANSLATIONS['en'];
    return langObj[key] || I18N_TRANSLATIONS['en'][key] || key;
}

function setLanguage(lang) {
    if (!I18N_TRANSLATIONS[lang]) return;
    currentLanguage = lang;
    localStorage.setItem('rescue_language', lang);
    applyTranslations();
}

function toggleLanguage() {
    const nextLang = currentLanguage === 'en' ? 'hi' : 'en';
    setLanguage(nextLang);
}

function applyTranslations() {
    // 1. Update text on all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const translation = getTranslation(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });

    // 2. Update language toggle button label
    const toggleBtn = document.getElementById('lang-toggle-btn');
    if (toggleBtn) {
        toggleBtn.innerHTML = `
            <span class="text-xs font-bold">${currentLanguage === 'en' ? '🌐 हिंदी' : '🌐 English'}</span>
        `;
    }

    // 3. Set HTML lang attribute
    document.documentElement.lang = currentLanguage;
}

window.I18N = {
    get: getTranslation,
    setLanguage,
    toggle: toggleLanguage,
    apply: applyTranslations,
    get current() { return currentLanguage; }
};
