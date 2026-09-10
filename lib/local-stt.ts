/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Local Multilingual STT - Realtime Streaming Speech-to-Text Engine
 * Features:
 * 1. Native Web Speech Recognition with adaptive language listening & auto-recovery.
 * 2. Live Audio Stream VAD STT fallback (/api/stt/transcribe) powered by 16kHz PCM audio buffers.
 * 3. Real-time language detection across Dutch (Flemish), English, Spanish, Tagalog, etc.
 * 4. Zero-failure fallback: Works across Chrome, Firefox, Safari, Edge, sandboxed iframes, and mobile.
 */

// Extend window for WebKit SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export type STTCallback = (text: string, isFinal: boolean) => void;

export interface STTLanguageDetection {
  code: string;
  name: string;
  flag: string;
  confidence: number;
  direction: 'staff-to-guest' | 'guest-to-staff';
  matchedTokens: string[];
}

export interface LanguageProfile {
  code: string;
  bcp47: string;
  name: string;
  flag: string;
  isStaffDefault?: boolean;
  keywords: string[];
  trigrams: string[];
  scriptRegex?: RegExp;
}

export const SUPPORTED_STT_LANGUAGES: Record<string, LanguageProfile> = {
  nl: {
    code: 'nl-BE',
    bcp47: 'nl-BE',
    name: 'Dutch (Flemish)',
    flag: '🇧🇪',
    isStaffDefault: true,
    keywords: [
      'alstublieft', 'dank', 'dankuwel', 'goedendag', 'goedemorgen', 'goedemiddag', 'hallo',
      'hoe', 'gaat', 'met', 'u', 'ik', 'heb', 'pijn', 'hoofdpijn', 'koorts', 'borst',
      'adem', 'ademen', 'dokter', 'arts', 'medicatie', 'medicijnen', 'onderzoek',
      'voorschrift', 'ja', 'nee', 'graag', 'meneer', 'mevrouw', 'waar', 'wanneer',
      'voelt', 'ziek', 'bloeddruk', 'misselijk', 'duizelig', 'ziekenhuis', 'klachten'
    ],
    trigrams: ['een', 'van', 'het', 'aar', 'oor', 'sch', 'der', 'ver', 'ijk', 'cht', 'ier']
  },
  en: {
    code: 'en-US',
    bcp47: 'en-US',
    name: 'English (US)',
    flag: '🇺🇸',
    keywords: [
      'hello', 'hi', 'morning', 'afternoon', 'doctor', 'please', 'thank', 'thanks',
      'pain', 'headache', 'chest', 'fever', 'cough', 'coughing', 'hurt', 'hurts',
      'feel', 'feeling', 'sick', 'medication', 'medicine', 'pill', 'pills', 'prescription',
      'where', 'what', 'how', 'are', 'you', 'yes', 'no', 'can', 'help', 'breath',
      'breathe', 'dizzy', 'stomach', 'blood', 'pressure', 'hospital', 'symptoms'
    ],
    trigrams: ['the', 'ing', 'and', 'tha', 'ent', 'ion', 'for', 'wit', 'here', 'plea', 'tion']
  },
  es: {
    code: 'es-ES',
    bcp47: 'es-ES',
    name: 'Spanish',
    flag: '🇪🇸',
    keywords: [
      'hola', 'buenos', 'dias', 'días', 'tardes', 'gracias', 'por favor', 'doctor',
      'médico', 'duele', 'dolor', 'cabeza', 'pecho', 'fiebre', 'tos', 'siento',
      'enfermo', 'donde', 'dónde', 'cuando', 'medicamento', 'pastilla', 'pastillas',
      'presion', 'presión', 'respirar', 'estomago', 'estómago', 'ayuda', 'sí', 'no'
    ],
    trigrams: ['que', 'del', 'con', 'por', 'ion', 'est', 'par', 'ado', 'ien', 'res']
  },
  fr: {
    code: 'fr-FR',
    bcp47: 'fr-FR',
    name: 'French',
    flag: '🇫🇷',
    keywords: [
      'bonjour', 'bonsoir', 'merci', 's\'il vous plaît', 'docteur', 'médecin',
      'mal', 'douleur', 'tête', 'poitrine', 'fièvre', 'toux', 'respire', 'respirer',
      'médicament', 'ordonnance', 'ventre', 'estomac', 'vertige', 'tension',
      'oui', 'non', 'comment', 'allez', 'vous', 'je', 'suis'
    ],
    trigrams: ['les', 'des', 'est', 'que', 'our', 'ent', 'ous', 'tio', 'ion', 'ait']
  },
  fil: {
    code: 'fil-PH',
    bcp47: 'fil-PH',
    name: 'Tagalog (Filipino)',
    flag: '🇵🇭',
    keywords: [
      'kamusta', 'kumusta', 'salamat', 'opo', 'po', 'doktor', 'masakit', 'sakit',
      'ulo', 'dibdib', 'lagnat', 'ubo', 'nahihilo', 'hilo', 'tiyan', 'gamot',
      'reseta', 'nahihirapan', 'huminga', 'oo', 'hindi', 'ano', 'saan', 'bakit',
      'magandang', 'umaga', 'hapon', 'ako', 'ikaw', 'siya'
    ],
    trigrams: ['ang', 'mga', 'nga', 'pag', 'ung', 'ing', 'yan', 'ito', 'iya', 'may']
  },
  de: {
    code: 'de-DE',
    bcp47: 'de-DE',
    name: 'German',
    flag: '🇩🇪',
    keywords: [
      'guten', 'tag', 'morgen', 'danke', 'bitte', 'arzt', 'doktor', 'schmerz',
      'schmerzen', 'kopf', 'brust', 'fieber', 'husten', 'atmen', 'medikament',
      'rezept', 'schwindel', 'magen', 'blutdruck', 'hilfe', 'ja', 'nein', 'wie'
    ],
    trigrams: ['und', 'sch', 'ich', 'ein', 'der', 'die', 'das', 'den', 'cht', 'ung']
  },
  it: {
    code: 'it-IT',
    bcp47: 'it-IT',
    name: 'Italian',
    flag: '🇮🇹',
    keywords: [
      'ciao', 'buongiorno', 'grazie', 'per favore', 'dottore', 'male', 'dolore',
      'testa', 'petto', 'febbre', 'tosse', 'respirare', 'medicina', 'farmaco',
      'vertigini', 'stomaco', 'pressione', 'sì', 'no', 'come'
    ],
    trigrams: ['che', 'del', 'non', 'ell', 'ion', 'per', 'con', 'ato', 'ent']
  },
  pt: {
    code: 'pt-PT',
    bcp47: 'pt-PT',
    name: 'Portuguese',
    flag: '🇵🇹',
    keywords: [
      'olá', 'bom dia', 'obrigado', 'por favor', 'médico', 'doutor', 'dor',
      'cabeça', 'peito', 'febre', 'tosse', 'respirar', 'remédio', 'receita',
      'tontura', 'estômago', 'pressão', 'sim', 'não'
    ],
    trigrams: ['que', 'ção', 'par', 'ent', 'com', 'est', 'ado', 'nto']
  },
  ar: {
    code: 'ar-SA',
    bcp47: 'ar-SA',
    name: 'Arabic',
    flag: '🇸🇦',
    keywords: [
      'marhaba', 'shukran', 'tabeeb', 'alam', 'waja', 'raas', 'sadr', 'humma', 'dawa'
    ],
    trigrams: [],
    scriptRegex: /[\u0600-\u06FF]/
  },
  zh: {
    code: 'zh-CN',
    bcp47: 'zh-CN',
    name: 'Chinese',
    flag: '🇨🇳',
    keywords: ['你好', '谢谢', '医生', '疼', '头疼', '发烧', '咳嗽', '吃药'],
    trigrams: [],
    scriptRegex: /[\u4E00-\u9FFF]/
  }
};

/**
 * Creates a valid 16-bit PCM WAV container from raw Int16 samples
 */
export function pcmToWav(samples: Int16Array, sampleRate = 16000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // "RIFF"
  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);
  view.setUint32(4, 36 + samples.length * 2, true);

  // "WAVE"
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);

  // "fmt "
  view.setUint8(12, 0x66);
  view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // 1 channel mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16 bits per sample

  // "data"
  view.setUint8(36, 0x64);
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);
  view.setUint32(40, samples.length * 2, true);

  // Copy sample values
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset + i * 2, samples[i], true);
  }

  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class LocalSTT {
  private recognition: any = null;
  private isRunning: boolean = false;
  private primaryLanguage: string = 'nl-BE';
  private secondaryLanguage: string = 'en-US';
  private primaryName: string = 'Dutch (Flemish)';
  private secondaryName: string = 'English (US)';
  private activeRecognitionLang: string = 'nl-BE';
  private autoDetect: boolean = true;

  // Active STT Engine: 'webspeech' | 'audiovad'
  private activeEngine: 'webspeech' | 'audiovad' = 'webspeech';
  private webSpeechBlocked: boolean = false;

  // Audio VAD Buffering State
  private collectedChunks: Int16Array[] = [];
  private totalBufferedSamples: number = 0;
  private isSpeaking: boolean = false;
  private silenceTimeout: any = null;
  private isTranscribingAudio: boolean = false;

  // Callbacks
  private onTranscriptCallback: STTCallback | null = null;
  private onLanguageDetectedCallback: ((info: STTLanguageDetection) => void) | null = null;
  private onErrorCallback: ((err: any) => void) | null = null;
  private onStatusChangeCallback: ((status: { engine: string; isSpeaking: boolean; isRunning: boolean }) => void) | null = null;

  private shouldRestart: boolean = false;
  private restartTimeout: any = null;
  private lastDetectedLang: string = 'Dutch (Flemish)';

  constructor() {
    this.checkEnvironmentAndInit();
  }

  private checkEnvironmentAndInit() {
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    // Check if running in an iframe where WebSpeech is often blocked
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;

    if (!SpeechRecognition || inIframe) {
      this.webSpeechBlocked = true;
      this.activeEngine = 'audiovad';
      console.log(`[LocalSTT] Initialized in Direct Audio Stream (VAD) mode (inIframe: ${inIframe}, hasWebSpeech: ${!!SpeechRecognition})`);
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.activeRecognitionLang;

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const candidateText = finalTranscript.trim() || interimTranscript.trim();
        if (candidateText && this.autoDetect) {
          const detected = this.detectLanguage(candidateText);
          if (detected) {
            this.lastDetectedLang = detected.name;
            if (this.onLanguageDetectedCallback) {
              this.onLanguageDetectedCallback(detected);
            }
          }
        }

        if (interimTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(interimTranscript.trim(), false);
        }

        if (finalTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(finalTranscript.trim(), true);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }

        console.warn('[LocalSTT] Web Speech API event error:', event.error);

        // If WebSpeech is blocked by browser policy, permissions, or audio collision:
        if (
          event.error === 'not-allowed' ||
          event.error === 'service-not-allowed' ||
          event.error === 'audio-capture' ||
          event.error === 'network'
        ) {
          console.warn('[LocalSTT] Web Speech failed or blocked. Seamlessly routing to Audio Stream VAD.');
          this.webSpeechBlocked = true;
          this.activeEngine = 'audiovad';
          this.notifyStatusChange();
          return;
        }

        if (this.onErrorCallback) {
          this.onErrorCallback(event);
        }
      };

      this.recognition.onend = () => {
        this.isRunning = false;
        if (this.shouldRestart && !this.webSpeechBlocked) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.shouldRestart && !this.webSpeechBlocked) {
              this.startWebSpeech();
            }
          }, 350);
        }
      };
    } catch (e) {
      console.warn('[LocalSTT] SpeechRecognition init failed, falling back to Audio VAD:', e);
      this.webSpeechBlocked = true;
      this.activeEngine = 'audiovad';
    }
  }

  private startWebSpeech() {
    if (!this.recognition || this.webSpeechBlocked) return;
    try {
      this.recognition.lang = this.activeRecognitionLang;
      this.recognition.start();
      this.isRunning = true;
    } catch (err: any) {
      if (err?.name !== 'InvalidStateError') {
        console.warn('[LocalSTT] Web Speech start error:', err);
      }
    }
  }

  /**
   * Feed raw Int16 PCM samples directly from AudioRecorder worklet.
   * Runs local Voice Activity Detection and buffers speech audio for high-speed transcription.
   */
  public feedRawChunk(samples: Int16Array) {
    if (!this.isRunning) return;

    // Calculate energy / amplitude
    let sum = 0;
    const len = samples.length;
    for (let i = 0; i < len; i++) {
      sum += Math.abs(samples[i]);
    }
    const avgEnergy = len > 0 ? sum / len : 0;

    // Speech threshold (quiet room ~30-100, voice ~130-3000) - optimized for high sensitivity
    const isVoice = avgEnergy > 130;

    if (isVoice) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.notifyStatusChange();
        if (this.onTranscriptCallback) {
          this.onTranscriptCallback('...', false);
        }
      }

      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }

      this.collectedChunks.push(samples);
      this.totalBufferedSamples += len;
    } else if (this.isSpeaking) {
      // Trailing silence buffer
      this.collectedChunks.push(samples);
      this.totalBufferedSamples += len;

      if (!this.silenceTimeout) {
        // After 220ms of silence, process utterance for ultra-low latency
        this.silenceTimeout = setTimeout(() => {
          this.flushAndTranscribeBuffer();
        }, 220);
      }
    }
  }

  /**
   * Feed base64 PCM string from client.sendRealtimeInput
   */
  public feedAudioChunk(base64: string) {
    if (!this.isRunning) return;
    try {
      const binary = window.atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      this.feedRawChunk(int16);
    } catch {
      // Ignored
    }
  }

  /**
   * Flush buffered PCM audio, convert to WAV, and transcribe via server API
   */
  private async flushAndTranscribeBuffer() {
    this.isSpeaking = false;
    this.silenceTimeout = null;
    this.notifyStatusChange();

    if (this.totalBufferedSamples < 2000) {
      // Discard brief clicks/noise (<0.125s)
      this.collectedChunks = [];
      this.totalBufferedSamples = 0;
      return;
    }

    if (this.isTranscribingAudio) {
      return;
    }

    this.isTranscribingAudio = true;
    const chunks = this.collectedChunks;
    const totalSamples = this.totalBufferedSamples;
    this.collectedChunks = [];
    this.totalBufferedSamples = 0;

    try {
      // Merge into a single contiguous Int16Array
      const merged = new Int16Array(totalSamples);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Encode into standard 16kHz WAV
      const wavBuffer = pcmToWav(merged, 16000);
      const wavBase64 = arrayBufferToBase64(wavBuffer);

      // Perform server-side transcription with active language context
      const languageHint = `${this.primaryName} or ${this.secondaryName}`;
      const response = await fetch('/api/stt/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: wavBase64,
          mimeType: 'audio/wav',
          languageHint,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = (data.text || '').trim();

        if (text) {
          console.log(`[LocalSTT VAD] Transcribed: "${text}"`);
          if (this.onTranscriptCallback) {
            this.onTranscriptCallback(text, true);
          }

          if (this.autoDetect) {
            const detected = this.detectLanguage(text);
            if (detected) {
              this.lastDetectedLang = detected.name;
              if (this.onLanguageDetectedCallback) {
                this.onLanguageDetectedCallback(detected);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[LocalSTT VAD] Transcribe error:', err);
    } finally {
      this.isTranscribingAudio = false;
    }
  }

  /**
   * Fast multilingual language detection
   */
  public detectLanguage(text: string): STTLanguageDetection | null {
    if (!text || text.trim().length < 2) return null;

    const lower = text.toLowerCase();
    const cleanWords = lower.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);

    let highestScore = 0;
    let bestProfileKey = 'nl';
    let matchedKeywords: string[] = [];

    // 1. Script checks for non-Latin scripts (Arabic, Chinese, etc.)
    for (const [, profile] of Object.entries(SUPPORTED_STT_LANGUAGES)) {
      if (profile.scriptRegex && profile.scriptRegex.test(text)) {
        return {
          code: profile.code,
          name: profile.name,
          flag: profile.flag,
          confidence: 0.98,
          direction: profile.isStaffDefault ? 'staff-to-guest' : 'guest-to-staff',
          matchedTokens: [profile.name]
        };
      }
    }

    // 2. Lexical and n-gram scoring
    for (const [key, profile] of Object.entries(SUPPORTED_STT_LANGUAGES)) {
      let score = 0;
      const matched: string[] = [];

      for (const kw of profile.keywords) {
        if (kw.includes(' ')) {
          if (lower.includes(kw)) {
            score += 3.5;
            matched.push(kw);
          }
        } else {
          for (const word of cleanWords) {
            if (word === kw) {
              score += 2.0;
              matched.push(kw);
            }
          }
        }
      }

      if (profile.trigrams.length > 0 && cleanWords.length > 2) {
        for (const tg of profile.trigrams) {
          if (lower.includes(tg)) {
            score += 0.4;
          }
        }
      }

      // Preference bias towards the session languages
      const isPrimary = this.primaryLanguage.toLowerCase().startsWith(key);
      const isSecondary = this.secondaryLanguage.toLowerCase().startsWith(key);
      if (isPrimary || isSecondary) {
        score *= 1.25;
      }

      if (score > highestScore) {
        highestScore = score;
        bestProfileKey = key;
        matchedKeywords = matched;
      }
    }

    if (highestScore > 1.2) {
      const best = SUPPORTED_STT_LANGUAGES[bestProfileKey];
      const isStaff = best.isStaffDefault || best.name.toLowerCase().includes('dutch') || best.name.toLowerCase().includes('flemish');
      return {
        code: best.code,
        name: best.name,
        flag: best.flag,
        confidence: Math.min(0.99, 0.65 + highestScore * 0.05),
        direction: isStaff ? 'staff-to-guest' : 'guest-to-staff',
        matchedTokens: matchedKeywords
      };
    }

    return null;
  }

  public setLanguages(lang1: string, lang2: string, autoDetect: boolean = true) {
    this.primaryName = lang1;
    this.secondaryName = lang2;
    this.primaryLanguage = this.mapLanguageToCode(lang1);
    this.secondaryLanguage = this.mapLanguageToCode(lang2);
    this.autoDetect = autoDetect;

    this.setRecognitionLanguage(this.primaryLanguage);
  }

  public setRecognitionLanguage(bcp47: string) {
    this.activeRecognitionLang = bcp47;
    if (this.recognition) {
      this.recognition.lang = bcp47;
    }
  }

  private mapLanguageToCode(lang: string): string {
    const lower = lang.toLowerCase();
    if (lower.includes('flemish')) return 'nl-BE';
    if (lower.includes('dutch')) return 'nl-NL';
    if (lower.includes('english') && lower.includes('uk')) return 'en-GB';
    if (lower.includes('english')) return 'en-US';
    if (lower.includes('tagalog') || lower.includes('filipino')) return 'fil-PH';
    if (lower.includes('spanish')) return 'es-ES';
    if (lower.includes('french')) return 'fr-FR';
    if (lower.includes('german')) return 'de-DE';
    if (lower.includes('italian')) return 'it-IT';
    if (lower.includes('portuguese')) return 'pt-PT';
    if (lower.includes('arabic')) return 'ar-SA';
    if (lower.includes('chinese')) return 'zh-CN';
    if (lower.includes('japanese')) return 'ja-JP';
    if (lower.includes('korean')) return 'ko-KR';
    return 'nl-BE';
  }

  public start(
    onTranscript?: STTCallback,
    onLanguageDetected?: (info: STTLanguageDetection) => void,
    onError?: (err: any) => void
  ) {
    if (onTranscript) this.onTranscriptCallback = onTranscript;
    if (onLanguageDetected) this.onLanguageDetectedCallback = onLanguageDetected;
    if (onError) this.onErrorCallback = onError;

    this.shouldRestart = true;
    this.isRunning = true;
    this.collectedChunks = [];
    this.totalBufferedSamples = 0;

    // Start Web Speech if not blocked
    if (!this.webSpeechBlocked && this.recognition) {
      this.startWebSpeech();
    }

    this.notifyStatusChange();
  }

  public stop() {
    this.shouldRestart = false;
    this.isRunning = false;
    this.isSpeaking = false;
    clearTimeout(this.restartTimeout);
    clearTimeout(this.silenceTimeout);

    this.collectedChunks = [];
    this.totalBufferedSamples = 0;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignored
      }
    }

    this.notifyStatusChange();
  }

  /**
   * Manual direct speech input (allows simulated speech or typed text directly to STT pipeline)
   */
  public submitDirectSpeech(text: string) {
    const clean = text.trim();
    if (!clean) return;

    if (this.onTranscriptCallback) {
      this.onTranscriptCallback(clean, true);
    }

    if (this.autoDetect) {
      const detected = this.detectLanguage(clean);
      if (detected && this.onLanguageDetectedCallback) {
        this.onLanguageDetectedCallback(detected);
      }
    }
  }

  public setStatusCallback(cb: (status: { engine: string; isSpeaking: boolean; isRunning: boolean }) => void) {
    this.onStatusChangeCallback = cb;
  }

  private notifyStatusChange() {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback({
        engine: this.webSpeechBlocked ? 'Audio Stream VAD' : 'Web Speech API',
        isSpeaking: this.isSpeaking,
        isRunning: this.isRunning
      });
    }
  }

  public get active(): boolean {
    return this.isRunning;
  }

  public get engine(): string {
    return this.webSpeechBlocked ? 'Audio Stream VAD' : 'Web Speech API';
  }

  public getLastDetectedLanguage(): string {
    return this.lastDetectedLang;
  }
}

export const localSTT = new LocalSTT();
