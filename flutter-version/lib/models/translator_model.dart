class LanguageOption {
  final String code;
  final String name;
  final String nativeName;

  const LanguageOption({
    required this.code,
    required this.name,
    required this.nativeName,
  });
}

class VoiceProfile {
  final String id;
  final String name;
  final String gender; // 'female', 'male', or 'legacy'
  final String description;

  const VoiceProfile({
    required this.id,
    required this.name,
    required this.gender,
    required this.description,
  });
}

class ProsodyProfile {
  final String value;
  final String name;
  final String category;
  final String description;

  const ProsodyProfile({
    required this.value,
    required this.name,
    required this.category,
    required this.description,
  });
}

class TranslationRecord {
  final String id;
  final String sourceText;
  final String translatedText;
  final String sourceLang;
  final String targetLang;
  final DateTime timestamp;

  TranslationRecord({
    required this.id,
    required this.sourceText,
    required this.translatedText,
    required this.sourceLang,
    required this.targetLang,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'sourceText': sourceText,
        'translatedText': translatedText,
        'sourceLang': sourceLang,
        'targetLang': targetLang,
        'timestamp': timestamp.toIso8601String(),
      };

  factory TranslationRecord.fromJson(Map<String, dynamic> json) =>
      TranslationRecord(
        id: json['id'],
        sourceText: json['sourceText'],
        translatedText: json['translatedText'],
        sourceLang: json['sourceLang'],
        targetLang: json['targetLang'],
        timestamp: DateTime.parse(json['timestamp']),
      );
}

const List<LanguageOption> kLanguages = [
  LanguageOption(code: 'en', name: 'English (US)', nativeName: 'English'),
  LanguageOption(code: 'tl', name: 'Tagalog (Filipino)', nativeName: 'Tagalog'),
  LanguageOption(code: 'es', name: 'Spanish', nativeName: 'Español'),
  LanguageOption(code: 'fr', name: 'French', nativeName: 'Français'),
  LanguageOption(code: 'de', name: 'German', nativeName: 'Deutsch'),
  LanguageOption(code: 'nl', name: 'Dutch / Flemish', nativeName: 'Nederlands'),
  LanguageOption(code: 'ja', name: 'Japanese', nativeName: '日本語'),
  LanguageOption(code: 'zh', name: 'Mandarin Chinese', nativeName: '中文'),
  LanguageOption(code: 'ar', name: 'Arabic', nativeName: 'العربية'),
  LanguageOption(code: 'hi', name: 'Hindi', nativeName: 'हिन्दी'),
];

const List<VoiceProfile> kVoiceProfiles = [
  VoiceProfile(id: 'F1', name: 'Aria (Warm & Clear)', gender: 'female', description: 'Expressive soprano with natural cadence'),
  VoiceProfile(id: 'F2', name: 'Luna (Soft & Empathetic)', gender: 'female', description: 'Calm vocal timbre suited for clinical & care settings'),
  VoiceProfile(id: 'F3', name: 'Maya (Professional & Articulate)', gender: 'female', description: 'Crisp articulation for multilingual presentations'),
  VoiceProfile(id: 'F4', name: 'Nova (Dynamic & Bright)', gender: 'female', description: 'Enthusiastic and engaging delivery'),
  VoiceProfile(id: 'F5', name: 'Elena (Authoritative & Calm)', gender: 'female', description: 'Deep resonant warmth'),
  VoiceProfile(id: 'M1', name: 'Atlas (Deep & Grounded)', gender: 'male', description: 'Resonant bass baritone for authoritative transmission'),
  VoiceProfile(id: 'M2', name: 'Orion (Clear & Direct)', gender: 'male', description: 'Balanced frequency profile for high intelligibility'),
  VoiceProfile(id: 'M3', name: 'Leo (Warm & Conversational)', gender: 'male', description: 'Friendly peer-to-peer timbre'),
  VoiceProfile(id: 'M4', name: 'Zeus (Professional Baritone)', gender: 'male', description: 'Formal clinical delivery'),
  VoiceProfile(id: 'M5', name: 'Kai (Calm & Steady)', gender: 'male', description: 'Relaxed tempo with steady modulation'),
];

const List<ProsodyProfile> kProsodyProfiles = [
  ProsodyProfile(value: 'balanced', name: 'Balanced Natural', category: 'Standard', description: 'Natural conversational cadence and pacing.'),
  ProsodyProfile(value: 'clinical', name: 'Clinical Precision', category: 'Medical', description: 'Emphasized articulation and deliberate pacing for medical terms.'),
  ProsodyProfile(value: 'empathetic', name: 'Empathetic Soft', category: 'Care', description: 'Softer vocal weight and warmer pitch contour.'),
  ProsodyProfile(value: 'expressive', name: 'Expressive Dynamic', category: 'Dynamic', description: 'Wider pitch range and emotive inflection.'),
  ProsodyProfile(value: 'articulate', name: 'High Articulation', category: 'Formal', description: 'Crisp consonant release for noisy environments.'),
  ProsodyProfile(value: 'fast', name: 'Rapid Stream', category: 'Speed', description: 'Condensed duration for high-speed dialogue.'),
];
