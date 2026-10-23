import { ensureSidebarMounted, setupLayoutScrollSync, updateSidebarActiveState } from './components/layout.component.js';
import { findRoute } from './config/routes.config.js';
import { fetchCurrentAdmin, hasPermission } from './services/auth.service.js';
import { setNavigationHandler } from './services/navigation.service.js';
import { hideTooltip } from './services/tooltip.service.js';
import { ViewController } from './types/common.types.js';

let activeViewElement: HTMLElement | null = null;
let currentNavigation = 0;
let previousPath = '';

export interface RenderOptions {
  updateHistory?: {
    fullUrl: string;
    replace: boolean;
  };
}

function normalizePath(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '') return '/';
  const clean = rawPath.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

export function navigate(url: string, replace = false): void {
  const [pathPart] = (url || '').split(/[?#]/);
  const pathname = normalizePath(pathPart);
  const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (currentFull === url && !replace) {
    const scrollable = document.querySelector<HTMLElement>(
      '.view-scrollable, .home-scrollable, .layout-scrollable, .layout-body--scrollable, .layout-content'
    );
    if (scrollable) {
      scrollable.scrollTo({ behavior: 'smooth', top: 0 });
    }
    return;
  }

  previousPath = window.location.pathname;
  void render(pathname, { updateHistory: { fullUrl: url, replace } });
}

setNavigationHandler(navigate);

export async function render(rawPath = window.location.pathname, options?: RenderOptions): Promise<void> {
  const [pathPart, queryPart = ''] = (rawPath || '').split('?');
  const path = normalizePath(pathPart);
  const targetQuery = new URLSearchParams(queryPart || window.location.search);

  hideTooltip();

  const user = await fetchCurrentAdmin();
  const isUserAuthenticated = Boolean(user && hasPermission('admin:access'));

  if (!isUserAuthenticated) {
    if (path !== '/login') {
      navigate('/login', true);
      return;
    }
  }

  const appRoot = document.querySelector<HTMLElement>('[data-ref="app"]');
  if (!appRoot) return;

  let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
  if (!layoutContent) {
    layoutContent = document.createElement('div');
    layoutContent.className = 'layout-content';
    layoutContent.setAttribute('data-ref', 'app-layout');
    appRoot.appendChild(layoutContent);
  }

  const isLoginRoute = path === '/login';
  const sidebar = await ensureSidebarMounted(layoutContent);
  sidebar.style.display = isLoginRoute ? 'none' : '';

  const navId = ++currentNavigation;
  let nextViewElement: HTMLElement | null = null;
  const matched = findRoute(path);

  try {
    if (matched) {
      if (!matched.route.public && matched.route.requiredPermission && !hasPermission(matched.route.requiredPermission)) {
        const { createForbiddenView } = await import('./views/forbidden.view.js');
        nextViewElement = await createForbiddenView();
      } else {
        nextViewElement = await matched.route.handler({
          params: matched.params,
          path: matched.canonicalPath,
          previousPath,
          query: targetQuery,
        });
      }
    } else {
      const { createNotFoundView } = await import('./views/not-found.view.js');
      nextViewElement = await createNotFoundView();
    }
  } catch {
    const { createNotFoundView } = await import('./views/not-found.view.js');
    nextViewElement = await createNotFoundView();
  }

  if (navId !== currentNavigation || !nextViewElement) {
    return;
  }

  if (activeViewElement) {
    const controller = (activeViewElement as any)?.__controller as ViewController | undefined;
    if (controller && typeof controller.destroy === 'function') {
      try {
        controller.destroy();
      } catch {}
    }
    activeViewElement.remove();
    activeViewElement = null;
  }

  activeViewElement = nextViewElement;
  layoutContent.appendChild(nextViewElement);

  if (options?.updateHistory) {
    if (options.updateHistory.replace) {
      window.history.replaceState({}, '', options.updateHistory.fullUrl);
    } else {
      window.history.pushState({}, '', options.updateHistory.fullUrl);
    }
  }

  if (!isLoginRoute) {
    updateSidebarActiveState(sidebar, path);
  }

  layoutContent.scrollTop = 0;
  const scrollable = nextViewElement.querySelector<HTMLElement>(
    '.view-scrollable, .home-scrollable, .layout-scrollable, .layout-body--scrollable'
  );
  if (scrollable) {
    scrollable.scrollTop = 0;
  }
  setupLayoutScrollSync();

  previousPath = path;
}

export function initRouter(): void {
  window.addEventListener('popstate', () => {
    void render(window.location.pathname);
  });

  void render(window.location.pathname);
}
