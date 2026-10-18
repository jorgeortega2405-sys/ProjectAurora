import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

export class ContactController implements ViewController {
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
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="contact-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="contact-form"]');
    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-name"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-email"]');
    const subjectSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="contact-subject"]');
    const messageInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="contact-message"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-contact"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-error"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-success"]');

    const showError = (msg: string) => {
      if (successBanner) successBanner.style.display = 'none';
      if (errorBanner) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
      }
    };

    const showSuccess = (msg: string) => {
      if (errorBanner) errorBanner.style.display = 'none';
      if (successBanner) {
        successBanner.textContent = msg;
        successBanner.style.display = 'block';
      }
    };

    form?.addEventListener(
      'submit',
      async (e: Event) => {
        e.preventDefault();

        const name = (nameInput?.value || '').trim();
        const email = (emailInput?.value || '').trim();
        const subject = (subjectSelect?.value || '').trim();
        const message = (messageInput?.value || '').trim();

        if (name.length < 2) {
          showError('Por favor ingresa tu nombre completo.');
          nameInput?.focus();
          return;
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          showError(emailValidation.error || 'Ingresa un correo electrónico válido.');
          emailInput?.focus();
          return;
        }

        if (!subject) {
          showError('Por favor selecciona el asunto de tu consulta.');
          subjectSelect?.focus();
          return;
        }

        if (message.length < 10) {
          showError('Por favor escribe un mensaje de al menos 10 caracteres para entender tu consulta.');
          messageInput?.focus();
          return;
        }

        if (errorBanner) errorBanner.style.display = 'none';

        await withButtonLoading(submitBtn, 'Enviando mensaje...', async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));

          form.reset();
          showSuccess('¡Tu mensaje ha sido enviado correctamente! Nuestro equipo te responderá a la brevedad posible.');
          showToast('Mensaje enviado con éxito', 'success');
        });
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createContactView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/contact/contact.html');
  const controller = new ContactController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
