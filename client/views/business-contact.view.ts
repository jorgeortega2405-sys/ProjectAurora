import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

export class BusinessContactController implements ViewController {
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
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="business-contact-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="business-contact-form"]');
    const firstNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="business-contact-firstname"]');
    const lastNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="business-contact-lastname"]');
    const companyInput = this.container.querySelector<HTMLInputElement>('[data-ref="business-contact-company"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="business-contact-email"]');
    const messageInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="business-contact-message"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-business-contact"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="business-contact-error"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="business-contact-success"]');

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

        const firstName = (firstNameInput?.value || '').trim();
        const lastName = (lastNameInput?.value || '').trim();
        const company = (companyInput?.value || '').trim();
        const email = (emailInput?.value || '').trim();
        const message = (messageInput?.value || '').trim();

        if (firstName.length < 2) {
          showError('Por favor ingresa tu nombre.');
          firstNameInput?.focus();
          return;
        }

        if (lastName.length < 2) {
          showError('Por favor ingresa tus apellidos.');
          lastNameInput?.focus();
          return;
        }

        if (company.length < 2) {
          showError('Por favor ingresa el nombre de tu empresa u organización.');
          companyInput?.focus();
          return;
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          showError(emailValidation.error || 'Ingresa un correo electrónico corporativo válido.');
          emailInput?.focus();
          return;
        }

        if (message.length < 10) {
          showError('Por favor escribe un mensaje de al menos 10 caracteres describiendo tus necesidades.');
          messageInput?.focus();
          return;
        }

        if (errorBanner) errorBanner.style.display = 'none';

        await withButtonLoading(submitBtn, 'Enviando solicitud...', async () => {
          try {
            const res = await postApi('/api/enterprise/inquiry', {
              company,
              email,
              firstName,
              lastName,
              message,
            });
            let data: Record<string, any> = {};
            try {
              data = await res.json();
            } catch {
              data = {};
            }

            if (res.ok && data.success) {
              form.reset();
              showSuccess('¡Tu solicitud ha sido recibida con éxito! Un especialista corporativo se comunicará contigo a la brevedad.');
              showToast('Solicitud empresarial enviada con éxito', 'success');
            } else {
              showError(data.error || 'No se pudo registrar la solicitud empresarial. Por favor intenta más tarde.');
            }
          } catch {
            showError('Error de conexión al enviar la solicitud. Por favor verifica tu conexión e intenta de nuevo.');
          }
        });
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createBusinessContactView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/business/business-contact.html');
  const controller = new BusinessContactController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
