import { API_ROUTES } from '../../config/api-routes.js';
import { getApi, postApi } from '../../services/api.service.js';
import { t } from '../../services/i18n.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { applyAccessibilityPreferences, getTheme, setTheme } from '../../services/theme.service.js';
import { setToastPreferences, showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { debounce, setupDropdown } from '../../utils/dom.util.js';

export class AccessibilitySettingsController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const themeDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-theme"]');
    const themeSelectedText = this.container.querySelector<HTMLElement>('[data-ref="theme-selected-text"]');
    const themeSelectedIcon = this.container.querySelector<HTMLElement>('[data-ref="theme-selected-icon"]');

    const toggleReduceMotion = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-reduce-motion"]');
    const toggleHighContrast = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-high-contrast"]');
    const toggleExtendedAlerts = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-extended-alerts"]');

    const getThemeLabel = (_theme: string) => t('settings.accessibility.theme_light', 'Claro');

    const themeIcons: Record<string, string> = {
      light: 'light_mode',
    };

    const updateThemeUi = (theme: string) => {
      const validTheme = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
      if (themeSelectedText) {
        themeSelectedText.textContent = getThemeLabel(validTheme);
      }
      if (themeSelectedIcon && themeIcons[validTheme]) {
        themeSelectedIcon.textContent = themeIcons[validTheme];
      }
      if (themeDropdown) {
        const activeItem = themeDropdown.querySelector<HTMLElement>(
          `[data-theme-value="${validTheme}"], [data-theme="${validTheme}"]`
        );
        if (activeItem) {
          themeDropdown.querySelectorAll('.menu-item').forEach((i) => i.classList.remove('is-active'));
          activeItem.classList.add('is-active');
        }
      }
    };

    updateThemeUi(getTheme());

    try {
      const prefRes = await getApi(API_ROUTES.settings.preferences);
      if (prefRes.ok) {
        const prefData = await prefRes.json();
        const prefs = prefData.preferences;

        if (prefs) {
          setToastPreferences(prefs);
          applyAccessibilityPreferences(prefs);

          const currentLocal = localStorage.getItem('aurora_theme');
          if (!currentLocal && prefs.theme && ['system', 'light', 'dark'].includes(prefs.theme)) {
            await setTheme(prefs.theme, false);
            updateThemeUi(prefs.theme);
          } else {
            updateThemeUi(getTheme());
          }

          if (toggleReduceMotion) toggleReduceMotion.checked = Boolean(prefs.reduce_motion);
          if (toggleHighContrast) toggleHighContrast.checked = Boolean(prefs.high_contrast);
          if (toggleExtendedAlerts) toggleExtendedAlerts.checked = Boolean(prefs.extended_alerts);
        }
      }
    } catch (_) {}

    if (themeDropdown) {
      setupDropdown(themeDropdown, {
        onSelect: async (theme: string) => {
          try {
            updateThemeUi(theme);
            await setTheme(theme, true);
            showToast(t('toasts.theme_updated', 'Tema actualizado'), 'success');
          } catch (_) {}
        },
      });
    }

    const saveReduceMotion = debounce(async (checked: boolean) => {
      try {
        await postApi(API_ROUTES.settings.preferences, { reduce_motion: checked });
        showToast(t('toasts.preferences_saved', 'Preferencias guardadas'), 'success');
      } catch (_) {}
    }, 350);

    const saveHighContrast = debounce(async (checked: boolean) => {
      try {
        await postApi(API_ROUTES.settings.preferences, { high_contrast: checked });
        showToast(t('toasts.preferences_saved', 'Preferencias guardadas'), 'success');
      } catch (_) {}
    }, 350);

    const saveExtendedAlerts = debounce(async (checked: boolean) => {
      try {
        await postApi(API_ROUTES.settings.preferences, { extended_alerts: checked });
        showToast(t('toasts.preferences_saved', 'Preferencias guardadas'), 'success');
      } catch (_) {}
    }, 350);

    toggleReduceMotion?.addEventListener('change', (e: Event) => {
      const checked = (e.target as HTMLInputElement).checked;
      applyAccessibilityPreferences({ reduce_motion: checked });
      saveReduceMotion(checked);
    }, { signal });

    toggleHighContrast?.addEventListener('change', (e: Event) => {
      const checked = (e.target as HTMLInputElement).checked;
      applyAccessibilityPreferences({ high_contrast: checked });
      saveHighContrast(checked);
    }, { signal });

    toggleExtendedAlerts?.addEventListener('change', (e: Event) => {
      const checked = (e.target as HTMLInputElement).checked;
      setToastPreferences({ extended_alerts: checked });
      saveExtendedAlerts(checked);
    }, { signal });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createAccessibilityView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/accessibility.html');
  const controller = new AccessibilitySettingsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
