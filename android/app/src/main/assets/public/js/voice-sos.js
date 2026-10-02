/**
 * Single, Robust Vanilla Web Speech API Voice SOS Module for RESCUE AI
 * Features:
 * - Pre-recorded / synthesized AI voice audio: "It's an emergency, I need help."
 * - Instant 1-Click Send Voice SOS (zero delay dispatch)
 * - Live microphone SpeechRecognition continuous transcription
 */

class VoiceSOSEngine {
    constructor() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.isSupported = !!SpeechRec;
        this.recognition = this.isSupported ? new SpeechRec() : null;
        this.isRecording = false;
        this.fullTranscript = '';
        this.audioPlayer = new Audio('assets/emergency_voice.wav');

        if (this.isSupported) {
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.updateUI();
            };

            this.recognition.onresult = (event) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        this.fullTranscript += (this.fullTranscript ? ' ' : '') + event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                this.renderTranscript(this.fullTranscript + (interim ? ` (${interim}...)` : ''));
            };

            this.recognition.onerror = (event) => {
                console.warn('[Voice SOS] Speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    showToast('Microphone access was denied. Please allow microphone permissions in your browser.', 'error');
                }
                this.isRecording = false;
                this.updateUI();
            };

            this.recognition.onend = () => {
                this.isRecording = false;
                this.updateUI();
            };
        }
    }

    /**
     * Plays the AI pre-recorded audio saying: "It's an emergency, I need help."
     */
    playEmergencyAudio() {
        showToast("Playing AI Emergency Voice: \"It's an emergency, I need help.\"", 'info');

        // Try playing recorded WAV file
        this.audioPlayer.play().catch(() => {
            // Fallback to browser SpeechSynthesis if audio autoplay is restricted
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance("It's an emergency, I need help.");
                utterance.rate = 0.95;
                utterance.pitch = 1.0;
                window.speechSynthesis.speak(utterance);
            }
        });
    }

    /**
     * Instant 1-Click Voice SOS Dispatch
     * Dispatches emergency signal immediately with pre-recorded voice transcript without delay.
     */
    async instantSendVoiceSOS() {
        const btn = document.getElementById('btn-instant-voice-sos');
        const originalText = btn ? btn.innerHTML : '⚡ Send Instant Voice SOS';

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `
                    <span class="inline-flex items-center space-x-2">
                        <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>DISPATCHING VOICE SOS TO COMMAND HQ...</span>
                    </span>
                `;
            }

            // Play the emergency audio
            this.playEmergencyAudio();

            // Obtain coordinates
            const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];

            const voiceText = "VOICE SOS TRANSMISSION: It's an emergency, I need help. Immediate emergency assistance and medical rescue triage requested.";

            const payload = {
                category: 'Medical Emergency',
                count: 1,
                details: voiceText,
                latitude: coords[0],
                longitude: coords[1]
            };

            const res = await api.post('/api/incidents', payload);

            if (!res.success) throw new Error(res.message || 'Failed to dispatch voice SOS');

            const incident = res.data.incident || res.data;
            window.activeIncidentId = incident.id;
            showToast(`⚡ Instant Voice SOS Dispatched! Incident ID: ${incident.id}`, 'success');

            // Render on active reports and map
            if (typeof fetchCitizenReports === 'function') {
                await fetchCitizenReports();
            }

            // Show confirmation popup with incident ID
            if (typeof showDispatchSuccessModal === 'function') {
                showDispatchSuccessModal(incident);
            }

            // Switch to reports tab
            if (typeof switchTab === 'function') {
                switchTab('reports');
            }

        } catch (err) {
            console.error('Instant Voice SOS failed:', err);
            showToast(err.message || 'Failed to dispatch voice SOS. Check network connection.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    toggle() {
        if (!this.isSupported) {
            showToast('Voice speech recognition is not supported in this browser. Please use Chrome, Edge, or enter text manually.', 'warning');
            return;
        }

        if (this.isRecording) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (!this.isSupported || this.isRecording) return;
        try {
            this.recognition.start();
        } catch (e) {
            console.error('[Voice SOS] Failed to start:', e);
        }
    }

    stop() {
        if (!this.isSupported || !this.isRecording) return;
        try {
            this.recognition.stop();
        } catch (e) {
            console.error('[Voice SOS] Failed to stop:', e);
        }
    }

    clear() {
        this.fullTranscript = '';
        this.renderTranscript('');
    }

    applyToDetails() {
        if (!this.fullTranscript.trim()) {
            showToast('No speech has been transcribed yet.', 'warning');
            return;
        }

        const detailsInput = document.getElementById('sos-details');
        if (detailsInput) {
            const current = detailsInput.value.trim();
            detailsInput.value = current ? `${current}\n[Voice Audio]: ${this.fullTranscript}` : this.fullTranscript;
            showToast('Transcribed speech applied to emergency situation details.', 'success');
        }

        // Open SOS modal if not already open
        const modal = document.getElementById('sos-modal');
        if (modal) modal.classList.remove('hidden');
    }

    renderTranscript(text) {
        const box = document.getElementById('voice-transcription');
        if (!box) return;

        if (text) {
            box.innerHTML = `
                <div class="flex items-center justify-between mb-1 text-[11px] text-purple-300 font-bold">
                    <span>Captured Transcript:</span>
                    <button onclick="voiceEngine.clear()" class="text-red-400 hover:text-red-300 text-[10px] underline">Clear</button>
                </div>
                <p class="text-white font-medium text-xs leading-relaxed italic">"${text}"</p>
                <div class="mt-2.5 flex items-center space-x-2">
                    <button onclick="voiceEngine.applyToDetails()" class="flex-grow bg-purple-700 hover:bg-purple-600 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] flex items-center justify-center space-x-1 transition shadow">
                        <span>Insert into SOS Form →</span>
                    </button>
                    <button onclick="voiceEngine.instantSendVoiceSOS()" class="bg-red-700 hover:bg-red-600 text-white font-extrabold py-1.5 px-3 rounded-lg text-[11px] flex items-center justify-center space-x-1 transition shadow">
                        <span>⚡ Send Now</span>
                    </button>
                </div>
            `;
        } else {
            box.innerHTML = `
                <div class="text-[11px] text-slate-400">
                    <p>Pre-recorded AI distress phrase stored: <strong class="text-purple-300">"It's an emergency, I need help."</strong></p>
                    <div class="mt-2 flex items-center space-x-2">
                        <button onclick="voiceEngine.playEmergencyAudio()" class="text-purple-400 hover:text-purple-300 text-[11px] font-bold underline flex items-center space-x-1">
                            <span>▶ Listen to Audio</span>
                        </button>
                        <span class="text-slate-600">|</span>
                        <button onclick="voiceEngine.instantSendVoiceSOS()" class="text-red-400 hover:text-red-300 text-[11px] font-bold underline flex items-center space-x-1">
                            <span>⚡ Dispatch Audio SOS Immediately</span>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    updateUI() {
        const btn = document.getElementById('btn-voice-rec');
        const textSpan = document.getElementById('voice-btn-text');
        if (!btn || !textSpan) return;

        if (!this.isSupported) {
            textSpan.innerText = 'Voice Not Supported In Browser';
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            return;
        }

        if (this.isRecording) {
            textSpan.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block mr-1.5"></span>Recording... (Click to Stop)';
            btn.className = 'w-full bg-red-950/80 border border-red-600 text-red-200 font-bold py-2 rounded-xl text-xs mb-2 flex items-center justify-center transition shadow-lg shadow-red-950/50';
        } else {
            textSpan.innerText = this.fullTranscript ? 'Continue Recording Speech' : 'Record Custom Voice SOS (Hands-Free)';
            btn.className = 'w-full bg-slate-950 hover:bg-slate-800 border border-slate-700 text-purple-300 font-bold py-2 rounded-xl text-xs mb-2 flex items-center justify-center space-x-1.5 transition';
        }
    }
}

const voiceEngine = new VoiceSOSEngine();
window.voiceEngine = voiceEngine;
