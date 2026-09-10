import 'package:flutter/material.dart';
import 'models/translator_model.dart';
import 'services/tts_service.dart';

void main() {
  runApp(const MultilinguaApp());
}

class MultilinguaApp extends StatelessWidget {
  const MultilinguaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MultilinguaHe Flutter',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        useMaterial3: true,
      ),
      home: const TranslatorScreen(),
    );
  }
}

class TranslatorScreen extends StatefulWidget {
  const TranslatorScreen({super.key});

  @override
  State<TranslatorScreen> createState() => _TranslatorScreenState();
}

class _TranslatorScreenState extends State<TranslatorScreen> {
  final SupertonicFlutterTTS _tts = SupertonicFlutterTTS();
  
  String _sourceLang = 'Tagalog (Filipino)';
  String _targetLang = 'English (US)';
  bool _isMedicalMode = false;
  bool _isListening = false;
  String _selectedVoice = 'F1';
  String _selectedProsody = 'balanced';

  final TextEditingController _textController = TextEditingController();
  final List<TranslationRecord> _history = [];
  String _liveTranslation = '';

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  void _translate() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    // Simulated high-fidelity translation response
    String translated = "Translated ($_targetLang): $text";
    if (text.toLowerCase().contains('magandang araw')) {
      translated = "Good day to you.";
    } else if (text.toLowerCase().contains('kumusta')) {
      translated = "How are you doing?";
    } else if (_isMedicalMode) {
      translated = "[Clinical Precision] Patient reports acute symptoms in $_targetLang.";
    }

    setState(() {
      _liveTranslation = translated;
      _history.insert(
        0,
        TranslationRecord(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          sourceText: text,
          translatedText: translated,
          sourceLang: _sourceLang,
          targetLang: _targetLang,
          timestamp: DateTime.now(),
        ),
      );
    });

    _tts.speak(translated, _targetLang.contains('Tagalog') ? 'tl' : 'en');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.translate, color: Color(0xFF60A5FA)),
            SizedBox(width: 10),
            Text('MultilinguaHe Realtime', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => _showSettingsModal(context),
            tooltip: 'Voice & Translation Settings',
          ),
        ],
      ),
      body: Column(
        children: [
          // Top Control Bar
          Container(
            padding: const EdgeInsets.all(12),
            color: const Color(0xFF1E293B).withOpacity(0.5),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildLanguageDropdown(_sourceLang, (val) => setState(() => _sourceLang = val!)),
                const Icon(Icons.arrow_forward, color: Colors.grey),
                _buildLanguageDropdown(_targetLang, (val) => setState(() => _targetLang = val!)),
                Switch(
                  value: _isMedicalMode,
                  onChanged: (val) => setState(() => _isMedicalMode = val),
                  activeColor: const Color(0xFF3B82F6),
                ),
                const Text('Medical Mode', style: TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          ),
          
          // Main Conversation / Translation Display
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  color: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.between,
                          children: [
                            const Text('Live Speech Transcript', style: TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold)),
                            IconButton(
                              icon: Icon(_isListening ? Icons.mic : Icons.mic_none, color: _isListening ? Colors.red : Colors.grey),
                              onPressed: () {
                                setState(() {
                                  _isListening = !_isListening;
                                  if (_isListening) {
                                    _textController.text = "Magandang araw sa 'yo, kumusta na po kayo?";
                                  }
                                });
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _textController,
                          maxLines: 3,
                          decoration: const InputDecoration(
                            hintText: 'Type or speak in source language...',
                            border: OutlineInputBorder(),
                            filled: true,
                            fillColor: Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: _translate,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF3B82F6),
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 45),
                          ),
                          icon: const Icon(Icons.bolt),
                          label: const Text('Translate & Synthesize Audio'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (_liveTranslation.isNotEmpty) ...[
                  const Text('Latest Translation Output', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.greenAccent)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF064E3B).withOpacity(0.3),
                      border: Border.all(color: const Color(0xFF059669)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(_liveTranslation, style: const TextStyle(fontSize: 16, color: Colors.white)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.volume_up, color: Color(0xFF34D399)),
                          onPressed: () => _tts.speak(_liveTranslation, 'en'),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                const Text('Translation History', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ..._history.map((rec) => Card(
                      color: const Color(0xFF1E293B).withOpacity(0.7),
                      child: ListTile(
                        title: Text(rec.sourceText, style: const TextStyle(color: Colors.white)),
                        subtitle: Text(rec.translatedText, style: const TextStyle(color: Color(0xFF34D399))),
                        trailing: Text(
                          '${rec.timestamp.hour}:${rec.timestamp.minute.toString().padLeft(2, '0')}',
                          style: const TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                      ),
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLanguageDropdown(String current, ValueChanged<String?> onChanged) {
    return DropdownButton<String>(
      value: current,
      dropdownColor: const Color(0xFF1E293B),
      style: const TextStyle(color: Colors.white, fontSize: 14),
      items: kLanguages.map((l) => DropdownMenuItem(value: l.name, child: Text(l.name))).toList(),
      onChanged: onChanged,
    );
  }

  void _showSettingsModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E293B),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              padding: const EdgeInsets.all(20),
              height: 400,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Supertonic 3 Voice & Prosody Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 16),
                  const Text('Voice Profile', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  DropdownButton<String>(
                    value: _selectedVoice,
                    isExpanded: true,
                    dropdownColor: const Color(0xFF0F172A),
                    style: const TextStyle(color: Colors.white),
                    items: kVoiceProfiles.map((v) => DropdownMenuItem(value: v.id, child: Text('${v.id} - ${v.name}'))).toList(),
                    onChanged: (val) {
                      if (val != null) {
                        setModalState(() => _selectedVoice = val);
                        setState(() => _selectedVoice = val);
                        _tts.setVoice(val);
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text('Prosody Profile', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  DropdownButton<String>(
                    value: _selectedProsody,
                    isExpanded: true,
                    dropdownColor: const Color(0xFF0F172A),
                    style: const TextStyle(color: Colors.white),
                    items: kProsodyProfiles.map((p) => DropdownMenuItem(value: p.value, child: Text(p.name))).toList(),
                    onChanged: (val) {
                      if (val != null) {
                        setModalState(() => _selectedProsody = val);
                        setState(() => _selectedProsody = val);
                        _tts.setProsodyProfile(val);
                      }
                    },
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF3B82F6), minimumSize: const Size(double.infinity, 45)),
                    child: const Text('Save Settings', style: TextStyle(color: Colors.white)),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
