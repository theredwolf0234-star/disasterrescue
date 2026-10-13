const cp = require('child_process');
const aapt = 'C:\\Users\\satyam pathak\\AppData\\Local\\Android\\Sdk\\build-tools\\35.0.0\\aapt.exe';
const apk = 'C:\\Users\\satyam pathak\\OneDrive\\Documents\\LUCKNOW\\AISTER-DisasterRescue-Release.apk';

try {
    const dumpBadging = cp.execSync(`"${aapt}" dump badging "${apk}"`).toString();
    console.log('=== BADGING ===');
    dumpBadging.split('\n').filter(l => 
        l.startsWith('package:') || 
        l.startsWith('sdkVersion:') || 
        l.startsWith('targetSdkVersion:') || 
        l.startsWith('application-label:') ||
        l.startsWith('launchable-activity:') ||
        l.startsWith('uses-permission:')
    ).forEach(l => console.log(l));

    const list = cp.execSync(`"${aapt}" list "${apk}"`).toString();
    const lines = list.split('\r\n').filter(Boolean);
    console.log('\n=== TOTAL ENTRIES ===', lines.length);
    console.log('=== META-INF ===', lines.filter(l => l.startsWith('META-INF')));
    const libs = lines.filter(l => l.startsWith('lib/'));
    console.log('=== NATIVE LIBS (' + libs.length + ') ===', libs);
} catch (e) {
    console.error(e.message);
}
