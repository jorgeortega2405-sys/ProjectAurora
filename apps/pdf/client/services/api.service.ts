import { User } from '../types/auth.types.js';
import { trackApiLatency } from './telemetry.service.js';

export let currentUser: User | null = null;
export let linkedAccounts: User[] = [];
const authListeners = new Set<(user: User | null, accounts?: User[]) => void>();

export function setAuthState(user: User | null, accounts: User[] = []): void {
  currentUser = user;
  linkedAccounts = accounts.length > 0 ? accounts : (user ? [user] : []);
  authListeners.forEach((fn) => {
    try {
      fn(currentUser, linkedAccounts);
    } catch {}
  });
}

export function setCurrentUser(user: User | null): void {
  setAuthState(user, linkedAccounts);
}

export function setLinkedAccounts(accounts: User[]): void {
  setAuthState(currentUser, accounts);
}

export function clearUserState(): void {
  setAuthState(null, []);
}

export function onAuthChange(callback: (user: User | null, accounts?: User[]) => void): () => void {
  authListeners.add(callback);
  return () => {
    authListeners.delete(callback);
  };
}

export function getCsrfToken(): string {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const match = document.cookie.match(/(?:^|;\s*)aurora_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  let token = getCsrfToken();
  if ((!token || forceRefresh) && typeof window !== 'undefined') {
    try {
      await fetch('/api/health', { credentials: 'include' });
      token = getCsrfToken();
    } catch {}
  }
  return token;
}

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false;
  const perms = user.permissions;
  if (Array.isArray(perms) && perms.length > 0) {
    return perms.includes('*') || perms.includes(permission);
  }
  return false;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const startTime = performance.now();
  try {
    const res = await fetch(url, init);
    const duration = Math.round(performance.now() - startTime);
    trackApiLatency(url, init.method || 'GET', duration, res.status);
    return res;
  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    trackApiLatency(url, init.method || 'GET', duration, 0);
    throw err;
  }
}

export async function getApi(url: string): Promise<Response> {
  return timedFetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
    method: 'GET',
  });
}

export async function postApi(url: string, body?: unknown, customHeaders?: Record<string, string>): Promise<Response> {
  const token = await ensureCsrfToken();
  return timedFetch(url, {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': token,
      ...(customHeaders || {}),
    },
    method: 'POST',
  });
}

export async function putApi(url: string, body?: unknown): Promise<Response> {
  const token = await ensureCsrfToken();
  return timedFetch(url, {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    },
    method: 'PUT',
  });
}

export async function deleteApi(url: string, body?: unknown): Promise<Response> {
  const token = await ensureCsrfToken();
  return timedFetch(url, {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'x-csrf-token': token,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    method: 'DELETE',
  });
}

export async function postFormApi(url: string, formData: FormData): Promise<Response> {
  const token = await ensureCsrfToken();
  return timedFetch(url, {
    body: formData,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'x-csrf-token': token,
    },
    method: 'POST',
  });
}

export interface UploadProgressInfo {
  etaSeconds: number;
  loaded: number;
  percent: number;
  speedBytesPerSec: number;
  total: number;
}

export async function postFormWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (info: UploadProgressInfo) => void,
  signal?: AbortSignal
): Promise<Response> {
  const token = await ensureCsrfToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('x-csrf-token', token);

    const startTime = Date.now();

    if (xhr.upload && onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0) {
          const elapsedSec = Math.max(0.05, (Date.now() - startTime) / 1000);
          const speedBytesPerSec = e.loaded / elapsedSec;
          const remainingBytes = Math.max(0, e.total - e.loaded);
          const etaSeconds = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));

          onProgress({
            etaSeconds,
            loaded: e.loaded,
            percent,
            speedBytesPerSec,
            total: e.total,
          });
        }
      });
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Upload aborted', 'AbortError'));
      });
    }

    xhr.onload = () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
      rawHeaders.forEach((line) => {
        const parts = line.split(': ');
        const header = parts.shift();
        const value = parts.join(': ');
        if (header) headers.append(header, value);
      });

      const response = new Response(xhr.response || xhr.responseText, {
        headers,
        status: xhr.status,
        statusText: xhr.statusText,
      });

      resolve(response);
    };

    xhr.onerror = () => {
      reject(new TypeError('Network request failed'));
    };

    xhr.ontimeout = () => {
      reject(new TypeError('Network request timed out'));
    };

    xhr.send(formData);
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function checkAuthSession(): Promise<User | null> {
  try {
    const res = await getApi('/api/me');
    if (res.ok) {
      const data = await res.json();
      const user = data.user || null;
      const accounts = Array.isArray(data.accounts) ? data.accounts : (user ? [user] : []);
      setAuthState(user, accounts);
      return user;
    }
  } catch {}
  setAuthState(null, []);
  return null;
}

export async function switchAccountApi(userId: string): Promise<{ accounts?: User[]; error?: string; success: boolean; user?: User }> {
  try {
    const res = await postApi('/api/switch-account', { user_id: userId });
    const data = await res.json();
    if (res.ok && data.success) {
      setAuthState(data.user, data.accounts || []);
      return { accounts: data.accounts, success: true, user: data.user };
    }
    return { error: data.error || 'Error al cambiar de cuenta.', success: false };
  } catch {
    return { error: 'Error de conexión al cambiar de cuenta.', success: false };
  }
}

export async function logoutApi(): Promise<{ accounts?: User[]; success: boolean; switched?: boolean; user?: User | null }> {
  try {
    const res = await postApi('/api/logout');
    if (res.ok) {
      const data = await res.json();
      if (data.switched && data.user) {
        setAuthState(data.user, data.accounts || []);
        return { accounts: data.accounts, success: true, switched: true, user: data.user };
      }
    }
  } catch {}
  setAuthState(null, []);
  return { accounts: [], success: true, switched: false, user: null };
}

export async function logoutAllApi(): Promise<boolean> {
  try {
    const res = await postApi('/api/logout-all');
    setAuthState(null, []);
    return res.ok;
  } catch {
    setAuthState(null, []);
    return false;
  }
}
