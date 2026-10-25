import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { setupDropdown, withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

export class ContactController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private dropdownController: { destroy: () => void } | null = null;
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
    if (this.dropdownController) {
      this.dropdownController.destroy();
      this.dropdownController = null;
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
    const subjectDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-contact-subject"]');
    const subjectInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-subject"]');
    const subjectText = this.container.querySelector<HTMLElement>('[data-ref="contact-subject-selected-text"]');
    const messageInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="contact-message"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-contact"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-error"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-success"]');

    if (subjectDropdown) {
      this.dropdownController = setupDropdown(subjectDropdown, {
        onSelect: (val: string, item?: HTMLElement) => {
          if (subjectInput) subjectInput.value = val;
          if (subjectText && item) {
            const text = item.querySelector('.menu-item__text')?.textContent || '';
            subjectText.textContent = text;
          }
        },
      });
    }

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
        const subject = (subjectInput?.value || '').trim();
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
          return;
        }

        if (message.length < 10) {
          showError('Por favor escribe un mensaje de al menos 10 caracteres para entender tu consulta.');
          messageInput?.focus();
          return;
        }

        if (errorBanner) errorBanner.style.display = 'none';

        await withButtonLoading(submitBtn, 'Enviando mensaje...', async () => {
          const res = await fetch('/api/support/contact', {
            body: JSON.stringify({
              category: subject,
              email,
              message,
              name,
              subject: subjectText?.textContent || subject,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: this.abortController?.signal,
          });

          const data = (await res.json().catch(() => ({}))) as { error?: string; ticketNumber?: string };
          if (!res.ok) {
            showError(data.error || 'No se pudo enviar el mensaje. Intenta más tarde.');
            return;
          }

          form.reset();
          if (subjectInput) subjectInput.value = '';
          if (subjectText) subjectText.textContent = 'Selecciona un asunto...';
          const ticketMsg = data.ticketNumber
            ? `¡Incidencia registrada con el número #${data.ticketNumber}! Te hemos enviado un correo con el acuse y enlace de seguimiento.`
            : '¡Tu mensaje ha sido enviado correctamente! Te responderemos a la brevedad posible.';
          showSuccess(ticketMsg);
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
