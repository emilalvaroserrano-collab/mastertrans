/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { useSettings, useUI } from '../lib/state';
import c from 'classnames';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { useAuth } from '../lib/auth';
import { useHistoryStore } from '../lib/history';
import { AVAILABLE_LANGUAGES, AVAILABLE_VOICES, AVAILABLE_PROSODY_PROFILES } from '../lib/constants';
import { supertonicTTS } from '../lib/supertonic-tts';
import { ollamaTranslator } from '../lib/ollama-translator';
import OllamaAutoInstallCard from './OllamaAutoInstallCard';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const {
    systemPrompt, voice, prosodyProfile, language1, language2, topic, autoDetect, customLanguages, medicalMode,
    ollamaEndpoint, model,
    setSystemPrompt, setVoice, setProsodyProfile, setLanguage1, setLanguage2, setTopic, setAutoDetect, setMedicalMode,
    setOllamaEndpoint, setModel
  } = useSettings();
  const { connected } = useLiveAPIContext();
  const { isSuperAdmin } = useAuth();
  const { history, clearHistory } = useHistoryStore();

  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioCtxRef = React.useRef<AudioContext | null>(null);

  // Stop preview if sidebar is closed or unmounted
  React.useEffect(() => {
    if (!isSidebarOpen && isPlayingPreview) {
      supertonicTTS.cancel();
      if (previewAudioCtxRef.current) {
        try {
          previewAudioCtxRef.current.close();
        } catch {}
        previewAudioCtxRef.current = null;
      }
      setIsPlayingPreview(false);
    }
  }, [isSidebarOpen, isPlayingPreview]);

  const handlePreviewVoice = async () => {
    if (isPlayingPreview) {
      supertonicTTS.cancel();
      if (previewAudioCtxRef.current) {
        try {
          previewAudioCtxRef.current.close();
        } catch {}
        previewAudioCtxRef.current = null;
      }
      setIsPlayingPreview(false);
      return;
    }

    setIsPlayingPreview(true);
    supertonicTTS.setVoice(voice);
    supertonicTTS.setProsodyProfile(prosodyProfile);

    const isDutchFlemish = language1.toLowerCase().includes('dutch') || language1.toLowerCase().includes('flemish');
    const samplePhrase = isDutchFlemish
      ? 'Goedendag! Dit is een voorbeeld van Supertonic 3 met het gekozen prosodieprofiel.'
      : 'Hello! This is a voice sample of Supertonic 3 with your selected prosody profile.';

    const pcmChunks: ArrayBuffer[] = [];

    try {
      await supertonicTTS.synthesizeStream(
        samplePhrase,
        language1,
        (chunk) => {
          pcmChunks.push(chunk);
        },
        () => {
          setIsPlayingPreview(false);
        }
      );

      // If SpeechSynthesis is unavailable or silent in this browser environment, play PCM directly via Web Audio
      if (typeof window !== 'undefined' && (!('speechSynthesis' in window) || window.speechSynthesis.getVoices().length === 0) && pcmChunks.length > 0) {
        try {
          const totalLength = pcmChunks.reduce((acc, c) => acc + c.byteLength, 0);
          const numSamples = totalLength / 2;
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass({ sampleRate: 24000 });
            previewAudioCtxRef.current = audioCtx;
            const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
            const channelData = audioBuffer.getChannelData(0);
            let offset = 0;
            for (const chunk of pcmChunks) {
              const view = new DataView(chunk);
              const count = chunk.byteLength / 2;
              for (let i = 0; i < count; i++) {
                channelData[offset++] = view.getInt16(i * 2, true) / 32768.0;
              }
            }
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(audioCtx.destination);
            src.onended = () => {
              setIsPlayingPreview(false);
            };
            src.start();
          }
        } catch {
          setIsPlayingPreview(false);
        }
      }
    } catch (err) {
      console.warn('Voice preview error:', err);
      setIsPlayingPreview(false);
    }
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    setTestStatus('Testing connection...');
    ollamaTranslator.setEndpoint(ollamaEndpoint || 'http://localhost:11434');
    ollamaTranslator.setModel(model || 'gemma3:1b');
    const res = await ollamaTranslator.checkHealth();
    setTestingOllama(false);
    if (res.ok) {
      setTestStatus(`Connected! Found ${res.models.length} local models.`);
    } else {
      setTestStatus(`Not reachable. Run 'ollama run gemma3:1b' locally or use fallback.`);
    }
  };

  const handleSave = () => {
    toggleSidebar();
  };

  const handleExport = () => {
    if (history.length === 0) {
      alert("No history to export.");
      return;
    }

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text('Dual Translator Chat History', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Exported on: ${new Date().toLocaleString()}`, 14, 30);
    doc.text('Powered by Eburon AI', 14, 36);
    
    const tableData = history.map(item => [
      new Date(item.timestamp).toLocaleString(),
      item.sourceText,
      item.translatedText
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Time', 'Source Text', 'Translation']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [68, 141, 255] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 70 },
        2: { cellWidth: 75 }
      }
    });

    doc.save('dual_translator_history.pdf');
  };

  return (
    <aside className={c('sidebar', { open: isSidebarOpen })}>
      <div className="sidebar-header">
        <h3>Settings</h3>
        <button onClick={toggleSidebar} className="close-button">
          <span className="icon">close</span>
        </button>
      </div>
      <div className="sidebar-content">
        <div className="sidebar-section">
          <fieldset disabled={connected}>
            <label>
              Staff Language (Language 1)
              <select
                value={language1}
                onChange={e => setLanguage1(e.target.value)}
              >
                {[...AVAILABLE_LANGUAGES.filter(l => l.value !== 'auto'), ...customLanguages].map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Guest Language (Language 2)
              <div className="flex flex-col gap-2">
                <select
                  value={language2}
                  onChange={e => setLanguage2(e.target.value)}
                  disabled={autoDetect}
                >
                  {[...AVAILABLE_LANGUAGES.filter(l => l.value !== 'auto'), ...customLanguages].map(lang => (
                    <option key={lang.value} value={lang.value}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoDetect}
                    onChange={e => setAutoDetect(e.target.checked)}
                  />
                  Auto-detect Guest Language
                </label>
              </div>
            </label>

            <div className="flex flex-col gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="icon text-sm">record_voice_over</span> Voice Settings
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="supertonic-voice-select" className="text-xs text-gray-300 font-medium">
                    Voice Profile
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    id="supertonic-voice-select"
                    value={voice}
                    onChange={e => setVoice(e.target.value)}
                    className="flex-1 text-xs"
                  >
                    <optgroup label="Female Voices (F1–F5)">
                      {AVAILABLE_VOICES.filter(v => v.gender === 'female').map(v => (
                        <option key={v.value} value={v.value}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Male Voices (M1–M5)">
                      {AVAILABLE_VOICES.filter(v => v.gender === 'male').map(v => (
                        <option key={v.value} value={v.value}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Legacy Voice Compatibility">
                      {AVAILABLE_VOICES.filter(v => !v.gender).map(v => (
                        <option key={v.value} value={v.value}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    id="play-sample-voice-button"
                    type="button"
                    onClick={handlePreviewVoice}
                    disabled={connected}
                    aria-label={isPlayingPreview ? "Stop audio sample" : "Play sample of selected voice and prosody"}
                    title={isPlayingPreview ? "Stop audio sample" : `Play sample with ${voice} and ${prosodyProfile} prosody`}
                    className={`shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-all shadow-sm ${
                      isPlayingPreview
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
                        : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <span className="icon text-sm leading-none">
                      {isPlayingPreview ? 'stop' : 'play_arrow'}
                    </span>
                    <span className="whitespace-nowrap">
                      {isPlayingPreview ? 'Stop' : 'Play Sample'}
                    </span>
                  </button>
                </div>
              </div>

              <label>
                Prosody Profile
                <select
                  value={prosodyProfile}
                  onChange={e => setProsodyProfile(e.target.value)}
                >
                  {AVAILABLE_PROSODY_PROFILES.map(p => (
                    <option key={p.value} value={p.value}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <label className="sidebar-section-title">Translation Mode</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="mode"
                  checked={medicalMode}
                  onChange={() => setMedicalMode(true)}
                />
                Medical Terms
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="mode"
                  checked={!medicalMode}
                  onChange={() => setMedicalMode(false)}
                />
                General
              </label>
            </div>

            <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-gray-700/40">
              <label className="sidebar-section-title">Local Edge AI Engine</label>
              
              {/* Automated Ollama Server & Model Auto-Installer Card */}
              <OllamaAutoInstallCard />
            </div>
          </fieldset>
          <button
            onClick={handleSave}
            className="save-settings-button"
            disabled={connected}
          >
            Save Settings
          </button>
        </div>
        <div className="sidebar-section history-section">
          <div className="sidebar-section-title-wrapper">
            <h4 className="sidebar-section-title">Translation History</h4>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="export-history-button"
                disabled={history.length === 0}
                aria-label="Export history"
                title="Export history"
              >
                <span className="icon">download</span> Export
              </button>
              <button
                onClick={clearHistory}
                className="clear-history-button"
                disabled={history.length === 0}
                aria-label="Clear translation history"
              >
                <span className="icon">delete_sweep</span> Clear
              </button>
            </div>
          </div>
          <div className="history-list">
            {history.length > 0 ? (
              history.map(item => (
                <div key={item.id} className="history-item">
                  <div className="history-item-header">
                    <span className="history-item-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="history-item-langs">
                      {item.lang1} → {item.lang2}
                    </span>
                  </div>
                  <div className="history-item-source">
                    <strong>Source:</strong> {item.sourceText}
                  </div>
                  <div className="history-item-translation">
                    <strong>Translation:</strong> {item.translatedText}
                  </div>
                </div>
              ))
            ) : (
              <p className="history-empty-placeholder">
                No history yet. Start a translation to see it here.
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="powered-by">Powered by Eburon AI</span>
        </div>
      </div>
    </aside>
  );
}