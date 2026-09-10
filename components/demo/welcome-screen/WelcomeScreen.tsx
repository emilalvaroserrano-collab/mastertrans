
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import './WelcomeScreen.css';
import { useLogStore, useSettings } from '../../../lib/state';

const WelcomeScreen: React.FC = () => {
  const turns = useLogStore(state => state.turns);
  const { language1, language2 } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);

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
        {turns.map((turn, index) => (
          <div 
            key={index} 
            className={`turn-block ${turn.role} ${turn.isFinal ? 'final' : 'interim'}`}
          >
            <div className="turn-inner">
              <span className="turn-label">
                {turn.role === 'user' ? 'Input' : 'Translation'}
              </span>
              <div className="turn-text-wrapper">
                {turn.role === 'user' ? (
                  <p className="turn-text">
                    {turn.text}
                    {(!turn.isFinal && index === turns.length - 1) && <span className="cursor"></span>}
                  </p>
                ) : (
                  <>
                    {turn.transcription && (
                      <p className="turn-transcription">
                        {turn.transcription}
                      </p>
                    )}
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
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WelcomeScreen;
