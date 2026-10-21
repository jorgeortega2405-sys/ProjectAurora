import { ensureCsrfToken } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { AttachedClientFile, ChatMessageItem, ChatMessageResult } from '../types/ai.types.js';
import { ViewController } from '../types/common.types.js';

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
  private container: HTMLElement;
  private messages: ChatMessageItem[] = [];
  private stagedFiles: AttachedClientFile[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.container);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.activeDocument = null;
    this.stagedFiles = [];
    this.messages = [];
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    const btnSend = this.container.querySelector<HTMLElement>('[data-ref="btn-send-message"]');
    const btnNewChat = this.container.querySelector<HTMLElement>('[data-ref="btn-new-chat"]');
    const btnClear = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-chat"]');
    const btnAttach = this.container.querySelector<HTMLElement>('[data-ref="btn-attach-files"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="ai-file-input"]');
    const dropOverlay = this.container.querySelector<HTMLElement>('[data-ref="ai-drop-overlay"]');
    const quickChips = this.container.querySelectorAll<HTMLElement>('.ai-quick-chip');

    if (input) {
      input.addEventListener(
        'input',
        () => {
          input.style.height = 'auto';
          input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
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

    btnClear?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        this.handleResetChat();
      },
      { signal }
    );

    btnAttach?.addEventListener(
      'click',
      (e: MouseEvent) => {
        e.preventDefault();
        fileInput?.click();
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

    for (const chip of quickChips) {
      chip.addEventListener(
        'click',
        () => {
          const prompt = chip.getAttribute('data-prompt');
          if (prompt && input) {
            input.value = prompt;
            input.focus();
            if (this.stagedFiles.length > 0) {
              this.handleSend();
            }
          }
        },
        { signal }
      );
    }

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

    document.addEventListener(
      'click',
      () => {
        this.closeAllDropdowns();
      },
      { signal }
    );
  }

  private closeAllDropdowns(): void {
    const menus = this.container.querySelectorAll<HTMLElement>('.ai-dropdown-menu');
    for (const m of menus) {
      m.style.display = 'none';
    }
    const toggles = this.container.querySelectorAll<HTMLButtonElement>('.ai-toolbar-btn[aria-expanded="true"]');
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
    input.style.height = 'auto';

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

    const formData = new FormData();
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
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.setThinking(false);
      this.showError('Ha ocurrido un error de conexión al enviar el mensaje. Por favor intenta de nuevo.');
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

  private renderAssistantMessage(msg: ChatMessageItem): void {
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
        <div class="ai-message-bubble">
          ${formattedText}
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

    const formData = new FormData();
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
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.setThinking(false);
      this.showError('Ha ocurrido un error de conexión al enviar el mensaje. Por favor intenta de nuevo.');
    }
  }

  private setThinking(isThinking: boolean): void {
    const indicator = this.container.querySelector<HTMLElement>('[data-ref="ai-thinking-indicator"]');
    const sendBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"]');
    if (indicator) {
      indicator.style.display = isThinking ? 'flex' : 'none';
    }
    if (sendBtn) {
      sendBtn.disabled = isThinking;
    }
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
      input.style.height = 'auto';
      input.focus();
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
}

export async function createAiView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/ai/ai.html');
  const controller = new AiController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
