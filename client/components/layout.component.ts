import { getLocalizedPath } from '../config/seo.config.js';
import { TOOLS_REGISTRY } from '../config/tools.registry.js';
import { currentUser, escapeHtml, getApi, hasPermission, linkedAccounts, logoutAllApi, logoutApi, onAuthChange, switchAccountApi } from '../services/api.service.js';
import { getCurrentLanguage, t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { UserWorkflow } from '../types/workflow.types.js';
import { applyAvatarTier } from '../utils/tier.util.js';
import { setupSheetDragToDismiss } from './modal.component.js';

export let isDrawerOpen = false;
export let currentDrawerMode: 'apps' | 'settings' | 'navigation' | 'help' = 'navigation';
let activeResizeObserver: ResizeObserver | null = null;
let drawerRemovalTimer: ReturnType<typeof setTimeout> | null = null;
let sidebarInitPromise: Promise<HTMLElement> | null = null;
let sidebarInstance: HTMLElement | null = null;

export function hasDesignatedMenuItems(pathname: string): boolean {
  if (!pathname) return false;
  return pathname.includes('/settings') || pathname.includes('/help');
}

export function updateSidebarAuthState(sidebar: HTMLElement): void {
  const itemLogin = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-login"]');
  const railItemSettings = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-settings"]');
  const avatarContainer = sidebar.querySelector<HTMLElement>('[data-ref="avatar-container"]');
  const avatarImg = sidebar.querySelector<HTMLImageElement>('[data-ref="avatar-img"]');
  const btnAvatar = sidebar.querySelector<HTMLElement>('[data-ref="btn-avatar"]');
  const activeAvatar = sidebar.querySelector<HTMLImageElement>('[data-ref="active-account-avatar"]');
  const activeAvatarBox = sidebar.querySelector<HTMLElement>('[data-ref="active-account-avatar-box"]');
  const activeName = sidebar.querySelector<HTMLElement>('[data-ref="active-account-name"]');
  const activeEmail = sidebar.querySelector<HTMLElement>('[data-ref="active-account-email"]');
  const railItemAi = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-ai"]');
  const btnMenuOrganization = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-organization"]');

  if (currentUser) {
    if (itemLogin) itemLogin.style.display = 'none';
    if (railItemSettings) railItemSettings.style.display = 'none';
    if (avatarContainer) avatarContainer.style.display = 'flex';
    if (railItemAi) railItemAi.style.display = 'flex';

    const isEnterprise = hasPermission(currentUser, 'subscription:feature:enterprise');
    if (btnMenuOrganization) {
      btnMenuOrganization.style.display = isEnterprise ? 'flex' : 'none';
    }

    const avatarUrl = currentUser.avatar_url || `/api/avatar?name=${encodeURIComponent(currentUser.username)}`;

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
      bindAvatarLoaded(avatarImg, avatarUrl, currentUser.username);
    }
    if (activeAvatar) {
      bindAvatarLoaded(activeAvatar, avatarUrl, currentUser.username);
    }
    if (activeName) {
      activeName.textContent = currentUser.username;
    }
    if (activeEmail) {
      activeEmail.textContent = currentUser.email || '';
    }
    if (btnAvatar) {
      applyAvatarTier(btnAvatar, currentUser.subscription_tier, currentUser.subscription_tier_color);
      btnAvatar.setAttribute('data-tooltip', currentUser.username);
      btnAvatar.setAttribute('aria-label', currentUser.username);
    }
    if (activeAvatarBox) {
      applyAvatarTier(activeAvatarBox, currentUser.subscription_tier, currentUser.subscription_tier_color);
    }
  } else {
    if (itemLogin) itemLogin.style.display = 'flex';
    if (railItemSettings) railItemSettings.style.display = 'flex';
    if (avatarContainer) avatarContainer.style.display = 'none';
    if (railItemAi) railItemAi.style.display = 'flex';
    if (btnMenuOrganization) btnMenuOrganization.style.display = 'none';
  }
}

export function updateSidebarActiveState(sidebar: HTMLElement, path = window.location.pathname): void {
  const isHome = path === '/' || path === '' || /^\/[a-z]{2}\/?$/i.test(path);
  const isSettings = path.includes('/settings');
  const isHelp = path.includes('/help') || path.includes('/preguntas-frecuentes') || path.includes('/herramientas') || path.includes('/seguridad') || path.includes('/privacidad') || path.includes('/terminos') || path.includes('/cookies');
  const isAi = path === '/ai' || path.startsWith('/ai') || /^\/[a-z]{2}\/ai(\/.*)?$/i.test(path);

  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const btnHome = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-home"]');
  const itemApps = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-apps"]');
  const btnApps = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-apps"]');
  const itemHelp = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-help"]');
  const btnHelp = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-help"]');
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const railItemSettings = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-settings"]');
  const btnRailSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-settings"]');
  const railItemAi = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-ai"]');
  const btnRailAi = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-ai"]');

  itemHome?.classList.toggle('is-active', isHome && (!isDrawerOpen || currentDrawerMode !== 'apps'));
  btnHome?.classList.toggle('is-active', isHome && (!isDrawerOpen || currentDrawerMode !== 'apps'));
  itemApps?.classList.toggle('is-active', isDrawerOpen && currentDrawerMode === 'apps');
  btnApps?.classList.toggle('is-active', isDrawerOpen && currentDrawerMode === 'apps');
  itemHelp?.classList.toggle('is-active', isHelp && (!isDrawerOpen || currentDrawerMode === 'help'));
  btnHelp?.classList.toggle('is-active', isHelp && (!isDrawerOpen || currentDrawerMode === 'help'));
  btnToggle?.classList.toggle('is-active', isDrawerOpen && currentDrawerMode !== 'apps');
  railItemSettings?.classList.toggle('is-active', isSettings && (!isDrawerOpen || currentDrawerMode === 'settings'));
  btnRailSettings?.classList.toggle('is-active', isSettings && (!isDrawerOpen || currentDrawerMode === 'settings'));
  railItemAi?.classList.toggle('is-active', isAi && (!isDrawerOpen || currentDrawerMode !== 'apps'));
  btnRailAi?.classList.toggle('is-active', isAi && (!isDrawerOpen || currentDrawerMode !== 'apps'));

  updateSidebarAuthState(sidebar);
  if (isDrawerOpen) {
    if (isSettings && currentDrawerMode !== 'settings' && currentDrawerMode !== 'apps') {
      currentDrawerMode = 'settings';
    } else if (isHelp && currentDrawerMode !== 'help' && currentDrawerMode !== 'apps') {
      currentDrawerMode = 'help';
    } else if (!isSettings && !isHelp && currentDrawerMode !== 'navigation' && currentDrawerMode !== 'apps') {
      currentDrawerMode = 'navigation';
    }
    void updateDynamicDrawer(sidebar);
  }
}

function setupRailNavigation(sidebar: HTMLElement): void {
  const itemHome = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-home"]');
  const btnHome = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-home"]');
  const itemApps = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-apps"]');
  const btnApps = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-apps"]');
  const btnLogin = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-login"]');
  const avatarContainer = sidebar.querySelector<HTMLElement>('[data-ref="avatar-container"]');
  const btnAvatar = sidebar.querySelector<HTMLElement>('[data-ref="btn-avatar"]');
  const avatarMenu = sidebar.querySelector<HTMLElement>('[data-ref="avatar-menu"]');
  const avatarBackdrop = sidebar.querySelector<HTMLElement>('[data-ref="avatar-menu-backdrop"]');
  const btnLogout = sidebar.querySelector<HTMLElement>('[data-ref="btn-logout"]');

  const panelMain = sidebar.querySelector<HTMLElement>('[data-ref="panel-main-options"]');
  const panelSwitcher = sidebar.querySelector<HTMLElement>('[data-ref="panel-account-switcher"]');
  const btnSwitchAccountMenu = sidebar.querySelector<HTMLElement>('[data-ref="btn-switch-account-menu"]');
  const btnBackToMainMenu = sidebar.querySelector<HTMLElement>('[data-ref="btn-back-to-main-menu"]');
  const btnAddAccount = sidebar.querySelector<HTMLElement>('[data-ref="btn-add-account"]');
  const btnLogoutAll = sidebar.querySelector<HTMLElement>('[data-ref="btn-logout-all"]');
  const accountSwitcherList = sidebar.querySelector<HTMLElement>('[data-ref="account-switcher-list"]');

  const goHome = (e: Event) => {
    e.preventDefault();
    navigate('/');
  };

  btnHome?.addEventListener('click', goHome);
  itemHome?.addEventListener('click', (e) => {
    if (e.target !== btnHome && !btnHome?.contains(e.target as Node)) {
      goHome(e);
    }
  });

  const toggleApps = (e: Event) => {
    e.preventDefault();
    if (isDrawerOpen && currentDrawerMode === 'apps') {
      toggleDrawer(false);
    } else {
      toggleDrawer(true, 'apps');
    }
  };

  btnApps?.addEventListener('click', toggleApps);
  itemApps?.addEventListener('click', (e) => {
    if (e.target !== btnApps && !btnApps?.contains(e.target as Node)) {
      toggleApps(e);
    }
  });

  btnLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/login');
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

    const accounts = linkedAccounts.length > 0 ? linkedAccounts : (currentUser ? [currentUser] : []);

    accounts.forEach((acc) => {
      const isActive = acc.id === currentUser?.id;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item menu-item--bordered account-item';
      item.setAttribute('data-ref', `account-item-${acc.id}`);

      const accAvatarUrl = acc.avatar_url || `/api/avatar?name=${encodeURIComponent(acc.username)}`;

      item.innerHTML = `
        <div class="account-item__avatar" data-ref="account-avatar-${acc.id}">
          <img class="avatar-img image-lazy-fade" data-ref="avatar-img-${acc.id}" src="${accAvatarUrl}" alt="${acc.username}" referrerpolicy="no-referrer" onload="this.classList.add('image-loaded')" onerror="this.classList.add('image-loaded')" />
        </div>
        <div class="account-item__info" data-ref="account-info-${acc.id}">
          <span class="account-item__name" data-ref="account-name-${acc.id}">${acc.username}</span>
          <span class="account-item__email" data-ref="account-email-${acc.id}">${acc.email || ''}</span>
        </div>
        ${isActive ? '<svg class="component-icon account-item__check" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>' : ''}
      `;

      const accAvatarBox = item.querySelector<HTMLElement>(`[data-ref="account-avatar-${acc.id}"]`);
      if (accAvatarBox) {
        applyAvatarTier(accAvatarBox, acc.subscription_tier, acc.subscription_tier_color);
      }


      if (!isActive) {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          closeAvatarMenu();
          const res = await switchAccountApi(acc.id);
          if (res.success) {
            updateSidebarAuthState(sidebar);
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
    if (!avatarMenu || !avatarBackdrop) return;
    avatarMenu.classList.remove('is-open');
    avatarBackdrop.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    showPanel('main');
  };

  const toggleAvatarMenu = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = avatarMenu?.classList.contains('is-open');
    if (isOpen) {
      closeAvatarMenu();
    } else {
      toggleDrawer(false);
      showPanel('main');
      if (avatarMenu && avatarBackdrop) {
        avatarBackdrop.classList.add('is-open');
        void avatarMenu.offsetHeight;
        requestAnimationFrame(() => {
          avatarMenu.classList.add('is-open');
        });
      }
      if (window.innerWidth <= 768) {
        document.body.classList.add('modal-open');
      }
    }
  };

  btnAvatar?.addEventListener('click', toggleAvatarMenu);

  const avatarDragZone = avatarMenu?.querySelector<HTMLElement>('[data-ref="avatar-menu-drag-zone"]');
  if (avatarDragZone && avatarMenu && avatarBackdrop) {
    setupSheetDragToDismiss(avatarDragZone, avatarMenu, avatarBackdrop, closeAvatarMenu);
  }

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
      toggleDrawer(false);
    }
  });

  const itemHelp = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-help"]');
  const btnRailHelp = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-help"]');

  const goHelp = (e: Event) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate('/help/security');
  };

  btnRailHelp?.addEventListener('click', goHelp);
  itemHelp?.addEventListener('click', (e) => {
    if (e.target !== btnRailHelp && !btnRailHelp?.contains(e.target as Node)) {
      goHelp(e);
    }
  });

  const railItemSettings = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-settings"]');
  const btnRailSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-settings"]');
  const btnMenuSettings = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-settings"]');
  const btnMenuWorkflows = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-workflows"]');

  const goSettings = (e: Event) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate(currentUser ? '/settings/your-account' : '/settings/guest');
  };

  btnRailSettings?.addEventListener('click', goSettings);
  railItemSettings?.addEventListener('click', (e) => {
    if (e.target !== btnRailSettings && !btnRailSettings?.contains(e.target as Node)) {
      goSettings(e);
    }
  });

  btnMenuSettings?.addEventListener('click', goSettings);

  btnMenuWorkflows?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate('/workflows');
  });

  const btnMenuOrganization = sidebar.querySelector<HTMLElement>('[data-ref="btn-menu-organization"]');
  btnMenuOrganization?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate('/organization');
  });

  const railItemAi = sidebar.querySelector<HTMLElement>('[data-ref="rail-item-ai"]');
  const btnRailAi = sidebar.querySelector<HTMLElement>('[data-ref="btn-rail-ai"]');

  const goAi = (e: Event) => {
    e.preventDefault();
    closeAvatarMenu();
    navigate('/ai');
  };

  btnRailAi?.addEventListener('click', goAi);
  railItemAi?.addEventListener('click', (e) => {
    if (e.target !== btnRailAi && !btnRailAi?.contains(e.target as Node)) {
      goAi(e);
    }
  });

  btnLogout?.addEventListener('click', async (e) => {
    e.preventDefault();
    closeAvatarMenu();
    const res = await logoutApi();
    updateSidebarAuthState(sidebar);
    if (!res.switched) {
      navigate('/login');
    }
  });

  btnLogoutAll?.addEventListener('click', async (e) => {
    e.preventDefault();
    closeAvatarMenu();
    await logoutAllApi();
    updateSidebarAuthState(sidebar);
    navigate('/login');
  });
}

function createDrawerElement(): HTMLElement {
  const drawer = document.createElement('div');
  drawer.className = 'layout-drawer';
  drawer.setAttribute('data-ref', 'layout-drawer');

  const dragZone = document.createElement('div');
  dragZone.className = 'layout-drawer__drag-zone';
  dragZone.setAttribute('data-ref', 'drawer-drag-zone');
  dragZone.setAttribute('aria-hidden', 'true');
  const dragHandle = document.createElement('div');
  dragHandle.className = 'layout-drawer__drag-handle';
  dragZone.appendChild(dragHandle);
  drawer.appendChild(dragZone);

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

export async function populateDrawerContent(drawer: HTMLElement): Promise<void> {
  const drawerBody = drawer.querySelector<HTMLElement>('[data-ref="drawer-body"]');
  const drawerFooter = drawer.querySelector<HTMLElement>('[data-ref="drawer-footer"]');
  if (!drawerBody) return;

  const currentPath = window.location.pathname;

  const bindNavLink = (btn: HTMLElement | null, path: string) => {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      navigate(path);
    });
  };

  const isSettings = currentDrawerMode === 'settings' || (currentDrawerMode !== 'apps' && currentPath.includes('/settings'));
  const isHelp = currentDrawerMode === 'help' || (currentDrawerMode !== 'apps' && (currentPath.includes('/help') || currentPath.includes('/preguntas-frecuentes') || currentPath.includes('/herramientas') || currentPath.includes('/seguridad') || currentPath.includes('/privacidad') || currentPath.includes('/terminos') || currentPath.includes('/cookies')));

  if (isSettings) {
    if (currentUser) {
      drawerBody.innerHTML = `
        <div class="drawer-section__header" data-ref="drawer-settings-header" style="padding: 8px 8px 4px 8px;">
          <span class="drawer-section__title" data-ref="drawer-settings-title" data-i18n="nav.settings" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.settings', 'Configuración')}</span>
        </div>
        <button type="button" class="menu-item" data-ref="btn-nav-settings-account">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#person"></use></svg>
          <span class="menu-item__text" data-i18n="nav.your_account">Tu cuenta</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-nav-settings-accessibility">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#accessibility_new"></use></svg>
          <span class="menu-item__text" data-i18n="nav.accessibility">Accesibilidad</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-nav-settings-security">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#lock"></use></svg>
          <span class="menu-item__text" data-i18n="nav.security">Seguridad</span>
        </button>
      `;

      if (drawerFooter) {
        drawerFooter.innerHTML = `
          <button type="button" class="menu-item" data-ref="btn-nav-settings-billing">
            <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
            <span class="menu-item__text" data-i18n="nav.billing">Facturación</span>
          </button>
          <button type="button" class="menu-item" data-ref="btn-nav-settings-purchases">
            <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#receipt_long"></use></svg>
            <span class="menu-item__text" data-i18n="nav.purchases">Historial de compras</span>
          </button>
        `;
        drawerFooter.style.display = 'flex';
        translateElement(drawerFooter);

        const btnBilling = drawerFooter.querySelector<HTMLElement>('[data-ref="btn-nav-settings-billing"]');
        const btnPurchases = drawerFooter.querySelector<HTMLElement>('[data-ref="btn-nav-settings-purchases"]');

        if (currentPath.endsWith('/billing') || currentPath.includes('/billing')) {
          btnBilling?.classList.add('is-active');
        } else if (currentPath.endsWith('/purchases') || currentPath.includes('/purchases') || currentPath.includes('purchases-history')) {
          btnPurchases?.classList.add('is-active');
        }

        bindNavLink(btnBilling, '/settings/billing');
        bindNavLink(btnPurchases, '/settings/purchases');
        renderIcons(drawerFooter);
      }

      translateElement(drawerBody);

      const btnAccount = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-settings-account"]');
      const btnAccessibility = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-settings-accessibility"]');
      const btnSecurity = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-settings-security"]');

      if (currentPath.endsWith('/settings') || currentPath.includes('/your-account') || currentPath.includes('/profile')) {
        btnAccount?.classList.add('is-active');
      } else if (currentPath.includes('/accessibility')) {
        btnAccessibility?.classList.add('is-active');
      } else if (currentPath.includes('/security') || currentPath.includes('login-and-security')) {
        btnSecurity?.classList.add('is-active');
      }

      bindNavLink(btnAccount, '/settings/your-account');
      bindNavLink(btnAccessibility, '/settings/accessibility');
      bindNavLink(btnSecurity, '/settings/security');
    } else {
      drawerBody.innerHTML = `
        <div class="drawer-section__header" data-ref="drawer-settings-header" style="padding: 8px 8px 4px 8px;">
          <span class="drawer-section__title" data-ref="drawer-settings-title" data-i18n="nav.settings" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.settings', 'Configuración')}</span>
        </div>
        <button type="button" class="menu-item" data-ref="btn-nav-settings-guest">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#tune"></use></svg>
          <span class="menu-item__text" data-i18n="nav.guest_settings">Configuración</span>
        </button>
        <button type="button" class="menu-item" data-ref="btn-nav-settings-accessibility">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#accessibility_new"></use></svg>
          <span class="menu-item__text" data-i18n="nav.accessibility">Accesibilidad</span>
        </button>
      `;

      if (drawerFooter) {
        drawerFooter.innerHTML = '';
        drawerFooter.style.display = 'none';
      }

      translateElement(drawerBody);

      const btnGuest = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-settings-guest"]');
      const btnAccessibility = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-settings-accessibility"]');

      if (currentPath.endsWith('/settings') || currentPath.includes('/guest')) {
        btnGuest?.classList.add('is-active');
      } else if (currentPath.includes('/accessibility')) {
        btnAccessibility?.classList.add('is-active');
      }

      bindNavLink(btnGuest, '/settings/guest');
      bindNavLink(btnAccessibility, '/settings/accessibility');
    }
  } else if (isHelp) {
    if (drawerFooter) {
      drawerFooter.innerHTML = '';
      drawerFooter.style.display = 'none';
    }

    drawerBody.innerHTML = `
      <div class="drawer-section__header" data-ref="drawer-help-header" style="padding: 8px 8px 4px 8px;">
        <span class="drawer-section__title" data-ref="drawer-help-title" data-i18n="nav.help" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.help', 'Ayuda')}</span>
      </div>
      <button type="button" class="menu-item" data-ref="btn-nav-help-documentation">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#auto_awesome"></use></svg>
        <span class="menu-item__text">Documentación</span>
      </button>
      <button type="button" class="menu-item" data-ref="btn-nav-help-faq">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#help"></use></svg>
        <span class="menu-item__text">Preguntas frecuentes</span>
      </button>
      <button type="button" class="menu-item" data-ref="btn-nav-help-security">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#shield"></use></svg>
        <span class="menu-item__text" data-i18n="help.nav_security">${t('help.nav_security', 'Política de seguridad')}</span>
      </button>
      <button type="button" class="menu-item" data-ref="btn-nav-help-privacy">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#lock"></use></svg>
        <span class="menu-item__text" data-i18n="help.nav_privacy">${t('help.nav_privacy', 'Política de privacidad')}</span>
      </button>
      <button type="button" class="menu-item" data-ref="btn-nav-help-terms">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#gavel"></use></svg>
        <span class="menu-item__text" data-i18n="help.nav_terms">${t('help.nav_terms', 'Términos y condiciones')}</span>
      </button>
      <button type="button" class="menu-item" data-ref="btn-nav-help-cookies">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#cookie"></use></svg>
        <span class="menu-item__text" data-i18n="help.nav_cookies">${t('help.nav_cookies', 'Política de cookies')}</span>
      </button>
    `;
    translateElement(drawerBody);

    const btnDocs = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-documentation"]');
    const btnFaq = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-faq"]');
    const btnSecurity = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-security"]');
    const btnPrivacy = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-privacy"]');
    const btnTerms = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-terms"]');
    const btnCookies = drawerBody.querySelector<HTMLElement>('[data-ref="btn-nav-help-cookies"]');

    if (currentPath === '/help/documentation' || currentPath === '/documentation' || currentPath === '/herramientas') {
      btnDocs?.classList.add('is-active');
    } else if (currentPath === '/help/faq' || currentPath === '/faq' || currentPath === '/preguntas-frecuentes') {
      btnFaq?.classList.add('is-active');
    } else if (currentPath === '/help' || currentPath === '/help/security' || currentPath === '/security-policy') {
      btnSecurity?.classList.add('is-active');
    } else if (currentPath === '/help/privacy' || currentPath === '/privacy' || currentPath === '/privacy-policy') {
      btnPrivacy?.classList.add('is-active');
    } else if (currentPath === '/help/terms' || currentPath === '/terms' || currentPath === '/terms-and-conditions') {
      btnTerms?.classList.add('is-active');
    } else if (currentPath === '/help/cookies' || currentPath === '/cookies' || currentPath === '/cookie-policy') {
      btnCookies?.classList.add('is-active');
    }

    bindNavLink(btnDocs, '/help/documentation');
    bindNavLink(btnFaq, '/help/faq');
    bindNavLink(btnSecurity, '/help/security');
    bindNavLink(btnPrivacy, '/help/privacy');
    bindNavLink(btnTerms, '/help/terms');
    bindNavLink(btnCookies, '/help/cookies');
  } else if (currentDrawerMode === 'apps') {
    if (drawerFooter) {
      drawerFooter.innerHTML = '';
      drawerFooter.style.display = 'none';
    }
    renderAppsDrawerContent(drawerBody);
  } else {
    await renderWorkflowsDrawerContent(drawerBody, drawerFooter);
  }

  renderIcons(drawerBody);
}

async function renderWorkflowsDrawerContent(drawerBody: HTMLElement, drawerFooter: HTMLElement | null): Promise<void> {
  const currentPath = window.location.pathname;

  const bindNavLink = (btn: HTMLElement | null, path: string) => {
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        toggleDrawer(false);
      }
      navigate(path);
    });
  };

  if (!currentUser) {
    drawerBody.innerHTML = `
      <div class="drawer-section__header" data-ref="drawer-workflows-header" style="padding: 8px 8px 4px 8px;">
        <span class="drawer-section__title" data-ref="drawer-workflows-title" data-i18n="nav.workflows" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.workflows', 'Flujos de trabajo')}</span>
      </div>
      <div class="drawer-empty-state" data-ref="drawer-guest-workflows" style="padding: 32px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
        <svg class="component-icon" style="width: 36px; height: 36px; color: var(--text-tertiary); opacity: 0.6;" aria-hidden="true"><use href="/icons.svg#account_tree"></use></svg>
        <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">${t('workflows.login_prompt', 'Inicia sesión para ver tus flujos de trabajo')}</span>
      </div>
    `;

    if (drawerFooter) {
      drawerFooter.innerHTML = `
        <button type="button" class="menu-item menu-item--bordered" data-ref="btn-nav-login-workflows">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#login"></use></svg>
          <span class="menu-item__text" data-i18n="nav.login">Acceder</span>
        </button>
      `;
      drawerFooter.style.display = 'flex';
      translateElement(drawerFooter);
      bindNavLink(drawerFooter.querySelector('[data-ref="btn-nav-login-workflows"]'), '/login');
      renderIcons(drawerFooter);
    }

    translateElement(drawerBody);
    return;
  }

  let workflows: UserWorkflow[] = [];
  try {
    const res = await getApi('/api/settings/workflows');
    if (res.ok) {
      const data = await res.json();
      workflows = Array.isArray(data.workflows) ? data.workflows : [];
    }
  } catch {
    workflows = [];
  }

  if (workflows.length === 0) {
    drawerBody.innerHTML = `
      <div class="drawer-section__header" data-ref="drawer-workflows-header" style="padding: 8px 8px 4px 8px;">
        <span class="drawer-section__title" data-ref="drawer-workflows-title" data-i18n="nav.workflows" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.workflows', 'Flujos de trabajo')}</span>
      </div>
      <div class="drawer-empty-state" data-ref="drawer-empty-workflows" style="padding: 32px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
        <svg class="component-icon" style="width: 36px; height: 36px; color: var(--text-tertiary); opacity: 0.6;" aria-hidden="true"><use href="/icons.svg#account_tree"></use></svg>
        <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">${t('workflows.empty_title', 'No tienes flujos de trabajo')}</span>
        <span style="font-size: 12px; color: var(--text-tertiary);">${t('workflows.empty_subtitle', 'Crea combinaciones de herramientas automáticas')}</span>
      </div>
    `;
  } else {
    let html = `
      <div class="drawer-section__header" data-ref="drawer-workflows-header" style="padding: 8px 8px 4px 8px;">
        <span class="drawer-section__title" data-ref="drawer-workflows-title" data-i18n="nav.workflows" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${t('nav.workflows', 'Flujos de trabajo')}</span>
      </div>
    `;
    for (const wf of workflows) {
      const isActive = currentPath === `/workflow/${wf.id}`;
      const escapedName = escapeHtml(wf.name);
      html += `
        <button type="button" class="menu-item ${isActive ? 'is-active' : ''}" data-ref="btn-nav-wf-${wf.id}" data-wf-id="${wf.id}" title="${escapedName}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#account_tree"></use></svg>
          <span class="menu-item__text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapedName}</span>
        </button>
      `;
    }
    drawerBody.innerHTML = html;

    workflows.forEach((wf) => {
      const btn = drawerBody.querySelector<HTMLElement>(`[data-ref="btn-nav-wf-${wf.id}"]`);
      bindNavLink(btn, `/workflow/${wf.id}`);
    });
  }

  if (drawerFooter) {
    drawerFooter.innerHTML = `
      <button type="button" class="menu-item menu-item--bordered" data-ref="btn-nav-create-workflow">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#add"></use></svg>
        <span class="menu-item__text" data-i18n="workflows.create_title">Crear flujo de trabajo</span>
      </button>
    `;
    drawerFooter.style.display = 'flex';
    translateElement(drawerFooter);
    bindNavLink(drawerFooter.querySelector('[data-ref="btn-nav-create-workflow"]'), '/workflows?new=1');
    renderIcons(drawerFooter);
  }

  translateElement(drawerBody);
}

function renderAppsDrawerContent(drawerBody: HTMLElement): void {
  const categoriesConfig = [
    { id: 'organize', name: t('home.cat_organize') || 'Ordenar PDF' },
    { id: 'optimize', name: t('home.cat_optimize') || 'Optimizar PDF' },
    { id: 'convert-to-pdf', name: t('home.cat_convert_to_pdf') || 'Convertir a PDF' },
    { id: 'convert-from-pdf', name: t('home.cat_convert_from_pdf') || t('home.cat_convert') || 'Convertir desde PDF' },
    { id: 'edit', name: t('home.cat_edit') || 'Editar PDF' },
    { id: 'security', name: t('home.cat_security') || 'Seguridad de PDF' },
    { id: 'pdf-intelligence', name: t('home.cat_pdf_intelligence') || 'PDF Intelligence' },
  ];

  let html = `
    <div class="drawer-tools-list" data-ref="drawer-tools-list" style="display: flex; flex-direction: column; gap: 2px;">
  `;

  for (const cat of categoriesConfig) {
    const tools = TOOLS_REGISTRY.filter((item) => item.category === cat.id);
    if (tools.length === 0) continue;

    html += `
      <div class="drawer-category-group" data-ref="group-${cat.id}" style="margin-bottom: 8px;">
        <div class="drawer-category-title" data-ref="title-${cat.id}" style="padding: 10px 8px 4px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">
          ${cat.name}
        </div>
    `;

    const currentLang = getCurrentLanguage();
    for (const tool of tools) {
      const toolName = t(tool.nameKey);
      const toolDesc = t(tool.descKey);
      const searchHaystack = `${toolName} ${toolDesc} ${cat.name}`.toLowerCase();
      const toolPath = getLocalizedPath(tool.id, currentLang);

      html += `
        <button type="button" class="menu-item drawer-tool-item" data-ref="drawer-tool-${tool.id}" data-tool-path="${toolPath}" data-search="${searchHaystack}">
          <span class="menu-item__icon tool-item__mini-icon">
            ${tool.customSvg || `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
          </span>
          <span class="menu-item__text" style="font-size: 13px; font-weight: 500;">${toolName}</span>
        </button>
      `;
    }

    html += `</div>`;
  }

  html += `</div>`;
  drawerBody.innerHTML = html;

  const toolButtons = drawerBody.querySelectorAll<HTMLButtonElement>('.drawer-tool-item');
  toolButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const path = btn.getAttribute('data-tool-path');
      if (path) {
        if (window.innerWidth <= 1024) {
          toggleDrawer(false);
        }
        navigate(path);
      }
    });
  });
}

async function openDynamicDrawer(sidebar: HTMLElement): Promise<void> {
  let backdrop = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer-backdrop"]');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'layout-drawer-backdrop';
    backdrop.setAttribute('data-ref', 'layout-drawer-backdrop');
    backdrop.addEventListener('click', () => {
      toggleDrawer(false);
    });
    sidebar.appendChild(backdrop);
  }
  let drawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (!drawer) {
    drawer = createDrawerElement();
    sidebar.appendChild(drawer);
  }
  const dragZone = drawer.querySelector<HTMLElement>('[data-ref="drawer-drag-zone"]');
  if (dragZone && backdrop) {
    setupSheetDragToDismiss(dragZone, drawer, backdrop, () => toggleDrawer(false));
  }
  await populateDrawerContent(drawer);
  void drawer.offsetHeight;
  requestAnimationFrame(() => {
    backdrop?.classList.add('is-open');
    drawer?.classList.add('is-open');
  });
  if (window.innerWidth <= 768) {
    document.body.classList.add('modal-open');
  }
}

function closeDynamicDrawer(): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const drawer = sidebar?.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  const backdrop = sidebar?.querySelector<HTMLElement>('[data-ref="layout-drawer-backdrop"]');
  const itemApps = sidebar?.querySelector<HTMLElement>('[data-ref="rail-item-apps"]');
  const btnApps = sidebar?.querySelector<HTMLElement>('[data-ref="btn-rail-apps"]');
  itemApps?.classList.remove('is-active');
  btnApps?.classList.remove('is-active');
  backdrop?.classList.remove('is-open');
  document.body.classList.remove('modal-open');

  if (drawer) {
    drawer.classList.remove('is-open');
    if (drawerRemovalTimer) {
      clearTimeout(drawerRemovalTimer);
    }
    drawerRemovalTimer = setTimeout(() => {
      drawer?.remove();
      backdrop?.remove();
      drawerRemovalTimer = null;
    }, 280);
  }
}

export function toggleDrawer(forceState?: boolean, mode?: 'apps' | 'settings' | 'navigation' | 'help'): void {
  const sidebar = document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  const btnToggle = sidebar?.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]') || document.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  const itemApps = sidebar?.querySelector<HTMLElement>('[data-ref="rail-item-apps"]');
  const btnApps = sidebar?.querySelector<HTMLElement>('[data-ref="btn-rail-apps"]');

  const currentPath = window.location.pathname;
  const targetMode = mode || (currentPath.includes('/settings') ? 'settings' : (currentPath.includes('/help') ? 'help' : 'navigation'));

  if (forceState === undefined) {
    if (isDrawerOpen && currentDrawerMode === targetMode) {
      isDrawerOpen = false;
    } else {
      isDrawerOpen = true;
      currentDrawerMode = targetMode;
    }
  } else {
    isDrawerOpen = forceState;
    if (mode) {
      currentDrawerMode = mode;
    } else if (forceState) {
      currentDrawerMode = targetMode;
    }
  }

  btnToggle?.classList.toggle('is-active', isDrawerOpen && currentDrawerMode !== 'apps');
  const isAppsActive = isDrawerOpen && currentDrawerMode === 'apps';
  itemApps?.classList.toggle('is-active', isAppsActive);
  btnApps?.classList.toggle('is-active', isAppsActive);

  if (isDrawerOpen) {
    const avatarMenu = sidebar?.querySelector<HTMLElement>('[data-ref="avatar-menu"]');
    const avatarBackdrop = sidebar?.querySelector<HTMLElement>('[data-ref="avatar-menu-backdrop"]');
    avatarMenu?.classList.remove('is-open');
    avatarBackdrop?.classList.remove('is-open');

    if (drawerRemovalTimer) {
      clearTimeout(drawerRemovalTimer);
      drawerRemovalTimer = null;
    }
    if (sidebar) {
      void openDynamicDrawer(sidebar);
    }
  } else {
    closeDynamicDrawer();
  }
}

export async function updateDynamicDrawer(sidebar?: HTMLElement): Promise<void> {
  const sb = sidebar || document.querySelector<HTMLElement>('[data-ref="sidebar"]');
  if (!sb) return;
  const drawer = sb.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  if (drawer && isDrawerOpen) {
    await populateDrawerContent(drawer);
  }
}

function setupDrawerContent(sidebar: HTMLElement): void {
  const btnToggle = sidebar.querySelector<HTMLElement>('[data-ref="btn-toggle-drawer"]');
  btnToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    const currentPath = window.location.pathname;
    const mode = currentPath.includes('/settings') ? 'settings' : (currentPath.includes('/help') ? 'help' : 'navigation');
    toggleDrawer(undefined, mode);
  });

  isDrawerOpen = false;
  btnToggle?.classList.remove('is-active');
  const existingDrawer = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer"]');
  existingDrawer?.remove();
  const existingBackdrop = sidebar.querySelector<HTMLElement>('[data-ref="layout-drawer-backdrop"]');
  existingBackdrop?.remove();
}

export async function createSidebar(): Promise<HTMLElement> {
  if (sidebarInstance) {
    updateSidebarActiveState(sidebarInstance, window.location.pathname);
    return sidebarInstance;
  }
  if (sidebarInitPromise) {
    return sidebarInitPromise;
  }

  sidebarInitPromise = (async () => {
    const sidebar = await loadTemplate('/views/components/sidebar.html');
    translateElement(sidebar);
    setupRailNavigation(sidebar);
    setupDrawerContent(sidebar);
    updateSidebarActiveState(sidebar, window.location.pathname);
    renderIcons(sidebar);
    sidebarInstance = sidebar;

    onAuthChange(() => {
      if (sidebarInstance) {
        updateSidebarAuthState(sidebarInstance);
        if (isDrawerOpen) {
          void updateDynamicDrawer(sidebarInstance);
        }
      }
    });

    window.addEventListener('workflow:changed', () => {
      if (sidebarInstance && isDrawerOpen && currentDrawerMode === 'navigation') {
        void updateDynamicDrawer(sidebarInstance);
      }
    });

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
