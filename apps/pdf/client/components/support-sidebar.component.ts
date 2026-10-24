import { currentUser, postApi } from '../services/api.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { wsService } from '../services/websocket.service.js';

export let isTechSupportOpen = false;

interface ChatHistoryItem {
  role: 'assistant' | 'user';
  text: string;
}

const history: ChatHistoryItem[] = [];
let isBound = false;
let isPending = false;
let sidebarElement: HTMLElement | null = null;

let isLiveMode = false;
let activeChatId: string | null = null;
let activeSessionId: string | null = null;
let activeTier: 'L1' | 'L2' | 'L3' = 'L1';
let activeAgentName: string | null = null;
let wsUnsubscribe: (() => void) | null = null;
const renderedMessageIds = new Set<string>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const isInternal = href.startsWith('/');
      return `<a class="chat-link" data-ref="chat-link" href="${href}" ${isInternal ? '' : 'target="_blank" rel="noopener noreferrer"'}>${label}</a>`;
    });
}

function renderSupportMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('# ')) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(`<h1>${formatInlineMarkdown(escapeHtml(line.slice(2)))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(`<h2>${formatInlineMarkdown(escapeHtml(line.slice(3)))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(`<h3>${formatInlineMarkdown(escapeHtml(line.slice(4)))}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (inOl) { output.push('</ol>'); inOl = false; }
      if (!inUl) { output.push('<ul>'); inUl = true; }
      output.push(`<li>${formatInlineMarkdown(escapeHtml(line.slice(2)))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (!inOl) { output.push('<ol>'); inOl = true; }
      const content = line.replace(/^\d+\.\s/, '');
      output.push(`<li>${formatInlineMarkdown(escapeHtml(content))}</li>`);
    } else if (line.length === 0) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
    } else {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(`<p>${formatInlineMarkdown(escapeHtml(line))}</p>`);
    }
  }

  if (inUl) output.push('</ul>');
  if (inOl) output.push('</ol>');

  return output.join('');
}

function scrollToBottom(el: HTMLElement | null): void {
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function adjustTextareaHeight(textarea: HTMLTextAreaElement, inputBox: HTMLElement | null): void {
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 120);
  textarea.style.height = `${Math.max(20, newHeight)}px`;
  if (newHeight > 24) {
    inputBox?.classList.add('is-multiline');
  } else {
    inputBox?.classList.remove('is-multiline');
  }
}

function appendUserBubble(container: HTMLElement | null, text: string): void {
  if (!container) return;
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-message chat-message--user';
  userMsg.setAttribute('data-ref', 'chat-message-user');
  userMsg.textContent = text;
  container.appendChild(userMsg);
}

function appendAgentBubble(container: HTMLElement | null, text: string, agentTitle = 'Soporte IA'): void {
  if (!container) return;
  const agentMsg = document.createElement('div');
  agentMsg.className = 'chat-message chat-message--agent';
  agentMsg.setAttribute('data-ref', 'chat-message-agent');
  agentMsg.innerHTML = `
    <div class="chat-agent-badge" data-ref="chat-agent-badge">
      <svg class="component-icon chat-agent-badge__icon" aria-hidden="true"><use href="/icons.svg#support_agent"></use></svg>
      <span>${escapeHtml(agentTitle)}</span>
    </div>
    <div class="chat-agent-bubble" data-ref="chat-agent-bubble">
      ${renderSupportMarkdown(text)}
    </div>
  `;
  renderIcons(agentMsg);
  container.appendChild(agentMsg);
}

function appendSystemBubble(container: HTMLElement | null, text: string): void {
  if (!container) return;
  const sysMsg = document.createElement('div');
  sysMsg.className = 'chat-message chat-message--system';
  sysMsg.setAttribute('data-ref', 'chat-message-system');
  sysMsg.textContent = text;
  container.appendChild(sysMsg);
}

function showTypingIndicator(container: HTMLElement | null, label = 'Soporte IA'): void {
  if (!container) return;
  const typing = document.createElement('div');
  typing.className = 'chat-message chat-message--typing';
  typing.setAttribute('data-ref', 'chat-typing-indicator');
  typing.innerHTML = `
    <div class="chat-agent-badge" data-ref="chat-agent-badge">
      <svg class="component-icon chat-agent-badge__icon chat-agent-badge__icon--thinking" aria-hidden="true"><use href="/icons.svg#support_agent"></use></svg>
      <span>${escapeHtml(label)}</span>
    </div>
    <div class="chat-typing-dots" data-ref="chat-typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  renderIcons(typing);
  container.appendChild(typing);
}

function hideTypingIndicator(container: HTMLElement | null): void {
  if (!container) return;
  const typing = container.querySelector<HTMLElement>('[data-ref="chat-typing-indicator"]');
  typing?.remove();
}

function updateLiveBadge(statusText: string, isActive = false): void {
  if (!sidebarElement) return;
  let badge = sidebarElement.querySelector<HTMLElement>('[data-ref="chat-live-badge"]');
  if (!badge) {
    const top = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-top"]');
    if (top) {
      badge = document.createElement('div');
      badge.className = 'chat-live-badge';
      badge.setAttribute('data-ref', 'chat-live-badge');
      top.insertAdjacentElement('afterend', badge);
    }
  }
  if (badge) {
    badge.innerHTML = `
      <span class="chat-live-badge__dot ${isActive ? 'is-active' : ''}"></span>
      <span class="chat-live-badge__text">${escapeHtml(statusText)}</span>
      <span class="chat-live-badge__tier">${activeTier}</span>
    `;
  }
}

async function startLiveAgentHandoff(reason: string, messagesList: HTMLElement | null, centerEl: HTMLElement | null): Promise<void> {
  isLiveMode = true;
  activeSessionId = `support_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  activeTier = 'L1';
  activeAgentName = null;
  renderedMessageIds.clear();

  updateLiveBadge('Conectando con agente en vivo... (Nivel L1)', false);

  try {
    await wsService.connect(activeSessionId);

    if (wsUnsubscribe) {
      wsUnsubscribe();
      wsUnsubscribe = null;
    }

    wsUnsubscribe = wsService.subscribe(activeSessionId, (event: any) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'chat_claimed') {
        activeAgentName = event.agentName || 'Agente';
        activeTier = event.tier || activeTier;
        updateLiveBadge(`En vivo con ${activeAgentName}`, true);
        appendSystemBubble(messagesList, `El agente ${activeAgentName} se ha conectado al chat.`);
        scrollToBottom(centerEl);
      } else if (event.type === 'chat_transferred') {
        activeTier = event.tier || activeTier;
        const agentText = event.agentName ? ` por ${event.agentName}` : '';
        updateLiveBadge(activeAgentName ? `En vivo con ${activeAgentName}` : 'Conectando con agente...', Boolean(activeAgentName));
        appendSystemBubble(messagesList, `Caso transferido/escalado a Soporte Nivel ${activeTier}${agentText}.`);
        scrollToBottom(centerEl);
      } else if (event.type === 'chat_closed') {
        updateLiveBadge('Caso cerrado', false);
        appendSystemBubble(messagesList, 'La sesión de soporte en vivo ha concluido.');
        scrollToBottom(centerEl);
        if (sidebarElement) {
          const t = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="input-tech-support"]');
          if (t) t.disabled = true;
          const b = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-tech-support"]');
          if (b) b.disabled = true;
        }
      } else if (event.type === 'chat_message') {
        if (event.id && renderedMessageIds.has(event.id)) {
          return;
        }
        if (event.id) {
          renderedMessageIds.add(event.id);
        }
        if (event.senderType === 'user') {
          appendUserBubble(messagesList, event.message);
          scrollToBottom(centerEl);
        } else if (event.senderType === 'agent') {
          appendAgentBubble(messagesList, event.message, event.senderName || 'Agente de Soporte');
          scrollToBottom(centerEl);
        } else if (event.senderType === 'system') {
          appendSystemBubble(messagesList, event.message);
          scrollToBottom(centerEl);
        }
      }
    });

    const user = currentUser;
    const userName = user?.username || 'Usuario';
    const userEmail = user?.email || 'anonimo@aurora.app';

    const res = await postApi('/api/support/live/chats', {
      sessionId: activeSessionId,
      subject: reason,
      userEmail,
      userName,
    });

    if (res.ok) {
      const data = (await res.json()) as { chat?: { id: string } };
      if (data?.chat?.id) {
        activeChatId = data.chat.id;
      }
      appendSystemBubble(messagesList, 'Solicitud enviada a la cola de agentes. Esperando asignación...');
      scrollToBottom(centerEl);
    }
  } catch {
    appendSystemBubble(messagesList, 'Aviso: No se pudo enlazar en tiempo real. Reintentando...');
  }
}

async function handleSendMessage(): Promise<void> {
  if (!sidebarElement || isPending) return;
  const textarea = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="input-tech-support"]');
  const btnSend = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-tech-support"]');
  const inputBox = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-input-box"]');
  const emptyState = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-empty-state"]');
  const messagesList = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-messages"]');
  const centerEl = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-center"]');

  if (!textarea || !btnSend) return;
  const text = textarea.value.trim();
  if (!text) return;

  isPending = true;
  textarea.value = '';
  adjustTextareaHeight(textarea, inputBox);
  textarea.disabled = true;
  btnSend.disabled = true;

  if (emptyState) emptyState.style.display = 'none';
  if (messagesList) messagesList.style.display = 'flex';

  if (isLiveMode) {
    if (!activeChatId || !activeSessionId) {
      appendSystemBubble(messagesList, 'Conectando con el servicio de soporte. Por favor espera un momento...');
      scrollToBottom(centerEl);
      isPending = false;
      textarea.disabled = false;
      btnSend.disabled = false;
      textarea.focus();
      return;
    }

    const user = currentUser;
    const userName = user?.username || 'Usuario';

    try {
      const res = await postApi(`/api/support/live/chats/${activeChatId}/messages`, {
        message: text,
        senderName: userName,
      });

      if (res.ok) {
        const data = (await res.json()) as { message?: { id: string; message: string } };
        if (data?.message?.id && !renderedMessageIds.has(data.message.id)) {
          renderedMessageIds.add(data.message.id);
          appendUserBubble(messagesList, data.message.message);
          scrollToBottom(centerEl);
        }
      } else {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        const isClosed = res.status === 400 && Boolean(errData.error?.includes('cerrad'));
        if (isClosed) {
          updateLiveBadge('Caso cerrado', false);
          appendSystemBubble(messagesList, 'La sesión de soporte en vivo ha concluido.');
          textarea.disabled = true;
          btnSend.disabled = true;
          scrollToBottom(centerEl);
          isPending = false;
          return;
        }
        appendSystemBubble(messagesList, errData.error || 'No se pudo enviar el mensaje.');
        scrollToBottom(centerEl);
      }
    } catch {
      appendSystemBubble(messagesList, 'Error de red al enviar el mensaje.');
      scrollToBottom(centerEl);
    }

    isPending = false;
    textarea.disabled = false;
    btnSend.disabled = false;
    scrollToBottom(centerEl);
    textarea.focus();
    return;
  }

  appendUserBubble(messagesList, text);
  history.push({ role: 'user', text });
  scrollToBottom(centerEl);

  showTypingIndicator(messagesList, 'Soporte IA');
  scrollToBottom(centerEl);

  try {
    const res = await postApi('/api/support/chat', {
      history: history.slice(-8),
      message: text,
    });

    hideTypingIndicator(messagesList);

    if (res.ok) {
      const data = (await res.json()) as {
        awaitingReason?: boolean;
        reason?: string;
        reply?: string;
        requiresHandoff?: boolean;
        success?: boolean;
      };
      const reply = data.reply || 'He recibido tu mensaje, pero no pude generar una respuesta en este momento.';
      history.push({ role: 'assistant', text: reply });
      appendAgentBubble(messagesList, reply, 'Soporte IA');

      if (data.requiresHandoff) {
        const reason = data.reason || text;
        void startLiveAgentHandoff(reason, messagesList, centerEl);
      }
    } else {
      appendAgentBubble(
        messagesList,
        'Ha ocurrido un inconveniente al conectar con el servicio de soporte. Por favor, intenta de nuevo en unos instantes.',
        'Soporte IA'
      );
    }
  } catch {
    hideTypingIndicator(messagesList);
    appendAgentBubble(
      messagesList,
      'No se pudo establecer conexión con el servidor. Revisa tu conexión a internet e intenta nuevamente.',
      'Soporte IA'
    );
  } finally {
    isPending = false;
    textarea.disabled = false;
    btnSend.disabled = false;
    scrollToBottom(centerEl);
    textarea.focus();
  }
}

function bindGlobalEvents(): void {
  if (isBound) return;
  isBound = true;

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isTechSupportOpen) {
      closeTechSupportSidebar();
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!isTechSupportOpen || !sidebarElement) return;
    const target = e.target as Node;
    const trigger = document.querySelector('[data-ref="btn-menu-tech-support"]');
    if (trigger?.contains(target)) return;
    const panel = sidebarElement.querySelector('[data-ref="tech-support-panel"]');
    if (panel && !panel.contains(target)) {
      closeTechSupportSidebar();
    }
  });
}

export function createTechSupportSidebar(): HTMLElement {
  if (sidebarElement) {
    return sidebarElement;
  }

  const aside = document.createElement('aside');
  aside.className = 'chat-sidebar';
  aside.setAttribute('data-ref', 'tech-support-sidebar');
  aside.innerHTML = `
    <div class="chat-panel" data-ref="tech-support-panel">
      <div class="chat-panel__top" data-ref="tech-support-top">
        <span class="chat-panel__title" data-ref="tech-support-title" data-i18n="nav.tech_support">${t('nav.tech_support', 'Soporte técnico')}</span>
        <button type="button" class="component-button component-button--icon-only component-button--h32" data-ref="btn-close-tech-support" data-tooltip="Cerrar" data-i18n-tooltip="common.close" data-i18n-aria="common.close" aria-label="Cerrar">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
        </button>
      </div>
      <div class="chat-panel__center" data-ref="tech-support-center">
        <div class="chat-empty-state" data-ref="tech-support-empty-state">
          <div class="chat-empty-state__icon" data-ref="tech-support-empty-icon">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#support_agent"></use></svg>
          </div>
          <div class="chat-empty-state__title" data-ref="tech-support-empty-title" data-i18n="nav.tech_support">${t('nav.tech_support', 'Soporte técnico')}</div>
          <p class="chat-empty-state__desc" data-ref="tech-support-empty-desc" data-i18n="tech_support_panel.empty_desc">${t('tech_support_panel.empty_desc', 'Canal de asistencia y soporte técnico en vivo.')}</p>
        </div>
        <div class="chat-messages" data-ref="tech-support-messages" style="display: none;"></div>
      </div>
      <div class="chat-panel__bottom" data-ref="tech-support-bottom">
        <div class="chat-pill-input" data-ref="tech-support-input-box">
          <textarea class="chat-pill-input__field" data-ref="input-tech-support" data-i18n-placeholder="tech_support_panel.input_placeholder" placeholder="${t('tech_support_panel.input_placeholder', 'Escribe tu consulta...')}" rows="1" maxlength="2000"></textarea>
          <button type="button" class="component-button component-button--icon-only chat-pill-input__btn" data-ref="btn-send-tech-support" data-tooltip="Enviar mensaje" data-i18n-tooltip="tech_support_panel.send_btn" data-i18n-aria="tech_support_panel.send_btn" aria-label="Enviar mensaje">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#send"></use></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  translateElement(aside);
  renderIcons(aside);

  const btnClose = aside.querySelector<HTMLElement>('[data-ref="btn-close-tech-support"]');
  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeTechSupportSidebar();
  });

  const textarea = aside.querySelector<HTMLTextAreaElement>('[data-ref="input-tech-support"]');
  const btnSend = aside.querySelector<HTMLElement>('[data-ref="btn-send-tech-support"]');
  const inputBox = aside.querySelector<HTMLElement>('[data-ref="tech-support-input-box"]');
  const centerEl = aside.querySelector<HTMLElement>('[data-ref="tech-support-center"]');

  btnSend?.addEventListener('click', (e) => {
    e.preventDefault();
    void handleSendMessage();
  });

  textarea?.addEventListener('input', () => {
    adjustTextareaHeight(textarea, inputBox);
  });

  textarea?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  });

  centerEl?.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('a.chat-link');
    if (target) {
      const href = target.getAttribute('href');
      if (href && href.startsWith('/')) {
        e.preventDefault();
        closeTechSupportSidebar();
        navigate(href);
      }
    }
  });

  bindGlobalEvents();
  sidebarElement = aside;
  return aside;
}

export function openTechSupportSidebar(): void {
  const sidebar = createTechSupportSidebar();
  const host = document.querySelector<HTMLElement>('.layout-content') || document.querySelector<HTMLElement>('[data-ref="app"]') || document.body;
  if (!sidebar.parentElement || sidebar.parentElement !== host) {
    host.appendChild(sidebar);
  }
  sidebar.classList.add('is-active');
  isTechSupportOpen = true;

  const textarea = sidebar.querySelector<HTMLTextAreaElement>('[data-ref="input-tech-support"]');
  setTimeout(() => {
    textarea?.focus();
  }, 100);
}

export function closeTechSupportSidebar(): void {
  if (sidebarElement) {
    sidebarElement.classList.remove('is-active');
  }
  isTechSupportOpen = false;
}

export function toggleTechSupportSidebar(forceState?: boolean): void {
  const shouldOpen = forceState !== undefined ? forceState : !isTechSupportOpen;
  if (shouldOpen) {
    openTechSupportSidebar();
  } else {
    closeTechSupportSidebar();
  }
}
