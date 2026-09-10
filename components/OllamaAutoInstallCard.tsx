/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ollamaManager, OllamaServerStatus } from '../lib/ollama-manager';
import { useSettings } from '../lib/state';

export default function OllamaAutoInstallCard() {
  const [status, setStatus] = useState<OllamaServerStatus>(ollamaManager.getStatus());
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const { model, setModel } = useSettings();

  useEffect(() => {
    const unsubscribe = ollamaManager.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => unsubscribe();
  }, []);

  const handleAutoInstall = async () => {
    setActionMessage('Initiating automatic Ollama installation...');
    const result = await ollamaManager.autoInstallAndSetup();
    setActionMessage(result.message);
  };

  const handleStartServer = async () => {
    setActionMessage('Starting Ollama daemon...');
    const result = await ollamaManager.startServer();
    setActionMessage(result.message);
  };

  const handlePullGemma = async () => {
    setActionMessage('Starting Gemma 3 1B download...');
    const result = await ollamaManager.pullModel(model || 'gemma3:1b');
    setActionMessage(result.message);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const isFullyReady = status.running && status.hasGemma;

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-gray-900/80 border border-gray-800 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="icon text-purple-400 text-base">neurology</span>
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Ollama Edge Engine
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {status.running ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online {status.latencyMs ? `(${status.latencyMs}ms)` : ''}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Model Status */}
      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-gray-950/60 border border-gray-800/80 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Active Model</span>
          <span className="font-mono text-gray-200 text-xs font-medium">{model || 'gemma3:1b'}</span>
        </div>
        <div>
          {status.hasGemma ? (
            <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
              <span className="icon text-sm">check_circle</span> Installed
            </span>
          ) : status.isPulling ? (
            <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1">
              <span className="icon text-sm animate-spin">sync</span> Downloading...
            </span>
          ) : (
            <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1">
              <span className="icon text-sm">download</span> Not Installed
            </span>
          )}
        </div>
      </div>

      {/* Pull Progress Bar */}
      {status.isPulling && (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40">
          <div className="flex items-center justify-between text-xs text-blue-300">
            <span className="font-medium truncate max-w-[200px]">{status.pullStatus || 'Downloading model...'}</span>
            <span className="font-mono font-bold">{status.pullPercent}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, status.pullPercent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Install Progress / State */}
      {status.isInstalling && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/50 text-xs text-purple-300">
          <span className="icon animate-spin text-sm">progress_activity</span>
          <span>Installing Ollama server binary... Please wait.</span>
        </div>
      )}

      {/* Action Buttons */}
      {!isFullyReady && (
        <div className="flex flex-col gap-2 pt-1">
          {!status.running && (
            <button
              type="button"
              onClick={handleAutoInstall}
              disabled={status.isInstalling}
              className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <span className="icon text-sm">bolt</span>
              <span>{status.installed ? 'Start Ollama Server' : 'Auto-Install Ollama Server'}</span>
            </button>
          )}

          {status.running && !status.hasGemma && !status.isPulling && (
            <button
              type="button"
              onClick={handlePullGemma}
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
            >
              <span className="icon text-sm">cloud_download</span>
              <span>Auto-Download Gemma 3 1B (~850 MB)</span>
            </button>
          )}
        </div>
      )}

      {/* Action feedback */}
      {actionMessage && (
        <p className="text-[11px] text-gray-400 italic px-1">{actionMessage}</p>
      )}

      {/* Manual / Device Setup Expandable */}
      <div className="border-t border-gray-800/80 pt-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === 'auto' ? 'manual' : 'auto')}
          className="flex items-center justify-between text-[11px] text-gray-400 hover:text-gray-300 font-medium py-0.5"
        >
          <span>Run on your own Device (Mac/PC/Linux)</span>
          <span className="icon text-xs">{activeTab === 'manual' ? 'expand_less' : 'expand_more'}</span>
        </button>

        {activeTab === 'manual' && (
          <div className="flex flex-col gap-2 p-2 rounded-lg bg-gray-950/70 border border-gray-800/60 text-xs">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              If running directly on your personal computer, execute this one-liner in your terminal:
            </p>

            <div className="flex items-center justify-between p-1.5 rounded bg-gray-900 border border-gray-800 font-mono text-[10px] text-emerald-300">
              <span className="truncate mr-2">curl -fsSL https://ollama.com/install.sh | sh && ollama run gemma3:1b</span>
              <button
                type="button"
                onClick={() => copyToClipboard('curl -fsSL https://ollama.com/install.sh | sh && ollama run gemma3:1b', 'unix')}
                className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px]"
              >
                {copiedCmd === 'unix' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span>Windows: <code className="text-gray-300">winget install Ollama.Ollama</code></span>
              <button
                type="button"
                onClick={() => copyToClipboard('winget install Ollama.Ollama && ollama run gemma3:1b', 'win')}
                className="text-blue-400 hover:underline"
              >
                {copiedCmd === 'win' ? 'Copied' : 'Copy Win'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
