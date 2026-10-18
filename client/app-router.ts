import { ensureSidebarMounted, hasDesignatedMenuItems, setupLayoutScrollSync, toggleDrawer, updateSidebarActiveState } from './components/layout.component.js';
import { closeAllModals } from './components/modal.component.js';
import { findRoute } from './config/routes.config.js';
import { translateElement } from './services/i18n.service.js';
import { hideTooltip } from './services/tooltip.service.js';
import { consumeTransferFile } from './services/transfer.service.js';
import { ViewController } from './types/common.types.js';

let activeViewElement: HTMLElement | null = null;
let currentNavigation = 0;
let previousPath = '';

function normalizePath(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '') return '/';
  const clean = rawPath.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

function parseRouteUrl(rawUrl: string): { fullUrl: string; pathname: string; query: URLSearchParams } {
  try {
    const urlObj = new URL(rawUrl, window.location.origin);
    const pathname = normalizePath(urlObj.pathname);
    return {
      fullUrl: `${pathname}${urlObj.search}${urlObj.hash}`,
      pathname,
      query: urlObj.searchParams,
    };
  } catch {
    const [pathAndQuery] = (rawUrl || '').split('#');
    const [pathPart, queryPart = ''] = pathAndQuery.split('?');
    const pathname = normalizePath(pathPart);
    return {
      fullUrl: rawUrl,
      pathname,
      query: new URLSearchParams(queryPart),
    };
  }
}

export function navigate(url: string, replace = false): void {
  const { fullUrl, pathname } = parseRouteUrl(url);

  const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentFull === fullUrl && !replace) {
    const scrollable = document.querySelector<HTMLElement>(
      '.view-scrollable, .home-scrollable, .layout-scrollable, .layout-body--scrollable, .layout-content'
    );
    if (scrollable) {
      scrollable.scrollTo({ behavior: 'smooth', top: 0 });
    }
    return;
  }

  previousPath = window.location.pathname;

  if (replace) {
    window.history.replaceState({}, '', fullUrl);
  } else {
    window.history.pushState({}, '', fullUrl);
  }

  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"], .layout-nav');
  if (sidebar && !pathname.startsWith('/login') && !pathname.startsWith('/register') && !pathname.startsWith('/forgot-password') && !pathname.startsWith('/reset-password')) {
    updateSidebarActiveState(sidebar, pathname);
  }

  void render(pathname);
}

export async function render(rawPath = window.location.pathname): Promise<void> {
  const { pathname: path } = parseRouteUrl(rawPath);
  closeAllModals();
  hideTooltip();

  const appRoot = document.querySelector<HTMLElement>('[data-ref="app"]');
  if (!appRoot) return;

  let layoutContent = appRoot.querySelector<HTMLElement>('.layout-content');
  if (!layoutContent) {
    layoutContent = document.createElement('div');
    layoutContent.className = 'layout-content';
    layoutContent.setAttribute('data-ref', 'app-layout');
    appRoot.appendChild(layoutContent);
  }

  const isAuthView = path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/forgot-password') || path.startsWith('/reset-password');

  if (!isAuthView) {
    layoutContent.classList.remove('is-auth-mode');
    const sidebar = await ensureSidebarMounted(layoutContent);
    sidebar.style.display = '';
    updateSidebarActiveState(sidebar, path);
    translateElement(sidebar);
    if (hasDesignatedMenuItems(path)) {
      if (window.innerWidth > 768) {
        toggleDrawer(true);
      }
    }
  } else {
    toggleDrawer(false);
    layoutContent.classList.add('is-auth-mode');
    const existingSidebar = layoutContent.querySelector<HTMLElement>('[data-ref="sidebar"], .layout-nav');
    if (existingSidebar) {
      existingSidebar.style.display = 'none';
    }
  }

  const navId = ++currentNavigation;
  const matched = findRoute(path);

  let nextViewElement: HTMLElement | null = null;

  try {
    if (matched) {
      nextViewElement = await matched.route.handler({
        params: matched.params,
        path,
        previousPath,
        query: new URLSearchParams(window.location.search),
      });
    } else {
      const { createNotFoundView } = await import('./views/not-found.view.js');
      nextViewElement = await createNotFoundView();
      if (nextViewElement) {
        const errEl = document.createElement('div');
        errEl.setAttribute('data-ref', 'router-debug-error');
        errEl.style.display = 'none';
        errEl.textContent = `ROUTE_NOT_MATCHED:${path}`;
        nextViewElement.appendChild(errEl);
      }
    }
  } catch (routerErr: unknown) {
    const errMessage = routerErr instanceof Error ? `${routerErr.message}\n${routerErr.stack || ''}` : String(routerErr);
    (window as any).__lastRouterError = errMessage;
    const { createNotFoundView } = await import('./views/not-found.view.js');
    nextViewElement = await createNotFoundView();
    if (nextViewElement) {
      const errEl = document.createElement('div');
      errEl.setAttribute('data-ref', 'router-debug-error');
      errEl.style.display = 'none';
      errEl.textContent = errMessage;
      nextViewElement.appendChild(errEl);
    }
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
  translateElement(nextViewElement);
  layoutContent.appendChild(nextViewElement);

  const pendingTransfer = consumeTransferFile();
  if (pendingTransfer && nextViewElement) {
    const controller = (nextViewElement as any)?.__controller;
    if (controller) {
      if (typeof controller.handleFileSelected === 'function') {
        void controller.handleFileSelected(pendingTransfer);
      } else if (typeof controller.handleFilesAdded === 'function') {
        void controller.handleFilesAdded([pendingTransfer]);
      }
    }
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
