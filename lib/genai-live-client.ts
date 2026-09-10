/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import EventEmitter from 'eventemitter3';
import { DEFAULT_LIVE_API_MODEL } from './constants';
import { LiveConnectConfig, LiveServerContent, LiveServerToolCall, LiveServerToolCallCancellation } from '@google/genai';
import { localSTT } from './local-stt';
import { ollamaTranslator } from './ollama-translator';
import { supertonicTTS } from './supertonic-tts';
import { useSettings } from './state';

export interface StreamingLog {
  count?: number;
  data?: unknown;
  date: Date;
  message: string | object;
  type: string;
}

export interface LiveClientEventTypes {
  audio: (data: ArrayBuffer) => void;
  close: (event?: CloseEvent) => void;
  content: (data: LiveServerContent) => void;
  error: (e: ErrorEvent) => void;
  interrupted: () => void;
  log: (log: StreamingLog) => void;
  open: () => void;
  setupcomplete: () => void;
  toolcall: (toolCall: LiveServerToolCall) => void;
  toolcallcancellation: (toolcallCancellation: LiveServerToolCallCancellation) => void;
  turncomplete: () => void;
  inputTranscription: (text: string, isFinal: boolean) => void;
  outputTranscription: (text: string, isFinal: boolean) => void;
}

/**
 * Local Realtime Streaming Live Client
 * Powered by:
 * - Local STT: streaming continuous speech-to-text
 * - Ollama Gemma 3 1B: lightweight edge/mobile LLM translator
 * - Supertonic 3: on-device multilingual TTS with full Dutch (Flemish) support
 */
export class GenAILiveClient {
  private readonly emitter = new EventEmitter<LiveClientEventTypes>();

  public on = this.emitter.on.bind(this.emitter);
  public off = this.emitter.off.bind(this.emitter);

  public model: string = DEFAULT_LIVE_API_MODEL;
  private _status: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  public get status() {
    return this._status;
  }

  private isTranslating: boolean = false;
  private lastTranscribedText: string = '';

  constructor(apiKey?: string, model?: string) {
    if (model) this.model = model;
    // Set Supertonic voice from state if available
    const state = useSettings.getState();
    if (state.voice) {
      supertonicTTS.setVoice(state.voice);
    }
    if (state.prosodyProfile) {
      supertonicTTS.setProsodyProfile(state.prosodyProfile);
    }
  }

  public async connect(config?: LiveConnectConfig): Promise<boolean> {
    if (this._status === 'connected' || this._status === 'connecting') {
      return false;
    }

    this._status = 'connecting';
    this.log('client.connect', 'Starting Local STT, Gemma 3 Ollama, and Supertonic 3 TTS...');

    try {
      const state = useSettings.getState();
      ollamaTranslator.setEndpoint(state.ollamaEndpoint || 'http://localhost:11434');
      ollamaTranslator.setModel(state.model || 'gemma3:1b');
      supertonicTTS.setVoice(state.voice || 'F1');
      supertonicTTS.setProsodyProfile(state.prosodyProfile || 'balanced');

      // Check Ollama connection in background (non-blocking)
      ollamaTranslator.checkHealth().then(res => {
        if (!res.ok) {
          console.warn('Ollama check note:', res.error);
        } else {
          this.log('ollama.status', `Connected to Ollama with model ${this.model}`);
        }
      });

      // Configure Multilingual Realtime STT with Language 1 and Language 2
      localSTT.setLanguages(
        state.language1 || 'Dutch (Flemish)',
        state.language2 || 'English (US)',
        state.autoDetect
      );

      // Start Multilingual Local STT streaming with realtime language detection
      localSTT.start(
        (text: string, isFinal: boolean) => {
          this.handleSTTResult(text, isFinal);
        },
        (detection) => {
          if (state.autoDetect && detection) {
            if (detection.direction === 'guest-to-staff' && detection.name !== state.language2) {
              this.emitter.emit('toolcall', {
                functionCalls: [
                  {
                    id: `call_${Date.now()}`,
                    name: 'setGuestLanguage',
                    args: { language: detection.name },
                  },
                ],
              });
            }
          }
        },
        (err: any) => {
          console.warn('LocalSTT event:', err);
        }
      );

      this._status = 'connected';
      this.emitter.emit('open');
      this.emitter.emit('setupcomplete');
      this.log('client.open', 'Realtime streaming translation active.');
      return true;
    } catch (e: any) {
      console.error('Error connecting to local pipeline:', e);
      this._status = 'disconnected';
      const errorEvent = new ErrorEvent('error', {
        error: e,
        message: e?.message || 'Failed to initialize local translator.',
      });
      this.emitter.emit('error', errorEvent);
      return false;
    }
  }

  public disconnect(): boolean {
    localSTT.stop();
    ollamaTranslator.abort();
    supertonicTTS.cancel();

    this._status = 'disconnected';
    this.isTranslating = false;
    this.emitter.emit('close');
    this.log('client.close', 'Disconnected local translator session.');
    return true;
  }

  public sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>) {
    // Microphone audio chunks passed from AudioRecorder.
    // Forward audio chunk to localSTT for real-time VAD processing and transcription
    for (const chunk of chunks) {
      if (chunk?.data) {
        localSTT.feedAudioChunk(chunk.data);
      }
    }
  }

  public send(parts: any, turnComplete: boolean = true) {
    const textPart = Array.isArray(parts) ? parts.find((p: any) => p.text)?.text : parts?.text;
    if (textPart) {
      this.handleSTTResult(textPart, true);
    }
  }

  public sendToolResponse(toolResponse: any) {
    this.log('client.toolResponse', { toolResponse });
  }

  /**
   * Processes speech-to-text transcripts and routes them to Gemma 3 1B translator
   */
  private async handleSTTResult(text: string, isFinal: boolean) {
    const cleanText = text.trim();
    if (!cleanText) return;

    // Emit live transcription for real-time UI display
    this.emitter.emit('inputTranscription', cleanText, isFinal);

    // Only trigger LLM translation when an utterance is finalized or complete
    if (!isFinal) {
      return;
    }

    if (this.isTranslating) {
      // Allow slight gap or queue
      await new Promise(r => setTimeout(r, 100));
    }

    this.lastTranscribedText = cleanText;
    this.isTranslating = true;

    const state = useSettings.getState();
    const staffLang = state.language1 || 'Dutch (Flemish)';
    const guestLang = state.language2 || 'English (US)';
    const autoDetect = state.autoDetect;
    const medicalMode = state.medicalMode;
    const topic = state.topic;

    // Determine translation direction using multilingual STT detection
    const sttDetection = localSTT.detectLanguage(cleanText);
    const isDutchInput = sttDetection
      ? sttDetection.direction === 'staff-to-guest'
      : this.isDutchFlemish(cleanText, staffLang);

    let sourceLang = isDutchInput ? staffLang : (sttDetection?.name || guestLang);
    let targetLang = isDutchInput ? guestLang : staffLang;

    // Handle auto-detection of guest language switch
    if (autoDetect && !isDutchInput) {
      const detected = sttDetection?.name || this.detectLanguageFromText(cleanText);
      if (detected && detected !== guestLang) {
        this.emitter.emit('toolcall', {
          functionCalls: [
            {
              id: `call_${Date.now()}`,
              name: 'setGuestLanguage',
              args: { language: detected },
            },
          ],
        });
        sourceLang = detected;
      }
    }

    // Sync Supertonic voice & prosody
    supertonicTTS.setVoice(state.voice || 'F1');
    supertonicTTS.setProsodyProfile(state.prosodyProfile || 'balanced');

    let fullTranslation = '';

    try {
      await ollamaTranslator.translateStream(
        cleanText,
        {
          model: state.model || 'gemma3:1b',
          endpoint: state.ollamaEndpoint || 'http://localhost:11434',
          sourceLang,
          targetLang,
          isMedicalMode: medicalMode,
          topic,
        },
        {
          onToken: (token: string) => {
            fullTranslation += token;
            this.emitter.emit('outputTranscription', token, false);
            this.emitter.emit('content', {
              modelTurn: {
                parts: [{ text: token }],
              },
            });
          },
          onLanguageDetected: (lang: string) => {
            if (autoDetect && lang !== guestLang) {
              this.emitter.emit('toolcall', {
                functionCalls: [
                  {
                    id: `call_${Date.now()}`,
                    name: 'setGuestLanguage',
                    args: { language: lang },
                  },
                ],
              });
            }
          },
          onComplete: async (result: string) => {
            const finalResult = result || fullTranslation;
            this.emitter.emit('outputTranscription', '', true);

            // Synthesize real-time audio with Supertonic 3 (supporting Dutch Flemish and 31 languages)
            await supertonicTTS.synthesizeStream(
              finalResult,
              targetLang,
              (audioChunk: ArrayBuffer) => {
                this.emitter.emit('audio', audioChunk);
              },
              () => {
                this.emitter.emit('turncomplete');
              }
            );

            this.isTranslating = false;
          },
          onError: (err: any) => {
            console.error('Translation error:', err);
            this.emitter.emit('turncomplete');
            this.isTranslating = false;
          },
        }
      );
    } catch (err: any) {
      console.error('Translation pipeline error:', err);
      this.emitter.emit('turncomplete');
      this.isTranslating = false;
    }
  }

  private isDutchFlemish(text: string, staffLang: string): boolean {
    const lowerStaff = staffLang.toLowerCase();
    if (!lowerStaff.includes('dutch') && !lowerStaff.includes('flemish')) {
      return false;
    }
    const lower = text.toLowerCase();
    // High-frequency Dutch/Flemish words
    const dutchMarkers = /\b(ik|je|jij|u|uw|wij|we|het|de|een|van|in|is|dat|niet|op|met|voor|als|er|maar|om|heb|hebt|heeft|hallo|goedendag|alstublieft|dank|arts|pijn|hoofdpijn|dokter|medicijn|koorts)\b/i;
    return dutchMarkers.test(lower);
  }

  private detectLanguageFromText(text: string): string | null {
    const lower = text.toLowerCase();
    if (/\b(po|opo|kamusta|salamat|bakit|ano|hindi|oo|mabuti|ako|ikaw|dito)\b/i.test(lower)) {
      return 'Tagalog (Filipino)';
    }
    if (/\b(hola|gracias|por favor|buenos|como|esta|estoy|usted|doctor)\b/i.test(lower)) {
      return 'Spanish';
    }
    if (/\b(bonjour|merci|s'il vous plait|comment|allez|vous|oui|non|je|suis)\b/i.test(lower)) {
      return 'French';
    }
    if (/\b(guten tag|danke|bitte|wie|geht|ich|habe|schmerzen|arzt)\b/i.test(lower)) {
      return 'German';
    }
    if (/\b(hello|hi|please|thank you|how are you|i have|doctor|pain)\b/i.test(lower)) {
      return 'English (US)';
    }
    return null;
  }

  protected log(type: string, message: string | object) {
    this.emitter.emit('log', {
      type,
      message,
      date: new Date(),
    });
  }
}
