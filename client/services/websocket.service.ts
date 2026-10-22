export interface AiProgressEvent {
  message?: string;
  percent?: number;
  result?: Record<string, unknown>;
  runtime?: string;
  sessionId?: string;
  stage: string;
  step?: number;
  tool?: string;
  totalSteps?: number;
}

type ProgressCallback = (event: AiProgressEvent) => void;

class WebSocketClientService {
  private activeSubscriptions = new Map<string, Set<ProgressCallback>>();
  private isConnecting = false;
  private pingInterval: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private socket: WebSocket | null = null;

  connect(sessionId?: string): Promise<WebSocket | null> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      if (sessionId) {
        this.sendSubscribe(sessionId);
      }
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const intervalId = window.setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            window.clearInterval(intervalId);
            if (sessionId) this.sendSubscribe(sessionId);
            resolve(this.socket);
          } else if (!this.isConnecting) {
            window.clearInterval(intervalId);
            resolve(null);
          }
        }, 50);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname || 'localhost';
        const wsPort = '3001';
        const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
        const wsUrl = `${protocol}//${hostname}:${wsPort}/ws/ai${query}`;

        console.log(`[WebSocket] Conectando a ${wsUrl}...`);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] Conexión establecida con éxito con Aurora WS (Rust).');
          this.socket = ws;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();

          for (const [subId] of this.activeSubscriptions.entries()) {
            this.sendSubscribe(subId);
          }

          resolve(ws);
        };

        ws.onmessage = (event) => {
          try {
            const data: AiProgressEvent = JSON.parse(event.data);
            if (data.sessionId && this.activeSubscriptions.has(data.sessionId)) {
              const callbacks = this.activeSubscriptions.get(data.sessionId);
              if (callbacks) {
                for (const cb of callbacks) {
                  cb(data);
                }
              }
            }
          } catch (err) {
            console.warn('[WebSocket] Error al analizar mensaje entrante:', err);
          }
        };

        ws.onerror = (err) => {
          console.warn('[WebSocket] Advertencia en conexión WebSocket:', err);
        };

        ws.onclose = () => {
          console.log('[WebSocket] Conexión cerrada.');
          this.socket = null;
          this.isConnecting = false;
          this.stopHeartbeat();
          this.scheduleReconnect();
          resolve(null);
        };
      } catch (err) {
        console.error('[WebSocket] Error al instanciar WebSocket:', err);
        this.isConnecting = false;
        resolve(null);
      }
    });
  }

  subscribeAiProgress(sessionId: string, callback: ProgressCallback): () => void {
    if (!this.activeSubscriptions.has(sessionId)) {
      this.activeSubscriptions.set(sessionId, new Set());
    }
    this.activeSubscriptions.get(sessionId)!.add(callback);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscribe(sessionId);
    } else {
      this.connect(sessionId);
    }

    return () => {
      const set = this.activeSubscriptions.get(sessionId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.activeSubscriptions.delete(sessionId);
        }
      }
    };
  }

  private sendSubscribe(sessionId: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ sessionId, type: 'subscribe' }));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.activeSubscriptions.size === 0) return;

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[WebSocket] Reintentando conexión (intento ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.activeSubscriptions.clear();
  }
}

export const wsService = new WebSocketClientService();
