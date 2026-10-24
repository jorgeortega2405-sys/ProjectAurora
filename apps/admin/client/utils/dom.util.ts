import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const loadedStylesheets = new Set<string>();

export function loadStylesheet(href: string): Promise<void> {
  if (loadedStylesheets.has(href)) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  if (existing) {
    loadedStylesheets.add(href);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      loadedStylesheets.add(href);
      resolve();
    };
    link.onerror = () => {
      reject(new Error(`Error al cargar hoja de estilo: ${href}`));
    };
    document.head.appendChild(link);
  });
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export async function withButtonLoading<T>(button: HTMLElement | null, action: () => Promise<T>): Promise<T> {
  if (!button) {
    return await action();
  }

  const originalDisabled = button.hasAttribute('disabled');
  button.setAttribute('disabled', 'true');
  button.classList.add('is-loading');

  try {
    return await action();
  } finally {
    if (!originalDisabled) {
      button.removeAttribute('disabled');
    }
    button.classList.remove('is-loading');
  }
}

export interface SetupDropdownOptions {
  backdrop?: HTMLElement | null;
  isSelect?: boolean;
  matchWidth?: boolean;
  menu?: HTMLElement | null;
  offset?: [number, number];
  onClose?: () => void;
  onOpen?: () => void;
  onSelect?: (val: string, item?: HTMLElement) => boolean | Promise<boolean | void> | void;
  placement?: Placement;
  trigger?: HTMLElement | null;
}

export interface DropdownController {
  close: () => void;
  destroy: () => void;
  open: () => void;
  toggle: () => void;
  update: () => void;
}

export function setupDropdown(wrapper: HTMLElement | null, options: SetupDropdownOptions = {}): DropdownController {
  if (!wrapper) {
    return { close: () => {}, destroy: () => {}, open: () => {}, toggle: () => {}, update: () => {} };
  }

  const trigger =
    options.trigger ||
    (Array.from(wrapper.children).find((c) =>
      c.classList.contains('dropdown-trigger') ||
      c.getAttribute('data-ref')?.includes('trigger') ||
      c.tagName === 'BUTTON'
    ) as HTMLElement) ||
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

  const selectedTextEl = trigger?.querySelector<HTMLElement>('.dropdown-trigger__text, [data-ref*="selected-text"]') || null;
  const isSelect = typeof options.isSelect === 'boolean' ? options.isSelect : Boolean(selectedTextEl || options.onSelect);

  let popperInstance: PopperInstance | null = null;

  const destroyPopper = () => {
    if (popperInstance) {
      popperInstance.destroy();
      popperInstance = null;
    }
  };

  const createPopperInstance = () => {
    if (trigger && menu) {
      destroyPopper();
      popperInstance = createPopper(trigger, menu, {
        modifiers: [
          {
            name: 'offset',
            options: { offset: options.offset || [0, 6] },
          },
          {
            name: 'preventOverflow',
            options: { boundary: 'viewport', padding: 8 },
          },
          {
            effect: ({ state }: any) => {
              if (options.matchWidth !== false) {
                const w = `${state.elements.reference.offsetWidth}px`;
                state.elements.popper.style.width = w;
                state.elements.popper.style.minWidth = w;
              }
            },
            enabled: options.matchWidth !== false,
            fn: ({ state }: any) => {
              if (options.matchWidth !== false) {
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
        placement: options.placement || 'bottom-start',
        strategy: 'fixed',
      });
      popperInstance.update();
    }
  };

  const open = () => {
    backdrop?.classList.add('is-open');
    menu?.classList.add('is-open');
    trigger?.classList.add('is-open');
    wrapper.classList.add('is-open');
    createPopperInstance();
    if (typeof options.onOpen === 'function') {
      options.onOpen();
    }
  };

  const close = () => {
    backdrop?.classList.remove('is-open');
    menu?.classList.remove('is-open');
    trigger?.classList.remove('is-open');
    wrapper.classList.remove('is-open');
    destroyPopper();
    if (typeof options.onClose === 'function') {
      options.onClose();
    }
  };

  const toggle = () => {
    if (menu?.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  };

  const onTriggerClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (trigger?.hasAttribute('disabled') || trigger?.classList.contains('is-disabled')) {
      return;
    }
    toggle();
  };
  trigger?.addEventListener('click', onTriggerClick);

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!wrapper.contains(target) && (!backdrop || !backdrop.contains(target)) && (!menu || !menu.contains(target))) {
      close();
    }
  };
  document.addEventListener('click', onDocClick);

  const onDocKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu?.classList.contains('is-open')) {
      close();
    }
  };
  document.addEventListener('keydown', onDocKeydown);

  const onMenuClick = async (e: MouseEvent) => {
    if (!menu) return;
    const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('.menu-item, [data-ref*="opt-"], [data-ref*="option"]');
    if (!item || !menu.contains(item)) return;

    const val = item.getAttribute('data-value') || item.querySelector('.menu-item__text')?.textContent?.trim() || '';

    if (!isSelect) {
      if (typeof options.onSelect === 'function') {
        await options.onSelect(val, item);
      }
      close();
      return;
    }

    if (typeof options.onSelect === 'function') {
      const proceed = await options.onSelect(val, item);
      if (proceed === false) return;
    }

    menu.querySelectorAll<HTMLElement>('.menu-item, [data-ref*="opt-"]').forEach((i) => {
      i.classList.remove('is-active');
    });
    item.classList.add('is-active');

    const itemText = item.querySelector('.menu-item__text')?.textContent?.trim();
    if (selectedTextEl && itemText) {
      selectedTextEl.textContent = itemText;
    }

    close();
  };
  menu?.addEventListener('click', onMenuClick);

  const destroy = () => {
    trigger?.removeEventListener('click', onTriggerClick);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeydown);
    menu?.removeEventListener('click', onMenuClick);
    destroyPopper();
  };

  return { close, destroy, open, toggle, update: () => popperInstance?.update() };
}
