import path from 'path';
import { exec, spawn } from 'child_process';
import http from 'http';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';

function sttPlugin(apiKey?: string): Plugin {
  let aiClient: GoogleGenAI | null = null;
  function getAI() {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) return null;
    if (!aiClient) {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
    return aiClient;
  }

  return {
    name: 'stt-transcribe-service',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/stt') && !req.url?.startsWith('/api/translate')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost:3000');
        const pathname = url.pathname;

        res.setHeader('Content-Type', 'application/json');

        if (pathname === '/api/translate' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { text, sourceLang, targetLang, medicalMode, topic } = data;

              if (!text) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ ok: false, error: 'No text provided' }));
              }

              const ai = getAI();
              if (!ai) {
                res.statusCode = 503;
                return res.end(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY is not configured.' }));
              }

              let medicalPrompt = '';
              if (medicalMode) {
                medicalPrompt = `You are a medical translator. Use accurate clinical terminology.`;
              }

              const prompt = `Translate the following text from ${sourceLang} to ${targetLang}.
Topic: ${topic || 'General'}.
${medicalPrompt}
Output ONLY the translated text, nothing else.

Text:
"${text}"`;

              const result = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
              });
              
              const translatedText = result.text?.trim() || '';
              res.end(JSON.stringify({ ok: true, text: translatedText }));
            } catch (err: any) {
              console.error('Translation API error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Failed to translate text' }));
            }
          });
          return;
        }

        if (pathname === '/api/stt/health') {
          return res.end(JSON.stringify({
            ok: true,
            hasKey: !!(apiKey || process.env.GEMINI_API_KEY),
            engine: 'gemini-3.6-flash',
            sampleRate: 16000
          }));
        }

        if (pathname === '/api/stt/transcribe' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const audioBase64 = data.audio;
              const mimeType = data.mimeType || 'audio/wav';
              const languageHint = data.languageHint || 'Dutch (Flemish) or English';

              if (!audioBase64) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ ok: false, error: 'No audio data received' }));
              }

              const ai = getAI();
              if (!ai) {
                res.statusCode = 503;
                return res.end(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY is not configured on the server.' }));
              }

              const promptText = `You are a real-time speech-to-text transcriber for a dual-language hospital / clinic translator.
The speaker is speaking either ${languageHint}.
Transcribe the speech with exact verbatim accuracy.
Rules:
1. Return ONLY the verbatim transcribed words spoken in the audio.
2. If the audio is silence, breathing, background noise, or unintelligible, return an empty string "".
3. Do not add quotes, commentary, or punctuation labels.`;

              let resultText = '';
              const modelsToTry = ['gemini-3.6-flash', 'gemini-3.8-flash'];
              let lastErr = null;

              for (const modelName of modelsToTry) {
                try {
                  const result = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                      {
                        role: 'user',
                        parts: [
                          {
                            inlineData: {
                              mimeType: mimeType,
                              data: audioBase64
                            }
                          },
                          {
                            text: promptText
                          }
                        ]
                      }
                    ]
                  });
                  resultText = result.text?.trim().replace(/^["']|["']$/g, '') || '';
                  lastErr = null;
                  break;
                } catch (e: any) {
                  lastErr = e;
                }
              }

              if (lastErr && !resultText) {
                throw lastErr;
              }

              res.end(JSON.stringify({ ok: true, text: resultText }));
            } catch (err: any) {
              console.error('STT Transcribe API error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Failed to transcribe audio' }));
            }
          });
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
    }
  };
}

function ollamaManagerPlugin(): Plugin {
  let isInstalling = false;
  let isPulling = false;
  let pullStatus = '';
  let pullPercent = 0;
  let installLogs: string[] = [];

  return {
    name: 'ollama-manager',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/ollama-manager')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost:3000');
        const pathname = url.pathname;

        res.setHeader('Content-Type', 'application/json');

        if (pathname === '/api/ollama-manager/status') {
          exec('which ollama || test -f /usr/local/bin/ollama', (err) => {
            const installed = !err;

            const clientReq = http.get('http://127.0.0.1:11434/api/tags', (ollamaRes) => {
              let body = '';
              ollamaRes.on('data', chunk => body += chunk);
              ollamaRes.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
                  const hasGemma = models.some((m: string) => m.toLowerCase().includes('gemma'));
                  res.end(JSON.stringify({
                    installed,
                    running: true,
                    models,
                    hasGemma,
                    isInstalling,
                    isPulling,
                    pullStatus,
                    pullPercent,
                    installLogs: installLogs.slice(-10)
                  }));
                } catch {
                  res.end(JSON.stringify({
                    installed,
                    running: true,
                    models: [],
                    hasGemma: false,
                    isInstalling,
                    isPulling,
                    pullStatus,
                    pullPercent
                  }));
                }
              });
            });

            clientReq.on('error', () => {
              res.end(JSON.stringify({
                installed,
                running: false,
                models: [],
                hasGemma: false,
                isInstalling,
                isPulling,
                pullStatus,
                pullPercent,
                installLogs: installLogs.slice(-10)
              }));
            });
            clientReq.setTimeout(1200, () => clientReq.destroy());
          });
          return;
        }

        if (pathname === '/api/ollama-manager/install' && req.method === 'POST') {
          if (isInstalling) {
            return res.end(JSON.stringify({ ok: true, message: 'Installation already in progress' }));
          }
          isInstalling = true;
          installLogs = ['Starting Ollama installation...'];

          exec('which ollama || test -f /usr/local/bin/ollama', (err) => {
            if (!err) {
              installLogs.push('Ollama binary present. Launching daemon...');
              exec('nohup /usr/local/bin/ollama serve > /tmp/ollama.log 2>&1 &', () => {
                isInstalling = false;
                installLogs.push('Ollama daemon launched.');
              });
              return res.end(JSON.stringify({ ok: true, message: 'Starting existing Ollama daemon...' }));
            }

            installLogs.push('Executing official Ollama install script...');
            const installProc = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh']);
            installProc.stdout.on('data', d => installLogs.push(d.toString()));
            installProc.stderr.on('data', d => installLogs.push(d.toString()));
            installProc.on('close', (code) => {
              installLogs.push(`Install exited with code ${code}`);
              if (code === 0) {
                exec('nohup /usr/local/bin/ollama serve > /tmp/ollama.log 2>&1 &', () => {
                  isInstalling = false;
                  installLogs.push('Ollama service online.');
                });
              } else {
                isInstalling = false;
              }
            });

            res.end(JSON.stringify({ ok: true, message: 'Installing Ollama server...' }));
          });
          return;
        }

        if (pathname === '/api/ollama-manager/start' && req.method === 'POST') {
          exec('nohup /usr/local/bin/ollama serve > /tmp/ollama.log 2>&1 &', (err) => {
            res.end(JSON.stringify({ ok: !err, message: err ? err.message : 'Ollama daemon started' }));
          });
          return;
        }

        if (pathname === '/api/ollama-manager/pull' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            let modelToPull = 'gemma3:1b';
            try {
              const parsed = JSON.parse(body || '{}');
              if (parsed.model) modelToPull = parsed.model;
            } catch {}

            isPulling = true;
            pullStatus = `Pulling ${modelToPull}...`;
            pullPercent = 5;

            const pullReq = http.request('http://127.0.0.1:11434/api/pull', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }, (pullRes) => {
              let buf = '';
              pullRes.on('data', (chunk) => {
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.status) pullStatus = parsed.status;
                    if (parsed.total && parsed.completed) {
                      pullPercent = Math.round((parsed.completed / parsed.total) * 100);
                    }
                  } catch {}
                }
              });
              pullRes.on('end', () => {
                isPulling = false;
                pullStatus = `${modelToPull} downloaded!`;
                pullPercent = 100;
              });
            });

            pullReq.on('error', (err) => {
              isPulling = false;
              pullStatus = `Error: ${err.message}`;
            });

            pullReq.write(JSON.stringify({ model: modelToPull, stream: true }));
            pullReq.end();

            res.end(JSON.stringify({ ok: true, message: `Pulling ${modelToPull}...` }));
          });
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/ollama': {
            target: 'http://127.0.0.1:11434',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
          },
        },
      },
      plugins: [react(), ollamaManagerPlugin(), sttPlugin(env.GEMINI_API_KEY)],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
