import { UploadProgressInfo } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';

export interface ToolStatusOptions {
  container: HTMLElement;
  onRetry?: () => void;
  toolName: string;
}

export class ToolStatusManager {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentTotalFiles = 1;
  private errorScreen: HTMLElement | null = null;
  private onRetry?: () => void;
  private toolName: string;
  private uploadScreen: HTMLElement | null = null;

  constructor(options: ToolStatusOptions) {
    this.container = options.container;
    this.toolName = options.toolName;
    this.onRetry = options.onRetry;
    this.ensureElements();
  }

  private ensureElements(): void {
    let uploadEl = this.container.querySelector<HTMLElement>('[data-ref="tool-upload-screen"]');
    if (!uploadEl) {
      uploadEl = document.createElement('div');
      uploadEl.className = 'tool-upload-screen';
      uploadEl.setAttribute('data-ref', 'tool-upload-screen');
      uploadEl.style.display = 'none';
      uploadEl.innerHTML = `
        <div class="tool-upload-screen__content" data-ref="upload-screen-content">
          <h2 class="tool-upload-screen__title" data-ref="upload-screen-title">Subiendo tus archivos...</h2>
          <p class="tool-upload-screen__subtitle" data-ref="upload-screen-subtitle">Subiendo...</p>
          <div class="tool-upload-screen__meta" data-ref="upload-screen-meta">
            <span data-ref="upload-screen-eta">Tiempo restante: calculando...</span>
            <span class="tool-upload-screen__meta-sep">·</span>
            <span data-ref="upload-screen-speed">Velocidad: -- MB/s</span>
          </div>
          <div class="tool-upload-screen__progress-wrapper" data-ref="upload-screen-progress">
            <div class="tool-upload-screen__fill" data-ref="upload-screen-fill" style="width: 0%;"></div>
          </div>
          <div class="tool-upload-screen__percentage" data-ref="upload-screen-percent">0%</div>
          <span class="tool-upload-screen__badge" data-ref="upload-screen-badge">SUBIDO</span>
        </div>
      `;
      this.container.appendChild(uploadEl);
    }
    this.uploadScreen = uploadEl;

    let errorEl = this.container.querySelector<HTMLElement>('[data-ref="tool-error-screen"]');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'tool-error-screen';
      errorEl.setAttribute('data-ref', 'tool-error-screen');
      errorEl.style.display = 'none';
      errorEl.innerHTML = `
        <div class="tool-error-screen__body" data-ref="error-screen-body">
          <div class="tool-error-screen__content" data-ref="error-screen-content">
            <h2 class="tool-error-screen__title" data-ref="error-screen-title">¡Oh no! No hemos podido procesar tus archivos.</h2>
            <p class="tool-error-screen__desc" data-ref="error-screen-desc">El archivo no se ha procesado porque estaba dañado o era ilegible.</p>
            <div class="tool-error-screen__card" data-ref="error-screen-card">
              <div class="tool-error-screen__card-header" data-ref="error-screen-card-header">
                <svg class="component-icon tool-error-screen__card-icon" aria-hidden="true"><use href="/icons.svg#warning"></use></svg>
                <span class="tool-error-screen__card-title" data-ref="error-screen-box-title">Archivo dañado/corrupto</span>
              </div>
              <p class="tool-error-screen__card-text" data-ref="error-screen-box-text">No podemos procesar archivos dañados o corruptos. Comprueba que si tu archivo está dañado abriéndolo con tu software de PDF. Si no consigues abrirlo, repáralo y prueba con Aurora otra vez.</p>
            </div>
            <div class="tool-error-screen__actions" data-ref="error-screen-actions">
              <button type="button" class="component-button component-button--black component-button--h48 tool-error-screen__btn-retry" data-ref="btn-retry-tool">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#refresh"></use></svg>
                <span data-ref="txt-retry-btn">Reintentar ${this.toolName}</span>
              </button>
            </div>
          </div>
          <div class="tool-error-screen__graphic" data-ref="error-screen-graphic" aria-hidden="true">
            <div class="tool-error-illustration" data-ref="error-illustration">
              <svg class="tool-error-illustration__svg" viewBox="0 0 320 260" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g class="tool-error-illustration__server">
                  <path d="M70 120 L160 70 L250 120 L160 170 Z" fill="var(--bg-hover)" stroke="var(--border-color)" stroke-width="2"/>
                  <path d="M70 120 L70 140 L160 190 L160 170 Z" fill="var(--bg-surface)" stroke="var(--border-color)" stroke-width="2"/>
                  <path d="M250 120 L250 140 L160 190 L160 170 Z" fill="var(--bg-hover)" stroke="var(--border-color)" stroke-width="2"/>
                  <path d="M70 90 L160 40 L250 90 L160 140 Z" fill="var(--bg-surface)" stroke="var(--border-color)" stroke-width="2"/>
                  <path d="M70 90 L70 110 L160 160 L160 140 Z" fill="var(--bg-hover)" stroke="var(--border-color)" stroke-width="2"/>
                  <path d="M250 90 L250 110 L160 160 L160 140 Z" fill="var(--bg-surface)" stroke="var(--border-color)" stroke-width="2"/>
                </g>
                <g class="tool-error-illustration__badge" transform="translate(110, 80)">
                  <polygon points="50,10 90,85 10,85" fill="#ef4444" stroke="#dc2626" stroke-width="3" stroke-linejoin="round"/>
                  <circle cx="50" cy="74" r="3" fill="#ffffff"/>
                  <rect x="47.5" y="38" width="5" height="24" rx="2.5" fill="#ffffff"/>
                </g>
                <g class="tool-error-illustration__doc" transform="translate(40, 140)">
                  <rect x="0" y="0" width="46" height="58" rx="6" fill="var(--bg-surface)" stroke="var(--border-color)" stroke-width="2"/>
                  <line x1="10" y1="16" x2="36" y2="16" stroke="var(--text-tertiary)" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="10" y1="26" x2="30" y2="26" stroke="var(--text-tertiary)" stroke-width="2.5" stroke-linecap="round"/>
                  <line x1="10" y1="36" x2="24" y2="36" stroke="var(--text-tertiary)" stroke-width="2.5" stroke-linecap="round"/>
                </g>
              </svg>
            </div>
          </div>
        </div>
      `;
      this.container.appendChild(errorEl);
    }
    this.errorScreen = errorEl;

    this.bindEvents();
    renderIcons(this.container);
  }

  private bindEvents(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const retryBtn = this.errorScreen?.querySelector<HTMLButtonElement>('[data-ref="btn-retry-tool"]');
    retryBtn?.addEventListener('click', () => {
      this.hide();
      if (this.onRetry) {
        this.onRetry();
      }
    }, { signal });
  }

  public showUploading(currentFileIndex = 1, totalFiles = 1): void {
    this.currentTotalFiles = totalFiles;
    if (this.errorScreen) this.errorScreen.style.display = 'none';
    if (this.uploadScreen) {
      this.uploadScreen.style.display = 'flex';
      const titleEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-title"]');
      const subEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-subtitle"]');
      const etaEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-eta"]');
      const speedEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-speed"]');
      const fillEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-fill"]');
      const percentEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-percent"]');
      const badgeEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-badge"]');

      if (titleEl) {
        titleEl.textContent = totalFiles > 1
          ? `Subiendo archivo ${currentFileIndex} de ${totalFiles}`
          : 'Subiendo archivo...';
      }
      if (subEl) subEl.textContent = 'Subiendo...';
      if (etaEl) etaEl.textContent = 'Tiempo restante: calculando...';
      if (speedEl) speedEl.textContent = 'Velocidad de subida: -- MB/s';
      if (fillEl) {
        fillEl.classList.remove('is-processing');
        fillEl.style.width = '0%';
      }
      if (percentEl) percentEl.textContent = '0%';
      if (badgeEl) badgeEl.textContent = 'SUBIENDO';
    }
  }

  public updateUploadProgress(info: UploadProgressInfo, currentFileIndex = 1): void {
    if (!this.uploadScreen) return;
    const titleEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-title"]');
    const subEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-subtitle"]');
    const etaEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-eta"]');
    const speedEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-speed"]');
    const fillEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-fill"]');
    const percentEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-percent"]');
    const badgeEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-badge"]');

    if (info.percent >= 100) {
      if (titleEl) titleEl.textContent = 'Procesando documentos...';
      if (subEl) subEl.textContent = 'Aplicando cambios y preparando descarga...';
      if (fillEl) {
        fillEl.style.width = '100%';
        fillEl.classList.add('is-processing');
      }
      if (percentEl) percentEl.textContent = '100%';
      if (badgeEl) badgeEl.textContent = 'PROCESANDO';
      if (etaEl) etaEl.textContent = 'Casi listo...';
      if (speedEl) speedEl.textContent = 'Completando tarea';
      return;
    }

    if (titleEl && this.currentTotalFiles > 1) {
      titleEl.textContent = `Subiendo archivo ${currentFileIndex} de ${this.currentTotalFiles}`;
    }
    if (fillEl) fillEl.style.width = `${info.percent}%`;
    if (percentEl) percentEl.textContent = `${info.percent}%`;

    if (etaEl) {
      etaEl.textContent = info.etaSeconds > 0
        ? `Tiempo restante: ~${info.etaSeconds} s`
        : 'Tiempo restante: calculando...';
    }

    if (speedEl) {
      const mbps = (info.speedBytesPerSec / (1024 * 1024)).toFixed(1);
      speedEl.textContent = `Velocidad de subida: ${mbps} MB/s`;
    }
  }

  public showProcessing(title = 'Procesando documento...', subtitle = 'Por favor espera mientras finaliza la tarea'): void {
    if (this.errorScreen) this.errorScreen.style.display = 'none';
    if (this.uploadScreen) {
      this.uploadScreen.style.display = 'flex';
      const titleEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-title"]');
      const subEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-subtitle"]');
      const etaEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-eta"]');
      const speedEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-speed"]');
      const fillEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-fill"]');
      const percentEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-percent"]');
      const badgeEl = this.uploadScreen.querySelector<HTMLElement>('[data-ref="upload-screen-badge"]');

      if (titleEl) titleEl.textContent = title;
      if (subEl) subEl.textContent = subtitle;
      if (etaEl) etaEl.textContent = 'Procesando en servidor...';
      if (speedEl) speedEl.textContent = 'Optimizando salida';
      if (fillEl) {
        fillEl.style.width = '100%';
        fillEl.classList.add('is-processing');
      }
      if (percentEl) percentEl.textContent = '100%';
      if (badgeEl) badgeEl.textContent = 'PROCESANDO';
    }
  }

  public showError(options: {
    boxText?: string;
    boxTitle?: string;
    desc?: string;
    retryText?: string;
    title?: string;
  } = {}): void {
    if (this.uploadScreen) this.uploadScreen.style.display = 'none';
    if (this.errorScreen) {
      this.errorScreen.style.display = 'flex';
      const titleEl = this.errorScreen.querySelector<HTMLElement>('[data-ref="error-screen-title"]');
      const descEl = this.errorScreen.querySelector<HTMLElement>('[data-ref="error-screen-desc"]');
      const boxTitleEl = this.errorScreen.querySelector<HTMLElement>('[data-ref="error-screen-box-title"]');
      const boxTextEl = this.errorScreen.querySelector<HTMLElement>('[data-ref="error-screen-box-text"]');
      const retryTextEl = this.errorScreen.querySelector<HTMLElement>('[data-ref="txt-retry-btn"]');

      if (titleEl) titleEl.textContent = options.title || '¡Oh no! No hemos podido procesar tus archivos.';
      if (descEl) descEl.textContent = options.desc || 'El archivo no se ha procesado porque ocurrió un error durante el procesamiento.';
      if (boxTitleEl) boxTitleEl.textContent = options.boxTitle || 'Archivo dañado o no compatible';
      if (boxTextEl) {
        boxTextEl.textContent = options.boxText || 'No podemos procesar archivos dañados, protegidos o con formato incorrecto. Comprueba que tu archivo se pueda abrir correctamente e inténtalo de nuevo.';
      }
      if (retryTextEl) retryTextEl.textContent = options.retryText || `Reintentar ${this.toolName}`;
    }
  }

  public hide(): void {
    if (this.uploadScreen) this.uploadScreen.style.display = 'none';
    if (this.errorScreen) this.errorScreen.style.display = 'none';
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.uploadScreen = null;
    this.errorScreen = null;
  }
}
