import { getLocalizedPath } from '../config/seo.config.js';
import { escapeHtml } from '../services/api.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { switchLanguage } from '../services/navigation.service.js';
import { showToast } from '../services/toast.service.js';
import { setupDropdown } from '../utils/dom.util.js';
import { AVAILABLE_LANGUAGES, getLanguageName } from '../utils/languages.util.js';

export function getFooterHtml(): string {
  const currentLang = getCurrentLanguage();
  const currentLangName = getLanguageName(currentLang);

  return `
    <footer class="home-feature-section" data-ref="footer-section">
      <div class="site-footer" data-ref="site-footer">
        <div class="site-footer__grid" data-ref="site-footer-grid">
          <div class="footer-col" data-ref="footer-col-producto">
            <h4 class="footer-col__title" data-ref="footer-title-producto">Producto</h4>
            <ul class="footer-col__list" data-ref="footer-list-producto">
              <li class="footer-col__item" data-ref="footer-item-inicio">
                <a class="footer-col__link" data-ref="footer-link-inicio" href="${getLocalizedPath('home', currentLang)}">Inicio</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-herramientas">
                <a class="footer-col__link" data-ref="footer-link-herramientas" href="${getLocalizedPath('help-documentation', currentLang)}">Herramientas</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-faq">
                <a class="footer-col__link" data-ref="footer-link-faq" href="${getLocalizedPath('help-faq', currentLang)}">Preguntas frecuentes</a>
              </li>
            </ul>
          </div>

          <div class="footer-col" data-ref="footer-col-legal">
            <h4 class="footer-col__title" data-ref="footer-title-legal">Legal</h4>
            <ul class="footer-col__list" data-ref="footer-list-legal">
              <li class="footer-col__item" data-ref="footer-item-seguridad">
                <a class="footer-col__link" data-ref="footer-link-seguridad" href="${getLocalizedPath('help-security', currentLang)}">Seguridad</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-privacidad">
                <a class="footer-col__link" data-ref="footer-link-privacidad" href="${getLocalizedPath('help-privacy', currentLang)}">Política de Privacidad</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-terminos">
                <a class="footer-col__link" data-ref="footer-link-terminos" href="${getLocalizedPath('help-terms', currentLang)}">Términos y Condiciones</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-cookies">
                <a class="footer-col__link" data-ref="footer-link-cookies" href="${getLocalizedPath('help-cookies', currentLang)}">Cookies</a>
              </li>
            </ul>
          </div>

          <div class="footer-col" data-ref="footer-col-empresa">
            <h4 class="footer-col__title" data-ref="footer-title-empresa">Empresa</h4>
            <ul class="footer-col__list" data-ref="footer-list-empresa">
              <li class="footer-col__item" data-ref="footer-item-nosotros">
                <a class="footer-col__link" data-ref="footer-link-nosotros" href="${getLocalizedPath('about', currentLang)}">Sobre nosotros</a>
              </li>
              <li class="footer-col__item" data-ref="footer-item-contacto">
                <a class="footer-col__link" data-ref="footer-link-contacto" href="${getLocalizedPath('contact', currentLang)}">Contacto</a>
              </li>
            </ul>
          </div>
        </div>

        <div class="site-footer__bottom" data-ref="site-footer-bottom">
          <div class="site-footer__bottom-left" data-ref="footer-bottom-left">
            <div class="settings-dropdown-wrapper" data-ref="dropdown-wrapper-footer-language">
              <button type="button" class="dropdown-trigger" data-ref="btn-trigger-footer-language" aria-label="Seleccionar idioma">
                <div class="dropdown-trigger__left" data-ref="dropdown-trigger-left-footer-language">
                  <svg class="component-icon dropdown-trigger__icon" data-ref="icon-footer-language" aria-hidden="true"><use href="/icons.svg#language"></use></svg>
                  <span class="dropdown-trigger__text" data-ref="footer-language-selected-text">${escapeHtml(currentLangName)}</span>
                </div>
                <svg class="component-icon dropdown-trigger__chevron" data-ref="icon-footer-chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
              </button>

              <div class="dropdown-backdrop" data-ref="dropdown-backdrop-footer-language">
                <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-footer-language">
                  <div class="menu-panel__drag-zone" data-ref="drag-zone-footer-language" aria-hidden="true">
                    <div class="menu-panel__drag-handle" data-ref="drag-handle-footer-language"></div>
                  </div>
                  <div class="menu-panel__search" data-ref="search-wrapper-footer-language">
                    <svg class="component-icon menu-panel__search-icon" data-ref="search-icon-footer-language" aria-hidden="true"><use href="/icons.svg#search"></use></svg>
                    <input class="menu-panel__search-input" data-ref="input-search-footer-language" type="text" placeholder="Buscar idioma..." maxlength="50" autocomplete="off" />
                  </div>
                  <div class="menu-panel__list menu-panel__list--scrollable" data-ref="list-footer-languages"></div>
                  <div class="menu-panel__empty" data-ref="empty-footer-languages" style="display: none;">No se encontraron idiomas</div>
                </div>
              </div>
            </div>
          </div>

          <div class="site-footer__bottom-right" data-ref="footer-bottom-right">
            <div class="footer-socials" data-ref="footer-socials">
              <a class="footer-social-link" data-ref="footer-social-x" href="javascript:void(0)" aria-label="X (Twitter)">
                <svg class="footer-social-icon" data-ref="icon-social-x" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a class="footer-social-link" data-ref="footer-social-facebook" href="javascript:void(0)" aria-label="Facebook">
                <svg class="footer-social-icon" data-ref="icon-social-facebook" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a class="footer-social-link" data-ref="footer-social-linkedin" href="javascript:void(0)" aria-label="LinkedIn">
                <svg class="footer-social-icon" data-ref="icon-social-linkedin" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
              </a>
              <a class="footer-social-link" data-ref="footer-social-instagram" href="javascript:void(0)" aria-label="Instagram">
                <svg class="footer-social-icon" data-ref="icon-social-instagram" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a class="footer-social-link" data-ref="footer-social-tiktok" href="javascript:void(0)" aria-label="TikTok">
                <svg class="footer-social-icon" data-ref="icon-social-tiktok" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
              </a>
              <a class="footer-social-link" data-ref="footer-social-reddit" href="javascript:void(0)" aria-label="Reddit">
                <svg class="footer-social-icon" data-ref="icon-social-reddit" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm7.714 12.355c-.004.288-.04.576-.11.859-1.008 4.093-5.068 6.786-9.604 6.786-4.538 0-8.598-2.693-9.605-6.786-.07-.283-.106-.571-.11-.859-.448-.444-.725-1.055-.725-1.73 0-1.344 1.09-2.435 2.435-2.435.632 0 1.209.242 1.643.64 1.583-1.076 3.687-1.77 5.992-1.848l1.018-4.787 3.328.708c.18-.553.702-.954 1.32-.954.767 0 1.389.622 1.389 1.389s-.622 1.389-1.389 1.389c-.766 0-1.388-.622-1.388-1.389l-2.733-.582-.832 3.916c2.327.071 4.453.766 6.049 1.854.436-.403 1.017-.65 1.656-.65 1.344 0 2.435 1.091 2.435 2.435 0 .675-.277 1.286-.725 1.73zm-11.464.395c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm7.5 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm-3.75 3.75c-1.394 0-2.585.669-3.086 1.637-.107.208-.026.463.182.57.207.108.463.027.57-.181.383-.739 1.353-1.276 2.334-1.276s1.951.537 2.334 1.276c.08.155.239.245.402.245.056 0 .114-.011.168-.035.208-.107.289-.362.182-.57-.501-.968-1.692-1.637-3.086-1.637z"/>
                </svg>
              </a>
            </div>
            <span class="site-footer__copyright" data-ref="footer-copyright">© Aurora 2026 ® - Tu editor de PDF</span>
          </div>
        </div>
      </div>
    </footer>
  `;
}

export function mountSiteFooter(container: HTMLElement, signal?: AbortSignal): { destroy: () => void } {
  const langDropdown = container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-footer-language"]');
  const langSelectedText = container.querySelector<HTMLElement>('[data-ref="footer-language-selected-text"]');
  const langListEl = container.querySelector<HTMLElement>('[data-ref="list-footer-languages"]');
  const langSearchInput = container.querySelector<HTMLInputElement>('[data-ref="input-search-footer-language"]');
  const langEmptyEl = container.querySelector<HTMLElement>('[data-ref="empty-footer-languages"]');

  const renderLanguagesList = (currentLang: string) => {
    if (!langListEl) return;
    langListEl.innerHTML = AVAILABLE_LANGUAGES.map((l) => {
      const isActive = l.code.toLowerCase() === (currentLang || '').toLowerCase();
      return `<button type="button" class="menu-item${isActive ? ' is-active' : ''}" data-ref="option-footer-lang-${l.code}" data-lang="${l.code}">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#language"></use></svg>
        <span class="menu-item__text">${escapeHtml(l.name)}</span>
      </button>`;
    }).join('');
  };

  const filterLanguages = (query: string) => {
    if (!langListEl) return;
    const cleanQuery = query.toLowerCase().trim();
    let matchesCount = 0;
    const items = langListEl.querySelectorAll<HTMLElement>('.menu-item');
    items.forEach((item) => {
      const name = item.querySelector('.menu-item__text')?.textContent?.toLowerCase() || '';
      const code = (item.getAttribute('data-lang') || '').toLowerCase();
      const match = !cleanQuery || name.includes(cleanQuery) || code.includes(cleanQuery);
      item.style.display = match ? 'flex' : 'none';
      if (match) matchesCount++;
    });
    if (langEmptyEl) {
      langEmptyEl.style.display = matchesCount === 0 ? 'block' : 'none';
    }
  };

  let dropdownCtrl: { close: () => void; destroy: () => void; update: () => void } | null = null;

  if (langSearchInput) {
    langSearchInput.addEventListener(
      'input',
      (e: Event) => {
        filterLanguages((e.target as HTMLInputElement).value);
        dropdownCtrl?.update();
      },
      { signal }
    );
  }

  if (langDropdown) {
    let currentLang = getCurrentLanguage();
    dropdownCtrl = setupDropdown(langDropdown, {
      backdrop: langDropdown.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-footer-language"]'),
      isSelect: true,
      matchWidth: true,
      menu: langDropdown.querySelector<HTMLElement>('[data-ref="dropdown-menu-footer-language"]'),
      offset: [0, 8],
      onOpen: () => {
        currentLang = getCurrentLanguage();
        renderLanguagesList(currentLang);
        if (langListEl) {
          renderIcons(langListEl);
        }
        if (langSearchInput) {
          langSearchInput.value = '';
          filterLanguages('');
          setTimeout(() => langSearchInput.focus(), 60);
        }
      },
      placement: 'top-start',
      onClose: () => {
        if (langSearchInput) {
          langSearchInput.value = '';
          filterLanguages('');
        }
      },
      onSelect: async (lang: string) => {
        if (langSelectedText) {
          langSelectedText.textContent = getLanguageName(lang);
        }
        showToast(t('toasts.language_updated', 'Idioma actualizado'), 'success');
        await switchLanguage(lang);
      },
    });
  }

  renderIcons(container);

  return {
    destroy: () => {
      dropdownCtrl?.destroy();
    },
  };
}
