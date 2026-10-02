# RESCUE AI — Google Play Store Listing & Data Safety Dossier

This document provides all verified copy, metadata, questionnaire answers, and technical parameters required for creating and submitting your app on the **Google Play Console** ([play.google.com/console](https://play.google.com/console)).

---

## 1. Store Listing Details

### App Title (Max 30 characters)
```text
RESCUE AI: Emergency SOS
```
*(Alternative: `RESCUE AI — Disaster Rescue`)*

### Short Description (Max 80 characters)
```text
Instant emergency SOS beaconing, disaster triage, and relief coordination.
```

### Full Description (Max 4,000 characters)
```text
RESCUE AI is a mission-critical disaster coordination, emergency triage, and situational awareness platform designed to connect affected citizens, relief shelters, and first responder rescue squads in real time.

When extreme weather, flash floods, seismic events, or structural disasters strike, every second counts. RESCUE AI enables citizens to transmit emergency beacons instantly and allows disaster management authorities (NDRF, State Disaster Response, and local emergency teams) to prioritize casualties and deploy resources efficiently.

KEY FEATURES FOR CITIZENS:
• ONE-TOUCH EMERGENCY SOS BEACON: Instantly transmit your distress call with high-accuracy GPS coordinates, casualty count, and emergency classification.
• HANDS-FREE VOICE-ACTIVATED SOS: Trapped or unable to type? Built-in speech recognition listens for trigger keywords ("SOS", "HELP", "BACHAO") to launch distress beacons hands-free.
• DAMAGE & EVIDENCE UPLOADS: Attach real-time photos and videos of rising waters, collapsed structures, or trapped victims so rescuers know what equipment to bring.
• INTERACTIVE CITIZEN MAP: View nearby operational relief shelters with real-time bed capacity, drinking water, and ration availability.
• LIVE INCIDENT TRACKING: Watch rescue updates in real time as incident commanders acknowledge your distress call and dispatch field teams.
• METEOROLOGY & WEATHER TELEMETRY: Live atmospheric condition monitoring, precipitation tracking, and flood risk advisories.

KEY FEATURES FOR AUTHORITIES & FIRST RESPONDERS:
• TACTICAL COMMAND DASHBOARD: Real-time triage queue prioritizing critical life threats over minor relief requests.
• SQUAD DEPLOYMENT: Direct dispatch and assignment of specialized NDRF and first responder squads.
• COLLABORATIVE INCIDENT TIMELINE: Append operational field notes and track rescue lifecycle from triage to resolution.
• RELIEF SHELTER INVENTORY: Monitor and adjust shelter occupant loads and supply levels dynamically.

DATA PRIVACY & INTEGRITY:
Your safety and civil privacy are paramount. RESCUE AI transmits all emergency data through TLS/HTTPS and encrypted WebSockets. Location coordinates and audio inputs are accessed only for distress dispatch and never sold to third parties or used for commercial advertising.

CRITICAL EMERGENCY NOTICE:
RESCUE AI is an emergency coordination and triage prototype platform. In immediate life-threatening situations, always dial national emergency hotline 112 or NDRF hotline 1078 directly whenever mobile cellular networks are reachable.
```

---

## 2. Categorization & Contact Information

| Field | Value |
|---|---|
| **Application Type** | App |
| **Category** | Medical / Tools / Weather |
| **Tags** | Emergency, Disaster Relief, Navigation, First Aid, SOS, Safety |
| **Support Email** | `satyam@example.com` *(or your official developer email)* |
| **Support Website** | `https://github.com/theredwolf0234-star/disasterrescue` |
| **Privacy Policy URL** | `https://disasterrescue.onrender.com/privacy-policy.html` *(or your hosted domain)* |

---

## 3. Store Graphic Assets

All store graphic assets are prepared and ready in `playstore/assets/`:

1. **App Icon**:
   - Location: `playstore/assets/app_icon_playstore_512.png`
   - Specifications: **512 x 512 px**, 32-bit PNG with alpha channel (< 1 MB).
2. **Feature Graphic**:
   - Location: `playstore/assets/feature_graphic_playstore_1024x500.png`
   - Specifications: **1024 x 500 px**, PNG/JPEG (< 15 MB).
3. **App Launcher Mipmaps**:
   - Automatically generated and placed into `android/app/src/main/res/` (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).

---

## 4. Google Play Console: Data Safety Form Answers

Google Play strictly requires declaring data collection. Use these exact answers:

### A. Location
- **Is Location collected?** Yes.
- **Is it Approximate Location?** Yes.
- **Is it Precise Location?** Yes.
- **Is it processed ephemerally?** No (stored in incident log for rescue verification).
- **Is data required or optional?** Required for emergency dispatch, optional for browsing shelters.
- **Purpose:** App Functionality, Emergency Services & Disaster Rescue Coordination.
- **Is data shared with 3rd parties?** No.

### B. Personal Info
- **Name, Email Address, Phone Number:** Collected for user authentication and emergency contact verification.
- **Purpose:** Account management, emergency contact.
- **Shared?** No.

### C. Audio
- **Is Audio collected?** Yes (Microphone access for hands-free voice SOS keyword detection).
- **Processed ephemerally?** Yes (speech recognition runs locally on device; raw audio is not stored or shared).
- **Purpose:** App Functionality (Voice-activated SOS).

### D. Photos and Videos
- **Photos / Videos:** Collected only when the user voluntarily attaches disaster site evidence to an incident report.
- **Purpose:** App Functionality (Assisting rescuers with structural/flood damage evaluation).

### E. Security Practices
- **Data Encrypted in Transit?** Yes (All network communication uses HTTPS/TLS and WSS).
- **Can users request data deletion?** Yes (Users can request deletion via support contact).

---

## 5. Google Play Console: App Access (Reviewer Test Credentials)

Google reviewers test whether the app functions properly before approving. Provide these exact login credentials in the **App Access** section:

- **Access Type:** "All or some functionality is restricted"
- **Instructions:** "The app has two user roles: Citizen and Emergency Authority. Reviewers may test using the credentials below."
- **Citizen Test Account:**
  - Username/Email: `satyam@example.com`
  - Password: `citizen123`
- **Authority Test Account:**
  - Username: `ndrf_commander`
  - Password: `authority123`

---

## 6. Content Rating (IARC) Questionnaire

- **Violence:** No
- **Sexuality:** No
- **Language / Profanity:** No
- **Controlled Substances:** No
- **Location Sharing:** Yes (Location is shared with designated rescue authorities during an emergency beacon).
- **Expected Rating:** Everyone (PEGI 3, ESRB E).
