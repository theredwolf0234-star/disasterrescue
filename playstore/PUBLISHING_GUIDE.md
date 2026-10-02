# Complete Step-by-Step Guide: Publishing RESCUE AI to the Google Play Store

This comprehensive guide takes you from your current codebase to a live, published app on the **Google Play Store**.

---

## 🌟 Executive Summary of Setup Completed

Your project is now fully configured as a native Android application using **Capacitor 8**:

1. **Android Native Project**: Generated and configured under `android/` with package ID `com.rescueai.disasterrescue`.
2. **Target Android Version**: Configured for `compileSdk 36` / `targetSdk 36` (exceeds Google Play's minimum Android 14 / API 34 requirement).
3. **Android Permissions**: `AndroidManifest.xml` configured with high-accuracy GPS (`ACCESS_FINE_LOCATION`), voice microphone (`RECORD_AUDIO`), camera & photo uploads (`CAMERA`, `READ_MEDIA_IMAGES`), haptics, and notifications.
4. **App Icons & Graphics**:
   - `playstore/assets/app_icon_playstore_512.png` (512x512 PNG for Google Play Console).
   - `playstore/assets/feature_graphic_playstore_1024x500.png` (1024x500 PNG for Google Play Console).
   - Android mipmap launcher icons (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) generated in `android/app/src/main/res/`.
5. **Cryptographic Release Keystore**: Generated at `android/app/rescue-ai-release-key.jks` with a 27-year validity period (10,000 days), configured in `android/key.properties` and Gradle.
6. **Live Backend Connectivity**: `frontend/js/config.js` and `api.js` updated to route native mobile network requests to your live production server (`SERVER_URL`).
7. **Legal Privacy Policy**: Published at `frontend/privacy-policy.html` and linked in application footers to meet Google Play mandatory developer policies.
8. **Automated Cloud CI/CD**: `.github/workflows/build-playstore-aab.yml` created to automatically compile signed `.aab` bundles directly on GitHub with zero local SDK configuration.

---

## Step 1: Set Your Production Backend URL

In a mobile app installed on a phone, the app runs locally on the device. It cannot reach `http://localhost:5000`. It needs to talk to your live deployed backend server (e.g. deployed on Render, Railway, AWS, or your VPS).

1. Open `frontend/js/config.js`.
2. Set `SERVER_URL` to your live backend domain:
   ```javascript
   window.RESCUE_CONFIG = {
       SERVER_URL: 'https://your-deployed-service.onrender.com', // Replace with your live backend
       APP_NAME: 'RESCUE AI',
       VERSION: '1.0.0'
   };
   ```
3. Whenever you modify files in `frontend/`, sync them into the Android native wrapper:
   ```bash
   npm run app:sync
   ```

---

## Step 2: Build the Signed Android App Bundle (`.aab`)

Google Play requires all new apps to be submitted in the **Android App Bundle (`.aab`)** format.

You have two simple ways to build your signed `.aab`:

### Option A: Automated Cloud Build via GitHub Actions (Recommended — Zero Local Setup!)

Because this repository is connected to GitHub (`https://github.com/theredwolf0234-star/disasterrescue.git`), a GitHub Actions workflow is already set up at `.github/workflows/build-playstore-aab.yml`.

1. Commit and push your changes to GitHub:
   ```bash
   git add .
   git commit -m "Configure Android app and Play Store release assets"
   git push origin main
   ```
2. Navigate to your GitHub repository in your browser:
   `https://github.com/theredwolf0234-star/disasterrescue/actions`
3. Click on the workflow: **"Build Android App & Play Store Bundle (AAB)"**.
4. Click **"Run workflow"** (or let it run automatically on push).
5. Once the build finishes (~2 minutes), scroll to the **Artifacts** section at the bottom of the run page.
6. Download **`rescue-ai-playstore-bundle-aab`**. Unzip it to find your signed `app-release.aab` ready for upload to Google Play Console!

---

### Option B: Local Build via Android Studio

If you prefer building locally:

1. Download and install [Android Studio](https://developer.android.com/studio).
2. Open Android Studio and select **Open**, then choose the `android` folder:
   `c:\Users\satyam pathak\OneDrive\Documents\LUCKNOW\android`
3. Wait for Gradle sync to complete. (Android Studio automatically uses its bundled JDK 17).
4. In the top menu, go to **Build** → **Generate Signed Bundle / APK...**.
5. Select **Android App Bundle** and click **Next**.
6. Provide the keystore information:
   - **Key store path**: Browse to `android/app/rescue-ai-release-key.jks`.
   - **Key store password**: `rescueai2026secure`
   - **Key alias**: `rescueai`
   - **Key password**: `rescueai2026secure`
7. Select **release** build variant and click **Finish**.
8. Android Studio will generate the signed `.aab` at:
   `android/app/build/outputs/bundle/release/app-release.aab`.

---

## Step 3: Register Your Google Play Developer Account

1. Go to the [Google Play Console](https://play.google.com/console/signup).
2. Sign in with your Google account.
3. Choose your account type:
   - **Personal Account**: Requires a $25 one-time registration fee. (Note: Google requires personal accounts created after Nov 2023 to test with 12 testers for 14 days before production release).
   - **Organization Account**: Requires a D-U-N-S number, but does not have the 14-day tester holding period.
4. Pay the one-time $25 USD registration fee.
5. Complete identity verification (government ID and address verification as requested by Google).

---

## Step 4: Create Your App in Google Play Console

1. On the Play Console Home Dashboard, click **Create app**.
2. Fill in the initial details:
   - **App name**: `RESCUE AI: Emergency SOS`
   - **Default language**: English (United States) or English (India)
   - **App or game**: App
   - **Free or paid**: Free
3. Accept the Declarations (Developer Program Policies & US export laws) and click **Create app**.

---

## Step 5: Complete the "Set up your app" Tasks (Dashboard)

On your app dashboard, work through the mandatory tasks under **Set up your app**:

### 1. Privacy Policy
- Paste the live URL where `frontend/privacy-policy.html` is accessible on the internet:
  e.g. `https://disasterrescue.onrender.com/privacy-policy.html`

### 2. App Access (Reviewer Credentials)
- Select: **"All or some functionality is restricted"** → **Add instructions**:
  - Name: `Citizen and Authority Accounts`
  - Username: `satyam@example.com`
  - Password: `citizen123`
  - Notes: `Authority account credentials: ndrf_commander / authority123`

### 3. Ads
- Select: **"No, my app does not contain ads"**.

### 4. Content Rating (IARC)
- Enter your email address.
- Select category: **Utility, Productivity, Communication or Other**.
- Answer the questionnaire: Select "No" to violence, offensive language, controlled substances, etc.
- In Location Sharing: Select "Yes" (shares coordinates with emergency response services).
- Click **Save** → **Next** → **Submit**.

### 5. Target Audience
- Select target age: **18 and over** (and 13–17 if desired).
- Neutral appeal: "No, the app is not designed specifically for children."

### 6. News Apps & Government Apps
- Select "No" (Not an official news app, and not an official government entity).

### 7. Data Safety Section
Use the pre-filled answers from `playstore/PLAYSTORE_LISTING.md`:
- **Location**: Approximate and Precise (Emergency dispatch & relief shelter navigation).
- **Personal Info**: Name, email, phone (Account management & verification).
- **Photos / Videos**: Optional user evidence uploads.
- **Audio**: Speech recognition keyword trigger.
- **Security**: All data is encrypted in transit via HTTPS/WSS.

---

## Step 6: Create the Main Store Listing

Go to **Grow** → **Store presence** → **Main store listing**:

1. **App Title**: `RESCUE AI: Emergency SOS`
2. **Short description**:
   `Instant emergency SOS beaconing, disaster triage, and relief coordination.`
3. **Full description**:
   Copy the complete description from `playstore/PLAYSTORE_LISTING.md`.
4. **App Icon**: Upload `playstore/assets/app_icon_playstore_512.png` (512x512).
5. **Feature Graphic**: Upload `playstore/assets/feature_graphic_playstore_1024x500.png` (1024x500).
6. **Phone Screenshots**: Upload at least 2 screenshots of the app. (You can take screenshots of `index.html` on your phone or in Chrome DevTools Device Mode).

---

## Step 7: Upload Your `.aab` and Submit for Review

### For Personal Developer Accounts (14-day Closed Testing Requirement):
1. In the left navigation, go to **Testing** → **Closed testing**.
2. Click **Create track** or select the default closed testing track.
3. Click **Create new release**:
   - Upload your `app-release.aab`.
   - Release name: `1.0.0 (1)`.
   - Release notes: `Initial release of RESCUE AI emergency triage platform.`
4. In the **Testers** tab, create an email list with at least 12 tester emails (friends, family, colleagues).
5. Share the opt-in link with your testers. Once they opt in and have the app installed for 14 days, Google enables the "Apply for Production" button.

### For Organization Accounts (or Production Track):
1. In the left navigation, go to **Release** → **Production**.
2. Click **Create new release**.
3. Upload your `app-release.aab`.
4. Review release details and click **Save** → **Review release**.
5. Click **Start rollout to Production**!

Google's review team typically approves new apps within **24 to 72 hours**. Once approved, RESCUE AI will be live on Google Play worldwide!

---

## Quick Reference: Future App Updates

When you make improvements to the app in the future:
1. Increment `versionCode` (e.g. `2`) and `versionName` (e.g. `"1.0.1"`) in `android/app/build.gradle`.
2. Run `npm run app:sync` to sync web code to Android.
3. Push to GitHub to generate the new `.aab` via GitHub Actions.
4. Upload the new `.aab` to Play Console and roll out!
