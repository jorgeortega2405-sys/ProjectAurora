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
  {
    handler: async () => {
      const { createEducationView } = await import('../views/education.view.js');
      return await createEducationView();
    },
    id: 'education',
    match: (path) => path === '/education' || path.startsWith('/education') || path === '/educacion' || path.startsWith('/educacion'),
  },
  {
    handler: async () => {
      const { createPurchasesView } = await import('../views/purchases.view.js');
      return await createPurchasesView();
    },
    id: 'purchases',
    match: (path) => path === '/purchases' || path.startsWith('/purchases') || path === '/compras' || path.startsWith('/compras'),
  },
  {
    handler: async () => {
      const { createOrganizationsView } = await import('../views/organizations.view.js');
      return await createOrganizationsView();
    },
    id: 'organizations',
    match: (path) => path === '/organizations' || path.startsWith('/organizations') || path === '/organizaciones' || path.startsWith('/organizaciones'),
  },
  {
    handler: async () => {
      const { createInquiriesView } = await import('../views/inquiries.view.js');
      return await createInquiriesView();
    },
    id: 'inquiries',
    match: (path) => path === '/inquiries' || path.startsWith('/inquiries') || path === '/leads' || path.startsWith('/leads'),
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
