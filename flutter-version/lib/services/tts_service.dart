import 'flutter_tts/flutter_tts.dart';

class SupertonicFlutterTTS {
  final FlutterTts _flutterTts = FlutterTts();
  String _currentVoice = 'F1';
  String _currentProsody = 'balanced';

  SupertonicFlutterTTS() {
    _initTts();
  }

  Future<void> _initTts() async {
    await _flutterTts.setLanguage('en-US');
    await _flutterTts.setSpeechRate(0.5);
    await _flutterTts.setVolume(1.0);
    await _flutterTts.setPitch(1.0);
  }

  void setVoice(String voiceId) {
    _currentVoice = voiceId;
    // Adjust pitch based on gender/voice profile
    if (voiceId.startsWith('M')) {
      _flutterTts.setPitch(0.85);
    } else {
      _flutterTts.setPitch(1.15);
    }
  }

  void setProsodyProfile(String profile) {
    _currentProsody = profile;
    switch (profile) {
      case 'clinical':
        _flutterTts.setSpeechRate(0.45);
        _flutterTts.setPitch(1.0);
        break;
      case 'empathetic':
        _flutterTts.setSpeechRate(0.48);
        _flutterTts.setPitch(1.05);
        break;
      case 'expressive':
        _flutterTts.setSpeechRate(0.52);
        _flutterTts.setPitch(1.2);
        break;
      case 'articulate':
        _flutterTts.setSpeechRate(0.44);
        _flutterTts.setPitch(1.1);
        break;
      case 'fast':
        _flutterTts.setSpeechRate(0.65);
        _flutterTts.setPitch(1.0);
        break;
      case 'balanced':
      default:
        _flutterTts.setSpeechRate(0.5);
        _flutterTts.setPitch(_currentVoice.startsWith('M') ? 0.85 : 1.15);
        break;
    }
  }

  Future<void> speak(String text, String langCode) async {
    if (text.isEmpty) return;
    await _flutterTts.setLanguage(langCode);
    await _flutterTts.speak(text);
  }

  Future<void> stop() async {
    await _flutterTts.stop();
  }
}
