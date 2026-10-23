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
