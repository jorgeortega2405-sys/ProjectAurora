export type UserRole = 'USER' | 'ADMIN';

export interface User {
  avatar_url?: string | null;
  created_at?: string;
  email: string;
  google_id?: string | null;
  id: string;
  language?: string;
  permissions?: string[];
  role?: UserRole;
  roles?: string[];
  subscription_tier?: string;
  subscription_tier_color?: string;
  two_factor_enabled?: boolean;
  username: string;
}

export interface AuthSessionResponse {
  accounts?: User[];
  message?: string;
  success: boolean;
  switched?: boolean;
  user: User | null;
}

export interface RegistrationState {
  email?: string;
  password?: string;
  step?: number;
  username?: string;
}

export interface TwoFactorLoginState {
  email?: string;
  tempToken?: string;
  timestamp?: number;
}
