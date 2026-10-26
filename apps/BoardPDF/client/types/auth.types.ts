export interface User {
  avatar_url?: string | null;
  created_at?: string;
  email: string;
  id: string;
  language?: string;
  username: string;
}

export interface AuthSessionResponse {
  accounts?: User[];
  message?: string;
  success: boolean;
  user: User | null;
}
