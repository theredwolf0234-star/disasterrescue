/**
 * Comprehensive Voice SOS Module for RESCUE AI
 * Features:
 * - Real MediaRecorder microphone recording (start, stop, preview playback, blob export)
 * - Automatic attachment of recorded voice audio to incident dispatch (evidence payload)
 * - Pre-recorded / synthesized AI voice audio: "It's an emergency, I need help."
 * - Instant 1-Click Send Voice SOS (zero delay dispatch)
 * - SpeechRecognition live continuous transcription (where supported)
 * - Clear error handling when microphone access is denied or unavailable
 */

class VoiceSOSEngine {
    constructor() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.isSpeechSupported = !!SpeechRec;
        this.recognition = this.isSpeechSupported ? new SpeechRec() : null;
        this.isTranscribing = false;
        this.fullTranscript = '';

        // MediaRecorder real audio recording state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordedAudioBlob = null;
        this.recordedAudioUrl = null;
        this.isAudioRecording = false;
        this.recordingTimer = null;
        this.recordingSeconds = 0;

        this.aiAudioPlayer = new Audio('assets/emergency_voice.wav');

        if (this.isSpeechSupported) {
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isTranscribing = true;
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
                this.isTranscribing = false;
                this.updateUI();
            };

            this.recognition.onend = () => {
                this.isTranscribing = false;
                this.updateUI();
            };
        }
    }

    /**
     * Start live audio recording via navigator.mediaDevices.getUserMedia & MediaRecorder
     */
    async startAudioRecording() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Audio recording is not supported in this browser.', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];

            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
                else mimeType = '';
            }

            const options = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const finalMime = mimeType || 'audio/webm';
                this.recordedAudioBlob = new Blob(this.audioChunks, { type: finalMime });
                if (this.recordedAudioUrl) URL.revokeObjectURL(this.recordedAudioUrl);
                this.recordedAudioUrl = URL.createObjectURL(this.recordedAudioBlob);

                // Stop all tracks in stream
                stream.getTracks().forEach(track => track.stop());

                this.renderRecordedAudioPlayer();
                showToast(`Voice recording captured (${this.recordingSeconds}s). Ready for dispatch.`, 'success');
            };

            this.mediaRecorder.start(250); // Slice every 250ms
            this.isAudioRecording = true;
            this.recordingSeconds = 0;

            this.updateAudioRecordingUI(true);

            this.recordingTimer = setInterval(() => {
                this.recordingSeconds++;
                this.updateRecordingTimerUI();
            }, 1000);

            // Also start speech-to-text dictation if supported
            if (this.isSpeechSupported && !this.isTranscribing) {
                try { this.recognition.start(); } catch (_) {}
            }

        } catch (err) {
            console.error('[Voice SOS] Microphone permission error:', err);
            let msg = 'Unable to access microphone. Please enable microphone permissions in your browser.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = 'Microphone permission denied by user. Please grant access in browser settings.';
            } else if (err.name === 'NotFoundError') {
                msg = 'No microphone device found on this system.';
            }
            showToast(msg, 'error');
            this.renderAudioError(msg);
        }
    }

    /**
     * Stop live audio recording
     */
    stopAudioRecording() {
        if (this.mediaRecorder && this.isAudioRecording) {
            this.mediaRecorder.stop();
            this.isAudioRecording = false;
        }

        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.isSpeechSupported && this.isTranscribing) {
            try { this.recognition.stop(); } catch (_) {}
        }

        this.updateAudioRecordingUI(false);
    }

    updateRecordingTimerUI() {
        const timerEl = document.getElementById('voice-recording-timer');
        if (timerEl) {
            const mins = String(Math.floor(this.recordingSeconds / 60)).padStart(2, '0');
            const secs = String(this.recordingSeconds % 60).padStart(2, '0');
            timerEl.textContent = `REC ${mins}:${secs}`;
        }
    }

    updateAudioRecordingUI(isRec) {
        const startBtn = document.getElementById('btn-start-voice-rec');
        const stopBtn = document.getElementById('btn-stop-voice-rec');
        const statusEl = document.getElementById('voice-recording-status');

        if (startBtn && stopBtn) {
            if (isRec) {
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
            } else {
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
            }
        }

        if (statusEl) {
            if (isRec) {
                statusEl.innerHTML = `
                    <div class="flex items-center space-x-2 text-red-400 font-bold animate-pulse">
                        <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                        <span id="voice-recording-timer">REC 00:00</span>
                        <span class="text-xs text-slate-300 font-normal">• Speak your emergency details clearly...</span>
                    </div>
                `;
            } else if (this.recordedAudioBlob) {
                statusEl.innerHTML = `
                    <div class="text-xs text-emerald-400 font-semibold flex items-center space-x-1.5">
                        <span>✓ Audio captured (${(this.recordedAudioBlob.size / 1024).toFixed(1)} KB)</span>
                    </div>
                `;
            }
        }
    }

    renderRecordedAudioPlayer() {
        const container = document.getElementById('voice-player-container');
        if (!container || !this.recordedAudioUrl) return;

        container.innerHTML = `
            <div class="bg-slate-950 p-3 rounded-xl border border-purple-800/60 space-y-2 mt-2">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-slate-200 flex items-center space-x-1">
                        <i data-lucide="headphones" class="w-3.5 h-3.5 text-purple-400"></i>
                        <span>Recorded Voice SOS Preview</span>
                    </span>
                    <button type="button" onclick="voiceEngine.clearRecording()" class="text-red-400 hover:text-red-300 text-[11px] underline">Discard</button>
                </div>
                <audio controls src="${this.recordedAudioUrl}" class="w-full h-8 rounded opacity-90 focus:outline-none"></audio>
                <p class="text-[10px] text-slate-400">✓ This audio recording will be automatically uploaded with your SOS beacon.</p>
            </div>
        `;
        container.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    renderAudioError(msg) {
        const statusEl = document.getElementById('voice-recording-status');
        if (statusEl) {
            statusEl.innerHTML = `
                <div class="p-2.5 bg-red-950/60 border border-red-800 text-red-300 rounded-xl text-xs">
                    ⚠️ ${msg}
                </div>
            `;
        }
    }

    clearRecording() {
        this.recordedAudioBlob = null;
        if (this.recordedAudioUrl) {
            URL.revokeObjectURL(this.recordedAudioUrl);
            this.recordedAudioUrl = null;
        }
        const container = document.getElementById('voice-player-container');
        if (container) {
            container.innerHTML = '';
            container.classList.add('hidden');
        }
        const statusEl = document.getElementById('voice-recording-status');
        if (statusEl) statusEl.innerHTML = '';
        showToast('Voice recording cleared.', 'info');
    }

    /**
     * Plays the AI pre-recorded audio saying: "It's an emergency, I need help."
     */
    playEmergencyAudio() {
        showToast("Playing AI Emergency Voice: \"It's an emergency, I need help.\"", 'info');

        this.aiAudioPlayer.play().catch(() => {
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

            this.playEmergencyAudio();

            const coords = typeof getUserCoordinates === 'function' ? getUserCoordinates() : [26.8467, 80.9462];
            const voiceText = "VOICE SOS TRANSMISSION: It's an emergency, I need help. Immediate emergency assistance and medical rescue triage requested.";

            let res;
            if (this.recordedAudioBlob) {
                const formData = new FormData();
                formData.append('category', 'Medical Emergency');
                formData.append('count', '1');
                formData.append('details', voiceText + (this.fullTranscript ? ` (Dictated: ${this.fullTranscript})` : ''));
                formData.append('latitude', coords[0].toString());
                formData.append('longitude', coords[1].toString());
                formData.append('evidence', this.recordedAudioBlob, 'voice-sos.webm');
                res = await api.postMultipart('/api/incidents', formData);
            } else {
                const payload = {
                    category: 'Medical Emergency',
                    count: 1,
                    details: voiceText,
                    latitude: coords[0],
                    longitude: coords[1]
                };
                res = await api.post('/api/incidents', payload);
            }

            if (!res.success) throw new Error(res.message || 'Failed to dispatch voice SOS');

            const incident = res.data.incident || res.data;
            window.activeIncidentId = incident.id;
            showToast(`⚡ Instant Voice SOS Dispatched! Incident ID: ${incident.id}`, 'success');

            if (typeof fetchCitizenReports === 'function') {
                await fetchCitizenReports();
            }

            if (typeof showDispatchSuccessModal === 'function') {
                showDispatchSuccessModal(incident);
            }

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
        if (!this.isSpeechSupported) {
            showToast('Speech recognition not supported. You can use the Voice Recorder to record audio directly.', 'info');
            if (!this.isAudioRecording) this.startAudioRecording();
            else this.stopAudioRecording();
            return;
        }

        if (this.isTranscribing) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (!this.isSpeechSupported) return;
        try {
            this.fullTranscript = '';
            this.recognition.start();
        } catch (e) {
            console.warn('[Voice SOS] Start error:', e);
        }
    }

    stop() {
        if (!this.isSpeechSupported) return;
        try {
            this.recognition.stop();
        } catch (e) {
            console.warn('[Voice SOS] Stop error:', e);
        }
    }

    updateUI() {
        const btnText = document.getElementById('voice-btn-text');
        if (btnText) {
            btnText.innerText = this.isTranscribing ? 'Listening... Speak details' : 'Record Custom Voice SOS (Hands-Free)';
        }
    }

    renderTranscript(text) {
        const transEl = document.getElementById('voice-transcription');
        if (transEl) {
            transEl.innerHTML = `<span class="text-purple-300 font-semibold">🎙️ Transcribed:</span> ${text}`;
        }
        const textarea = document.getElementById('sos-details');
        if (textarea && text) {
            textarea.value = text;
        }
    }
}

const voiceEngine = new VoiceSOSEngine();
window.voiceEngine = voiceEngine;
