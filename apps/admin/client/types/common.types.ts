export type ToastType = 'success' | 'error' | 'danger' | 'warning' | 'info';

export interface AdminUser {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  permissions: string[];
  role: string;
  username: string;
}

export interface RouteContext {
  params: Record<string, string>;
  path: string;
  previousPath: string;
  query: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => Promise<HTMLElement | null>;

export interface RouteDefinition {
  handler: RouteHandler;
  id: string;
  match: (path: string) => boolean | Record<string, string>;
  public?: boolean;
  requiredPermission?: string;
}

export interface MatchedRoute {
  canonicalPath: string;
  params: Record<string, string>;
  rawPath: string;
  route: RouteDefinition;
  routeId: string;
}

export interface ViewController {
  destroy(): void;
  init(): Promise<void>;
}
