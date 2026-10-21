import { navigate } from '../app-router.js';
import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';
import { withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

export class EducationInstitutionsController implements ViewController {
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
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="institutions-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-institution-inquiry"]');
    if (form) {
      form.addEventListener(
        'submit',
        (e: Event) => {
          e.preventDefault();
          void this.handleSubmit(form);
        },
        { signal: this.abortController?.signal }
      );
    }
  }

  private showError(msg: string): void {
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-success"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    if (successBanner) successBanner.style.display = 'none';
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.style.display = 'block';
    }
  }

  private showSuccess(msg: string): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-success"]');
    if (errorBanner) errorBanner.style.display = 'none';
    if (successBanner) {
      successBanner.textContent = msg;
      successBanner.style.display = 'block';
    }
  }

  private async handleSubmit(form: HTMLFormElement): Promise<void> {
    const schoolNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-school-name"]');
    const websiteDomainInput = form.querySelector<HTMLInputElement>('[data-ref="input-website-domain"]');
    const contactNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-contact-name"]');
    const contactRoleInput = form.querySelector<HTMLInputElement>('[data-ref="input-contact-role"]');
    const contactEmailInput = form.querySelector<HTMLInputElement>('[data-ref="input-contact-email"]');
    const phoneInput = form.querySelector<HTMLInputElement>('[data-ref="input-phone"]');
    const estimatedStudentsSelect = form.querySelector<HTMLSelectElement>('[data-ref="select-estimated-students"]');
    const countryCityInput = form.querySelector<HTMLInputElement>('[data-ref="input-country-city"]');
    const messageInput = form.querySelector<HTMLTextAreaElement>('[data-ref="textarea-message"]');
    const submitBtn = form.querySelector<HTMLButtonElement>('[data-ref="btn-submit-institution"]');

    const schoolName = (schoolNameInput?.value || '').trim();
    const websiteDomain = (websiteDomainInput?.value || '').trim();
    const contactName = (contactNameInput?.value || '').trim();
    const contactRole = (contactRoleInput?.value || '').trim();
    const contactEmail = (contactEmailInput?.value || '').trim();
    const phone = (phoneInput?.value || '').trim();
    const estimatedStudents = (estimatedStudentsSelect?.value || '').trim();
    const countryCity = (countryCityInput?.value || '').trim();
    const message = (messageInput?.value || '').trim();

    if (schoolName.length < 2) {
      this.showError('Por favor ingresa el nombre de la institución educativa.');
      schoolNameInput?.focus();
      return;
    }

    if (contactName.length < 2) {
      this.showError('Por favor ingresa tu nombre completo.');
      contactNameInput?.focus();
      return;
    }

    if (contactRole.length < 2) {
      this.showError('Por favor ingresa tu cargo o rol institucional.');
      contactRoleInput?.focus();
      return;
    }

    if (!validateEmail(contactEmail)) {
      this.showError('Por favor ingresa un correo electrónico institucional válido.');
      contactEmailInput?.focus();
      return;
    }

    if (!estimatedStudents) {
      this.showError('Por favor selecciona el número estimado de alumnos o docentes.');
      estimatedStudentsSelect?.focus();
      return;
    }

    if (countryCity.length < 2) {
      this.showError('Por favor ingresa la ciudad y país de tu institución.');
      countryCityInput?.focus();
      return;
    }

    if (message.length < 10) {
      this.showError('Por favor describe brevemente tus necesidades o proyectos (mínimo 10 caracteres).');
      messageInput?.focus();
      return;
    }

    if (!submitBtn) return;

    await withButtonLoading(submitBtn, async () => {
      try {
        const res = await postApi('/api/education/institution-inquiry', {
          contactEmail,
          contactName,
          contactRole,
          countryCity,
          estimatedStudents,
          message,
          phone: phone || undefined,
          schoolName,
          websiteDomain: websiteDomain || undefined,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          this.showError(data.error || 'Ocurrió un error al enviar la solicitud. Por favor intenta de nuevo.');
          return;
        }

        form.reset();
        this.showSuccess(data.message || 'Solicitud de convenio enviada con éxito. Nuestro equipo se pondrá en contacto pronto.');
      } catch {
        this.showError('Error de conexión al procesar la solicitud. Por favor intenta más tarde.');
      }
    });
  }
}

export async function createEducationInstitutionsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/education/institutions.html');
  const controller = new EducationInstitutionsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
