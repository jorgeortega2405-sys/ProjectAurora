import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { getTheme, toggleTheme } from '../services/theme.service.js';

export let isDrawerOpen = false;
let sidebarInstance: HTMLElement | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;

function createDrawerElement(): HTMLElement {
  const drawer = document.createElement('div');
  drawer.className = 'layout-drawer';
  drawer.setAttribute('data-ref', 'layout-drawer');

  const drawerBody = document.createElement('div');
  drawerBody.className = 'layout-drawer__body';
  drawerBody.setAttribute('data-ref', 'drawer-body');
  drawer.appendChild(drawerBody);

  const drawerFooter = document.createElement('div');
  drawerFooter.className = 'layout-drawer__footer';
  drawerFooter.setAttribute('data-ref', 'drawer-footer');
  drawer.appendChild(drawerFooter);

  return drawer;
}

function populateDrawerContent(drawer: HTMLElement): void {
  const drawerBody = drawer.querySelector<HTMLElement>('[data-ref="drawer-body"]');
  const drawerFooter = drawer.querySelector<HTMLElement>('[data-ref="drawer-footer"]');
  if (!drawerBody) return;

  const currentPath = window.location.pathname;
  const isDashboard = currentPath === '/' || currentPath === '' || currentPath.startsWith('/dashboard');
  const isUsers = currentPath.startsWith('/users') || currentPath.startsWith('/usuarios');

  const bindNavLink = (btn: HTMLElement | null, path: string) => {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      navigate(path);
    });
  };

  drawerBody.innerHTML = `
    <div class="drawer-section__header" data-ref="drawer-admin-header" style="padding: 10px 12px 6px 12px;">
      <span class="drawer-section__title" data-ref="drawer-admin-title" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Navegación Admin</span>
    </div>
    <button type="button" class="menu-item ${isDashboard ? 'is-active' : ''}" data-ref="btn-drawer-nav-dashboard">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#dashboard"></use></svg>
      <span class="menu-item__text">Dashboard</span>
    </button>
    <button type="button" class="menu-item ${isUsers ? 'is-active' : ''}" data-ref="btn-drawer-nav-users">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#group"></use></svg>
      <span class="menu-item__text">Gestionar Usuarios</span>
    </button>
  `;

  if (drawerFooter) {
    const isDark = getTheme() === 'dark';
    drawerFooter.innerHTML = `
      <button type="button" class="menu-item menu-item--bordered" data-ref="btn-drawer-footer-theme">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${isDark ? 'light_mode' : 'dark_mode'}"></use></svg>
        <span class="menu-item__text">${isDark ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}</span>
      </button>
    `;

    const btnFooterTheme = drawerFooter.querySelector<HTMLElement>('[data-ref="btn-drawer-footer-theme"]');
    btnFooterTheme?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
      populateDrawerContent(drawer);
    });
  }

  const btnNavDashboard = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-dashboard"]');
  const btnNavUsers = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-users"]');

  bindNavLink(btnNavDashboard, '/');
  bindNavLink(btnNavUsers, '/users');

  renderIcons(drawer);
}

function openDynamicDrawer(sidebar: HTMLElement): void {
  let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (!drawer) {
    drawer = createDrawerElement();
    sidebar.appendChild(drawer);
  }
  populateDrawerContent(drawer);
  drawer.classList.add('is-open');
}

function closeDynamicDrawer(sidebar: HTMLElement): void {
  const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer) {
    drawer.classList.remove('is-open');
    setTimeout(() => {
      if (!isDrawerOpen) {
        drawer.remove();
      }
    }, 200);
  }
}

export function toggleDrawer(forceState?: boolean): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const btnToggle = sidebar?.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  if (forceState === undefined) {
    isDrawerOpen = !isDrawerOpen;
  } else {
    isDrawerOpen = forceState;
  }

  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  if (!sidebar) return;

  if (isDrawerOpen) {
    openDynamicDrawer(sidebar);
  } else {
    closeDynamicDrawer(sidebar);
  }
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isDashboard = path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard');
  const isUsers = path.startsWith('/users') || path.startsWith('/usuarios');

  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const itemUsers = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-users"]');
  const btnUsers = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-users"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  itemDashboard?.classList.toggle('is-active', isDashboard);
  btnDashboard?.classList.toggle('is-active', isDashboard);
  itemUsers?.classList.toggle('is-active', isUsers);
  btnUsers?.classList.toggle('is-active', isUsers);
  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer && isDrawerOpen) {
    populateDrawerContent(drawer);
  }
}

function bindSidebarEvents(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnUsers = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-users"]');
  const itemUsers = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-users"]');
  const btnTheme = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-theme"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  const navigateToDashboard = (e: Event) => {
    e.preventDefault();
    navigate('/');
  };

  btnDashboard?.addEventListener('click', navigateToDashboard);
  itemDashboard?.addEventListener('click', (e) => {
    if (e.target !== btnDashboard && !btnDashboard?.contains(e.target as Node)) {
      navigateToDashboard(e);
    }
  });

  const navigateToUsers = (e: Event) => {
    e.preventDefault();
    navigate('/users');
  };

  btnUsers?.addEventListener('click', navigateToUsers);
  itemUsers?.addEventListener('click', (e) => {
    if (e.target !== btnUsers && !btnUsers?.contains(e.target as Node)) {
      navigateToUsers(e);
    }
  });

  btnTheme?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
  });
}

export async function createSidebar(): Promise<HTMLElement> {
  if (sidebarInstance) {
    return sidebarInstance;
  }

  if (sidebarInitPromise) {
    return sidebarInitPromise;
  }

  sidebarInitPromise = (async () => {
    const sidebar = await loadTemplate('/views/components/sidebar.html');
    bindSidebarEvents(sidebar);
    sidebarInstance = sidebar;
    sidebarInitPromise = null;
    return sidebar;
  })();

  return sidebarInitPromise;
}

export async function ensureSidebarMounted(layoutContent: HTMLElement): Promise<HTMLElement> {
  const sidebar = await createSidebar();
  if (sidebar.parentElement !== layoutContent) {
    layoutContent.prepend(sidebar);
  }
  return sidebar;
}

let activeResizeObserver: ResizeObserver | null = null;

export function setupLayoutScrollSync(): void {
  const layoutContent = document.querySelector<HTMLElement>('.layout-content:has(.layout-nav)');
  if (activeResizeObserver) {
    activeResizeObserver.disconnect();
    activeResizeObserver = null;
  }
  if (!layoutContent) return;

  const scrollableBody = layoutContent.querySelector<HTMLElement>(
    '.view-scrollable, .home-scrollable, .layout-body--scrollable, .layout-scrollable'
  );
  if (!scrollableBody) {
    layoutContent.style.removeProperty('--layout-scroll-height');
    return;
  }

  const updateScrollHeight = () => {
    const maxScroll = Math.max(0, Math.ceil(scrollableBody.scrollHeight - scrollableBody.clientHeight));
    if (maxScroll === 0) {
      layoutContent.style.removeProperty('--layout-scroll-height');
      return;
    }
    const neededHeight = layoutContent.clientHeight + maxScroll;
    layoutContent.style.setProperty('--layout-scroll-height', `${neededHeight}px`);
  };

  updateScrollHeight();

  activeResizeObserver = new ResizeObserver(() => {
    updateScrollHeight();
  });

  activeResizeObserver.observe(scrollableBody);
  activeResizeObserver.observe(layoutContent);
  for (const child of scrollableBody.children) {
    activeResizeObserver.observe(child);
  }
}
