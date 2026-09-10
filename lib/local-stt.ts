/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Local Multilingual STT - Realtime Streaming Speech-to-Text Engine
 * Uses browser-native SpeechRecognition enhanced with real-time on-device
 * multilingual detection, adaptive language switching, and continuous streaming.
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

export class LocalSTT {
  private recognition: any = null;
  private isRunning: boolean = false;
  private primaryLanguage: string = 'nl-BE';
  private secondaryLanguage: string = 'en-US';
  private activeRecognitionLang: string = 'nl-BE';
  private autoDetect: boolean = true;
  private onTranscriptCallback: STTCallback | null = null;
  private onLanguageDetectedCallback: ((info: STTLanguageDetection) => void) | null = null;
  private onErrorCallback: ((err: any) => void) | null = null;
  private shouldRestart: boolean = false;
  private restartTimeout: any = null;
  private lastDetectedLang: string = 'Dutch (Flemish)';

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not supported in this browser.');
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
          // Perform real-time multilingual identification
          const detected = this.detectLanguage(candidateText);
          if (detected) {
            this.lastDetectedLang = detected.name;
            if (this.onLanguageDetectedCallback) {
              this.onLanguageDetectedCallback(detected);
            }
          }
        }

        if (interimTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(interimTranscript, false);
        }

        if (finalTranscript.trim() && this.onTranscriptCallback) {
          this.onTranscriptCallback(finalTranscript, true);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        console.warn('LocalSTT error:', event.error);
        if (this.onErrorCallback) {
          this.onErrorCallback(event);
        }
      };

      this.recognition.onend = () => {
        this.isRunning = false;
        if (this.shouldRestart) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.shouldRestart) {
              this.start();
            }
          }, 120);
        }
      };
    } catch (e) {
      console.error('LocalSTT initialization error:', e);
    }
  }

  /**
   * Fast, low-latency multilingual language detection
   * Analyzes function words, domain vocabulary, letter n-grams, and unicode scripts
   */
  public detectLanguage(text: string): STTLanguageDetection | null {
    if (!text || text.trim().length < 2) return null;

    const lower = text.toLowerCase();
    const cleanWords = lower.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);

    let highestScore = 0;
    let bestProfileKey = 'nl';
    let matchedKeywords: string[] = [];

    // 1. Script checks for non-Latin scripts (Arabic, Chinese, etc.)
    for (const [key, profile] of Object.entries(SUPPORTED_STT_LANGUAGES)) {
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

      // Exact keyword matches (high weight)
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

      // Trigram matching (medium weight)
      if (profile.trigrams.length > 0 && cleanWords.length > 2) {
        for (const tg of profile.trigrams) {
          if (lower.includes(tg)) {
            score += 0.4;
          }
        }
      }

      // Preference bias towards the two active session languages
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
    this.primaryLanguage = this.mapLanguageToCode(lang1);
    this.secondaryLanguage = this.mapLanguageToCode(lang2);
    this.autoDetect = autoDetect;

    // Use primary language as starting locale
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
    if (this.isRunning) return;

    if (!this.recognition) {
      this.initRecognition();
    }

    if (this.recognition) {
      try {
        this.recognition.lang = this.activeRecognitionLang;
        this.recognition.start();
        this.isRunning = true;
      } catch (err: any) {
        if (err?.name !== 'InvalidStateError') {
          console.warn('Recognition start error:', err);
        }
      }
    }
  }

  public stop() {
    this.shouldRestart = false;
    clearTimeout(this.restartTimeout);
    if (this.recognition && this.isRunning) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignored
      }
      this.isRunning = false;
    }
  }

  public get active(): boolean {
    return this.isRunning;
  }

  public getLastDetectedLanguage(): string {
    return this.lastDetectedLang;
  }
}

export const localSTT = new LocalSTT();

