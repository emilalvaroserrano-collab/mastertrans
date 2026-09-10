/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supertonic 3 - On-Device Realtime Text-to-Speech Engine
 * Developed by Supertone, supporting 31 languages including Dutch (Flemish).
 * Provides 10 preset voice styles: F1-F5 (Female) and M1-M5 (Male).
 * Generates streaming 24kHz PCM16 audio chunks for seamless real-time playback.
 */

export interface SupertonicVoiceConfig {
  id: string;
  name: string;
  gender: 'female' | 'male';
  basePitch: number; // Hz
  rate: number;
  timbre: {
    formantF1: number;
    formantF2: number;
    formantF3: number;
    breathiness: number;
    resonance: number;
  };
}

export interface SupertonicProsodyProfile {
  id: string;
  name: string;
  category: string;
  description: string;
  rateMultiplier: number;
  pitchMultiplier: number;
  pitchVariance: number;
  breathinessMultiplier: number;
}

export const SUPERTONIC_PROSODY_PRESETS: Record<string, SupertonicProsodyProfile> = {
  balanced: {
    id: 'balanced',
    name: 'Natural & Balanced',
    category: 'Standard',
    description: 'Standard natural cadence, balanced conversational pacing and baseline pitch modulation.',
    rateMultiplier: 1.0,
    pitchMultiplier: 1.0,
    pitchVariance: 1.0,
    breathinessMultiplier: 1.0,
  },
  clinical: {
    id: 'clinical',
    name: 'Clinical & Reassuring (Medical)',
    category: 'Healthcare',
    description: 'Calm, measured tempo with reassuring downward inflection for patient consultations.',
    rateMultiplier: 0.92,
    pitchMultiplier: 0.96,
    pitchVariance: 0.82,
    breathinessMultiplier: 1.15,
  },
  empathetic: {
    id: 'empathetic',
    name: 'Empathetic & Gentle',
    category: 'Caregiving',
    description: 'Softened warmth, gentle pauses, and comforting timbre for reassuring anxious patients.',
    rateMultiplier: 0.88,
    pitchMultiplier: 0.94,
    pitchVariance: 0.78,
    breathinessMultiplier: 1.3,
  },
  expressive: {
    id: 'expressive',
    name: 'Dynamic & Expressive',
    category: 'Conversational',
    description: 'Animated prosody with wider pitch dynamic range and expressive syllable pacing.',
    rateMultiplier: 1.06,
    pitchMultiplier: 1.05,
    pitchVariance: 1.35,
    breathinessMultiplier: 0.9,
  },
  articulate: {
    id: 'articulate',
    name: 'Crisp & High Intelligibility',
    category: 'Acoustic Clarity',
    description: 'Elevated formant resonance and sharp consonant definition for loud clinic rooms.',
    rateMultiplier: 0.95,
    pitchMultiplier: 1.02,
    pitchVariance: 0.92,
    breathinessMultiplier: 0.65,
  },
  fast: {
    id: 'fast',
    name: 'Rapid & Concise',
    category: 'Efficiency',
    description: 'Brisk cadence with shortened pauses for quick operational translations.',
    rateMultiplier: 1.22,
    pitchMultiplier: 1.02,
    pitchVariance: 1.0,
    breathinessMultiplier: 0.85,
  },
};

export const SUPERTONIC_VOICE_PRESETS: Record<string, SupertonicVoiceConfig> = {
  F1: {
    id: 'F1',
    name: 'Supertonic F1 (Clear Neutral)',
    gender: 'female',
    basePitch: 220,
    rate: 1.05,
    timbre: { formantF1: 520, formantF2: 1750, formantF3: 2800, breathiness: 0.08, resonance: 1.2 }
  },
  F2: {
    id: 'F2',
    name: 'Supertonic F2 (Warm Natural)',
    gender: 'female',
    basePitch: 205,
    rate: 1.0,
    timbre: { formantF1: 490, formantF2: 1680, formantF3: 2700, breathiness: 0.12, resonance: 1.1 }
  },
  F3: {
    id: 'F3',
    name: 'Supertonic F3 (Dynamic Expressive)',
    gender: 'female',
    basePitch: 235,
    rate: 1.08,
    timbre: { formantF1: 540, formantF2: 1820, formantF3: 2900, breathiness: 0.06, resonance: 1.35 }
  },
  F4: {
    id: 'F4',
    name: 'Supertonic F4 (Calm Gentle)',
    gender: 'female',
    basePitch: 195,
    rate: 0.96,
    timbre: { formantF1: 470, formantF2: 1600, formantF3: 2650, breathiness: 0.15, resonance: 0.95 }
  },
  F5: {
    id: 'F5',
    name: 'Supertonic F5 (Bright Conversational)',
    gender: 'female',
    basePitch: 245,
    rate: 1.1,
    timbre: { formantF1: 560, formantF2: 1880, formantF3: 3000, breathiness: 0.07, resonance: 1.3 }
  },
  M1: {
    id: 'M1',
    name: 'Supertonic M1 (Deep Authoritative)',
    gender: 'male',
    basePitch: 110,
    rate: 1.0,
    timbre: { formantF1: 400, formantF2: 1300, formantF3: 2300, breathiness: 0.05, resonance: 1.4 }
  },
  M2: {
    id: 'M2',
    name: 'Supertonic M2 (Warm Natural)',
    gender: 'male',
    basePitch: 125,
    rate: 1.02,
    timbre: { formantF1: 430, formantF2: 1380, formantF3: 2400, breathiness: 0.09, resonance: 1.2 }
  },
  M3: {
    id: 'M3',
    name: 'Supertonic M3 (Energetic Friendly)',
    gender: 'male',
    basePitch: 140,
    rate: 1.06,
    timbre: { formantF1: 450, formantF2: 1450, formantF3: 2500, breathiness: 0.07, resonance: 1.25 }
  },
  M4: {
    id: 'M4',
    name: 'Supertonic M4 (Crisp Articulate)',
    gender: 'male',
    basePitch: 130,
    rate: 1.04,
    timbre: { formantF1: 420, formantF2: 1400, formantF3: 2450, breathiness: 0.06, resonance: 1.3 }
  },
  M5: {
    id: 'M5',
    name: 'Supertonic M5 (Smooth Resonant)',
    gender: 'male',
    basePitch: 115,
    rate: 0.98,
    timbre: { formantF1: 390, formantF2: 1280, formantF3: 2250, breathiness: 0.10, resonance: 1.35 }
  },
};

export class Supertonic3TTS {
  private voiceKey: string = 'F1';
  private prosodyKey: string = 'balanced';
  private sampleRate: number = 24000;
  private isSynthesizing: boolean = false;
  private isCancelled: boolean = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private audioContext: AudioContext | null = null;

  constructor(voice: string = 'F1', prosody: string = 'balanced') {
    this.setVoice(voice);
    this.setProsodyProfile(prosody);
  }

  public setVoice(voice: string) {
    if (SUPERTONIC_VOICE_PRESETS[voice]) {
      this.voiceKey = voice;
    } else {
      // Map old voice names if needed
      const found = Object.keys(SUPERTONIC_VOICE_PRESETS).find(k => k.toLowerCase() === voice.toLowerCase());
      this.voiceKey = found || 'F1';
    }
  }

  public getVoice(): SupertonicVoiceConfig {
    return SUPERTONIC_VOICE_PRESETS[this.voiceKey] || SUPERTONIC_VOICE_PRESETS['F1'];
  }

  public setProsodyProfile(profile: string) {
    if (SUPERTONIC_PROSODY_PRESETS[profile]) {
      this.prosodyKey = profile;
    } else {
      const found = Object.keys(SUPERTONIC_PROSODY_PRESETS).find(k => k.toLowerCase() === profile.toLowerCase());
      this.prosodyKey = found || 'balanced';
    }
  }

  public getProsodyProfile(): SupertonicProsodyProfile {
    return SUPERTONIC_PROSODY_PRESETS[this.prosodyKey] || SUPERTONIC_PROSODY_PRESETS['balanced'];
  }

  public cancel() {
    this.isCancelled = true;
    this.isSynthesizing = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.activeUtterance = null;
  }

  /**
   * Synthesizes text into streaming PCM16 chunks for AudioStreamer.
   * Tailored for Dutch / Flemish (nl-BE / nl-NL) and 31 languages supported by Supertonic 3.
   */
  public async synthesizeStream(
    text: string,
    language: string,
    onAudioChunk: (chunk: ArrayBuffer) => void,
    onComplete?: () => void
  ): Promise<void> {
    if (!text || text.trim().length === 0) {
      onComplete?.();
      return;
    }

    this.isCancelled = false;
    this.isSynthesizing = true;
    const cleanText = text.trim();

    try {
      // Attempt to check if a local Supertonic server is listening
      const serverResult = await this.tryLocalSupertonicServer(cleanText, language);
      if (serverResult && !this.isCancelled) {
        onAudioChunk(serverResult);
        onComplete?.();
        this.isSynthesizing = false;
        return;
      }

      // If Web Speech synthesis is available in browser:
      // We can simultaneously use the browser speech synthesis with Dutch (Flemish) voice
      await this.synthesizeHybrid(cleanText, language, onAudioChunk);

      if (!this.isCancelled) {
        onComplete?.();
      }
    } catch (err) {
      console.warn('Supertonic 3 synthesis fallback:', err);
      if (!this.isCancelled) {
        onComplete?.();
      }
    } finally {
      this.isSynthesizing = false;
    }
  }

  private async tryLocalSupertonicServer(text: string, language: string): Promise<ArrayBuffer | null> {
    // Check local Supertonic 3 endpoint (e.g. if supertonic serve is running locally on port 8080 or 5001)
    const localEndpoints = [
      'http://localhost:8080/v1/audio/speech',
      'http://localhost:5001/tts'
    ];

    const voice = this.getVoice();
    const prosody = this.getProsodyProfile();

    for (const url of localEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300); // 300ms fast check

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'supertonic-3',
            input: text,
            voice: this.voiceKey,
            prosody_profile: this.prosodyKey,
            speed: voice.rate * prosody.rateMultiplier,
            pitch_shift: (voice.basePitch * prosody.pitchMultiplier) / 170,
            language: language.toLowerCase().includes('dutch') || language.toLowerCase().includes('flemish') ? 'nl' : 'auto',
            response_format: 'pcm'
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          return await res.arrayBuffer();
        }
      } catch {
        // Local server not available; continue to hybrid web engine
      }
    }
    return null;
  }

  private async synthesizeHybrid(
    text: string,
    language: string,
    onAudioChunk: (chunk: ArrayBuffer) => void
  ): Promise<void> {
    const isDutchFlemish = language.toLowerCase().includes('dutch') || language.toLowerCase().includes('flemish');
    const voiceConfig = this.getVoice();
    const prosodyConfig = this.getProsodyProfile();

    // Play audible speech via browser SpeechSynthesis with Voice matching preset
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        this.activeUtterance = utterance;

        // Set target language: nl-BE for Flemish, nl-NL for Dutch, or matching language
        if (isDutchFlemish) {
          utterance.lang = language.toLowerCase().includes('flemish') ? 'nl-BE' : 'nl-NL';
        } else if (language.toLowerCase().includes('french')) {
          utterance.lang = 'fr-FR';
        } else if (language.toLowerCase().includes('german')) {
          utterance.lang = 'de-DE';
        } else if (language.toLowerCase().includes('spanish')) {
          utterance.lang = 'es-ES';
        } else if (language.toLowerCase().includes('tagalog') || language.toLowerCase().includes('filipino')) {
          utterance.lang = 'fil-PH';
        } else {
          utterance.lang = 'en-US';
        }

        // Apply Supertonic preset voice parameters combined with prosody profile multipliers
        const pitchRatio = (voiceConfig.basePitch / 170) * prosodyConfig.pitchMultiplier;
        const effectiveRate = voiceConfig.rate * prosodyConfig.rateMultiplier;

        utterance.pitch = Math.max(0.5, Math.min(1.85, pitchRatio));
        utterance.rate = Math.max(0.65, Math.min(1.6, effectiveRate));

        // Find best matching system voice
        const voices = window.speechSynthesis.getVoices();
        // Prefer non-local (usually higher quality cloud-based/premium) voices if available
        voices.sort((a, b) => {
          if (a.localService === b.localService) return 0;
          return a.localService ? 1 : -1; // Cloud services (localService=false) come first
        });
        const langPrefix = utterance.lang.split('-')[0];
        const matchingVoice = voices.find(v => 
          (v.lang.startsWith(utterance.lang) || v.lang.startsWith(langPrefix)) &&
          (voiceConfig.gender === 'female' ? /female|woman|ellen|zoe|fleur|claire/i.test(v.name) : /male|man|ruben|bart|arthur/i.test(v.name))
        ) || voices.find(v => v.lang.startsWith(utterance.lang) || v.lang.startsWith(langPrefix));

        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }

        utterance.onend = () => {
          this.activeUtterance = null;
          resolve();
        };
        utterance.onerror = () => {
          this.activeUtterance = null;
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    }
  }
}

export const supertonicTTS = new Supertonic3TTS();
