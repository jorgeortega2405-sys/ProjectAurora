export type NavigationHandler = (url: string, replace?: boolean) => void;
export type LanguageSwitchHandler = (newLang: string) => Promise<void>;

let currentNavigationHandler: NavigationHandler = (url: string) => {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

let currentLanguageSwitchHandler: LanguageSwitchHandler | null = null;

export function setNavigationHandler(handler: NavigationHandler): void {
  currentNavigationHandler = handler;
}

export function setLanguageSwitchHandler(handler: LanguageSwitchHandler): void {
  currentLanguageSwitchHandler = handler;
}

export function navigate(url: string, replace = false): void {
  currentNavigationHandler(url, replace);
}

export async function switchLanguage(newLang: string): Promise<void> {
  if (currentLanguageSwitchHandler) {
    await currentLanguageSwitchHandler(newLang);
  }
}
