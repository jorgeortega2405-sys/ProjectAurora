const STORAGE_KEY = 'aurora_admin_theme';

export function getTheme(): 'light' | 'dark' {
  if (typeof localStorage === 'undefined') return 'light';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }
  return 'light';
}

export function setTheme(newTheme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(STORAGE_KEY, newTheme);
  } catch {}

  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', newTheme);
  if (newTheme === 'dark') {
    document.documentElement.classList.remove('light-theme');
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
    document.documentElement.classList.add('light-theme');
  }

  window.dispatchEvent(
    new CustomEvent('themechange', {
      detail: { theme: newTheme },
    })
  );
}

export function toggleTheme(): void {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function initTheme(): void {
  setTheme(getTheme());
}
