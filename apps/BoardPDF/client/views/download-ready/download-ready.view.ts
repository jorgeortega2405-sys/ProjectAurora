import { openModal } from '../../components/modal.component.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { getLocalizedPath } from '../../config/seo.config.js';
import { TOOLS_REGISTRY } from '../../config/tools.registry.js';
import { deleteApi, getApi } from '../../services/api.service.js';
import { exportToDropbox } from '../../services/dropbox.service.js';
import { exportToGoogleDrive } from '../../services/google-drive.service.js';
import { getCurrentLanguage, t } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { navigate } from '../../services/navigation.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { setTransferFile } from '../../services/transfer.service.js';
import { ViewController } from '../../types/common.types.js';

interface DownloadReadyData {
  downloadUrl: string;
  fileSize?: number;
  filename: string;
  returnText?: string;
  returnUrl?: string;
  subtitle?: string;
  title?: string;
  token?: string;
}

const CONTINUE_TOOL_IDS = [
  'compress-pdf',
  'split-pdf',
  'merge-pdf',
  'organize-pdf',
  'edit-pdf',
  'protect-pdf',
  'page-numbers',
  'watermark-pdf',
  'rotate-pdf',
  'pdf-to-markdown',
  'summarize-pdf',
  'translate-pdf',
];

export class DownloadReadyController implements ViewController {
  private abortController: AbortController | null = null;
  private cachedBlob: Blob | null = null;
  private container: HTMLElement;
  private data: DownloadReadyData | null = null;
  private isDeleted = false;
  private token: string | null = null;

  constructor(container: HTMLElement, token?: string) {
    this.container = container;
    this.token = token || null;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    await this.loadData();
    renderIcons(this.container);
    this.bindEvents();
    this.renderContinueWorkflow();
    this.triggerAutoDownload();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadData(): Promise<void> {
    let sessionData: DownloadReadyData | null = null;
    const raw = sessionStorage.getItem('download_ready_data');
    if (raw) {
      try {
        sessionData = JSON.parse(raw) as DownloadReadyData;
      } catch {
        sessionData = null;
      }
    }

    if (this.token) {
      const tokenMatches =
        sessionData &&
        (sessionData.token === this.token ||
          (sessionData.downloadUrl && sessionData.downloadUrl.includes(this.token)));

      if (tokenMatches) {
        this.data = sessionData;
      } else {
        try {
          const res = await getApi(API_ROUTES.download.info(this.token));
          const json = await res.json();
          if (res.ok && json.success && json.data) {
            this.data = {
              downloadUrl: json.data.downloadUrl || API_ROUTES.download.file(this.token),
              fileSize: json.data.fileSize,
              filename: json.data.filename,
              returnText: 'Volver a la herramienta',
              returnUrl: '/',
              subtitle: 'El proceso se ha completado con éxito y tu documento está listo para descargar.',
              title: '¡Tu archivo está listo para descargar!',
              token: this.token,
            };
          } else {
            this.data = null;
          }
        } catch {
          this.data = null;
        }
      }
    } else if (sessionData && sessionData.downloadUrl) {
      this.data = sessionData;
    }

    this.render();
  }

  private render(): void {
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="ready-title"]');
    const subtitleEl = this.container.querySelector<HTMLElement>('[data-ref="ready-subtitle"]');
    const downloadBtn = this.container.querySelector<HTMLAnchorElement>('[data-ref="btn-download-file"]');
    const actionBtns = this.container.querySelector<HTMLElement>('[data-ref="ready-action-btns"]');
    const workflowSection = this.container.querySelector<HTMLElement>('[data-ref="continue-workflow-section"]');
    const thankyouCard = this.container.querySelector<HTMLElement>('[data-ref="thankyou-card"]');

    if (!this.data || !this.data.downloadUrl) {
      if (titleEl) titleEl.textContent = 'Enlace no disponible';
      if (subtitleEl) {
        subtitleEl.textContent =
          'El archivo ya no está disponible en nuestro servidor o el enlace ha caducado (los archivos temporales se conservan durante 1 hora).';
      }
      if (downloadBtn) downloadBtn.style.display = 'none';
      if (actionBtns) actionBtns.style.display = 'none';
      if (workflowSection) workflowSection.style.display = 'none';
      if (thankyouCard) thankyouCard.style.display = 'none';
      return;
    }

    if (titleEl && this.data.title) titleEl.textContent = this.data.title;
    if (subtitleEl && this.data.subtitle) subtitleEl.textContent = this.data.subtitle;
    if (downloadBtn) {
      downloadBtn.href = this.data.downloadUrl;
      downloadBtn.download = this.data.filename;
      downloadBtn.style.display = 'inline-flex';
    }
    if (actionBtns) {
      actionBtns.style.display = 'grid';
    }
  }

  private renderContinueWorkflow(): void {
    const gridEl = this.container.querySelector<HTMLElement>('[data-ref="continue-workflow-grid"]');
    const workflowSection = this.container.querySelector<HTMLElement>('[data-ref="continue-workflow-section"]');
    if (!gridEl || !workflowSection) return;

    if (!this.data || !this.data.downloadUrl) {
      workflowSection.style.display = 'none';
      return;
    }

    const currentReturn = this.data.returnUrl || '';
    const currentLang = getCurrentLanguage();
    const toolsToShow = CONTINUE_TOOL_IDS
      .map((id) => TOOLS_REGISTRY.find((tool) => tool.id === id))
      .filter((tool): tool is typeof TOOLS_REGISTRY[0] => tool !== undefined && !currentReturn.startsWith(tool.path))
      .slice(0, 6);

    gridEl.innerHTML = toolsToShow
      .map((tool) => {
        const toolName = t(tool.nameKey);
        const toolDesc = t(tool.descKey);
        const toolPath = getLocalizedPath(tool.id, currentLang);
        const searchHaystack = `${toolName} ${toolDesc}`.toLowerCase();
        return `
        <button type="button" class="menu-item drawer-tool-item" data-ref="drawer-tool-${tool.id}" data-tool-path="${toolPath}" data-search="${searchHaystack}">
          <span class="menu-item__icon tool-item__mini-icon">
            ${tool.customSvg || `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
          </span>
          <span class="menu-item__text" style="font-size: 13px; font-weight: 500;">${toolName}</span>
        </button>
      `;
      })
      .join('');

    renderIcons(gridEl);

    const signal = this.abortController?.signal;
    const buttons = gridEl.querySelectorAll<HTMLButtonElement>('.drawer-tool-item');
    buttons.forEach((btn) => {
      btn.addEventListener(
        'click',
        async () => {
          const targetPath = btn.getAttribute('data-tool-path');
          if (!targetPath) return;
          await this.handleContinueToTool(targetPath, btn);
        },
        { signal }
      );
    });
  }

  private async handleContinueToTool(targetPath: string, btn: HTMLButtonElement): Promise<void> {
    if (!this.data?.downloadUrl) return;
    btn.disabled = true;
    showToast('Cargando archivo en la herramienta seleccionada...', 'info');

    try {
      let blob = this.cachedBlob;
      if (!blob) {
        const res = await fetch(this.data.downloadUrl);
        if (!res.ok) throw new Error('No se pudo recuperar el archivo procesado.');
        blob = await res.blob();
        this.cachedBlob = blob;
      }

      const filename = this.data.filename || 'documento.pdf';
      const file = new File([blob], filename, {
        lastModified: Date.now(),
        type: blob.type || 'application/pdf',
      });

      setTransferFile(file);
      navigate(targetPath);
    } catch {
      showToast('Error al preparar el archivo para la herramienta.', 'danger');
      btn.disabled = false;
    }
  }

  private triggerAutoDownload(): void {
    if (!this.data?.downloadUrl) return;

    try {
      const a = document.createElement('a');
      a.href = this.data.downloadUrl;
      a.download = this.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Descarga iniciada con éxito.', 'success');
    } catch {}
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    this.container.querySelector('[data-ref="btn-download-file"]')?.addEventListener(
      'click',
      () => {
        showToast('Descargando archivo...', 'info');
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-save-drive"]')?.addEventListener(
      'click',
      async () => {
        if (!this.data?.downloadUrl) return;
        await exportToGoogleDrive(this.data.downloadUrl, this.data.filename);
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-save-dropbox"]')?.addEventListener(
      'click',
      async () => {
        if (!this.data?.downloadUrl) return;
        await exportToDropbox(this.data.downloadUrl, this.data.filename);
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-copy-link"]')?.addEventListener(
      'click',
      () => {
        this.openShareModal();
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-delete-file"]')?.addEventListener(
      'click',
      async () => {
        await this.handleDeleteFile();
      },
      { signal }
    );
  }

  private openShareModal(): void {
    if (!this.data) return;

    const downloadLink = this.data.token
      ? `${window.location.origin}/download/${this.data.token}`
      : this.data.downloadUrl.startsWith('http')
      ? this.data.downloadUrl
      : `${window.location.origin}${this.data.downloadUrl}`;

    const modal = openModal({
      bodyHtml: `
        <div class="share-modal" data-ref="share-modal-container">
          <div class="share-modal__input-row">
            <div class="share-modal__input-wrap">
              <input class="field__input share-modal__input" data-ref="input-share-url" type="text" readonly value="${downloadLink}" />
            </div>
            <button type="button" class="component-button component-button--black component-button--h44 share-modal__btn-copy" data-ref="btn-modal-copy-url">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
              <span data-ref="modal-copy-label">Copiar</span>
            </button>
          </div>
          <div class="share-modal__qr-section">
            <div class="share-modal__qr-frame">
              <div class="share-modal__qr-target" data-ref="share-qr-target"></div>
            </div>
            <p class="share-modal__qr-label">Escanea el código QR con cualquier dispositivo para descargar el archivo directamente.</p>
          </div>
        </div>
      `,
      showCancel: false,
      showConfirm: false,
      size: 'sm',
      title: 'Compartir enlace de descarga',
    });

    renderIcons(modal.backdrop);

    const inputEl = modal.backdrop.querySelector<HTMLInputElement>('[data-ref="input-share-url"]');
    inputEl?.addEventListener('click', () => inputEl.select());

    const copyBtn = modal.backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-copy-url"]');
    const copyLabel = modal.backdrop.querySelector<HTMLElement>('[data-ref="modal-copy-label"]');
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(downloadLink);
        if (copyLabel) copyLabel.textContent = '¡Copiado!';
        showToast('Enlace de descarga copiado al portapapeles.', 'success');
        setTimeout(() => {
          if (copyLabel) copyLabel.textContent = 'Copiar';
        }, 2200);
      } catch {
        showToast('No se pudo copiar el enlace al portapapeles.', 'danger');
      }
    });

    void import('qr-code-styling').then(({ default: QRCodeStyling }) => {
      const qrTarget = modal.backdrop.querySelector<HTMLElement>('[data-ref="share-qr-target"]');
      if (!qrTarget) return;
      qrTarget.innerHTML = '';
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const qr = new QRCodeStyling({
        backgroundOptions: { color: isDark ? '#18181b' : '#ffffff' },
        cornersDotOptions: { color: isDark ? '#f4f4f5' : '#09090b', type: 'dot' },
        cornersSquareOptions: { color: isDark ? '#f4f4f5' : '#09090b', type: 'extra-rounded' },
        data: downloadLink,
        dotsOptions: { color: isDark ? '#f4f4f5' : '#09090b', type: 'rounded' },
        height: 190,
        margin: 2,
        type: 'svg',
        width: 190,
      });
      qr.append(qrTarget);
    });
  }

  private async handleDeleteFile(): Promise<void> {
    if (this.isDeleted) return;

    const token = this.token || this.data?.token;
    if (!token) {
      showToast('No se encontró el identificador del archivo.', 'danger');
      return;
    }

    try {
      const res = await deleteApi(API_ROUTES.download.delete(token));
      const json = await res.json();

      if (res.ok && json.success) {
        this.isDeleted = true;
        sessionStorage.removeItem('download_ready_data');
        showToast('Archivo eliminado permanentemente del servidor.', 'success');
        this.renderDeletedState();
      } else {
        const errorMsg = json.error || 'No se pudo eliminar el archivo.';
        showToast(errorMsg, 'danger');
      }
    } catch {
      showToast('Error de conexión al intentar eliminar el archivo.', 'danger');
    }
  }

  private renderDeletedState(): void {
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="ready-title"]');
    const subtitleEl = this.container.querySelector<HTMLElement>('[data-ref="ready-subtitle"]');
    const actionsGroup = this.container.querySelector<HTMLElement>('[data-ref="ready-actions-group"]');
    const workflowSection = this.container.querySelector<HTMLElement>('[data-ref="continue-workflow-section"]');
    const thankyouCard = this.container.querySelector<HTMLElement>('[data-ref="thankyou-card"]');

    if (titleEl) titleEl.textContent = 'Archivo eliminado';
    if (subtitleEl) subtitleEl.textContent = 'El archivo ha sido borrado del servidor de forma permanente.';
    if (actionsGroup) actionsGroup.style.display = 'none';
    if (workflowSection) workflowSection.style.display = 'none';
    if (thankyouCard) thankyouCard.style.display = 'none';
  }
}

export async function createDownloadReadyView(token?: string): Promise<HTMLElement> {
  const container = await loadTemplate('/views/download-ready/download-ready.html');
  const controller = new DownloadReadyController(container, token);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
