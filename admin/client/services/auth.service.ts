import { AdminUser } from '../types/common.types.js';
import { navigate } from './navigation.service.js';

let cachedAdminUser: AdminUser | null = null;
let linkedAdminAccounts: AdminUser[] = [];
let isAuthChecked = false;

export function getAdminUser(): AdminUser | null {
  return cachedAdminUser;
}

export function getAdminAccounts(): AdminUser[] {
  return linkedAdminAccounts;
}

export function setAdminUser(user: AdminUser | null, accounts?: AdminUser[]): void {
  cachedAdminUser = user;
  if (accounts) {
    linkedAdminAccounts = accounts;
  } else {
    linkedAdminAccounts = user ? [user] : [];
  }
  isAuthChecked = true;
}

export function hasPermission(permission: string): boolean {
  if (!cachedAdminUser) return false;
  if (!Array.isArray(cachedAdminUser.permissions)) return false;
  return (
    cachedAdminUser.permissions.includes('*') ||
    cachedAdminUser.permissions.includes(permission)
  );
}

export function isAuthenticated(): boolean {
  return Boolean(cachedAdminUser && hasPermission('admin:access'));
}

export async function fetchCurrentAdmin(force = false): Promise<AdminUser | null> {
  if (!force && isAuthChecked) {
    return cachedAdminUser;
  }

  try {
    const res = await fetch('/api/admin/auth/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      cachedAdminUser = null;
      linkedAdminAccounts = [];
      isAuthChecked = true;
      return null;
    }

    const data = await res.json();
    if (data && data.success && data.user) {
      cachedAdminUser = data.user;
      linkedAdminAccounts = Array.isArray(data.accounts) && data.accounts.length > 0 ? data.accounts : [data.user];
    } else {
      cachedAdminUser = null;
      linkedAdminAccounts = [];
    }
  } catch {
    cachedAdminUser = null;
    linkedAdminAccounts = [];
  }

  isAuthChecked = true;
  return cachedAdminUser;
}

export async function loginAdmin(
  identifier: string,
  passwordPlain: string
): Promise<{ accounts?: AdminUser[]; error?: string; success: boolean; user?: AdminUser }> {
  try {
    const res = await fetch('/api/admin/auth/login', {
      body: JSON.stringify({ identifier, password: passwordPlain }),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      return {
        error: data?.error || 'Credenciales inválidas.',
        success: false,
      };
    }

    cachedAdminUser = data.user;
    linkedAdminAccounts = Array.isArray(data.accounts) && data.accounts.length > 0 ? data.accounts : [data.user];
    isAuthChecked = true;

    return {
      accounts: linkedAdminAccounts,
      success: true,
      user: data.user,
    };
  } catch {
    return {
      error: 'Error de conexión con el servidor. Intenta nuevamente.',
      success: false,
    };
  }
}

export async function switchAdminAccount(
  userId: string
): Promise<{ accounts?: AdminUser[]; error?: string; success: boolean; user?: AdminUser }> {
  try {
    const res = await fetch('/api/admin/auth/switch-account', {
      body: JSON.stringify({ userId }),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data = await res.json();
    if (!res.ok || !data || !data.success) {
      return {
        error: data?.error || 'No se pudo cambiar de cuenta.',
        success: false,
      };
    }

    cachedAdminUser = data.user;
    linkedAdminAccounts = Array.isArray(data.accounts) && data.accounts.length > 0 ? data.accounts : [data.user];
    isAuthChecked = true;

    return {
      accounts: linkedAdminAccounts,
      success: true,
      user: data.user,
    };
  } catch {
    return {
      error: 'Error de conexión con el servidor. Intenta nuevamente.',
      success: false,
    };
  }
}

export async function logoutAdmin(userId?: string): Promise<void> {
  try {
    const res = await fetch('/api/admin/auth/logout', {
      body: JSON.stringify({ userId }),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data = await res.json();
    if (data && data.success && data.remainingAccounts > 0 && data.user) {
      cachedAdminUser = data.user;
      linkedAdminAccounts = Array.isArray(data.accounts) ? data.accounts : [];
      isAuthChecked = true;
      navigate('/', true);
      return;
    }
  } catch {}

  cachedAdminUser = null;
  linkedAdminAccounts = [];
  isAuthChecked = true;
  navigate('/login', true);
}

export async function logoutAllAdmin(): Promise<void> {
  try {
    await fetch('/api/admin/auth/logout-all', {
      credentials: 'same-origin',
      method: 'POST',
    });
  } catch {}

  cachedAdminUser = null;
  linkedAdminAccounts = [];
  isAuthChecked = true;
  navigate('/login', true);
}
