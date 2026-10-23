import { getTheme, toggleTheme } from '../services/theme.service.js';
import { loadTemplate } from '../services/template.service.js';
import { navigate } from '../services/navigation.service.js';
import { renderIcons } from '../services/icon.service.js';

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
  const isEducation = currentPath.startsWith('/education') || currentPath.startsWith('/educacion');
  const isPurchases = currentPath.startsWith('/purchases') || currentPath.startsWith('/compras');
  const isOrganizations = currentPath.startsWith('/organizations') || currentPath.startsWith('/organizaciones');
  const isInquiries = currentPath.startsWith('/inquiries') || currentPath.startsWith('/leads');

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
    <button type="button" class="menu-item ${isEducation ? 'is-active' : ''}" data-ref="btn-drawer-nav-education">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#school"></use></svg>
      <span class="menu-item__text">Verificación Estudiantes</span>
    </button>
    <button type="button" class="menu-item ${isPurchases ? 'is-active' : ''}" data-ref="btn-drawer-nav-purchases">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#receipt_long"></use></svg>
      <span class="menu-item__text">Historial de Compras</span>
    </button>
    <button type="button" class="menu-item ${isOrganizations ? 'is-active' : ''}" data-ref="btn-drawer-nav-organizations">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#groups"></use></svg>
      <span class="menu-item__text">Organizaciones B2B</span>
    </button>
    <button type="button" class="menu-item ${isInquiries ? 'is-active' : ''}" data-ref="btn-drawer-nav-inquiries">
      <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#mail"></use></svg>
      <span class="menu-item__text">Leads Comerciales</span>
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
  const btnNavEducation = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-education"]');
  const btnNavPurchases = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-purchases"]');
  const btnNavOrganizations = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-organizations"]');
  const btnNavInquiries = drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-inquiries"]');

  bindNavLink(btnNavDashboard, '/');
  bindNavLink(btnNavUsers, '/users');
  bindNavLink(btnNavEducation, '/education');
  bindNavLink(btnNavPurchases, '/purchases');
  bindNavLink(btnNavOrganizations, '/organizations');
  bindNavLink(btnNavInquiries, '/inquiries');

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
  const isEducation = path.startsWith('/education') || path.startsWith('/educacion');
  const isPurchases = path.startsWith('/purchases') || path.startsWith('/compras');
  const isOrganizations = path.startsWith('/organizations') || path.startsWith('/organizaciones');
  const isInquiries = path.startsWith('/inquiries') || path.startsWith('/leads');

  const itemDashboard = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-dashboard"]');
  const btnDashboard = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-dashboard"]');
  const itemUsers = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-users"]');
  const btnUsers = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-users"]');
  const itemEducation = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-education"]');
  const btnEducation = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-education"]');
  const itemPurchases = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-purchases"]');
  const btnPurchases = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-purchases"]');
  const itemOrganizations = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-organizations"]');
  const btnOrganizations = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-organizations"]');
  const itemInquiries = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-inquiries"]');
  const btnInquiries = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-inquiries"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  itemDashboard?.classList.toggle('is-active', isDashboard);
  btnDashboard?.classList.toggle('is-active', isDashboard);
  itemUsers?.classList.toggle('is-active', isUsers);
  btnUsers?.classList.toggle('is-active', isUsers);
  itemEducation?.classList.toggle('is-active', isEducation);
  btnEducation?.classList.toggle('is-active', isEducation);
  itemPurchases?.classList.toggle('is-active', isPurchases);
  btnPurchases?.classList.toggle('is-active', isPurchases);
  itemOrganizations?.classList.toggle('is-active', isOrganizations);
  btnOrganizations?.classList.toggle('is-active', isOrganizations);
  itemInquiries?.classList.toggle('is-active', isInquiries);
  btnInquiries?.classList.toggle('is-active', isInquiries);
  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer && isDrawerOpen) {
    populateDrawerContent(drawer);
  }
}

function bindSidebarEvents(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const btnTheme = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-theme"]');

  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDrawer();
  });

  const bindItemNav = (btnRef: string, itemRef: string, targetPath: string) => {
    const btn = sidebar.querySelector<HTMLElement>(`[data-ref="${btnRef}"]`);
    const item = sidebar.querySelector<HTMLElement>(`[data-ref="${itemRef}"]`);

    const go = (e: Event) => {
      e.preventDefault();
      navigate(targetPath);
    };

    btn?.addEventListener('click', go);
    item?.addEventListener('click', (e) => {
      if (e.target !== btn && !btn?.contains(e.target as Node)) {
        go(e);
      }
    });
  };

  bindItemNav('btn-rail-dashboard', 'rail-item-dashboard', '/');
  bindItemNav('btn-rail-users', 'rail-item-users', '/users');
  bindItemNav('btn-rail-education', 'rail-item-education', '/education');
  bindItemNav('btn-rail-purchases', 'rail-item-purchases', '/purchases');
  bindItemNav('btn-rail-organizations', 'rail-item-organizations', '/organizations');
  bindItemNav('btn-rail-inquiries', 'rail-item-inquiries', '/inquiries');

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
