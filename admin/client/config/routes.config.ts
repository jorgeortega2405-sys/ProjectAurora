import { MatchedRoute, RouteDefinition } from '../types/common.types.js';

export const ADMIN_ROUTES: RouteDefinition[] = [
  {
    handler: async () => {
      const { createDashboardView } = await import('../views/dashboard.view.js');
      return await createDashboardView();
    },
    id: 'dashboard',
    match: (path) => path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard'),
  },
  {
    handler: async () => {
      const { createUsersView } = await import('../views/users.view.js');
      return await createUsersView();
    },
    id: 'users',
    match: (path) => path === '/users' || path.startsWith('/users') || path === '/usuarios' || path.startsWith('/usuarios'),
  },
];

export function findRoute(path: string): MatchedRoute | null {
  const cleanPath = path.replace(/\/+$/, '') || '/';
  for (const route of ADMIN_ROUTES) {
    const matchResult = route.match(cleanPath);
    if (matchResult) {
      const params = typeof matchResult === 'object' && matchResult !== null ? matchResult : {};
      return {
        canonicalPath: cleanPath,
        params,
        rawPath: path,
        route,
        routeId: route.id,
      };
    }
  }
  return null;
}
