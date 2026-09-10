
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import './WelcomeScreen.css';
import { useLogStore, useSettings } from '../../../lib/state';

const WelcomeScreen: React.FC = () => {
  const turns = useLogStore(state => state.turns);
  const { language1, language2 } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});

  const toggleDetails = (index: number) => {
    setExpandedDetails(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Auto-scroll to bottom whenever turns update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content empty">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            <span>{language1}</span>
            <span className="text-gray-400">⇄</span>
            <span>{language2}</span>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-1">Eburon AI Local Translator</h2>
            <p className="text-sm text-gray-400 max-w-sm">
              Real-time streaming translation powered by Local STT, Gemma 3 (Ollama), and Supertonic 3 (Dutch Flemish).
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Ready for speech streaming</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-screen chat-layout" ref={scrollRef}>
      <div className="chat-thread">
        {turns.map((turn, index) => {
          const isExpanded = !!expandedDetails[index];
          const hasMetadata = turn.transcription || (turn.groundingChunks && turn.groundingChunks.length > 0);

          return (
            <div 
              key={index} 
              className={`turn-block ${turn.role} ${turn.isFinal ? 'final' : 'interim'}`}
            >
              <div className="turn-inner">
                <div className="flex items-center justify-between">
                  <span className="turn-label">
                    {turn.role === 'user' ? 'Input' : 'Translation'}
                  </span>
                  {hasMetadata && (
                    <button
                      onClick={() => toggleDetails(index)}
                      className="text-[11px] font-medium text-gray-400 hover:text-gray-200 bg-gray-800/60 hover:bg-gray-800 px-2 py-0.5 rounded border border-gray-700/50 transition-colors flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                      <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  )}
                </div>

                <div className="turn-text-wrapper">
                  {turn.role === 'user' ? (
                    <p className="turn-text">
                      {turn.text}
                      {(!turn.isFinal && index === turns.length - 1) && <span className="cursor"></span>}
                    </p>
                  ) : (
                    <>
                      {turn.translation ? (
                        <p className="turn-text">
                          {turn.translation}
                          {(!turn.isFinal && index === turns.length - 1) && <span className="cursor"></span>}
                        </p>
                      ) : (
                        <p className="turn-text">
                          {turn.text}
                          {(!turn.isFinal && index === turns.length - 1) && <span className="cursor"></span>}
                        </p>
                      )}

                      {/* Collapsible Secondary Metadata */}
                      {hasMetadata && isExpanded && (
                        <div className="mt-3 pt-3 border-t border-gray-800 flex flex-col gap-2 text-xs text-gray-400 animate-fadeIn">
                          {turn.transcription && (
                            <div>
                              <span className="font-semibold text-gray-300">Raw Source Transcription:</span>
                              <p className="italic mt-0.5 text-gray-400">{turn.transcription}</p>
                            </div>
                          )}
                          {turn.groundingChunks && turn.groundingChunks.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-300">Grounding Metadata:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {turn.groundingChunks.map((chunk, ci) => (
                                  <span key={ci} className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    {chunk.web?.title || 'Source'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WelcomeScreen;
