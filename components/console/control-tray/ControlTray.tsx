/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from 'classnames';

// FIX: Import React to use React.CSSProperties
import React, { memo, ReactNode, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '../../../lib/audio-recorder';
import { useLogStore } from '../../../lib/state';
import { useAuth, clearUserConversations } from '../../../lib/auth';
import { useVAD } from '../../../hooks/use-vad';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { localSTT } from '../../../lib/local-stt';
import MicVisualizer from '../../MicVisualizer';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const isSpeaking = useVAD(audioRecorder);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [sttState, setSttState] = useState<{ engine: string; isSpeaking: boolean; isRunning: boolean }>({
    engine: localSTT.engine,
    isSpeaking: false,
    isRunning: false,
  });
  const { session, user } = useAuth();

  useEffect(() => {
    localSTT.setStatusCallback((status) => {
      setSttState(status);
    });
  }, []);

  const {
    client,
    connected,
    connect,
    disconnect,
    isTtsMuted,
    toggleTtsMute,
    isAiSpeaking,
  } = useLiveAPIContext();

  useEffect(() => {
    if (connected) {
      setIsConnecting(false);
    }
  }, [connected]);

  useEffect(() => {
    if (audioRecorder.stream) {
      audioRecorder.stream.getTracks().forEach(track => {
        track.enabled = !isAiSpeaking && !muted;
      });
    }
  }, [isAiSpeaking, muted, audioRecorder.stream]);
  
  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    if (!connected) {
      setMuted(false);
    }
  }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    const onRawChunk = (samples: Int16Array) => {
      localSTT.feedRawChunk(samples);
    };
    const onVolume = (vol: number) => {
      setMicVolume(vol);
    };

    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.on('rawChunk', onRawChunk);
      audioRecorder.on('volume', onVolume);
      audioRecorder.start();
    } else {
      setMicVolume(0);
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData);
      audioRecorder.off('rawChunk', onRawChunk);
      audioRecorder.off('volume', onVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  const handleMicClick = async () => {
    if (!session) return;
    if (connected) {
      setMuted(!muted);
    } else {
      setIsConnecting(true);
      try {
        await connect();
      } catch (e) {
        setIsConnecting(false);
      }
    }
  };

  const connectButtonAction = async () => {
    if (!session) return;
    if (connected) {
      disconnect();
    } else {
      setIsConnecting(true);
      try {
        await connect();
      } catch (e) {
        setIsConnecting(false);
      }
    }
  };

  const handleReset = () => {
    useLogStore.getState().clearTurns();
    if (user) {
      clearUserConversations(user.id);
    }
  };

  const micButtonTitle = session
    ? connected
      ? muted
        ? 'Unmute microphone'
        : 'Mute microphone'
      : 'Connect and start microphone'
    : 'Please sign in to use the translator';

  const connectButtonTitle = session
    ? connected
      ? 'Stop streaming'
      : 'Start streaming'
    : 'Please sign in to use the translator';

  const isMicActive = connected && !muted;

  return (
    <section className="control-tray">
      {/* Realtime STT Engine Status Pill */}
      <div className="flex items-center justify-center gap-2 mb-2 text-xs">
        <span
          className={cn('w-2 h-2 rounded-full transition-colors', {
            'bg-emerald-400 animate-pulse': sttState.isSpeaking,
            'bg-blue-400': connected && !sttState.isSpeaking,
            'bg-gray-500': !connected,
          })}
        />
        <span className="text-gray-400 font-medium">
          STT Engine: <strong className="text-gray-200">{sttState.engine}</strong>
          {sttState.isSpeaking
            ? ' • 🎙️ Speech Detected'
            : connected
            ? ' • Ready'
            : ' • Offline'}
        </span>
      </div>

      <MicVisualizer volume={micVolume} isActive={isMicActive} />
      <div className="control-tray-buttons">
        <nav className={cn('actions-nav')}>
          <button
            className={cn('action-button mic-button', { active: isMicActive })}
            onClick={handleMicClick}
            title={micButtonTitle}
            disabled={!session}
            style={{ '--mic-volume': micVolume } as React.CSSProperties}
          >
            {!muted ? (
              <span className="material-symbols-outlined filled">mic</span>
            ) : (
              <span className="material-symbols-outlined filled">mic_off</span>
            )}
          </button>
          <button
            className={cn('action-button')}
            onClick={toggleTtsMute}
            aria-label={isTtsMuted ? 'Unmute audio output' : 'Mute audio output'}
            title={isTtsMuted ? 'Unmute audio output' : 'Mute audio output'}
          >
            <span className="icon">{isTtsMuted ? 'volume_off' : 'volume_up'}</span>
          </button>
          <button
            className={cn('action-button')}
            onClick={handleReset}
            aria-label="Reset Chat"
            title="Reset session logs"
          >
            <span className="icon">refresh</span>
          </button>
          {children}
        </nav>

        <div className={cn('connection-container', { connected })}>
          <div className="connection-button-container">
            <button
              ref={connectButtonRef}
              className={cn('action-button connect-toggle', { connected })}
              onClick={connectButtonAction}
              title={connectButtonTitle}
              disabled={!session}
            >
              <span className="material-symbols-outlined filled">
                {connected ? 'pause' : (isConnecting ? 'sync' : 'play_arrow')}
              </span>
            </button>
          </div>
          <span className="text-indicator">{isConnecting ? 'Connecting...' : 'Streaming'}</span>
        </div>
      </div>

      {/* Direct Speech / Phrase Quick Test Bar */}
      <div className="quick-speech-test flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg bg-gray-900/80 border border-gray-800 text-xs w-full max-w-md mx-auto shadow-sm">
        <span className="text-gray-400 font-medium whitespace-nowrap">Test Speech:</span>
        <input
          type="text"
          placeholder="Type phrase (e.g. 'Hallo dokter, ik heb buikpijn')..."
          className="flex-1 bg-transparent text-gray-200 focus:outline-none placeholder:text-gray-600 text-xs"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && testInput.trim()) {
              localSTT.submitDirectSpeech(testInput.trim());
              setTestInput('');
            }
          }}
        />
        <button
          onClick={() => {
            if (testInput.trim()) {
              localSTT.submitDirectSpeech(testInput.trim());
              setTestInput('');
            }
          }}
          disabled={!testInput.trim()}
          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-xs transition-colors"
        >
          Send
        </button>
      </div>
    </section>
  );
}

export default memo(ControlTray);