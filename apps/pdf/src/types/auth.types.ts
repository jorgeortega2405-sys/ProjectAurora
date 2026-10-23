export type UserRole = 'USER' | 'ADMIN';

export interface UserRecord {
  ai_credits_balance?: number;
  avatar_url: string | null;
  cancel_at_period_end?: boolean;
  created_at: string;
  email: string;
  email_changed_at?: string | null;
  google_id?: string | null;
  id: string;
  password_hash: string | null;
  role: UserRole;
  stripe_customer_id?: string | null;
  is_student?: boolean;
  stripe_subscription_id?: string | null;
  subscription_origin?: string;
  subscription_period_end?: string | null;
  subscription_status?: string;
  subscription_tier: string;
  subscription_tier_color?: string;
  two_factor_enabled?: boolean;
  two_factor_recovery_codes?: string[] | null;
  two_factor_secret?: string | null;
  updated_at: string;
  username: string;
  username_changed_at?: string | null;
}

export interface UserPayload {
  ai_credits_balance?: number;
  avatar_url: string | null;
  cancel_at_period_end?: boolean;
  created_at: string;
  email: string;
  google_id?: string | null;
  id: string;
  is_student?: boolean;
  permissions?: string[];
  role?: UserRole;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_origin?: string;
  subscription_period_end?: string | null;
  subscription_status?: string;
  subscription_tier?: string;
  subscription_tier_color?: string;
  two_factor_enabled?: boolean;
  username: string;
}

export interface SessionAccount {
  ai_credits_balance?: number;
  avatar_url: string | null;
  cancel_at_period_end?: boolean;
  created_at?: string;
  email: string;
  google_id?: string | null;
  id: string;
  last_accessed?: number;
  role: UserRole;
  subscription_status?: string;
  subscription_tier?: string;
  subscription_tier_color?: string;
  two_factor_enabled?: boolean;
  username: string;
}


export interface MultiAccountSessionPayload {
  accounts: SessionAccount[];
  activeId: string;
  exp?: number;
  iat?: number;
}

export interface SessionPayload {
  exp: number;
  iat: number;
  user: UserPayload;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  scope: string;
  token_type: string;
}

export interface GoogleUserInfo {
  email: string;
  email_verified?: boolean;
  family_name?: string;
  given_name?: string;
  id: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
}
