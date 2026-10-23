import { getAdminAccounts, getAdminUser, hasPermission, logoutAdmin, logoutAllAdmin, switchAdminAccount } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { getTheme, toggleTheme } from '../services/theme.service.js';
import { WebsiteSelectorComponent } from './website-selector.component.js';

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

  const user = getAdminUser();
  const currentPath = window.location.pathname;
  const isDashboard = currentPath === '/' || currentPath === '' || currentPath.startsWith('/dashboard');
  const isUsers = currentPath.startsWith('/users') || currentPath.startsWith('/usuarios');
  const isEducation = currentPath.startsWith('/education') || currentPath.startsWith('/educacion');
  const isPurchases = currentPath.startsWith('/purchases') || currentPath.startsWith('/compras');
  const isOrganizations = currentPath.startsWith('/organizations') || currentPath.startsWith('/organizaciones');
  const isInquiries = currentPath.startsWith('/inquiries') || currentPath.startsWith('/leads');
  const isHr = currentPath.startsWith('/hr') || currentPath.startsWith('/rrhh');
  const isBackups = currentPath.startsWith('/backups') || currentPath.startsWith('/copias-de-seguridad');
  const isTickets = currentPath.startsWith('/internal-tickets') || currentPath.startsWith('/tickets-internos') || currentPath.startsWith('/tickets');

  const canDashboard = hasPermission('admin:dashboard:view') || hasPermission('admin:access');
  const canUsers = hasPermission('admin:users:view');
  const canEducation = hasPermission('admin:education:view');
  const canPurchases = hasPermission('admin:purchases:view');
  const canOrganizations = hasPermission('admin:organizations:view');
  const canInquiries = hasPermission('admin:inquiries:view');
  const canHr = hasPermission('admin:hr:view');
  const canBackups = hasPermission('system:backup:read');
  const canTickets = hasPermission('admin:tickets:view');

  const bindNavLink = (btn: HTMLElement | null, path: string) => {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      navigate(path);
    });
  };

  let itemsHtml = `
    <div class="website-selector-mount" data-ref="website-selector-mount" style="padding: 10px 12px 4px 12px;"></div>
    <div class="drawer-section__header" data-ref="drawer-admin-header" style="padding: 10px 12px 6px 12px;">
      <span class="drawer-section__title" data-ref="drawer-admin-title" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Navegación Admin</span>
    </div>
  `;

  if (canDashboard) {
    itemsHtml += `
      <button type="button" class="menu-item ${isDashboard ? 'is-active' : ''}" data-ref="btn-drawer-nav-dashboard">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#dashboard"></use></svg>
        <span class="menu-item__text">Dashboard</span>
      </button>
    `;
  }

  if (canUsers) {
    itemsHtml += `
      <button type="button" class="menu-item ${isUsers ? 'is-active' : ''}" data-ref="btn-drawer-nav-users">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#group"></use></svg>
        <span class="menu-item__text">Gestionar Usuarios</span>
      </button>
    `;
  }

  if (canEducation) {
    itemsHtml += `
      <button type="button" class="menu-item ${isEducation ? 'is-active' : ''}" data-ref="btn-drawer-nav-education">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#school"></use></svg>
        <span class="menu-item__text">Verificación Estudiantes</span>
      </button>
    `;
  }

  if (canPurchases) {
    itemsHtml += `
      <button type="button" class="menu-item ${isPurchases ? 'is-active' : ''}" data-ref="btn-drawer-nav-purchases">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#receipt_long"></use></svg>
        <span class="menu-item__text">Historial de Compras</span>
      </button>
    `;
  }

  if (canOrganizations) {
    itemsHtml += `
      <button type="button" class="menu-item ${isOrganizations ? 'is-active' : ''}" data-ref="btn-drawer-nav-organizations">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#groups"></use></svg>
        <span class="menu-item__text">Organizaciones B2B</span>
      </button>
    `;
  }

  if (canInquiries) {
    itemsHtml += `
      <button type="button" class="menu-item ${isInquiries ? 'is-active' : ''}" data-ref="btn-drawer-nav-inquiries">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#mail"></use></svg>
        <span class="menu-item__text">Leads Comerciales</span>
      </button>
    `;
  }

  if (canHr) {
    itemsHtml += `
      <button type="button" class="menu-item ${isHr ? 'is-active' : ''}" data-ref="btn-drawer-nav-hr">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#account_tree"></use></svg>
        <span class="menu-item__text">Recursos Humanos</span>
      </button>
    `;
  }

  if (canBackups) {
    itemsHtml += `
      <button type="button" class="menu-item ${isBackups ? 'is-active' : ''}" data-ref="btn-drawer-nav-backups">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#cloud"></use></svg>
        <span class="menu-item__text">Copias de Seguridad</span>
      </button>
    `;
  }

  if (canTickets) {
    itemsHtml += `
      <button type="button" class="menu-item ${isTickets ? 'is-active' : ''}" data-ref="btn-drawer-nav-tickets">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#support_agent"></use></svg>
        <span class="menu-item__text">Tickets Internos</span>
      </button>
    `;
  }

  drawerBody.innerHTML = itemsHtml;

  const websiteMount = drawerBody.querySelector<HTMLElement>('[data-ref="website-selector-mount"]');
  if (websiteMount) {
    const websiteSelector = new WebsiteSelectorComponent();
    websiteSelector.init(websiteMount);
  }

  if (drawerFooter) {
    const isDark = getTheme() === 'dark';
    drawerFooter.innerHTML = `
      <div class="drawer-user-info" data-ref="drawer-user-info" style="padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: var(--surface-secondary, rgba(0,0,0,0.03)); border: 1px solid var(--border-light, rgba(0,0,0,0.08));">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${user?.username || 'Administrador'}</div>
        <div style="font-size: 11px; font-weight: 600; color: var(--primary, #0ea5e9); text-transform: uppercase; letter-spacing: 0.5px;">${user?.role || 'ADMIN'}</div>
      </div>
      <button type="button" class="menu-item menu-item--bordered" data-ref="btn-drawer-footer-theme">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#palette"></use></svg>
        <span class="menu-item__text">${isDark ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}</span>
      </button>
      <button type="button" class="menu-item menu-item--bordered" data-ref="btn-drawer-footer-logout" style="margin-top: 4px; color: var(--danger, #ef4444);">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#logout"></use></svg>
        <span class="menu-item__text">Cerrar sesión</span>
      </button>
    `;

    const btnFooterTheme = drawerFooter.querySelector<HTMLElement>('[data-ref="btn-drawer-footer-theme"]');
    btnFooterTheme?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
      populateDrawerContent(drawer);
    });

    const btnFooterLogout = drawerFooter.querySelector<HTMLElement>('[data-ref="btn-drawer-footer-logout"]');
    btnFooterLogout?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      void logoutAdmin();
    });
  }

  if (canDashboard) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-dashboard"]'), '/');
  }
  if (canUsers) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-users"]'), '/users');
  }
  if (canEducation) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-education"]'), '/education');
  }
  if (canPurchases) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-purchases"]'), '/purchases');
  }
  if (canOrganizations) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-organizations"]'), '/organizations');
  }
  if (canInquiries) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-inquiries"]'), '/inquiries');
  }
  if (canHr) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-hr"]'), '/hr');
  }
  if (canBackups) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-backups"]'), '/backups');
  }
  if (canTickets) {
    bindNavLink(drawerBody.querySelector<HTMLElement>('[data-ref="btn-drawer-nav-tickets"]'), '/internal-tickets');
  }

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

export function updateSidebarProfile(sidebar: HTMLElement): void {
  const user = getAdminUser();
  const avatarContainer = sidebar.querySelector<HTMLElement>('[data-ref="avatar-container"]');
  const avatarImg = sidebar.querySelector<HTMLImageElement>('[data-ref="avatar-img"]');
  const btnAvatar = sidebar.querySelector<HTMLElement>('[data-ref="btn-avatar"]');
  const activeAvatar = sidebar.querySelector<HTMLImageElement>('[data-ref="active-account-avatar"]');
  const activeName = sidebar.querySelector<HTMLElement>('[data-ref="active-account-name"]');
  const activeEmail = sidebar.querySelector<HTMLElement>('[data-ref="active-account-email"]');
  const activeRole = sidebar.querySelector<HTMLElement>('[data-ref="active-account-role"]');

  if (!user) {
    if (avatarContainer) avatarContainer.style.display = 'none';
    return;
  }

  if (avatarContainer) avatarContainer.style.display = 'inline-flex';

  const avatarUrl = user.avatar_url || `/api/avatar?name=${encodeURIComponent(user.username)}`;

  const bindAvatarLoaded = (img: HTMLImageElement, url: string, altText: string) => {
    img.alt = altText;
    if (img.src !== url) {
      img.src = url;
    }
    img.onload = () => img.classList.add('image-loaded');
    img.onerror = () => img.classList.add('image-loaded');
    if (img.complete) {
      img.classList.add('image-loaded');
    }
  };

  if (avatarImg) {
    bindAvatarLoaded(avatarImg, avatarUrl, user.username);
  }
  if (activeAvatar) {
    bindAvatarLoaded(activeAvatar, avatarUrl, user.username);
  }
  if (activeName) {
    activeName.textContent = user.username;
  }
  if (activeEmail) {
    activeEmail.textContent = user.email || '';
  }
  if (activeRole) {
    activeRole.textContent = user.role || '';
  }
  if (btnAvatar) {
    btnAvatar.setAttribute('data-tooltip', user.username);
    btnAvatar.setAttribute('aria-label', user.username);
  }
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isDashboard = path === '/' || path === '' || path === '/dashboard' || path.startsWith('/dashboard');
  const isUsers = path.startsWith('/users') || path.startsWith('/usuarios');
  const isEducation = path.startsWith('/education') || path.startsWith('/educacion');
  const isPurchases = path.startsWith('/purchases') || path.startsWith('/compras');
  const isOrganizations = path.startsWith('/organizations') || path.startsWith('/organizaciones');
  const isInquiries = path.startsWith('/inquiries') || path.startsWith('/leads');
  const isHr = path.startsWith('/hr') || path.startsWith('/rrhh');
  const isBackups = path.startsWith('/backups') || path.startsWith('/copias-de-seguridad');
  const isTickets = path.startsWith('/internal-tickets') || path.startsWith('/tickets-internos') || path.startsWith('/tickets');

  const canDashboard = hasPermission('admin:dashboard:view') || hasPermission('admin:access');
  const canUsers = hasPermission('admin:users:view');
  const canEducation = hasPermission('admin:education:view');
  const canPurchases = hasPermission('admin:purchases:view');
  const canOrganizations = hasPermission('admin:organizations:view');
  const canInquiries = hasPermission('admin:inquiries:view');
  const canHr = hasPermission('admin:hr:view');
  const canBackups = hasPermission('system:backup:read');
  const canTickets = hasPermission('admin:tickets:view');

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
  const itemHr = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-hr"]');
  const btnHr = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-hr"]');
  const itemBackups = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-backups"]');
  const btnBackups = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-backups"]');
  const itemTickets = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-tickets"]');
  const btnTickets = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-tickets"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');

  if (itemDashboard) itemDashboard.style.display = canDashboard ? '' : 'none';
  if (itemUsers) itemUsers.style.display = canUsers ? '' : 'none';
  if (itemEducation) itemEducation.style.display = canEducation ? '' : 'none';
  if (itemPurchases) itemPurchases.style.display = canPurchases ? '' : 'none';
  if (itemOrganizations) itemOrganizations.style.display = canOrganizations ? '' : 'none';
  if (itemInquiries) itemInquiries.style.display = canInquiries ? '' : 'none';
  if (itemHr) itemHr.style.display = canHr ? '' : 'none';
  if (itemBackups) itemBackups.style.display = canBackups ? '' : 'none';
  if (itemTickets) itemTickets.style.display = canTickets ? '' : 'none';

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
  itemHr?.classList.toggle('is-active', isHr);
  btnHr?.classList.toggle('is-active', isHr);
  itemBackups?.classList.toggle('is-active', isBackups);
  btnBackups?.classList.toggle('is-active', isBackups);
  itemTickets?.classList.toggle('is-active', isTickets);
  btnTickets?.classList.toggle('is-active', isTickets);
  btnBackups?.classList.toggle('is-active', isBackups);
  btnToggle?.classList.toggle('is-active', isDrawerOpen);

  updateSidebarProfile(sidebar);

  const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer && isDrawerOpen) {
    populateDrawerContent(drawer);
  }
}

function bindSidebarEvents(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const btnTheme = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-theme"]');
  const avatarContainer = sidebar.querySelector<HTMLElement>('[data-ref="avatar-container"]');
  const btnAvatar = sidebar.querySelector<HTMLElement>('[data-ref="btn-avatar"]');
  const avatarMenu = sidebar.querySelector<HTMLElement>('[data-ref="avatar-menu"]');
  const avatarBackdrop = sidebar.querySelector<HTMLElement>('[data-ref="avatar-menu-backdrop"]');
  const panelMain = sidebar.querySelector<HTMLElement>('[data-ref="panel-main-options"]');
  const panelSwitcher = sidebar.querySelector<HTMLElement>('[data-ref="panel-account-switcher"]');
  const btnSwitchAccountMenu = sidebar.querySelector<HTMLElement>('[data-ref="btn-switch-account-menu"]');
  const btnBackToMainMenu = sidebar.querySelector<HTMLElement>('[data-ref="btn-back-to-main-menu"]');
  const btnAddAccount = sidebar.querySelector<HTMLElement>('[data-ref="btn-add-account"]');
  const btnLogoutAll = sidebar.querySelector<HTMLElement>('[data-ref="btn-logout-all"]');
  const accountSwitcherList = sidebar.querySelector<HTMLElement>('[data-ref="account-switcher-list"]');
  const btnMenuTheme = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-theme"]');
  const btnLogout = sidebar.querySelector<HTMLElement>('[data-ref="btn-logout"]');

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
  bindItemNav('btn-rail-hr', 'rail-item-hr', '/hr');
  bindItemNav('btn-rail-backups', 'rail-item-backups', '/backups');
  bindItemNav('btn-rail-tickets', 'rail-item-tickets', '/internal-tickets');

  btnTheme?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
  });

  const showPanel = (panelName: 'main' | 'switcher') => {
    if (panelName === 'switcher') {
      if (panelMain) panelMain.style.display = 'none';
      if (panelSwitcher) panelSwitcher.style.display = 'flex';
      renderAccountList();
    } else {
      if (panelSwitcher) panelSwitcher.style.display = 'none';
      if (panelMain) panelMain.style.display = 'flex';
    }
  };

  const renderAccountList = () => {
    if (!accountSwitcherList) return;
    accountSwitcherList.innerHTML = '';

    const current = getAdminUser();
    const accounts = getAdminAccounts().length > 0 ? getAdminAccounts() : (current ? [current] : []);

    accounts.forEach((acc) => {
      const isActive = acc.id === current?.id;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `menu-item menu-item--bordered account-item ${isActive ? 'account-item--active' : ''}`;
      item.setAttribute('data-ref', `account-item-${acc.id}`);

      const accAvatarUrl = acc.avatar_url || `/api/avatar?name=${encodeURIComponent(acc.username)}`;

      item.innerHTML = `
        <div class="account-item__avatar" data-ref="account-avatar-${acc.id}">
          <img class="avatar-img image-lazy-fade" data-ref="avatar-img-${acc.id}" src="${accAvatarUrl}" alt="${acc.username}" referrerpolicy="no-referrer" onload="this.classList.add('image-loaded')" onerror="this.classList.add('image-loaded')" />
        </div>
        <div class="account-item__info" data-ref="account-info-${acc.id}">
          <span class="account-item__name" data-ref="account-name-${acc.id}">${acc.username}</span>
          <span class="account-item__email" data-ref="account-email-${acc.id}">${acc.email || ''}</span>
          <span class="account-item__role" data-ref="account-role-${acc.id}" style="font-size: 10px; font-weight: 700; color: var(--primary, #0ea5e9); text-transform: uppercase; margin-top: 2px;">${acc.role || ''}</span>
        </div>
        ${isActive ? '<svg class="component-icon account-item__check" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>' : ''}
      `;

      if (!isActive) {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          closeAvatarMenu();
          const res = await switchAdminAccount(acc.id);
          if (res.success) {
            updateSidebarActiveState(sidebar);
            navigate('/');
          }
        });
      }

      accountSwitcherList.appendChild(item);
    });

    renderIcons(accountSwitcherList);

    if (btnAddAccount) {
      btnAddAccount.style.display = accounts.length >= 3 ? 'none' : 'flex';
    }
  };

  const closeAvatarMenu = () => {
    avatarMenu?.classList.remove('is-open');
    avatarBackdrop?.classList.remove('is-open');
    showPanel('main');
  };

  const toggleAvatarMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = avatarMenu?.classList.contains('is-open');
    if (isOpen) {
      closeAvatarMenu();
    } else {
      showPanel('main');
      avatarMenu?.classList.add('is-open');
      avatarBackdrop?.classList.add('is-open');
    }
  };

  btnAvatar?.addEventListener('click', toggleAvatarMenu);

  btnSwitchAccountMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('switcher');
  });

  btnBackToMainMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('main');
  });

  btnAddAccount?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate('/login');
  });

  avatarBackdrop?.addEventListener('click', (e) => {
    if (e.target === avatarBackdrop) {
      closeAvatarMenu();
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!avatarContainer?.contains(e.target as Node)) {
      closeAvatarMenu();
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeAvatarMenu();
    }
  });

  btnMenuTheme?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
    const drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
    if (drawer && isDrawerOpen) {
      populateDrawerContent(drawer);
    }
  });

  btnLogout?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAvatarMenu();
    void logoutAdmin();
  });

  btnLogoutAll?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAvatarMenu();
    void logoutAllAdmin();
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
