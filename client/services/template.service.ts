import { translateElement } from './i18n.service.js';
import { renderIcons } from './icon.service.js';

const templateCache = new Map<string, string>();
const templatePending = new Map<string, Promise<string>>();

export function preloadTemplates(urls: string[]): void {
  for (const url of urls) {
    if (!templateCache.has(url) && !templatePending.has(url)) {
      const pending = fetch(url)
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (text) {
            templateCache.set(url, text);
          }
          templatePending.delete(url);
          return text;
        })
        .catch(() => {
          templatePending.delete(url);
          return '';
        });
      templatePending.set(url, pending);
    }
  }
}

export async function loadTemplate(url: string): Promise<HTMLElement> {
  let html = templateCache.get(url);
  if (!html) {
    let pending = templatePending.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Error al cargar la plantilla: ${url} (${res.status})`);
          }
          return res.text();
        })
        .then((text) => {
          templateCache.set(url, text);
          templatePending.delete(url);
          return text;
        })
        .catch((err) => {
          templatePending.delete(url);
          throw err;
        });
      templatePending.set(url, pending);
    }
    html = await pending;
  }

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild as HTMLElement | null;
  if (!element) {
    throw new Error(`Plantilla vacía o inválida: ${url}`);
  }

  const clone = document.importNode(element, true) as HTMLElement;
  renderIcons(clone);
  return translateElement(clone);
}
