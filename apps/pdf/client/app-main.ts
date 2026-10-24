import { initRouter, navigate } from './app-router.js';
import { setupLayoutScrollSync } from './components/layout.component.js';
import { initTechSupportAutoResume } from './components/support-sidebar.component.js';
import { checkAuthSession } from './services/api.service.js';
import { initI18n, translateElement } from './services/i18n.service.js';
import { initTelemetry } from './services/telemetry.service.js';
import { preloadTemplates } from './services/template.service.js';
import { initTheme } from './services/theme.service.js';
import { initTooltips } from './services/tooltip.service.js';

let isSyncing = false;

function handleScrollEvent(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target || target.nodeType !== 1) return;

  if (target.classList.contains('layout-content')) {
    if (!isSyncing) {
      const scrollableBody = target.querySelector<HTMLElement>(
        '.view-scrollable, .home-scrollable, .layout-body--scrollable, .layout-scrollable'
      );
      if (scrollableBody) {
        const maxScrollLayout = target.scrollHeight - target.clientHeight;
        const maxScrollBody = scrollableBody.scrollHeight - scrollableBody.clientHeight;

        if (maxScrollLayout > 0 && maxScrollBody > 0) {
          const ratio = Math.max(0, Math.min(1, target.scrollTop / maxScrollLayout));
          const targetOffset = ratio * maxScrollBody;
          if (Math.abs(scrollableBody.scrollTop - targetOffset) > 0.25) {
            isSyncing = true;
            scrollableBody.scrollTop = targetOffset;
            isSyncing = false;
          }
        } else {
          isSyncing = true;
          scrollableBody.scrollTop = target.scrollTop;
          isSyncing = false;
        }
      }
    }

    const isScrolled = target.scrollTop > 0;
    const header = document.querySelector<HTMLElement>('.layout-header, .general-content-top');
    if (header) {
      header.classList.toggle('shadow', isScrolled);
      header.classList.toggle('layout-header--shadow', isScrolled);
    }
  }
}

function initScrollShadow(): void {
  setupLayoutScrollSync();
  document.addEventListener('scroll', handleScrollEvent, { capture: true, passive: true });
}

function setupGlobalLinks(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const targetEl = e.target as HTMLElement | null;
    const declarativeNav = targetEl?.closest<HTMLElement>('[data-navigate]');
    if (declarativeNav) {
      const dest = declarativeNav.getAttribute('data-navigate');
      if (dest) {
        e.preventDefault();
        navigate(dest);
        return;
      }
    }

    const anchor = targetEl?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) {
      return;
    }

    if (anchor.origin === window.location.origin) {
      e.preventDefault();
      navigate(href);
    }
  });
}

async function initApp(): Promise<void> {
  const currentPath = window.location.pathname;
  if (currentPath === '/' || currentPath === '' || /^\/[a-z]{2}\/?$/i.test(currentPath)) {
    preloadTemplates(['/views/components/sidebar.html', '/views/home/home.html']);
  } else {
    preloadTemplates(['/views/components/sidebar.html']);
  }
  await Promise.all([initI18n(), checkAuthSession()]);
  initTheme();
  initTooltips();
  initTelemetry();
  setupGlobalLinks();
  initScrollShadow();
  translateElement(document.body);
  initRouter();
  void initTechSupportAutoResume();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initApp();
  });
} else {
  void initApp();
}
