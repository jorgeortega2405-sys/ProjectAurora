import { MatchedRoute, RouteDefinition } from '../types/common.types.js';

export const ADMIN_ROUTES: RouteDefinition[] = [
  {
    handler: async () => {
      const { createAdminLoginView } = await import('../views/login.view.js');
      return await createAdminLoginView();
    },
    id: 'login',
    match: (path) => path === '/login' || path.startsWith('/login'),
    public: true,
  },
  {
    handler: async () => {
      const { createDashboardView } = await import('../views/dashboard.view.js');
      return await createDashboardView();
    },
    id: 'dashboard',
    match: (path) => path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard'),
    requiredPermission: 'admin:dashboard:view',
  },
  {
    handler: async () => {
      const { createUsersView } = await import('../views/users.view.js');
      return await createUsersView();
    },
    id: 'users',
    match: (path) => path === '/users' || path.startsWith('/users') || path === '/usuarios' || path.startsWith('/usuarios'),
    requiredPermission: 'admin:users:view',
  },
  {
    handler: async () => {
      const { createEducationView } = await import('../views/education.view.js');
      return await createEducationView();
    },
    id: 'education',
    match: (path) => path === '/education' || path.startsWith('/education') || path === '/educacion' || path.startsWith('/educacion'),
    requiredPermission: 'admin:education:view',
  },
  {
    handler: async () => {
      const { createPurchasesView } = await import('../views/purchases.view.js');
      return await createPurchasesView();
    },
    id: 'purchases',
    match: (path) => path === '/purchases' || path.startsWith('/purchases') || path === '/compras' || path.startsWith('/compras'),
    requiredPermission: 'admin:purchases:view',
  },
  {
    handler: async () => {
      const { createOrganizationsView } = await import('../views/organizations.view.js');
      return await createOrganizationsView();
    },
    id: 'organizations',
    match: (path) => path === '/organizations' || path.startsWith('/organizations') || path === '/organizaciones' || path.startsWith('/organizaciones'),
    requiredPermission: 'admin:organizations:view',
  },
  {
    handler: async () => {
      const { createInquiriesView } = await import('../views/inquiries.view.js');
      return await createInquiriesView();
    },
    id: 'inquiries',
    match: (path) => path === '/inquiries' || path.startsWith('/inquiries') || path === '/leads' || path.startsWith('/leads'),
    requiredPermission: 'admin:inquiries:view',
  },
  {
    handler: async () => {
      const { createHrView } = await import('../views/hr.view.js');
      return await createHrView();
    },
    id: 'hr',
    match: (path) => path === '/hr' || path.startsWith('/hr') || path === '/rrhh' || path.startsWith('/rrhh'),
    requiredPermission: 'admin:hr:view',
  },
  {
    handler: async () => {
      const { createBackupsView } = await import('../views/backups.view.js');
      return await createBackupsView();
    },
    id: 'backups',
    match: (path) => path === '/backups' || path.startsWith('/backups') || path === '/copias-de-seguridad' || path.startsWith('/copias-de-seguridad'),
    requiredPermission: 'system:backup:read',
  },
  {
    handler: async ({ params }) => {
      const { createInternalTicketsView } = await import('../views/internal-tickets.view.js');
      return await createInternalTicketsView(params.id || '');
    },
    id: 'internal-tickets',
    match: (path) => {
      const match = path.match(/^\/internal-tickets(?:\/([a-zA-Z0-9_-]+))?$/) ||
                    path.match(/^\/tickets-internos(?:\/([a-zA-Z0-9_-]+))?$/) ||
                    path.match(/^\/tickets(?:\/([a-zA-Z0-9_-]+))?$/);
      if (match) {
        return { id: match[1] || '' };
      }
      return false;
    },
    requiredPermission: 'admin:tickets:view',
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
