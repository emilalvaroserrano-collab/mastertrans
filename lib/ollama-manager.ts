/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ollama Manager - Automated Server Detection, One-Click Installation,
 * and Gemma 3 Model Lifecycle Management.
 */

export interface OllamaServerStatus {
  installed: boolean;
  running: boolean;
  models: string[];
  hasGemma: boolean;
  isInstalling: boolean;
  isPulling: boolean;
  pullStatus: string;
  pullPercent: number;
  installLogs?: string[];
  latencyMs?: number;
  error?: string | null;
}

type StatusListener = (status: OllamaServerStatus) => void;

export class OllamaManager {
  private currentStatus: OllamaServerStatus = {
    installed: false,
    running: false,
    models: [],
    hasGemma: false,
    isInstalling: false,
    isPulling: false,
    pullStatus: '',
    pullPercent: 0,
    error: null
  };

  private listeners: Set<StatusListener> = new Set();
  private pollInterval: any = null;
  private isAutoPullTriggered: boolean = false;

  constructor() {
    this.checkStatus();
    this.startPolling();
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentStatus);
      } catch (err) {
        console.warn('OllamaManager listener error:', err);
      }
    }
  }

  public startPolling(intervalMs: number = 3000) {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.checkStatus();
    }, intervalMs);
  }

  public stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  public getStatus(): OllamaServerStatus {
    return this.currentStatus;
  }

  /**
   * Queries status from server API proxy or direct Ollama instance
   */
  public async checkStatus(): Promise<OllamaServerStatus> {
    const startTime = performance.now();

    try {
      // 1. First query server-side manager endpoint
      const res = await fetch('/api/ollama-manager/status', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (res.ok) {
        const data = await res.json();
        const latencyMs = Math.round(performance.now() - startTime);

        this.currentStatus = {
          ...this.currentStatus,
          installed: !!data.installed,
          running: !!data.running,
          models: Array.isArray(data.models) ? data.models : [],
          hasGemma: !!data.hasGemma,
          isInstalling: !!data.isInstalling,
          isPulling: !!data.isPulling,
          pullStatus: data.pullStatus || '',
          pullPercent: typeof data.pullPercent === 'number' ? data.pullPercent : 0,
          installLogs: data.installLogs,
          latencyMs,
          error: null
        };

        // If running but gemma3 is not yet installed and not pulling, auto-pull!
        if (this.currentStatus.running && !this.currentStatus.hasGemma && !this.currentStatus.isPulling && !this.isAutoPullTriggered) {
          this.isAutoPullTriggered = true;
          this.pullModel('gemma3:1b');
        }

        // Auto-install if not installed
        if (!this.currentStatus.installed && !this.currentStatus.isInstalling) {
          // Fire and forget
          this.autoInstallAndSetup().catch(console.error);
        }

        this.notify();
        return this.currentStatus;
      }
    } catch {
      // Server-side manager endpoint not reachable; fallback to direct /api/ollama tags
    }

    try {
      // 2. Direct Ollama tags check via proxy
      const directRes = await fetch('/api/ollama/api/tags', {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (directRes.ok) {
        const data = await directRes.json();
        const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
        const hasGemma = models.some((m: string) => m.toLowerCase().includes('gemma'));
        const latencyMs = Math.round(performance.now() - startTime);

        this.currentStatus = {
          ...this.currentStatus,
          installed: true,
          running: true,
          models,
          hasGemma,
          latencyMs,
          error: null
        };

        if (!hasGemma && !this.currentStatus.isPulling && !this.isAutoPullTriggered) {
          this.isAutoPullTriggered = true;
          this.pullModel('gemma3:1b');
        }

        this.notify();
        return this.currentStatus;
      }
    } catch (err: any) {
      this.currentStatus = {
        ...this.currentStatus,
        running: false,
        error: 'Ollama service is not responding.'
      };
      this.notify();
    }

    return this.currentStatus;
  }

  /**
   * One-click automated setup: installs Ollama server if missing,
   * starts daemon, and pulls gemma3:1b.
   */
  public async autoInstallAndSetup(): Promise<{ ok: boolean; message: string }> {
    this.currentStatus.isInstalling = true;
    this.currentStatus.error = null;
    this.notify();

    try {
      const res = await fetch('/api/ollama-manager/install', {
        method: 'POST'
      });
      const data = await res.json();
      this.checkStatus();
      return { ok: true, message: data.message || 'Auto-install initiated.' };
    } catch (err: any) {
      this.currentStatus.isInstalling = false;
      this.currentStatus.error = err.message || 'Failed to trigger installation.';
      this.notify();
      return { ok: false, message: this.currentStatus.error };
    }
  }

  /**
   * Launches the Ollama daemon if binary is already installed
   */
  public async startServer(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch('/api/ollama-manager/start', {
        method: 'POST'
      });
      const data = await res.json();
      setTimeout(() => this.checkStatus(), 1000);
      return { ok: true, message: data.message || 'Server start requested.' };
    } catch (err: any) {
      return { ok: false, message: err.message || 'Failed to start Ollama server.' };
    }
  }

  /**
   * Pulls Gemma 3 1B with real-time streaming progress
   */
  public async pullModel(modelName: string = 'gemma3:1b'): Promise<{ ok: boolean; message: string }> {
    this.currentStatus.isPulling = true;
    this.currentStatus.pullStatus = `Initiating pull for ${modelName}...`;
    this.currentStatus.pullPercent = 2;
    this.notify();

    try {
      const res = await fetch('/api/ollama-manager/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });

      if (res.ok) {
        // Fast status polling while pulling
        this.startPolling(1000);
        return { ok: true, message: `Pulling ${modelName}` };
      }
    } catch {
      // Fallback: try direct proxy pull if manager endpoint failed
      try {
        const directRes = await fetch('/api/ollama/api/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, stream: true })
        });

        if (directRes.ok && directRes.body) {
          const reader = directRes.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.status) this.currentStatus.pullStatus = parsed.status;
                if (parsed.total && parsed.completed) {
                  this.currentStatus.pullPercent = Math.round((parsed.completed / parsed.total) * 100);
                }
                this.notify();
              } catch {}
            }
          }

          this.currentStatus.isPulling = false;
          this.currentStatus.hasGemma = true;
          this.currentStatus.pullPercent = 100;
          this.currentStatus.pullStatus = `${modelName} ready!`;
          this.notify();
          this.checkStatus();
          return { ok: true, message: `${modelName} installed successfully` };
        }
      } catch (err: any) {
        this.currentStatus.isPulling = false;
        this.currentStatus.error = err.message || 'Model pull error';
        this.notify();
      }
    }

    return { ok: false, message: 'Could not trigger model pull' };
  }
}

export const ollamaManager = new OllamaManager();
