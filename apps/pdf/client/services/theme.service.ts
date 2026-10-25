const STORAGE_KEY = 'aurora_theme';

export function getEffectiveTheme(): 'light' {
  return 'light';
}

export function getTheme(): string {
  return 'light';
}

function applyThemeToDom(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.classList.remove('dark-theme');
  document.documentElement.classList.add('light-theme');

  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { effective: 'light', setting: 'light' },
    })
  );
}

export async function setTheme(_newTheme: string, _syncBackend = false): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, 'light');
  } catch {}

  applyThemeToDom();
}

export function applyAccessibilityPreferences(prefs: { high_contrast?: boolean; reduce_motion?: boolean } = {}): void {
  if (typeof document === 'undefined') return;

  if (typeof prefs.high_contrast === 'boolean') {
    document.documentElement.setAttribute('data-contrast', prefs.high_contrast ? 'high' : 'normal');
    document.documentElement.classList.toggle('high-contrast', prefs.high_contrast);
  }

  if (typeof prefs.reduce_motion === 'boolean') {
    document.documentElement.setAttribute('data-reduce-motion', prefs.reduce_motion ? 'true' : 'false');
    document.documentElement.classList.toggle('reduce-motion', prefs.reduce_motion);
  }
}

export function initTheme(initialPrefs: { high_contrast?: boolean; reduce_motion?: boolean; theme?: string } | null = null): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'light');
  } catch {}
  applyThemeToDom();

  let highContrast = initialPrefs?.high_contrast;
  let reduceMotion = initialPrefs?.reduce_motion;
  try {
    if (highContrast === undefined) {
      const stored = localStorage.getItem('aurora_high_contrast');
      if (stored !== null) highContrast = stored === 'true';
    }
    if (reduceMotion === undefined) {
      const stored = localStorage.getItem('aurora_reduce_motion');
      if (stored !== null) reduceMotion = stored === 'true';
    }
  } catch {}

  applyAccessibilityPreferences({
    high_contrast: highContrast,
    reduce_motion: reduceMotion,
  });
}
