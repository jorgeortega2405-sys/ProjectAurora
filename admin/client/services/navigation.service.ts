type NavigateFunction = (url: string, replace?: boolean) => void;

let activeNavigator: NavigateFunction | null = null;

export function setNavigationHandler(fn: NavigateFunction): void {
  activeNavigator = fn;
}

export function navigate(url: string, replace = false): void {
  if (activeNavigator) {
    activeNavigator(url, replace);
  } else {
    if (replace) {
      window.location.replace(url);
    } else {
      window.location.assign(url);
    }
  }
}
