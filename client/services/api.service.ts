import { User } from '../types/auth.types.js';

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

export async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (!token && typeof window !== 'undefined') {
    try {
      await fetch('/api/health', { credentials: 'same-origin' });
      token = getCsrfToken();
    } catch {}
  }
  return token;
}

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false;
  const perms = user.permissions;
  if (Array.isArray(perms) && perms.length > 0) {
    if (perms.includes('*') || perms.includes(permission)) return true;
  }
  const tier = (user.subscription_tier || '').toLowerCase();
  if (tier === 'enterprise' || tier === 'empresas') {
    return true;
  }
  if (tier === 'pro' || tier === 'plus') {
    if (permission === 'subscription:feature:pro' || permission.startsWith('tools:')) {
      return true;
    }
  }
  return false;
}

export async function getApi(url: string): Promise<Response> {
  return fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
    method: 'GET',
  });
}

export async function postApi(url: string, body?: unknown): Promise<Response> {
  const token = await ensureCsrfToken();
  return fetch(url, {
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    },
    method: 'POST',
  });
}

export async function putApi(url: string, body?: unknown): Promise<Response> {
  const token = await ensureCsrfToken();
  return fetch(url, {
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
  return fetch(url, {
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
  return fetch(url, {
    body: formData,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'x-csrf-token': token,
    },
    method: 'POST',
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
