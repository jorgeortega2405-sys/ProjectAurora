import { navigate } from '../app-router.js';
import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { API_ROUTES } from '../config/api-routes.js';
import { checkAuthSession, currentUser, getApi, postApi, postFormApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

export class EducationVerifyController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private footerController: { destroy: () => void } | null = null;
  private selectedFile: File | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderFooter();
    this.bindEvents();
    renderIcons(this.container);
    await this.checkStatus();
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
    this.selectedFile = null;
  }

  private renderFooter(): void {
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="verify-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private async checkStatus(): Promise<void> {
    const user = currentUser;
    if (!user) {
      this.showCard('card-unauthenticated');
      return;
    }

    try {
      const res = await getApi(API_ROUTES.education.status);
      if (res.status === 401) {
        this.showCard('card-unauthenticated');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const verification = data.verification;

        if (verification && verification.status === 'pending') {
          this.renderPendingState(verification);
          this.showCard('card-pending');
          return;
        }

        if ((verification && verification.status === 'approved') || user.is_student || user.subscription_tier === 'pro') {
          this.renderApprovedState(verification);
          this.showCard('card-approved');
          return;
        }

        if (data.isEligibleInstant) {
          this.renderInstantEligibleState(data.eligibleSchoolName, user.email || '');
          this.showCard('card-instant-eligible');
          return;
        }
      }

      this.showCard('card-form');
    } catch {
      this.showCard('card-form');
    }
  }

  private showCard(cardRef: string): void {
    const cards = ['card-unauthenticated', 'card-pending', 'card-approved', 'card-instant-eligible', 'card-form'];
    cards.forEach((ref) => {
      const el = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
      if (el) {
        el.style.display = ref === cardRef ? 'flex' : 'none';
      }
    });
  }

  private renderInstantEligibleState(schoolName: string, email: string): void {
    const emailEl = this.container.querySelector<HTMLElement>('[data-ref="val-instant-email"]');
    const schoolEl = this.container.querySelector<HTMLElement>('[data-ref="val-instant-school"]');
    if (emailEl) emailEl.textContent = email;
    if (schoolEl) schoolEl.textContent = schoolName;
  }

  private renderPendingState(verification: { created_at?: string; full_name?: string; school_name?: string }): void {
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="val-pending-name"]');
    const schoolEl = this.container.querySelector<HTMLElement>('[data-ref="val-pending-school"]');
    const dateEl = this.container.querySelector<HTMLElement>('[data-ref="val-pending-date"]');

    if (nameEl) nameEl.textContent = verification.full_name || '--';
    if (schoolEl) schoolEl.textContent = verification.school_name || '--';
    if (dateEl && verification.created_at) {
      try {
        const d = new Date(verification.created_at);
        dateEl.textContent = d.toLocaleDateString();
      } catch {
        dateEl.textContent = verification.created_at;
      }
    }
  }

  private renderApprovedState(verification?: { school_name?: string }): void {
    const schoolEl = this.container.querySelector<HTMLElement>('[data-ref="val-approved-school"]');
    if (schoolEl) {
      schoolEl.textContent = verification?.school_name || 'Institución Educativa Verificada';
    }
  }

  private bindEvents(): void {
    const claimInstantBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-claim-instant-pro"]');
    if (claimInstantBtn) {
      claimInstantBtn.addEventListener(
        'click',
        () => void this.handleClaimInstantPro(claimInstantBtn),
        { signal: this.abortController?.signal }
      );
    }

    const altOptionsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-show-alternative-options"]');
    if (altOptionsBtn) {
      altOptionsBtn.addEventListener(
        'click',
        () => this.showCard('card-form'),
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

    const tabInstant = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-btn-instant"]');
    const tabManual = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-btn-manual"]');
    const boxInstant = this.container.querySelector<HTMLElement>('[data-ref="box-mode-instant"]');
    const boxManual = this.container.querySelector<HTMLElement>('[data-ref="box-mode-manual"]');

    if (tabInstant && tabManual && boxInstant && boxManual) {
      tabInstant.addEventListener(
        'click',
        () => {
          tabInstant.classList.add('education-tab-btn--active');
          tabManual.classList.remove('education-tab-btn--active');
          boxInstant.style.display = 'block';
          boxManual.style.display = 'none';
        },
        { signal: this.abortController?.signal }
      );

      tabManual.addEventListener(
        'click',
        () => {
          tabManual.classList.add('education-tab-btn--active');
          tabInstant.classList.remove('education-tab-btn--active');
          boxManual.style.display = 'block';
          boxInstant.style.display = 'none';
        },
        { signal: this.abortController?.signal }
      );
    }

    const formInstantEmail = this.container.querySelector<HTMLFormElement>('[data-ref="form-instant-email"]');
    if (formInstantEmail) {
      formInstantEmail.addEventListener(
        'submit',
        (e: Event) => {
          e.preventDefault();
          void this.handleInstantEmailSubmit(formInstantEmail);
        },
        { signal: this.abortController?.signal }
      );
    }

    const formVerifyOtp = this.container.querySelector<HTMLFormElement>('[data-ref="form-verify-otp"]');
    if (formVerifyOtp) {
      formVerifyOtp.addEventListener(
        'submit',
        (e: Event) => {
          e.preventDefault();
          void this.handleVerifyOtpSubmit(formVerifyOtp);
        },
        { signal: this.abortController?.signal }
      );
    }

    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="dropzone"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-file"]');
    const removeFileBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');

    if (dropzone && fileInput) {
      dropzone.addEventListener(
        'click',
        (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('[data-ref="btn-remove-file"]')) return;
          fileInput.click();
        },
        { signal: this.abortController?.signal }
      );

      dropzone.addEventListener(
        'dragover',
        (e: DragEvent) => {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        },
        { signal: this.abortController?.signal }
      );

      dropzone.addEventListener(
        'dragleave',
        () => {
          dropzone.classList.remove('is-dragover');
        },
        { signal: this.abortController?.signal }
      );

      dropzone.addEventListener(
        'drop',
        (e: DragEvent) => {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
          if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            this.handleFileSelected(e.dataTransfer.files[0]);
          }
        },
        { signal: this.abortController?.signal }
      );

      fileInput.addEventListener(
        'change',
        () => {
          if (fileInput.files && fileInput.files.length > 0) {
            this.handleFileSelected(fileInput.files[0]);
          }
        },
        { signal: this.abortController?.signal }
      );
    }

    if (removeFileBtn) {
      removeFileBtn.addEventListener(
        'click',
        (e: MouseEvent) => {
          e.stopPropagation();
          this.clearSelectedFile();
        },
        { signal: this.abortController?.signal }
      );
    }

    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-verify"]');
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

  private handleFileSelected(file: File): void {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.type.startsWith('image/')) {
      this.showError('Por favor selecciona un archivo JPG, PNG, WEBP o PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.showError('El archivo excede el tamaño máximo permitido de 10 MB.');
      return;
    }

    this.selectedFile = file;
    this.renderSelectedFilePreview(file);
    this.hideError();
  }

  private renderSelectedFilePreview(file: File): void {
    const emptyEl = this.container.querySelector<HTMLElement>('[data-ref="dropzone-empty"]');
    const selectedEl = this.container.querySelector<HTMLElement>('[data-ref="dropzone-selected"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="file-name"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="file-size"]');

    if (emptyEl) emptyEl.style.display = 'none';
    if (selectedEl) selectedEl.style.display = 'flex';
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);
  }

  private clearSelectedFile(): void {
    this.selectedFile = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-file"]');
    if (fileInput) fileInput.value = '';

    const emptyEl = this.container.querySelector<HTMLElement>('[data-ref="dropzone-empty"]');
    const selectedEl = this.container.querySelector<HTMLElement>('[data-ref="dropzone-selected"]');
    if (emptyEl) emptyEl.style.display = 'flex';
    if (selectedEl) selectedEl.style.display = 'none';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private showError(msg: string): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    const errorText = this.container.querySelector<HTMLElement>('[data-ref="text-error"]');
    if (errorBanner) {
      if (errorText) errorText.textContent = msg;
      errorBanner.style.display = 'flex';
    }
  }

  private hideError(): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    if (errorBanner) {
      errorBanner.style.display = 'none';
    }
  }

  private showSuccess(msg: string): void {
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-success"]');
    const successText = this.container.querySelector<HTMLElement>('[data-ref="text-success"]');
    if (successBanner) {
      if (successText) successText.textContent = msg;
      successBanner.style.display = 'flex';
    }
  }

  private showInstantError(msg: string): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error-instant"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-success-instant"]');
    if (successBanner) successBanner.style.display = 'none';
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.style.display = 'block';
    }
  }

  private showInstantSuccess(msg: string): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-error-instant"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="banner-success-instant"]');
    if (errorBanner) errorBanner.style.display = 'none';
    if (successBanner) {
      successBanner.textContent = msg;
      successBanner.style.display = 'block';
    }
  }

  private async handleInstantEmailSubmit(form: HTMLFormElement): Promise<void> {
    const emailInput = form.querySelector<HTMLInputElement>('[data-ref="input-instant-email"]');
    const submitBtn = form.querySelector<HTMLButtonElement>('[data-ref="btn-submit-instant-email"]');
    const email = (emailInput?.value || '').trim();

    if (!validateEmail(email)) {
      this.showInstantError('Por favor ingresa un correo institucional válido.');
      emailInput?.focus();
      return;
    }

    if (!submitBtn) return;

    await withButtonLoading(submitBtn, async () => {
      try {
        const res = await postApi('/api/education/request-otp', { email });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          this.showInstantError(data.error || 'No se pudo enviar el código al correo indicado.');
          return;
        }

        const otpBox = this.container.querySelector<HTMLElement>('[data-ref="box-otp-step"]');
        const schoolText = this.container.querySelector<HTMLElement>('[data-ref="text-detected-school"]');
        if (schoolText) schoolText.textContent = data.schoolName || 'Institución Educativa Verificada';
        if (otpBox) otpBox.style.display = 'block';

        this.showInstantSuccess(data.message || 'Código de verificación enviado. Revisa tu correo institucional.');
      } catch {
        this.showInstantError('Error de conexión al solicitar el código. Por favor intenta más tarde.');
      }
    });
  }

  private async handleVerifyOtpSubmit(form: HTMLFormElement): Promise<void> {
    const codeInput = form.querySelector<HTMLInputElement>('[data-ref="input-otp-code"]');
    const submitBtn = form.querySelector<HTMLButtonElement>('[data-ref="btn-submit-otp"]');
    const code = (codeInput?.value || '').trim();

    if (code.length !== 6) {
      this.showInstantError('Por favor ingresa el código de 6 dígitos.');
      codeInput?.focus();
      return;
    }

    if (!submitBtn) return;

    await withButtonLoading(submitBtn, async () => {
      try {
        const res = await postApi('/api/education/verify-otp', { code });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          this.showInstantError(data.error || 'Código incorrecto o expirado.');
          return;
        }

        if (currentUser) {
          currentUser.is_student = true;
          currentUser.subscription_tier = 'pro';
          currentUser.subscription_origin = 'education';
        }

        showToast('¡Estado de estudiante verificado exitosamente!', 'success');
        this.renderApprovedState({ school_name: data.schoolName });
        this.showCard('card-approved');
      } catch {
        this.showInstantError('Error de conexión al verificar el código. Por favor intenta más tarde.');
      }
    });
  }

  private async handleSubmit(form: HTMLFormElement): Promise<void> {
    this.hideError();

    const fullNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-full-name"]');
    const schoolNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-school-name"]');
    const submitBtn = form.querySelector<HTMLButtonElement>('[data-ref="btn-submit-verify"]');

    const fullName = (fullNameInput?.value || '').trim();
    const schoolName = (schoolNameInput?.value || '').trim();

    if (fullName.length < 3) {
      this.showError('Por favor ingresa tu nombre completo (mínimo 3 caracteres).');
      fullNameInput?.focus();
      return;
    }

    if (schoolName.length < 3) {
      this.showError('Por favor ingresa el nombre de tu escuela o universidad (mínimo 3 caracteres).');
      schoolNameInput?.focus();
      return;
    }

    if (!this.selectedFile) {
      this.showError('Por favor adjunta una fotografía o documento de tu credencial o constancia.');
      return;
    }

    if (!submitBtn) return;

    await withButtonLoading(submitBtn, async () => {
      try {
        const formData = new FormData();
        formData.append('fullName', fullName);
        formData.append('schoolName', schoolName);
        formData.append('document', this.selectedFile as Blob);

        const res = await postFormApi('/api/education/verify', formData);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          this.showError(data.error || 'Ocurrió un error al procesar la solicitud. Por favor intenta de nuevo.');
          return;
        }

        this.showSuccess('Tu solicitud ha sido enviada con éxito. Nuestro equipo la revisará a la brevedad.');
        showToast('Solicitud enviada a revisión', 'success');

        setTimeout(() => {
          this.renderPendingState({
            created_at: new Date().toISOString(),
            full_name: fullName,
            school_name: schoolName,
          });
          this.showCard('card-pending');
        }, 1200);
      } catch {
        this.showError('Error de conexión al enviar los datos. Por favor intenta de nuevo.');
      }
    });
  }

  private async handleClaimInstantPro(btn: HTMLButtonElement): Promise<void> {
    await withButtonLoading(btn, async () => {
      try {
        const res = await postApi(API_ROUTES.education.claimInstantPro, {});
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || 'No fue posible activar el plan estudiantil.', 'danger');
          return;
        }

        showToast(data.message || '¡Plan Pro Estudiantil activado con éxito!', 'success');
        await checkAuthSession();
        this.renderApprovedState({ school_name: data.schoolName });
        this.showCard('card-approved');
      } catch {
        showToast('Error de conexión al activar el beneficio educativo.', 'danger');
      }
    });
  }
}

export async function createEducationVerifyView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/education/verify.html');
  const controller = new EducationVerifyController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
