import { setupSheetDragToDismiss } from '../components/modal.component.js';
import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core';

export interface BannerManager {
  hideAll: () => void;
  hideError: () => void;
  hideSuccess: () => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export function setupPasswordToggle(
  toggleBtn: HTMLElement | null,
  passwordInput: HTMLInputElement | null,
  options: { hideTooltip?: string; showTooltip?: string } = {}
): void {
  if (!toggleBtn || !passwordInput) return;

  const showText = options.showTooltip || 'Mostrar contraseña';
  const hideText = options.hideTooltip || 'Ocultar contraseña';

  toggleBtn.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';

    const icon = toggleBtn.querySelector('.component-icon use, .material-symbols-rounded');
    if (icon) {
      if (icon.tagName.toLowerCase() === 'use') {
        icon.setAttribute('href', isPassword ? '/icons.svg#visibility_off' : '/icons.svg#visibility');
      } else {
        icon.textContent = isPassword ? 'visibility_off' : 'visibility';
      }
    }

    toggleBtn.setAttribute('data-tooltip', isPassword ? hideText : showText);
    passwordInput.focus();
  });
}

export function createBannerManager(
  container: HTMLElement,
  options: { errorRef?: string; successRef?: string } = {}
): BannerManager {
  const errorBanner = (options.errorRef
    ? container.querySelector(`[data-ref="${options.errorRef}"]`)
    : container.querySelector('.banner--danger, [data-ref*="error"]')) as HTMLElement | null;

  const successBanner = (options.successRef
    ? container.querySelector(`[data-ref="${options.successRef}"]`)
    : container.querySelector('.banner--success, [data-ref*="success"]')) as HTMLElement | null;

  const hideError = () => {
    if (errorBanner) {
      errorBanner.style.display = 'none';
      errorBanner.textContent = '';
    }
  };

  const hideSuccess = () => {
    if (successBanner) {
      successBanner.style.display = 'none';
      successBanner.textContent = '';
    }
  };

  const hideAll = () => {
    hideError();
    hideSuccess();
  };

  const showError = (msg: string) => {
    hideSuccess();
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.style.display = 'block';
    }
  };

  const showSuccess = (msg: string) => {
    hideError();
    if (successBanner) {
      successBanner.textContent = msg;
      successBanner.style.display = 'block';
    }
  };

  return {
    hideAll,
    hideError,
    hideSuccess,
    showError,
    showSuccess,
  };
}

export async function withButtonLoading(
  button: HTMLElement | HTMLButtonElement | null,
  loadingTextOrCallback: string | (() => Promise<void>),
  asyncCallback?: () => Promise<void>
): Promise<void> {
  let callback: () => Promise<void>;
  let loadingText: string | null = null;

  if (typeof loadingTextOrCallback === 'function') {
    callback = loadingTextOrCallback;
  } else {
    loadingText = loadingTextOrCallback;
    callback = asyncCallback || (async () => {});
  }

  if (!button) {
    await callback();
    return;
  }

  const originalHtml = button.innerHTML;
  if ('disabled' in button) {
    (button as HTMLButtonElement).disabled = true;
  }
  if (loadingText !== null) {
    button.textContent = loadingText;
  } else {
    button.classList.add('is-loading');
  }

  try {
    await callback();
  } finally {
    if ('disabled' in button) {
      (button as HTMLButtonElement).disabled = false;
    }
    if (loadingText !== null) {
      button.innerHTML = originalHtml;
    } else {
      button.classList.remove('is-loading');
    }
  }
}

export function bindSubmitOnEnter(
  inputs: (HTMLElement | null) | (HTMLElement | null)[] | NodeListOf<HTMLElement> | null,
  submitCallback: () => void
): void {
  if (!inputs) return;

  const rawList = Array.isArray(inputs)
    ? inputs
    : inputs instanceof NodeList
    ? Array.from(inputs)
    : [inputs];

  const list = rawList.filter(Boolean) as HTMLElement[];

  list.forEach((input) => {
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitCallback();
      }
    });
  });
}

export function bindNavigationLinks(
  container: HTMLElement,
  linksMap: Record<string, string>,
  onNavigate?: (path: string) => void
): void {
  for (const [ref, path] of Object.entries(linksMap)) {
    const el = container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    el?.addEventListener('click', (e) => {
      e.preventDefault();
      if (onNavigate) {
        onNavigate(path);
      } else {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    });
  }
}

const loadedStylesheets = new Set<string>();

export function loadStylesheet(href: string): Promise<void> {
  const cleanHref = href.split('?')[0];
  if (
    loadedStylesheets.has(href) ||
    document.querySelector(`link[href="${href}"]`)
  ) {
    loadedStylesheets.add(href);
    loadedStylesheets.add(cleanHref);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      loadedStylesheets.add(href);
      loadedStylesheets.add(cleanHref);
      resolve();
    };
    link.onerror = () => {
      reject(new Error(`Error al cargar hoja de estilo: ${href}`));
    };
    document.head.appendChild(link);
  });
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delayMs = 350): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delayMs);
  };
}

let activeDropdowns: Array<{ backdrop?: HTMLElement | null; close: () => void; menu?: HTMLElement | null; wrapper: HTMLElement }> = [];

function registerActiveDropdown(entry: { backdrop?: HTMLElement | null; close: () => void; menu?: HTMLElement | null; wrapper: HTMLElement }): void {
  activeDropdowns.forEach((d) => {
    if (d.wrapper !== entry.wrapper) d.close();
  });
  activeDropdowns = [entry];
}

function unregisterActiveDropdown(wrapper: HTMLElement | null): void {
  activeDropdowns = activeDropdowns.filter((d) => d.wrapper !== wrapper);
}

export function setupDropdown(
  wrapper: HTMLElement | null,
  options: {
    backdrop?: HTMLElement | null;
    isSelect?: boolean;
    matchWidth?: boolean;
    menu?: HTMLElement | null;
    offset?: [number, number];
    onClose?: () => void;
    onOpen?: () => void;
    onSelect?: (val: any, item?: HTMLElement) => boolean | Promise<boolean | void> | void;
    placement?: Placement;
    trigger?: HTMLElement | null;
  } = {}
): { close: () => void; destroy: () => void; open: () => void; toggle: () => void; update: () => void } {
  if (!wrapper) return { close: () => {}, destroy: () => {}, open: () => {}, toggle: () => {}, update: () => {} };

  const trigger =
    options.trigger ||
    (wrapper ? (Array.from(wrapper.children).find((c) =>
      c.classList.contains('dropdown-trigger') ||
      c.getAttribute('data-ref')?.includes('trigger') ||
      c.tagName === 'BUTTON' ||
      c.classList.contains('component-button')
    ) as HTMLElement) : null) ||
    wrapper.querySelector<HTMLElement>('.dropdown-trigger, [data-ref*="trigger"]');
  const backdrop =
    options.backdrop ||
    wrapper.querySelector<HTMLElement>(':scope > .dropdown-backdrop, :scope > [data-ref*="backdrop"]') ||
    wrapper.querySelector<HTMLElement>('.dropdown-backdrop, [data-ref*="backdrop"]');
  const menu =
    options.menu ||
    backdrop?.querySelector<HTMLElement>(':scope > .menu-panel--dropdown, :scope > [data-ref*="menu"]') ||
    backdrop?.querySelector<HTMLElement>('.menu-panel--dropdown, [data-ref*="menu"]') ||
    wrapper.querySelector<HTMLElement>('.menu-panel--dropdown, [data-ref*="menu"]');
  const dragZone =
    menu?.querySelector<HTMLElement>('.menu-panel__drag-zone, [data-ref*="drag-zone"]') ||
    wrapper.querySelector<HTMLElement>('.menu-panel__drag-zone, [data-ref*="drag-zone"]');
  const selectedTextEl = trigger?.querySelector<HTMLElement>('.dropdown-trigger__text, [data-ref*="selected-text"]') || null;
  const selectedIconEl = trigger?.querySelector<HTMLElement>('.dropdown-trigger__icon, [data-ref*="selected-icon"]') || null;
  const isSelect = typeof options.isSelect === 'boolean' ? options.isSelect : Boolean(selectedTextEl || options.onSelect);

  const hasExplicitWidthClass = Boolean(
    menu && Array.from(menu.classList).some((c) => c.startsWith('menu-panel--w-') && c !== 'menu-panel--w-full')
  );
  const isIconButton = Boolean(trigger?.classList.contains('component-button--icon-only'));
  const shouldMatchWidth = options.matchWidth !== undefined
    ? options.matchWidth
    : (!hasExplicitWidthClass && !isIconButton && (isSelect || Boolean(menu?.classList.contains('menu-panel--w-full'))));
  const defaultPlacement: Placement = isIconButton ? 'bottom-end' : 'bottom-start';

  let isClosing = false;
  let popperInstance: PopperInstance | null = null;
  let cleanupDrag: (() => void) | null = null;
  const teleportTarget = backdrop || menu;
  let originalParent: HTMLElement | null = null;
  let originalNextSibling: Node | null = null;

  const teleportToBody = () => {
    if (window.innerWidth <= 768 && teleportTarget && teleportTarget.parentElement && teleportTarget.parentElement !== document.body) {
      originalParent = teleportTarget.parentElement;
      originalNextSibling = teleportTarget.nextSibling;
      document.body.appendChild(teleportTarget);
    }
  };

  const returnFromTeleport = () => {
    if (teleportTarget && originalParent && teleportTarget.parentElement === document.body) {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(teleportTarget, originalNextSibling);
      } else {
        originalParent.appendChild(teleportTarget);
      }
      originalParent = null;
      originalNextSibling = null;
    }
  };

  const destroyPopper = () => {
    if (popperInstance) {
      popperInstance.destroy();
      popperInstance = null;
      if (menu) {
        menu.style.width = '';
        menu.style.minWidth = '';
      }
    }
  };

  const createPopperInstance = () => {
    if (window.innerWidth > 768 && trigger && menu) {
      destroyPopper();
      if (!shouldMatchWidth) {
        menu.style.width = '';
        menu.style.minWidth = '';
      }
      popperInstance = createPopper(trigger, menu, {
        modifiers: [
          {
            name: 'offset',
            options: {
              offset: options.offset || [0, 6],
            },
          },
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['top-start', 'bottom-end', 'top-end', 'bottom-start'],
              padding: 8,
            },
          },
          {
            name: 'preventOverflow',
            options: {
              boundary: 'viewport',
              padding: 8,
            },
          },
          {
            effect: ({ state }: any) => {
              if (shouldMatchWidth) {
                const w = `${state.elements.reference.offsetWidth}px`;
                state.elements.popper.style.width = w;
                state.elements.popper.style.minWidth = w;
              }
            },
            enabled: shouldMatchWidth,
            fn: ({ state }: any) => {
              if (shouldMatchWidth) {
                const w = `${state.rects.reference.width}px`;
                state.styles.popper.width = w;
                state.styles.popper.minWidth = w;
              }
            },
            name: 'sameWidth',
            phase: 'beforeWrite',
            requires: ['computeStyles'],
          },
        ],
        placement: options.placement || defaultPlacement,
        strategy: 'fixed',
      });
      popperInstance.update();
    }
  };

  const openDropdown = () => {
    if (isClosing) return;

    registerActiveDropdown({
      backdrop,
      close: closeDropdown,
      menu,
      wrapper,
    });

    if (window.innerWidth <= 768 && backdrop && menu) {
      teleportToBody();
      destroyPopper();
      backdrop.style.display = 'flex';
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'auto';
      menu.style.transform = 'translateY(100%)';
      menu.style.transition = 'none';
      backdrop.style.transition = 'none';

      void menu.offsetHeight;

      backdrop.classList.add('is-open');
      menu.classList.add('is-open');
      trigger?.classList.add('is-open');
      wrapper?.classList.add('is-open');

      requestAnimationFrame(() => {
        backdrop.style.transition = 'opacity 0.25s ease';
        menu.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        backdrop.style.opacity = '1';
        menu.style.transform = 'translateY(0)';
      });

      cleanupDrag?.();
      if (dragZone) {
        cleanupDrag = setupSheetDragToDismiss(dragZone, menu, backdrop, () => {
          closeDropdown();
        });
      }
    } else {
      backdrop?.classList.add('is-open');
      menu?.classList.add('is-open');
      trigger?.classList.add('is-open');
      wrapper?.classList.add('is-open');
      createPopperInstance();
    }

    const searchInput = menu?.querySelector<HTMLInputElement>('.menu-panel__search-input, [data-ref*="search"]');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 60);
    }

    if (typeof options.onOpen === 'function') {
      options.onOpen();
    }
  };

  const closeDropdown = () => {
    if (isClosing || !menu?.classList.contains('is-open')) return;

    cleanupDrag?.();
    cleanupDrag = null;
    unregisterActiveDropdown(wrapper);
    destroyPopper();

    if (window.innerWidth <= 768 && backdrop && menu) {
      isClosing = true;
      backdrop.style.pointerEvents = 'none';
      backdrop.style.transition = 'opacity 0.2s ease';
      menu.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
      backdrop.style.opacity = '0';
      menu.style.transform = 'translateY(100%)';

      setTimeout(() => {
        backdrop.classList.remove('is-open');
        menu.classList.remove('is-open');
        trigger?.classList.remove('is-open');
        wrapper?.classList.remove('is-open');
        backdrop.style.display = '';
        backdrop.style.opacity = '';
        backdrop.style.transition = '';
        backdrop.style.pointerEvents = '';
        menu.style.transform = '';
        menu.style.transition = '';
        returnFromTeleport();
        isClosing = false;
        if (typeof options.onClose === 'function') {
          options.onClose();
        }
      }, 200);
    } else {
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open');
      trigger?.classList.remove('is-open');
      wrapper?.classList.remove('is-open');
      if (backdrop) {
        backdrop.style.display = '';
        backdrop.style.opacity = '';
        backdrop.style.transition = '';
      }
      if (menu) {
        menu.style.transform = '';
        menu.style.transition = '';
        if (!shouldMatchWidth) {
          menu.style.width = '';
        }
      }
      returnFromTeleport();
      if (typeof options.onClose === 'function') {
        options.onClose();
      }
    }
  };

  const toggleDropdown = () => {
    if (menu?.classList.contains('is-open') && !isClosing) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const onTriggerClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (trigger?.hasAttribute('disabled') || trigger?.classList.contains('is-disabled')) {
      return;
    }
    toggleDropdown();
  };
  trigger?.addEventListener('click', onTriggerClick);

  const onBackdropClick = (e: MouseEvent) => {
    if (!menu?.contains(e.target as Node)) {
      closeDropdown();
    }
  };
  backdrop?.addEventListener('click', onBackdropClick);

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (
      !wrapper.contains(target) &&
      (!backdrop || !backdrop.contains(target)) &&
      (!menu || !menu.contains(target))
    ) {
      closeDropdown();
    }
  };
  document.addEventListener('click', onDocClick);

  const onDocKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu?.classList.contains('is-open')) {
      closeDropdown();
    }
  };
  document.addEventListener('keydown', onDocKeydown);

  const onMenuClick = async (e: MouseEvent) => {
    const activeMenu = menu;
    if (!activeMenu) return;
    const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('.menu-item, [data-ref*="option"]');
    if (!item || !activeMenu.contains(item)) return;

    const closestMenu = item.closest<HTMLElement>('.menu-panel--dropdown, .menu-panel, [data-ref*="menu"]');
    if (closestMenu !== activeMenu) return;

    const val =
      item.getAttribute('data-theme-value') ||
      item.getAttribute('data-value') ||
      item.getAttribute('data-lang') ||
      item.getAttribute('data-theme') ||
      item.querySelector('.menu-item__text')?.textContent?.trim() ||
      '';

    if (!isSelect) {
      if (typeof options.onSelect === 'function') {
        await options.onSelect(val, item);
      }
      closeDropdown();
      return;
    }

    if (typeof options.onSelect === 'function') {
      const proceed = await options.onSelect(val, item);
      if (proceed === false) return;
    }

    activeMenu.querySelectorAll<HTMLElement>('.menu-item, [data-ref*="option"]').forEach((i) => {
      if (i.closest<HTMLElement>('.menu-panel--dropdown, .menu-panel, [data-ref*="menu"]') === activeMenu) {
        i.classList.remove('is-active');
      }
    });
    item.classList.add('is-active');

    const itemText = item.querySelector('.menu-item__text')?.textContent?.trim() || '';
    const itemIconEl = item.querySelector<HTMLElement>('.menu-item__icon');
    const itemIconUse = itemIconEl?.querySelector('use');
    const itemIconHref = itemIconUse?.getAttribute('href') || itemIconUse?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    const itemIconText = itemIconEl?.textContent?.trim() || '';

    if (selectedTextEl && itemText) {
      selectedTextEl.textContent = itemText;
    }
    if (selectedIconEl) {
      if (itemIconHref) {
        const selectedUse = selectedIconEl.querySelector('use');
        if (selectedUse) {
          selectedUse.setAttribute('href', itemIconHref);
          selectedUse.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', itemIconHref);
        } else if (selectedIconEl.tagName.toLowerCase() === 'svg') {
          selectedIconEl.innerHTML = `<use href="${itemIconHref}" xlink:href="${itemIconHref}"></use>`;
        }
      } else if (itemIconText) {
        const selectedUse = selectedIconEl.querySelector('use');
        if (selectedUse) {
          selectedUse.setAttribute('href', `/icons.svg#${itemIconText}`);
          selectedUse.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `/icons.svg#${itemIconText}`);
        } else if (selectedIconEl.tagName.toLowerCase() === 'svg') {
          selectedIconEl.innerHTML = `<use href="/icons.svg#${itemIconText}" xlink:href="/icons.svg#${itemIconText}"></use>`;
        } else {
          selectedIconEl.textContent = itemIconText;
        }
      }
    }

    closeDropdown();
  };
  menu?.addEventListener('click', onMenuClick);

  const onResize = () => {
    if (menu?.classList.contains('is-open')) {
      if (window.innerWidth <= 768) {
        destroyPopper();
      } else {
        if (backdrop) {
          backdrop.style.display = '';
          backdrop.style.opacity = '';
          backdrop.style.transition = '';
          backdrop.style.pointerEvents = '';
        }
        if (menu) {
          menu.style.transform = '';
          menu.style.transition = '';
        }
        if (!popperInstance) {
          createPopperInstance();
        } else {
          popperInstance.update();
        }
      }
    }
  };
  window.addEventListener('resize', onResize, { passive: true });

  const destroy = () => {
    cleanupDrag?.();
    cleanupDrag = null;
    returnFromTeleport();
    unregisterActiveDropdown(wrapper);
    trigger?.removeEventListener('click', onTriggerClick);
    backdrop?.removeEventListener('click', onBackdropClick);
    menu?.removeEventListener('click', onMenuClick);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeydown);
    window.removeEventListener('resize', onResize);
    destroyPopper();
  };

  return {
    close: closeDropdown,
    destroy,
    open: openDropdown,
    toggle: toggleDropdown,
    update: () => {
      popperInstance?.update();
    },
  };
}

export interface ToolSidebarModalController {
  close: () => void;
  destroy: () => void;
  open: () => void;
}

export function setupToolSidebarModal(options: {
  backdrop: HTMLElement | null;
  closeBtn?: HTMLElement | null;
  dragZone?: HTMLElement | null;
  settingsBtn?: HTMLElement | null;
  sidebar: HTMLElement | null;
  signal?: AbortSignal;
}): ToolSidebarModalController {
  const { backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal } = options;
  if (!sidebar) {
    return {
      close: () => {},
      destroy: () => {},
      open: () => {},
    };
  }

  const resolvedCloseBtn = closeBtn || sidebar.querySelector<HTMLElement>('[data-ref*="close"]') || undefined;
  const resolvedDragZone = dragZone || sidebar.querySelector<HTMLElement>('[data-ref*="drag-zone"]') || undefined;

  let isDragging = false;
  let activePointerId: number | null = null;
  let startY = 0;
  let currentY = 0;

  const open = () => {
    sidebar.classList.add('is-mobile-open');
    if (backdrop) backdrop.classList.add('is-visible');
    document.body.classList.add('modal-open');
  };

  const close = () => {
    sidebar.classList.remove('is-mobile-open');
    sidebar.style.transform = '';
    sidebar.style.transition = '';
    if (backdrop) backdrop.classList.remove('is-visible');
    document.body.classList.remove('modal-open');
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (backdrop && e.target === backdrop) {
      close();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && sidebar.classList.contains('is-mobile-open')) {
      e.preventDefault();
      close();
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = e.clientY;
    try {
      (resolvedDragZone || sidebar)?.setPointerCapture(activePointerId);
    } catch (_) {}
    sidebar.style.transition = 'none';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    currentY = e.clientY;
    const diff = currentY - startY;
    if (diff > 0) {
      sidebar.style.transform = `translateY(${diff}px)`;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    isDragging = false;
    try {
      if (activePointerId !== null) {
        (resolvedDragZone || sidebar)?.releasePointerCapture(activePointerId);
      }
    } catch (_) {}
    const diff = currentY - startY;
    if (diff > 120) {
      close();
    } else {
      sidebar.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      sidebar.style.transform = '';
    }
  };

  settingsBtn?.addEventListener('click', open, { signal });
  resolvedCloseBtn?.addEventListener('click', close, { signal });
  backdrop?.addEventListener('click', handleBackdropClick, { signal });
  document.addEventListener('keydown', handleKeyDown, { signal });

  resolvedDragZone?.addEventListener('pointerdown', onPointerDown, { signal });
  resolvedDragZone?.addEventListener('pointermove', onPointerMove, { signal });
  resolvedDragZone?.addEventListener('pointerup', onPointerUp, { signal });
  resolvedDragZone?.addEventListener('pointercancel', onPointerUp, { signal });

  return {
    close,
    destroy: () => {
      close();
      document.removeEventListener('keydown', handleKeyDown);
    },
    open,
  };
}

export function bindFileDropzone(options: {
  dropTarget: HTMLElement | null;
  visualTarget?: HTMLElement | null;
  onFiles: (files: FileList) => void;
  signal?: AbortSignal;
}): void {
  const { dropTarget, visualTarget, onFiles, signal } = options;
  if (!dropTarget) return;
  const visual = visualTarget || dropTarget.closest<HTMLElement>('.tool-workspace__canvas') || dropTarget;

  let dragCounter = 0;

  const addActive = () => {
    visual.classList.add('is-dragover');
    visual.classList.add('tool-dropzone--active');
  };

  const removeActive = () => {
    dragCounter = 0;
    visual.classList.remove('is-dragover');
    visual.classList.remove('tool-dropzone--active');
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      addActive();
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter--;

    const rect = dropTarget.getBoundingClientRect();
    const isOutside =
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom;

    const hasCoords = typeof e.clientX === 'number' && (e.clientX !== 0 || e.clientY !== 0);
    if (hasCoords && !isOutside) {
      return;
    }

    if (dragCounter <= 0 || isOutside || !hasCoords) {
      removeActive();
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    removeActive();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      onFiles(files);
    }
  };

  dropTarget.addEventListener('dragenter', handleDragEnter, { signal });
  dropTarget.addEventListener('dragover', handleDragOver, { signal });
  dropTarget.addEventListener('dragleave', handleDragLeave, { signal });
  dropTarget.addEventListener('drop', handleDrop, { signal });

  window.addEventListener('drop', () => {
    removeActive();
  }, { signal });

  window.addEventListener('dragend', () => {
    removeActive();
  }, { signal });
}
