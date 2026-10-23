import { render, switchLanguage } from '../../app-router.js';
import { escapeHtml } from '../../services/api.service.js';
import { getCurrentLanguage, setLanguage, t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { applyAccessibilityPreferences } from '../../services/theme.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { setupDropdown } from '../../utils/dom.util.js';
import { AVAILABLE_LANGUAGES, detectBrowserLanguage, getLanguageName } from '../../utils/languages.util.js';

export class GuestSettingsController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private dropdownControllers: Array<{ destroy: () => void }> = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    translateElement(this.container);

    const langDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-guest-language"]');
    const langSelectedText = this.container.querySelector<HTMLElement>('[data-ref="guest-language-selected-text"]');
    const langListEl = this.container.querySelector<HTMLElement>('[data-ref="list-guest-languages"]');
    const langSearchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-guest-language"]');
    const langEmptyEl = this.container.querySelector<HTMLElement>('[data-ref="empty-guest-languages"]');

    const renderLanguagesList = (currentLang: string) => {
      if (!langListEl) return;
      langListEl.innerHTML = AVAILABLE_LANGUAGES.map((l) => {
        const isActive = l.code.toLowerCase() === (currentLang || '').toLowerCase();
        return `<button type="button" class="menu-item${isActive ? ' is-active' : ''}" data-ref="option-guest-lang-${l.code}" data-lang="${l.code}">
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

    let guestLangDropdownCtrl: { close: () => void; destroy: () => void; update: () => void } | null = null;

    langSearchInput?.addEventListener('input', (e: Event) => {
      filterLanguages((e.target as HTMLInputElement).value);
      guestLangDropdownCtrl?.update();
    }, { signal });

    let guestLanguage = getCurrentLanguage() || detectBrowserLanguage();
    renderLanguagesList(guestLanguage);
    if (langSelectedText) {
      langSelectedText.textContent = getLanguageName(guestLanguage);
    }

    if (langDropdown) {
      guestLangDropdownCtrl = setupDropdown(langDropdown, {
        onClose: () => {
          if (langSearchInput) {
            langSearchInput.value = '';
            filterLanguages('');
          }
        },
        onSelect: async (lang: string) => {
          guestLanguage = lang;
          if (langSelectedText) {
            langSelectedText.textContent = getLanguageName(lang);
          }
          showToast(t('toasts.language_updated', 'Idioma actualizado'), 'success');
          await switchLanguage(lang);
        },
      });
      if (guestLangDropdownCtrl) this.dropdownControllers.push(guestLangDropdownCtrl);
    }

    const toggleReduceMotion = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-guest-reduce-motion"]');
    const toggleHighContrast = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-guest-high-contrast"]');

    try {
      const savedReduceMotion = localStorage.getItem('aurora_reduce_motion') === 'true';
      const savedHighContrast = localStorage.getItem('aurora_high_contrast') === 'true';
      if (toggleReduceMotion) toggleReduceMotion.checked = savedReduceMotion;
      if (toggleHighContrast) toggleHighContrast.checked = savedHighContrast;
    } catch {}

    toggleReduceMotion?.addEventListener('change', () => {
      const isChecked = toggleReduceMotion.checked;
      try {
        localStorage.setItem('aurora_reduce_motion', String(isChecked));
      } catch {}
      applyAccessibilityPreferences({ reduce_motion: isChecked });
      showToast(t('toasts.preferences_saved', 'Preferencias guardadas.'), 'success');
    }, { signal });

    toggleHighContrast?.addEventListener('change', () => {
      const isChecked = toggleHighContrast.checked;
      try {
        localStorage.setItem('aurora_high_contrast', String(isChecked));
      } catch {}
      applyAccessibilityPreferences({ high_contrast: isChecked });
      showToast(t('toasts.preferences_saved', 'Preferencias guardadas.'), 'success');
    }, { signal });

    renderIcons(this.container);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.dropdownControllers.forEach((ctrl) => {
      try {
        ctrl.destroy();
      } catch {}
    });
    this.dropdownControllers = [];
  }
}

export async function createGuestSettingsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/guest.html');
  const controller = new GuestSettingsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
