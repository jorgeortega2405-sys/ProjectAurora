import { ensureCsrfToken, getApi } from '../services/api.service.js';
import { pickDropboxFiles } from '../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../services/google-drive.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadPdfJs } from '../services/pdf-loader.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { AiProgressEvent, wsService } from '../services/websocket.service.js';
import { AttachedClientFile, ChatMessageItem, ChatMessageResult } from '../types/ai.types.js';
import { ViewController } from '../types/common.types.js';
import { animateTypewriter } from '../utils/dom.util.js';

interface FileTypeDisplayInfo {
  badgeClass: string;
  icon: string;
  pillClass: string;
}

function getFileIconInfo(filename: string): FileTypeDisplayInfo {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'pdf':
      return { badgeClass: 'ai-result-card__icon-badge--pdf', icon: 'picture_as_pdf', pillClass: 'ai-file-pill--pdf' };
    case 'doc':
    case 'docx':
      return { badgeClass: 'ai-result-card__icon-badge--word', icon: 'description', pillClass: 'ai-file-pill--word' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { badgeClass: 'ai-result-card__icon-badge--excel', icon: 'table_chart', pillClass: 'ai-file-pill--excel' };
    case 'ppt':
    case 'pptx':
      return { badgeClass: 'ai-result-card__icon-badge--ppt', icon: 'slideshow', pillClass: 'ai-file-pill--ppt' };
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'gif':
    case 'svg':
      return { badgeClass: 'ai-result-card__icon-badge--image', icon: 'photo_library', pillClass: 'ai-file-pill--image' };
    case 'zip':
    case 'rar':
    case '7z':
      return { badgeClass: 'ai-result-card__icon-badge--generic', icon: 'folder', pillClass: 'ai-file-pill--generic' };
    default:
      return { badgeClass: 'ai-result-card__icon-badge--generic', icon: 'description', pillClass: 'ai-file-pill--generic' };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSimpleMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('# ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { output.push('<ul>'); inList = true; }
      const content = escapeHtml(line.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      output.push(`<li>${content}</li>`);
    } else if (line.length === 0) {
      if (inList) { output.push('</ul>'); inList = false; }
    } else {
      if (inList) { output.push('</ul>'); inList = false; }
      const content = escapeHtml(line)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      output.push(`<p>${content}</p>`);
    }
  }

  if (inList) {
    output.push('</ul>');
  }

  return output.join('');
}

export class AiController implements ViewController {
  private abortController: AbortController | null = null;
  private activeDocument: { filename: string; token: string } | null = null;
  private activePreviewResult: ChatMessageResult | null = null;
  private container: HTMLElement;
  private isDraggingSlider = false;
  private messages: ChatMessageItem[] = [];
  private previewCurrentPage = 1;
  private previewMaxPages = 1;
  private previewMode: 'compare' | 'result' | 'slider' = 'compare';
  private previewPdfAfter: any = null;
  private previewPdfBefore: any = null;
  private previewZoom = 1.0;
  private progressUnsubscribe: (() => void) | null = null;
  private stagedFiles: AttachedClientFile[] = [];
  private userCredits = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    void wsService.connect();
    this.bindEvents();
    renderIcons(this.container);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = null;
    }
    this.closePreview();
    this.activeDocument = null;
    this.stagedFiles = [];
    this.messages = [];
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    const btnSend = this.container.querySelector<HTMLElement>('[data-ref="btn-send-message"]');
    const btnNewChat = this.container.querySelector<HTMLElement>('[data-ref="btn-new-chat"]');
    const btnAttach = this.container.querySelector<HTMLElement>('[data-ref="btn-attach-files"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="ai-file-input"]');
    const dropOverlay = this.container.querySelector<HTMLElement>('[data-ref="ai-drop-overlay"]');

    if (input) {
      input.addEventListener(
        'input',
        () => {
          this.adjustComposerHeight();
        },
        { signal }
      );

      input.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
          }
        },
        { signal }
      );
    }

    btnSend?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        this.handleSend();
      },
      { signal }
    );

    btnNewChat?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        this.handleResetChat();
      },
      { signal }
    );

    const menuAttach = this.container.querySelector<HTMLElement>('[data-ref="menu-attach-options"]');
    const btnAttachDevice = this.container.querySelector<HTMLElement>('[data-ref="btn-attach-device"]');
    const btnAttachDrive = this.container.querySelector<HTMLElement>('[data-ref="btn-attach-drive"]');
    const btnAttachDropbox = this.container.querySelector<HTMLElement>('[data-ref="btn-attach-dropbox"]');

    btnAttach?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = menuAttach?.style.display === 'flex';
        this.closeAllDropdowns();
        if (!isOpen && menuAttach) {
          menuAttach.style.display = 'flex';
          btnAttach.setAttribute('aria-expanded', 'true');
        }
      },
      { signal }
    );

    btnAttachDevice?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        this.closeAllDropdowns();
        fileInput?.click();
      },
      { signal }
    );

    btnAttachDrive?.addEventListener(
      'click',
      async (e: MouseEvent) => {
        e.preventDefault();
        this.closeAllDropdowns();
        const files = await pickGoogleDriveFiles({ multiselect: true });
        if (files && files.length > 0) {
          this.addFiles(files);
        }
      },
      { signal }
    );

    btnAttachDropbox?.addEventListener(
      'click',
      async (e: MouseEvent) => {
        e.preventDefault();
        this.closeAllDropdowns();
        const files = await pickDropboxFiles({ multiselect: true });
        if (files && files.length > 0) {
          this.addFiles(files);
        }
      },
      { signal }
    );

    fileInput?.addEventListener(
      'change',
      () => {
        if (fileInput.files) {
          this.addFiles(Array.from(fileInput.files));
          fileInput.value = '';
        }
      },
      { signal }
    );

    this.container.addEventListener(
      'dragover',
      (e: DragEvent) => {
        e.preventDefault();
        if (dropOverlay) dropOverlay.classList.add('is-active');
      },
      { signal }
    );

    dropOverlay?.addEventListener(
      'dragleave',
      (e: DragEvent) => {
        e.preventDefault();
        dropOverlay.classList.remove('is-active');
      },
      { signal }
    );

    this.container.addEventListener(
      'drop',
      (e: DragEvent) => {
        e.preventDefault();
        if (dropOverlay) dropOverlay.classList.remove('is-active');
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          this.addFiles(Array.from(e.dataTransfer.files));
        }
      },
      { signal }
    );



    const modalBackdrop = this.container.querySelector<HTMLElement>('[data-ref="ai-preview-modal"]');
    const closePreviewBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-preview"]');
    const prevPageBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-prev-page"]');
    const nextPageBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-next-page"]');
    const zoomInBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const zoomOutBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');

    closePreviewBtn?.addEventListener('click', () => {
      this.closePreview();
    }, { signal });

    modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        this.closePreview();
      }
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalBackdrop?.style.display === 'flex') {
        this.closePreview();
      }
    }, { signal });

    prevPageBtn?.addEventListener('click', () => {
      if (this.previewCurrentPage > 1) {
        this.previewCurrentPage--;
        void this.renderPreviewPages();
      }
    }, { signal });

    nextPageBtn?.addEventListener('click', () => {
      if (this.previewCurrentPage < this.previewMaxPages) {
        this.previewCurrentPage++;
        void this.renderPreviewPages();
      }
    }, { signal });

    zoomInBtn?.addEventListener('click', () => {
      this.previewZoom = Math.min(this.previewZoom + 0.25, 3.0);
      void this.renderPreviewPages();
    }, { signal });

    zoomOutBtn?.addEventListener('click', () => {
      this.previewZoom = Math.max(this.previewZoom - 0.25, 0.5);
      void this.renderPreviewPages();
    }, { signal });

    const modeTabs = this.container.querySelectorAll<HTMLButtonElement>('.ai-preview-tab');
    for (const tab of modeTabs) {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode') as 'compare' | 'result' | 'slider';
        if (mode) {
          this.previewMode = mode;
          this.updatePreviewModeUi();
        }
      }, { signal });
    }

    const sliderWrap = this.container.querySelector<HTMLElement>('[data-ref="preview-slider-wrap"]');
    sliderWrap?.addEventListener('mousedown', (e) => {
      this.isDraggingSlider = true;
      this.handleSliderMove(e.clientX);
    }, { signal });

    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingSlider) {
        this.handleSliderMove(e.clientX);
      }
    }, { signal });

    window.addEventListener('mouseup', () => {
      this.isDraggingSlider = false;
    }, { signal });

    sliderWrap?.addEventListener('touchstart', (e) => {
      if (e.touches[0]) {
        this.isDraggingSlider = true;
        this.handleSliderMove(e.touches[0].clientX);
      }
    }, { passive: true, signal });

    window.addEventListener('touchmove', (e) => {
      if (this.isDraggingSlider && e.touches[0]) {
        this.handleSliderMove(e.touches[0].clientX);
      }
    }, { passive: true, signal });

    window.addEventListener('touchend', () => {
      this.isDraggingSlider = false;
    }, { signal });

    document.addEventListener(
      'click',
      () => {
        this.closeAllDropdowns();
      },
      { signal }
    );
  }

  private closeAllDropdowns(): void {
    const menus = this.container.querySelectorAll<HTMLElement>('.ai-dropdown-menu, .ai-attach-dropdown-menu');
    for (const m of menus) {
      m.style.display = 'none';
    }
    const toggles = this.container.querySelectorAll<HTMLButtonElement>(
      '.ai-toolbar-btn[aria-expanded="true"], .chat-pill-input__attach[aria-expanded="true"]'
    );
    for (const btn of toggles) {
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  private addFiles(newFiles: File[]): void {
    this.hideError();
    for (const file of newFiles) {
      this.stagedFiles.push({
        file,
        id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }
    this.renderStagedTray();
  }

  private renderStagedTray(): void {
    const tray = this.container.querySelector<HTMLElement>('[data-ref="ai-staged-tray"]');
    const list = this.container.querySelector<HTMLElement>('[data-ref="ai-staged-list"]');
    if (!tray || !list) return;

    if (this.stagedFiles.length === 0) {
      tray.style.display = 'none';
      list.innerHTML = '';
      this.renderContextualSuggestions();
      return;
    }

    tray.style.display = 'flex';
    list.innerHTML = '';

    for (const item of this.stagedFiles) {
      const info = getFileIconInfo(item.name);
      const chip = document.createElement('div');
      chip.className = `ai-staged-chip ${info.pillClass}`;
      chip.setAttribute('data-ref', `staged-file-${item.id}`);

      chip.innerHTML = `
        <svg class="component-icon ai-staged-chip__icon" aria-hidden="true"><use href="/icons.svg#${info.icon}"></use></svg>
        <span class="ai-staged-chip__name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <button type="button" class="ai-staged-chip__remove" data-ref="btn-remove-${item.id}" aria-label="Remover archivo">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
        </button>
      `;

      const removeBtn = chip.querySelector<HTMLElement>(`[data-ref="btn-remove-${item.id}"]`);
      removeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.stagedFiles = this.stagedFiles.filter((f) => f.id !== item.id);
        this.renderStagedTray();
      });

      list.appendChild(chip);
    }

    renderIcons(list);
    this.renderContextualSuggestions();
  }

  private renderContextualSuggestions(): void {
    const chipsGrid = this.container.querySelector<HTMLElement>('[data-ref="ai-quick-chips"]');
    if (!chipsGrid) return;

    if (this.stagedFiles.length === 0) {
      chipsGrid.style.display = 'none';
      chipsGrid.innerHTML = '';
      return;
    }

    const suggestions: Array<{ icon: string; label: string; prompt: string }> = [];
    const count = this.stagedFiles.length;
    const names = this.stagedFiles.map((f) => f.name.toLowerCase());
    const pdfCount = names.filter((n) => n.endsWith('.pdf')).length;
    const wordCount = names.filter((n) => n.endsWith('.doc') || n.endsWith('.docx')).length;
    const excelCount = names.filter((n) => n.endsWith('.xls') || n.endsWith('.xlsx')).length;
    const imageCount = names.filter((n) => n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.webp')).length;

    if (count === 1 && pdfCount === 1) {
      suggestions.push(
        { icon: 'compress', label: 'Comprimir PDF', prompt: 'Comprímeme este archivo PDF' },
        { icon: 'auto_awesome', label: 'Resumir PDF', prompt: 'Resúmeme este documento' },
        { icon: 'description', label: 'Pasar a Word', prompt: 'Convierte este PDF a formato Word (.docx)' },
        { icon: 'lock', label: 'Proteger con clave', prompt: 'Protege este documento PDF con contraseña' },
        { icon: 'translate', label: 'Traducir al inglés', prompt: 'Traduce este documento PDF al inglés' },
        { icon: 'format_list_numbered', label: 'Numerar páginas', prompt: 'Añade numeración de páginas en la parte inferior' }
      );
    } else if (count >= 2 && pdfCount === count) {
      suggestions.push(
        { icon: 'call_merge', label: 'Unir todos los PDF', prompt: 'Une estos archivos PDF en un único documento' },
        { icon: 'bolt', label: 'Unir y comprimir', prompt: 'Une estos archivos PDF y luego comprime el resultado' },
        { icon: 'sort', label: 'Ordenar por contenido y unir', prompt: 'Analiza el contenido de estos PDF, ordénalos según su continuación y únelos' }
      );
      if (count >= 4) {
        const half = Math.floor(count / 2);
        suggestions.push({
          icon: 'splitscreen',
          label: `Unir en 2 archivos (${half} y ${count - half})`,
          prompt: `Une estos ${count} archivos pero en 2 archivos PDF, ${half} y ${count - half}`,
        });
      }
      suggestions.push(
        { icon: 'compress', label: 'Comprimir todos', prompt: 'Comprime todos estos archivos PDF en calidad recomendada' }
      );
    } else if (wordCount > 0 && count === wordCount) {
      suggestions.push(
        { icon: 'picture_as_pdf', label: 'Convertir a PDF', prompt: 'Convierte este documento Word a formato PDF' },
        { icon: 'compress', label: 'Convertir a PDF y comprimir', prompt: 'Convierte este Word a PDF y comprímelo' }
      );
    } else if (excelCount > 0 && count === excelCount) {
      suggestions.push(
        { icon: 'picture_as_pdf', label: 'Convertir a PDF', prompt: 'Convierte esta hoja de Excel a formato PDF' }
      );
    } else if (imageCount > 0 && count === imageCount) {
      suggestions.push(
        { icon: 'picture_as_pdf', label: 'Convertir a PDF', prompt: 'Convierte estas imágenes a un archivo PDF' }
      );
    } else {
      suggestions.push(
        { icon: 'call_merge', label: 'Convertir todo a PDF y unir', prompt: 'Convierte todos los archivos a PDF y únelos en un solo documento' }
      );
    }

    chipsGrid.innerHTML = '';
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'component-badge component-badge--sm component-badge--interactive ai-quick-chip';
      btn.setAttribute('data-ref', `chip-suggestion-${i}`);
      btn.setAttribute('data-prompt', s.prompt);
      btn.innerHTML = `
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${s.icon}"></use></svg>
        <span>${escapeHtml(s.label)}</span>
      `;
      btn.addEventListener('click', () => {
        if (input) {
          input.value = s.prompt;
          this.adjustComposerHeight();
          this.handleSend();
        }
      });
      chipsGrid.appendChild(btn);
    }

    chipsGrid.style.display = 'flex';
    renderIcons(chipsGrid);
  }

  private async handleSend(): Promise<void> {
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    if (!input) return;

    const message = input.value.trim();
    if (!message && this.stagedFiles.length === 0) {
      return;
    }

    this.hideError();
    const hero = this.container.querySelector<HTMLElement>('[data-ref="ai-chat-hero"]');
    if (hero) hero.style.display = 'none';

    const sentFiles = [...this.stagedFiles];
    this.stagedFiles = [];
    this.renderStagedTray();

    input.value = '';
    this.adjustComposerHeight();

    const userMessageItem: ChatMessageItem = {
      files: sentFiles.map((f) => ({ name: f.name, size: f.size })),
      id: `msg_u_${Date.now()}`,
      reply: message || 'Procesar documentos adjuntos',
      role: 'user',
      timestamp: Date.now(),
    };

    this.messages.push(userMessageItem);
    this.renderUserMessage(userMessageItem);

    this.setThinking(true);
    this.scrollToBottom();

    const sessionId = `ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = null;
    }
    this.progressUnsubscribe = wsService.subscribeAiProgress(sessionId, (evt) => {
      this.updateThinkingProgress(evt);
    });

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('message', userMessageItem.reply);

    const historyPayload = this.messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.reply,
    }));
    formData.append('history', JSON.stringify(historyPayload));

    if (sentFiles.length > 0) {
      for (const f of sentFiles) {
        formData.append('files', f.file, f.name);
      }
    } else if (this.activeDocument) {
      formData.append('fileTokens', JSON.stringify([this.activeDocument.token]));
      formData.append('activeToken', this.activeDocument.token);
      formData.append('activeFilename', this.activeDocument.filename);
    }

    try {
      const csrfToken = await ensureCsrfToken();
      if (csrfToken) {
        formData.append('_csrf', csrfToken);
      }

      let res = await fetch('/api/ai/chat', {
        body: formData,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
        },
        method: 'POST',
        signal: this.abortController?.signal,
      });

      if (res.status === 403) {
        const freshToken = await ensureCsrfToken(true);
        if (freshToken && freshToken !== csrfToken) {
          formData.set('_csrf', freshToken);
          res = await fetch('/api/ai/chat', {
            body: formData,
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'x-csrf-token': freshToken,
            },
            method: 'POST',
            signal: this.abortController?.signal,
          });
        }
      }

      const responseJson = await res.json();

      if (!res.ok || !responseJson.success) {
        this.setThinking(false);
        const errMsg = responseJson.error || 'No se pudo procesar la solicitud con el asistente.';
        this.showError(errMsg);
        return;
      }

      this.setThinking(false);

      const aiData = responseJson.data;
      const primaryRes = aiData.result || aiData.results?.[0];
      if (primaryRes?.token) {
        this.activeDocument = {
          filename: primaryRes.filename || 'documento.pdf',
          token: primaryRes.token,
        };
      } else if (aiData.activeToken) {
        this.activeDocument = {
          filename: aiData.activeFilename || 'documento.pdf',
          token: aiData.activeToken,
        };
      }

      const assistantMessageItem: ChatMessageItem = {
        id: `msg_a_${Date.now()}`,
        reply: aiData.reply || 'Operación completada con éxito.',
        result: aiData.result,
        results: aiData.results,
        role: 'assistant',
        suggestedActions: aiData.suggestedActions,
        timestamp: Date.now(),
      };

      this.messages.push(assistantMessageItem);
      this.renderAssistantMessage(assistantMessageItem);
      this.scrollToBottom();

      if (typeof aiData.creditsRemaining === 'number') {
        this.updateCreditsUi(aiData.creditsRemaining);
      } else {
        void this.loadCredits();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.setThinking(false);
      this.showError('Ha ocurrido un error de conexión al enviar el mensaje. Por favor intenta de nuevo.');
    } finally {
      if (this.progressUnsubscribe) {
        this.progressUnsubscribe();
        this.progressUnsubscribe = null;
      }
    }
  }

  private renderUserMessage(msg: ChatMessageItem): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="ai-messages-list"]');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'ai-message ai-message--user';
    row.setAttribute('data-ref', `msg-${msg.id}`);

    let filesHtml = '';
    if (msg.files && msg.files.length > 0) {
      filesHtml = `<div class="ai-message-attachments">${msg.files
        .map((f) => {
          const info = getFileIconInfo(f.name);
          return `
            <div class="ai-file-pill ${info.pillClass}">
              <svg class="component-icon ai-file-pill__icon" aria-hidden="true"><use href="/icons.svg#${info.icon}"></use></svg>
              <span>${escapeHtml(f.name)}${f.size > 0 ? ` (${formatFileSize(f.size)})` : ''}</span>
            </div>
          `;
        })
        .join('')}</div>`;
    }

    row.innerHTML = `
      <div class="ai-message-body">
        <div class="ai-message-bubble">
          <p>${escapeHtml(msg.reply)}</p>
          ${filesHtml}
        </div>
      </div>
    `;

    list.appendChild(row);
    renderIcons(row);
  }

  private renderAssistantMessage(msg: ChatMessageItem, animate = true): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="ai-messages-list"]');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'ai-message ai-message--ai';
    row.setAttribute('data-ref', `msg-${msg.id}`);

    const formattedText = renderSimpleMarkdown(msg.reply);
    const results = msg.results && msg.results.length > 0 ? msg.results : msg.result ? [msg.result] : [];
    let resultCardsHtml = '';

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (!res || !res.downloadUrl) continue;
      const info = getFileIconInfo(res.filename || 'documento.pdf');
      const origSize = res.originalSize ? formatFileSize(res.originalSize) : '';
      const finalSize = res.fileSize ? formatFileSize(res.fileSize) : '';
      const savings = res.savingsPercent && res.savingsPercent > 0 ? `<span class="ai-savings-badge">-${res.savingsPercent}%</span>` : '';

      resultCardsHtml += `
        <div class="ai-result-card" data-ref="card-result-${msg.id}-${i}">
          <div class="ai-result-card__header">
            <div class="ai-result-card__icon-badge ${info.badgeClass}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${info.icon}"></use></svg>
            </div>
            <div class="ai-result-card__meta">
              <span class="ai-result-card__title">${escapeHtml(res.filename || 'documento')}</span>
              <span class="ai-result-card__subtitle">${origSize ? `${origSize} ➔ ` : ''}${finalSize} ${savings}</span>
            </div>
          </div>
          <div class="ai-result-card__actions">
            <a class="component-button component-button--black component-button--h40 ai-result-card__download-btn" data-ref="btn-download-${msg.id}-${i}" href="${res.downloadUrl}" download="${escapeHtml(res.filename || 'documento')}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
              <span>Descargar archivo</span>
            </a>
            ${(res.filename?.toLowerCase().endsWith('.pdf') || res.originalFilename?.toLowerCase().endsWith('.pdf') || res.downloadUrl.toLowerCase().includes('.pdf')) ? `
            <button type="button" class="component-button component-button--subtle component-button--h40 ai-result-card__preview-btn" data-ref="btn-preview-${msg.id}-${i}" aria-label="Vista previa / Comparar">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
              <span>Vista previa / Comparar</span>
            </button>
            ` : ''}
          </div>
        </div>
      `;
    }

    const primaryResult = results[0];
    const retryOptions = primaryResult?.alternatives?.filter((a) => a.sourceType === 'original') || [];
    const nextToolOptions = primaryResult?.alternatives?.filter((a) => a.sourceType === 'result') || [];

    let toolbarButtonsHtml = '';
    if (primaryResult?.downloadUrl) {
      toolbarButtonsHtml += `
        <a class="component-button component-button--icon-only component-button--subtle ai-toolbar-btn" data-ref="btn-action-download-${msg.id}" href="${primaryResult.downloadUrl}" download="${escapeHtml(primaryResult.filename || 'documento.pdf')}" data-tooltip="Descargar archivo" aria-label="Descargar archivo">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
        </a>
      `;
    }

    toolbarButtonsHtml += `
      <button type="button" class="component-button component-button--icon-only component-button--subtle ai-toolbar-btn" data-ref="btn-action-like-${msg.id}" data-tooltip="Buena respuesta" aria-label="Buena respuesta">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#thumb_up"></use></svg>
      </button>
      <button type="button" class="component-button component-button--icon-only component-button--subtle ai-toolbar-btn" data-ref="btn-action-dislike-${msg.id}" data-tooltip="Mala respuesta" aria-label="Mala respuesta">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#thumb_down"></use></svg>
      </button>
    `;

    if (retryOptions.length > 0) {
      toolbarButtonsHtml += `
        <div class="ai-dropdown-wrapper" data-ref="dropdown-retry-wrapper-${msg.id}">
          <button type="button" class="component-button component-button--icon-only component-button--subtle ai-toolbar-btn" data-ref="btn-action-retry-${msg.id}" data-tooltip="Reintentar con otra opción" aria-label="Reintentar con otra opción" aria-haspopup="true" aria-expanded="false">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#refresh"></use></svg>
          </button>
          <div class="ai-dropdown-menu" data-ref="menu-retry-${msg.id}" style="display: none;">
            <div class="ai-dropdown-menu__header">Opciones de reintento</div>
            ${retryOptions
              .map((alt, k) => {
                const targetToken = primaryResult.originalToken || primaryResult.token || '';
                const targetFilename = primaryResult.originalFilename || primaryResult.filename || 'documento.pdf';
                return `
                  <button type="button" class="ai-dropdown-item ai-alt-chip" data-ref="btn-retry-${msg.id}-${k}" data-prompt="${escapeHtml(alt.prompt)}" data-token="${escapeHtml(targetToken)}" data-name="${escapeHtml(targetFilename)}">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${alt.icon || 'refresh'}"></use></svg>
                    <span class="ai-dropdown-item__text">${escapeHtml(alt.label)}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    if (nextToolOptions.length > 0) {
      toolbarButtonsHtml += `
        <div class="ai-dropdown-wrapper" data-ref="dropdown-more-wrapper-${msg.id}">
          <button type="button" class="component-button component-button--icon-only component-button--subtle ai-toolbar-btn" data-ref="btn-action-more-${msg.id}" data-tooltip="Continuar con otra herramienta" aria-label="Continuar con otra herramienta" aria-haspopup="true" aria-expanded="false">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#more_vert"></use></svg>
          </button>
          <div class="ai-dropdown-menu" data-ref="menu-more-${msg.id}" style="display: none;">
            <div class="ai-dropdown-menu__header">Continuar con otra herramienta</div>
            ${nextToolOptions
              .map((alt, k) => {
                const targetToken = primaryResult.token || '';
                const targetFilename = primaryResult.filename || 'documento.pdf';
                return `
                  <button type="button" class="ai-dropdown-item ai-alt-chip" data-ref="btn-more-${msg.id}-${k}" data-prompt="${escapeHtml(alt.prompt)}" data-token="${escapeHtml(targetToken)}" data-name="${escapeHtml(targetFilename)}">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${alt.icon || 'build'}"></use></svg>
                    <span class="ai-dropdown-item__text">${escapeHtml(alt.label)}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="ai-message-avatar ai-message-avatar--ai">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#auto_awesome"></use></svg>
      </div>
      <div class="ai-message-body">
        <div class="ai-message-bubble" data-ref="ai-bubble-${msg.id}">
          ${animate ? '' : formattedText}
        </div>
        ${resultCardsHtml}
        <div class="ai-message-footer" data-ref="msg-footer-${msg.id}">
          <div class="ai-action-toolbar" data-ref="ai-action-toolbar-${msg.id}">
            ${toolbarButtonsHtml}
          </div>
        </div>
      </div>
    `;

    list.appendChild(row);
    renderIcons(row);

    if (animate) {
      const bubble = row.querySelector<HTMLElement>(`[data-ref="ai-bubble-${msg.id}"]`);
      if (bubble) {
        void animateTypewriter(bubble, msg.reply, {
          onChunk: () => {
            this.scrollToBottom();
          },
          renderHtml: renderSimpleMarkdown,
          signal: this.abortController?.signal
        });
      }
    }

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const previewBtn = row.querySelector<HTMLButtonElement>(`[data-ref="btn-preview-${msg.id}-${i}"]`);
      previewBtn?.addEventListener('click', () => {
        void this.openPreview(res);
      });
    }

    const likeBtn = row.querySelector<HTMLButtonElement>(`[data-ref="btn-action-like-${msg.id}"]`);
    const dislikeBtn = row.querySelector<HTMLButtonElement>(`[data-ref="btn-action-dislike-${msg.id}"]`);

    likeBtn?.addEventListener('click', () => {
      const isLiked = likeBtn.classList.contains('ai-toolbar-btn--active-like');
      likeBtn.classList.toggle('ai-toolbar-btn--active-like');
      dislikeBtn?.classList.remove('ai-toolbar-btn--active-dislike');
      if (!isLiked) {
        showToast('¡Gracias por tu valoración!', 'success');
      }
    });

    dislikeBtn?.addEventListener('click', () => {
      const isDisliked = dislikeBtn.classList.contains('ai-toolbar-btn--active-dislike');
      dislikeBtn.classList.toggle('ai-toolbar-btn--active-dislike');
      likeBtn?.classList.remove('ai-toolbar-btn--active-like');
      if (!isDisliked) {
        showToast('Gracias, trabajaremos para mejorar esta respuesta.', 'info');
      }
    });

    const retryBtn = row.querySelector<HTMLButtonElement>(`[data-ref="btn-action-retry-${msg.id}"]`);
    const retryMenu = row.querySelector<HTMLElement>(`[data-ref="menu-retry-${msg.id}"]`);
    const moreBtn = row.querySelector<HTMLButtonElement>(`[data-ref="btn-action-more-${msg.id}"]`);
    const moreMenu = row.querySelector<HTMLElement>(`[data-ref="menu-more-${msg.id}"]`);

    retryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = retryMenu?.style.display === 'flex';
      this.closeAllDropdowns();
      if (!isOpen && retryMenu) {
        retryMenu.style.display = 'flex';
        retryBtn.setAttribute('aria-expanded', 'true');
      }
    });

    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = moreMenu?.style.display === 'flex';
      this.closeAllDropdowns();
      if (!isOpen && moreMenu) {
        moreMenu.style.display = 'flex';
        moreBtn.setAttribute('aria-expanded', 'true');
      }
    });

    const altButtons = row.querySelectorAll<HTMLButtonElement>('.ai-alt-chip');
    for (const btn of altButtons) {
      btn.addEventListener('click', () => {
        this.closeAllDropdowns();
        const prompt = btn.getAttribute('data-prompt') || '';
        const token = btn.getAttribute('data-token') || '';
        const filename = btn.getAttribute('data-name') || 'documento.pdf';
        if (prompt && token) {
          this.handleAlternativeAction(prompt, token, filename);
        }
      });
    }
  }

  private async handleAlternativeAction(prompt: string, token: string, filename: string): Promise<void> {
    this.activeDocument = { filename, token };
    this.hideError();
    const hero = this.container.querySelector<HTMLElement>('[data-ref="ai-chat-hero"]');
    if (hero) hero.style.display = 'none';

    const userMessageItem: ChatMessageItem = {
      files: [{ name: filename, size: 0 }],
      id: `msg_u_${Date.now()}`,
      reply: prompt,
      role: 'user',
      timestamp: Date.now(),
    };

    this.messages.push(userMessageItem);
    this.renderUserMessage(userMessageItem);

    this.setThinking(true);
    this.scrollToBottom();

    const sessionId = `ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = null;
    }
    this.progressUnsubscribe = wsService.subscribeAiProgress(sessionId, (evt) => {
      this.updateThinkingProgress(evt);
    });

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('message', prompt);
    formData.append('fileTokens', JSON.stringify([token]));
    formData.append('activeToken', token);
    formData.append('activeFilename', filename);

    const historyPayload = this.messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.reply,
    }));
    formData.append('history', JSON.stringify(historyPayload));

    try {
      const csrfToken = await ensureCsrfToken();
      if (csrfToken) {
        formData.append('_csrf', csrfToken);
      }

      let res = await fetch('/api/ai/chat', {
        body: formData,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
        },
        method: 'POST',
        signal: this.abortController?.signal,
      });

      if (res.status === 403) {
        const freshToken = await ensureCsrfToken(true);
        if (freshToken && freshToken !== csrfToken) {
          formData.set('_csrf', freshToken);
          res = await fetch('/api/ai/chat', {
            body: formData,
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'x-csrf-token': freshToken,
            },
            method: 'POST',
            signal: this.abortController?.signal,
          });
        }
      }

      const responseJson = await res.json();

      if (!res.ok || !responseJson.success) {
        this.setThinking(false);
        const errMsg = responseJson.error || 'No se pudo procesar la solicitud con el asistente.';
        this.showError(errMsg);
        return;
      }

      this.setThinking(false);

      const aiData = responseJson.data;
      const primaryRes = aiData.result || aiData.results?.[0];
      if (primaryRes?.token) {
        this.activeDocument = {
          filename: primaryRes.filename || 'documento.pdf',
          token: primaryRes.token,
        };
      } else if (aiData.activeToken) {
        this.activeDocument = {
          filename: aiData.activeFilename || 'documento.pdf',
          token: aiData.activeToken,
        };
      }

      const assistantMessageItem: ChatMessageItem = {
        id: `msg_a_${Date.now()}`,
        reply: aiData.reply || 'Operación completada con éxito.',
        result: aiData.result,
        results: aiData.results,
        role: 'assistant',
        suggestedActions: aiData.suggestedActions,
        timestamp: Date.now(),
      };

      this.messages.push(assistantMessageItem);
      this.renderAssistantMessage(assistantMessageItem);
      this.scrollToBottom();

      if (typeof aiData.creditsRemaining === 'number') {
        this.updateCreditsUi(aiData.creditsRemaining);
      } else {
        void this.loadCredits();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.setThinking(false);
      this.showError('Ha ocurrido un error de conexión al enviar el mensaje. Por favor intenta de nuevo.');
    } finally {
      if (this.progressUnsubscribe) {
        this.progressUnsubscribe();
        this.progressUnsubscribe = null;
      }
    }
  }

  private setThinking(isThinking: boolean): void {
    const indicator = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-indicator"]');
    const sendBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"]');
    const textEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-text"]');
    const barEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-bar"]');
    const percentEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-percent"]');
    const stepBadge = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-step"]');

    if (indicator) {
      indicator.style.display = isThinking ? 'flex' : 'none';
    }
    if (sendBtn) {
      sendBtn.disabled = isThinking;
    }
    if (isThinking) {
      if (textEl) textEl.textContent = 'Analizando solicitud...';
      if (barEl) barEl.style.width = '10%';
      if (percentEl) percentEl.textContent = '10%';
      if (stepBadge) stepBadge.style.display = 'none';
    }
  }

  private updateThinkingProgress(event: AiProgressEvent): void {
    const textEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-text"]');
    const barEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-bar"]');
    const percentEl = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-percent"]');
    const stepBadge = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-step"]');

    if (event.message && textEl) {
      textEl.textContent = event.message;
    }

    if (typeof event.percent === 'number' && barEl && percentEl) {
      barEl.style.width = `${Math.min(Math.max(event.percent, 5), 100)}%`;
      percentEl.textContent = `${event.percent}%`;
    }

    if (stepBadge) {
      if (event.step && event.totalSteps) {
        stepBadge.textContent = `Paso ${event.step} de ${event.totalSteps}`;
        stepBadge.style.display = 'inline-block';
      } else if (event.stage === 'completed') {
        stepBadge.textContent = 'Completado';
        stepBadge.style.display = 'inline-block';
      } else {
        stepBadge.style.display = 'none';
      }
    }
    this.scrollToBottom();
  }

  private showError(message: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="ai-error-banner"]');
    const textEl = this.container.querySelector<HTMLElement>('[data-ref="ai-error-text"]');
    if (banner && textEl) {
      textEl.textContent = message;
      banner.style.display = 'flex';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="ai-error-banner"]');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  private handleResetChat(): void {
    this.activeDocument = null;
    this.messages = [];
    this.stagedFiles = [];
    this.hideError();
    this.renderStagedTray();

    const hero = this.container.querySelector<HTMLElement>('[data-ref="ai-chat-hero"]');
    const list = this.container.querySelector<HTMLElement>('[data-ref="ai-messages-list"]');
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');

    if (hero) hero.style.display = 'flex';
    if (list) list.innerHTML = '';
    if (input) {
      input.value = '';
      this.adjustComposerHeight();
      input.focus();
    }
  }

  private adjustComposerHeight(): void {
    const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    const inputBox = this.container.querySelector<HTMLElement>('[data-ref="chat-input-box"]');
    if (!textarea || !inputBox) return;

    const text = textarea.value;
    if (!text || text.trim().length === 0) {
      inputBox.classList.remove('is-multiline');
      textarea.style.height = '';
      return;
    }

    if (text.includes('\n')) {
      inputBox.classList.add('is-multiline');
      textarea.style.height = 'auto';
      const nextH = Math.min(Math.max(textarea.scrollHeight, 24), 120);
      textarea.style.height = `${nextH}px`;
      return;
    }

    const wasMultiline = inputBox.classList.contains('is-multiline');
    if (wasMultiline) {
      inputBox.classList.remove('is-multiline');
    }
    textarea.style.height = 'auto';
    const singleRowScrollH = textarea.scrollHeight;

    if (singleRowScrollH > 24) {
      inputBox.classList.add('is-multiline');
      textarea.style.height = 'auto';
      const nextH = Math.min(Math.max(textarea.scrollHeight, 24), 120);
      textarea.style.height = `${nextH}px`;
    } else {
      inputBox.classList.remove('is-multiline');
      textarea.style.height = '';
    }
  }

  private scrollToBottom(): void {
    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="ai-messages-scroll"]');
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }

  private async loadCredits(): Promise<void> {
    try {
      const res = await getApi('/api/ai/credits');
      if (res.ok) {
        const json = (await res.json()) as { data?: { credits?: number; plan?: string }; credits?: number; plan?: string };
        const credits = typeof json.data?.credits === 'number' ? json.data.credits : json.credits;
        const plan = json.data?.plan || json.plan;
        if (typeof credits === 'number') {
          this.updateCreditsUi(credits, plan);
        }
      }
    } catch {}
  }

  private updateCreditsUi(credits: number, plan?: string): void {
    this.userCredits = credits;
    const valEl = this.container.querySelector<HTMLElement>('[data-ref="ai-credits-value"]');
    const dropValEl = this.container.querySelector<HTMLElement>('[data-ref="ai-credits-dropdown-val"]');
    const planEl = this.container.querySelector<HTMLElement>('[data-ref="ai-plan-badge"]');

    if (valEl) valEl.textContent = credits.toLocaleString();
    if (dropValEl) dropValEl.textContent = credits.toLocaleString();
    if (plan && planEl) planEl.textContent = plan;
  }

  private async openPreview(res: ChatMessageResult): Promise<void> {
    this.closePreview();
    this.activePreviewResult = res;
    this.previewCurrentPage = 1;
    this.previewZoom = 1.0;

    const modal = this.container.querySelector<HTMLElement>('[data-ref="ai-preview-modal"]');
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="preview-title"]');
    const subtitleEl = this.container.querySelector<HTMLElement>('[data-ref="preview-subtitle"]');
    const beforeSizeEl = this.container.querySelector<HTMLElement>('[data-ref="preview-before-size"]');
    const afterSizeEl = this.container.querySelector<HTMLElement>('[data-ref="preview-after-size"]');
    const savingsEl = this.container.querySelector<HTMLElement>('[data-ref="preview-savings-badge"]');
    const downloadBtn = this.container.querySelector<HTMLAnchorElement>('[data-ref="btn-preview-download"]');

    if (modal) modal.style.display = 'flex';
    if (titleEl) titleEl.textContent = res.filename || 'Vista previa';
    if (subtitleEl) subtitleEl.textContent = res.action || 'Detalle del documento';

    if (downloadBtn) {
      downloadBtn.href = res.downloadUrl || '#';
      downloadBtn.download = res.filename || 'documento.pdf';
    }

    if (beforeSizeEl) beforeSizeEl.textContent = res.originalSize ? formatFileSize(res.originalSize) : '--';
    if (afterSizeEl) afterSizeEl.textContent = res.fileSize ? formatFileSize(res.fileSize) : '--';
    if (savingsEl) {
      if (res.savingsPercent && res.savingsPercent > 0) {
        savingsEl.textContent = `-${res.savingsPercent}%`;
        savingsEl.style.display = 'inline-block';
      } else {
        savingsEl.style.display = 'none';
      }
    }

    const hasOriginal = Boolean(res.originalToken);
    const compareTab = this.container.querySelector<HTMLElement>('[data-ref="tab-mode-compare"]');
    const sliderTab = this.container.querySelector<HTMLElement>('[data-ref="tab-mode-slider"]');

    if (hasOriginal) {
      if (compareTab) compareTab.style.display = '';
      if (sliderTab) sliderTab.style.display = '';
      this.previewMode = 'compare';
    } else {
      if (compareTab) compareTab.style.display = 'none';
      if (sliderTab) sliderTab.style.display = 'none';
      this.previewMode = 'result';
    }
    this.updatePreviewModeUi();

    try {
      const pdfjs = await loadPdfJs();
      if (res.downloadUrl) {
        this.previewPdfAfter = await pdfjs.getDocument({ url: res.downloadUrl }).promise;
      }
      if (res.originalToken) {
        this.previewPdfBefore = await pdfjs.getDocument({ url: `/api/ai/download/${encodeURIComponent(res.originalToken)}` }).promise;
      }
      this.previewMaxPages = Math.max(this.previewPdfBefore?.numPages || 1, this.previewPdfAfter?.numPages || 1);
      await this.renderPreviewPages();
    } catch {
      showToast('No se pudo generar la vista previa interactiva del documento.', 'error');
    }
  }

  private closePreview(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="ai-preview-modal"]');
    if (modal) modal.style.display = 'none';

    if (this.previewPdfBefore) {
      try { void this.previewPdfBefore.destroy(); } catch {}
      this.previewPdfBefore = null;
    }
    if (this.previewPdfAfter) {
      try { void this.previewPdfAfter.destroy(); } catch {}
      this.previewPdfAfter = null;
    }
    this.activePreviewResult = null;
  }

  private updatePreviewModeUi(): void {
    const compareGrid = this.container.querySelector<HTMLElement>('[data-ref="preview-compare-grid"]');
    const sliderContainer = this.container.querySelector<HTMLElement>('[data-ref="preview-slider-container"]');
    const beforePane = this.container.querySelector<HTMLElement>('[data-ref="preview-pane-before"]');

    const tabs = this.container.querySelectorAll<HTMLElement>('.ai-preview-tab');
    for (const tab of tabs) {
      tab.classList.toggle('is-active', tab.getAttribute('data-mode') === this.previewMode);
    }

    if (this.previewMode === 'compare') {
      if (compareGrid) {
        compareGrid.style.display = 'grid';
        compareGrid.classList.remove('is-single-mode');
      }
      if (beforePane) beforePane.style.display = 'flex';
      if (sliderContainer) sliderContainer.style.display = 'none';
    } else if (this.previewMode === 'slider') {
      if (compareGrid) compareGrid.style.display = 'none';
      if (sliderContainer) sliderContainer.style.display = 'flex';
    } else if (this.previewMode === 'result') {
      if (compareGrid) {
        compareGrid.style.display = 'grid';
        compareGrid.classList.add('is-single-mode');
      }
      if (beforePane) beforePane.style.display = 'none';
      if (sliderContainer) sliderContainer.style.display = 'none';
    }
  }

  private handleSliderMove(clientX: number): void {
    const wrap = this.container.querySelector<HTMLElement>('[data-ref="preview-slider-wrap"]');
    const beforeEl = this.container.querySelector<HTMLElement>('[data-ref="preview-slider-before"]');
    const dividerEl = this.container.querySelector<HTMLElement>('[data-ref="preview-slider-divider"]');
    if (!wrap || !beforeEl || !dividerEl) return;

    const rect = wrap.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (offsetX / rect.width) * 100;

    beforeEl.style.width = `${percent}%`;
    dividerEl.style.left = `${percent}%`;
  }

  private async renderPreviewPages(): Promise<void> {
    const pageNum = this.previewCurrentPage;
    const zoom = this.previewZoom;

    const pageInfo = this.container.querySelector<HTMLElement>('[data-ref="preview-page-info"]');
    const zoomText = this.container.querySelector<HTMLElement>('[data-ref="preview-zoom-text"]');
    if (pageInfo) pageInfo.textContent = `Página ${pageNum} de ${this.previewMaxPages}`;
    if (zoomText) zoomText.textContent = `${Math.round(zoom * 100)}%`;

    const dpr = window.devicePixelRatio || 1;

    if (this.previewPdfBefore) {
      try {
        const page = await this.previewPdfBefore.getPage(Math.min(pageNum, this.previewPdfBefore.numPages));
        const viewport = page.getViewport({ scale: zoom });

        const canvasBefore = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-before"]');
        if (canvasBefore) {
          canvasBefore.width = Math.floor(viewport.width * dpr);
          canvasBefore.height = Math.floor(viewport.height * dpr);
          canvasBefore.style.width = `${viewport.width}px`;
          canvasBefore.style.height = `${viewport.height}px`;
          const ctx = canvasBefore.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
        }

        const canvasSliderBefore = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-slider-before"]');
        if (canvasSliderBefore) {
          canvasSliderBefore.width = Math.floor(viewport.width * dpr);
          canvasSliderBefore.height = Math.floor(viewport.height * dpr);
          canvasSliderBefore.style.width = `${viewport.width}px`;
          canvasSliderBefore.style.height = `${viewport.height}px`;
          const ctx = canvasSliderBefore.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
        }
      } catch {}
    }

    if (this.previewPdfAfter) {
      try {
        const page = await this.previewPdfAfter.getPage(Math.min(pageNum, this.previewPdfAfter.numPages));
        const viewport = page.getViewport({ scale: zoom });

        const canvasAfter = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-after"]');
        if (canvasAfter) {
          canvasAfter.width = Math.floor(viewport.width * dpr);
          canvasAfter.height = Math.floor(viewport.height * dpr);
          canvasAfter.style.width = `${viewport.width}px`;
          canvasAfter.style.height = `${viewport.height}px`;
          const ctx = canvasAfter.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
        }

        const canvasSliderAfter = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-slider-after"]');
        if (canvasSliderAfter) {
          canvasSliderAfter.width = Math.floor(viewport.width * dpr);
          canvasSliderAfter.height = Math.floor(viewport.height * dpr);
          canvasSliderAfter.style.width = `${viewport.width}px`;
          canvasSliderAfter.style.height = `${viewport.height}px`;
          const ctx = canvasSliderAfter.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport }).promise;
          }
        }
      } catch {}
    }
  }
}

export async function createAiView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/ai/ai.html');
  const controller = new AiController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
