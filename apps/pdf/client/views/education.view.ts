import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';

export class EducationController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private footerController: { destroy: () => void } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderFooter();
    this.bindEvents();
    renderIcons(this.container);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.footerController) {
      this.footerController.destroy();
      this.footerController = null;
    }
  }

  private renderFooter(): void {
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="education-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const verifyButton = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-verify-student"]');
    if (verifyButton) {
      verifyButton.addEventListener(
        'click',
        (e: MouseEvent) => {
          e.preventDefault();
          navigate('/education/verify');
        },
        { signal: this.abortController?.signal }
      );
    }

    const institutionsButton = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-institutions"]');
    if (institutionsButton) {
      institutionsButton.addEventListener(
        'click',
        (e: MouseEvent) => {
          e.preventDefault();
          navigate('/education/institutions');
        },
        { signal: this.abortController?.signal }
      );
    }

    const navigateLinks = this.container.querySelectorAll<HTMLAnchorElement>('[data-navigate]');
    navigateLinks.forEach((link) => {
      link.addEventListener(
        'click',
        (e: MouseEvent) => {
          const target = link.getAttribute('data-navigate') || link.getAttribute('href');
          if (target && target.startsWith('/')) {
            e.preventDefault();
            navigate(target);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }
}

export async function createEducationView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/education/education.html');
  const controller = new EducationController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
