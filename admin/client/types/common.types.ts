export type ToastType = 'success' | 'error' | 'danger' | 'warning' | 'info';

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
