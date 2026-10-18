import { navigate } from '../app-router.js';
import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { currentUser, getApi, postFormApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { withButtonLoading } from '../utils/dom.util.js';

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
      const res = await getApi('/api/education/status');
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

        if ((verification && verification.status === 'approved') || user.is_student) {
          this.renderApprovedState(verification);
          this.showCard('card-approved');
          return;
        }
      }

      this.showCard('card-form');
    } catch {
      this.showCard('card-form');
    }
  }

  private showCard(cardRef: string): void {
    const cards = ['card-unauthenticated', 'card-pending', 'card-approved', 'card-form'];
    cards.forEach((ref) => {
      const el = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
      if (el) {
        el.style.display = ref === cardRef ? 'flex' : 'none';
      }
    });
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
      this.showError('El archivo no debe superar los 10 MB.');
      return;
    }

    this.hideError();
    this.selectedFile = file;

    const emptyBox = this.container.querySelector<HTMLElement>('[data-ref="dropzone-empty"]');
    const selectedBox = this.container.querySelector<HTMLElement>('[data-ref="dropzone-selected"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="file-name"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="file-size"]');

    if (emptyBox) emptyBox.style.display = 'none';
    if (selectedBox) selectedBox.style.display = 'flex';
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);
  }

  private clearSelectedFile(): void {
    this.selectedFile = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-file"]');
    if (fileInput) fileInput.value = '';

    const emptyBox = this.container.querySelector<HTMLElement>('[data-ref="dropzone-empty"]');
    const selectedBox = this.container.querySelector<HTMLElement>('[data-ref="dropzone-selected"]');

    if (emptyBox) emptyBox.style.display = 'flex';
    if (selectedBox) selectedBox.style.display = 'none';
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    const text = this.container.querySelector<HTMLElement>('[data-ref="text-error"]');
    if (banner && text) {
      text.textContent = msg;
      banner.style.display = 'flex';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    if (banner) banner.style.display = 'none';
  }

  private async handleSubmit(form: HTMLFormElement): Promise<void> {
    this.hideError();

    const fullNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-full-name"]');
    const schoolNameInput = form.querySelector<HTMLInputElement>('[data-ref="input-school-name"]');
    const submitBtn = form.querySelector<HTMLButtonElement>('[data-ref="btn-submit-verify"]');

    const fullName = fullNameInput?.value.trim() || '';
    const schoolName = schoolNameInput?.value.trim() || '';

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
      this.showError('Debes adjuntar una foto o documento de tu credencial o constancia de estudios.');
      return;
    }

    if (!submitBtn) return;

    await withButtonLoading(submitBtn, async () => {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('schoolName', schoolName);
      formData.append('document', this.selectedFile as Blob);

      try {
        const res = await postFormApi('/api/education/verify', formData);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          this.showError(data.error || 'Ocurrió un error al procesar la solicitud. Por favor intenta de nuevo.');
          return;
        }

        showToast(data.message || 'Solicitud enviada exitosamente.', 'success');
        this.renderPendingState(data.verification || { full_name: fullName, school_name: schoolName, created_at: new Date().toISOString() });
        this.showCard('card-pending');
      } catch {
        this.showError('No se pudo conectar con el servidor. Revisa tu conexión a internet.');
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
