export type NavigationHandler = (url: string, replace?: boolean) => void;

let currentNavigationHandler: NavigationHandler = (url: string) => {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export function setNavigationHandler(handler: NavigationHandler): void {
  currentNavigationHandler = handler;
}

export function navigate(url: string, replace = false): void {
  currentNavigationHandler(url, replace);
}
