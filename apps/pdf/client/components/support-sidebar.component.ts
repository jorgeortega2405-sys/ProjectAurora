import { currentUser, getApi, postApi } from '../services/api.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { showToast } from '../services/toast.service.js';
import { wsService } from '../services/websocket.service.js';
import { openModal } from './modal.component.js';

export let isTechSupportOpen = false;

interface ChatHistoryItem {
  role: 'assistant' | 'user';
  text: string;
}

const STORAGE_KEY_CHAT_ID = 'aurora_support_active_chat_id';
const STORAGE_KEY_SESSION_ID = 'aurora_support_session_id';
const STORAGE_KEY_SIDEBAR_OPEN = 'aurora_support_sidebar_open';

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

function showEndChatButton(visible: boolean): void {
  if (!sidebarElement) return;
  const btn = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-end-live-chat"]');
  if (btn) {
    btn.style.display = visible ? 'inline-flex' : 'none';
  }
}

function bindLiveSupportWebSocket(sessionId: string, messagesList: HTMLElement | null, centerEl: HTMLElement | null): void {
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }

  void wsService.connect(sessionId);

  wsUnsubscribe = wsService.subscribe(sessionId, (event: any) => {
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
      const closedChatId = activeChatId;
      const closedAgentName = activeAgentName;
      updateLiveBadge('Caso cerrado', false);
      appendSystemBubble(messagesList, 'La sesión de soporte en vivo ha concluido.');
      scrollToBottom(centerEl);
      showEndChatButton(false);
      if (sidebarElement) {
        const t = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
        if (t) t.disabled = true;
        const b = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');
        if (b) b.disabled = true;
      }
      if (closedChatId) {
        openSupportRatingModal(closedChatId, closedAgentName);
      }
    } else if (event.type === 'agent_presence_updated') {
      void refreshAgentAvailability();
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
}

function promptEndLiveChat(): void {
  if (!activeChatId) return;
  openModal({
    cancelText: 'Continuar en el chat',
    confirmClass: 'component-button--danger',
    confirmText: 'Sí, finalizar',
    description: 'Al finalizar la sesión se dará por concluido el caso y podrás calificar la atención recibida.',
    onConfirm: async () => {
      await finalizeActiveChat();
      return true;
    },
    title: '¿Deseas finalizar la sesión de soporte?',
  });
}

async function finalizeActiveChat(): Promise<void> {
  if (!activeChatId) return;
  const chatIdToRate = activeChatId;
  const agentNameToRate = activeAgentName;

  try {
    await postApi(`/api/support/live/chats/${chatIdToRate}/close`);
  } catch (_) {}

  const messagesList = sidebarElement?.querySelector<HTMLElement>('[data-ref="tech-support-messages"]') || null;
  const centerEl = sidebarElement?.querySelector<HTMLElement>('[data-ref="tech-support-center"]') || null;
  appendSystemBubble(messagesList, 'Has finalizado la sesión de soporte.');
  scrollToBottom(centerEl);
  updateLiveBadge('Caso cerrado', false);
  showEndChatButton(false);

  if (sidebarElement) {
    const t = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
    if (t) t.disabled = true;
    const b = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');
    if (b) b.disabled = true;
  }

  openSupportRatingModal(chatIdToRate, agentNameToRate);
}

export function openSupportRatingModal(chatId: string, agentName: string | null): void {
  let selectedRating = 0;
  const modalBody = document.createElement('div');
  modalBody.className = 'support-rating-modal-body';
  modalBody.setAttribute('data-ref', 'support-rating-modal-body');
  modalBody.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 4px 0;';

  const starsContainer = document.createElement('div');
  starsContainer.className = 'support-rating-stars';
  starsContainer.setAttribute('data-ref', 'support-rating-stars');
  starsContainer.style.cssText = 'display: flex; gap: 8px; justify-content: center;';

  for (let i = 1; i <= 5; i++) {
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'component-button component-button--icon-only';
    starBtn.setAttribute('data-ref', `btn-star-${i}`);
    starBtn.setAttribute('data-rating', String(i));
    starBtn.setAttribute('aria-label', `${i} estrellas`);
    starBtn.style.cssText = 'width: 44px; height: 44px; border: none; background: transparent; cursor: pointer; color: var(--border-color); transition: all 0.15s ease;';
    starBtn.innerHTML = `<svg class="component-icon" style="width: 32px; height: 32px; fill: currentColor;" aria-hidden="true"><use href="/icons.svg#star"></use></svg>`;
    starsContainer.appendChild(starBtn);
  }

  const feedbackField = document.createElement('label');
  feedbackField.className = 'field';
  feedbackField.setAttribute('data-ref', 'field-rating-feedback');
  feedbackField.style.cssText = 'width: 100%;';
  feedbackField.innerHTML = `
    <textarea class="field__input field__input--textarea" data-ref="input-rating-feedback" placeholder=" " rows="3" maxlength="800"></textarea>
    <span class="field__label">Comentarios u observaciones (opcional)</span>
  `;

  const errorBanner = document.createElement('div');
  errorBanner.className = 'banner banner--danger';
  errorBanner.setAttribute('data-ref', 'rating-error-banner');
  errorBanner.style.cssText = 'display: none; width: 100%; font-size: 12.5px;';

  modalBody.appendChild(starsContainer);
  modalBody.appendChild(feedbackField);
  modalBody.appendChild(errorBanner);
  renderIcons(modalBody);

  const updateStarVisuals = (hoverVal: number) => {
    const activeVal = hoverVal || selectedRating;
    const starButtons = starsContainer.querySelectorAll<HTMLButtonElement>('[data-rating]');
    starButtons.forEach((btn) => {
      const r = Number(btn.getAttribute('data-rating') || '0');
      if (r <= activeVal) {
        btn.style.color = '#f59e0b';
        btn.style.transform = 'scale(1.12)';
      } else {
        btn.style.color = 'var(--border-color)';
        btn.style.transform = 'scale(1)';
      }
    });
  };

  starsContainer.addEventListener('mouseover', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rating]');
    if (btn) {
      const val = Number(btn.getAttribute('data-rating') || '0');
      updateStarVisuals(val);
    }
  });

  starsContainer.addEventListener('mouseleave', () => {
    updateStarVisuals(0);
  });

  starsContainer.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rating]');
    if (btn) {
      selectedRating = Number(btn.getAttribute('data-rating') || '0');
      updateStarVisuals(0);
      errorBanner.style.display = 'none';
    }
  });

  openModal({
    bodyHtml: modalBody,
    cancelText: 'Omitir',
    confirmClass: 'component-button--black',
    confirmText: 'Enviar calificación',
    description: agentName
      ? `¿Cómo calificarías la atención recibida por ${agentName}?`
      : '¿Cómo calificarías la atención recibida durante esta sesión?',
    onCancel: () => {
      resetChatToCleanState();
    },
    onConfirm: async () => {
      if (!selectedRating) {
        errorBanner.textContent = 'Por favor selecciona una calificación de 1 a 5 estrellas.';
        errorBanner.style.display = 'block';
        return false;
      }

      const textarea = feedbackField.querySelector<HTMLTextAreaElement>('[data-ref="input-rating-feedback"]');
      const comment = textarea?.value?.trim() || '';

      try {
        await postApi(`/api/support/live/chats/${chatId}/rate`, {
          feedbackComment: comment,
          rating: selectedRating,
        });
        showToast('¡Gracias por tus comentarios! Nos ayudan a mejorar.');
      } catch {
        showToast('Aviso: Tu calificación fue registrada.');
      }

      resetChatToCleanState();
      return true;
    },
    title: 'Califica tu experiencia de soporte',
  });
}

function resetChatToCleanState(): void {
  localStorage.removeItem(STORAGE_KEY_CHAT_ID);
  isLiveMode = false;
  activeChatId = null;
  activeAgentName = null;
  activeTier = 'L1';
  renderedMessageIds.clear();

  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }

  if (sidebarElement) {
    const badge = sidebarElement.querySelector<HTMLElement>('[data-ref="chat-live-badge"]');
    if (badge) badge.remove();

    showEndChatButton(false);

    const textarea = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
    if (textarea) {
      textarea.disabled = false;
      textarea.value = '';
    }
    const btnSend = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');
    if (btnSend) btnSend.disabled = false;

    const emptyState = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-empty-state"]');
    const messagesList = sidebarElement.querySelector<HTMLElement>('[data-ref="tech-support-messages"]');
    if (messagesList) {
      messagesList.innerHTML = '';
      messagesList.style.display = 'none';
    }
    if (emptyState) {
      emptyState.style.display = 'flex';
    }
  }
}

export async function checkAndResumeActiveChat(): Promise<void> {
  const storedSessionId = localStorage.getItem(STORAGE_KEY_SESSION_ID);
  const storedChatId = localStorage.getItem(STORAGE_KEY_CHAT_ID);

  try {
    const url = storedSessionId
      ? `/api/support/live/active-chat?sessionId=${encodeURIComponent(storedSessionId)}`
      : '/api/support/live/active-chat';

    const res = await getApi(url);
    if (!res.ok) return;

    const data = (await res.json()) as {
      chat: {
        assigned_agent_name: string | null;
        id: string;
        session_id: string;
        status: 'active' | 'closed' | 'pending';
        tier: 'L1' | 'L2' | 'L3';
      } | null;
      messages: Array<{
        created_at: string;
        id: string;
        message: string;
        sender_name: string;
        sender_type: 'agent' | 'system' | 'user';
      }>;
      success: boolean;
    };

    if (data.chat && (data.chat.status === 'active' || data.chat.status === 'pending')) {
      const chat = data.chat;
      isLiveMode = true;
      activeChatId = chat.id;
      activeSessionId = chat.session_id;
      activeTier = chat.tier;
      activeAgentName = chat.assigned_agent_name;

      localStorage.setItem(STORAGE_KEY_CHAT_ID, chat.id);
      localStorage.setItem(STORAGE_KEY_SESSION_ID, chat.session_id);

      const sidebar = createTechSupportSidebar();
      const emptyState = sidebar.querySelector<HTMLElement>('[data-ref="tech-support-empty-state"]');
      const messagesList = sidebar.querySelector<HTMLElement>('[data-ref="tech-support-messages"]');
      const centerEl = sidebar.querySelector<HTMLElement>('[data-ref="tech-support-center"]');
      const textarea = sidebar.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
      const btnSend = sidebar.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');

      if (emptyState) emptyState.style.display = 'none';
      if (messagesList) {
        messagesList.style.display = 'flex';
        messagesList.innerHTML = '';
        renderedMessageIds.clear();

        if (Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            renderedMessageIds.add(msg.id);
            if (msg.sender_type === 'user') {
              appendUserBubble(messagesList, msg.message);
            } else if (msg.sender_type === 'agent') {
              appendAgentBubble(messagesList, msg.message, msg.sender_name || 'Agente');
            } else if (msg.sender_type === 'system') {
              appendSystemBubble(messagesList, msg.message);
            }
          }
        }
      }

      if (chat.status === 'active') {
        updateLiveBadge(`En vivo con ${activeAgentName || 'Agente'}`, true);
      } else {
        updateLiveBadge(`Conectando con agente en vivo... (Nivel ${activeTier})`, false);
      }

      if (textarea) textarea.disabled = false;
      if (btnSend) btnSend.disabled = false;
      showEndChatButton(true);
      scrollToBottom(centerEl);

      bindLiveSupportWebSocket(chat.session_id, messagesList, centerEl);

      if (localStorage.getItem(STORAGE_KEY_SIDEBAR_OPEN) === 'true') {
        openTechSupportSidebar();
      }
    } else {
      if (storedChatId) {
        localStorage.removeItem(STORAGE_KEY_CHAT_ID);
      }
    }
  } catch (_) {}
}

export function initTechSupportAutoResume(): void {
  void checkAndResumeActiveChat();
}

async function refreshAgentAvailability(): Promise<void> {
  if (!sidebarElement) return;
  const badge = sidebarElement.querySelector<HTMLElement>('[data-ref="support-online-badge"]');
  const dot = sidebarElement.querySelector<HTMLElement>('[data-ref="support-online-dot"]');
  const text = sidebarElement.querySelector<HTMLElement>('[data-ref="support-online-text"]');
  if (!badge || !dot || !text) return;

  try {
    const res = await getApi('/api/support/live/availability');
    if (!res.ok) return;
    const data = (await res.json()) as { available?: boolean; availableCount?: number };
    badge.style.display = 'inline-flex';
    if (data.available) {
      badge.style.background = 'rgba(16, 185, 129, 0.12)';
      badge.style.color = '#10b981';
      dot.style.background = '#10b981';
      text.textContent = 'Agentes en línea';
    } else {
      badge.style.background = 'rgba(156, 163, 175, 0.15)';
      badge.style.color = 'var(--text-tertiary)';
      dot.style.background = '#9ca3af';
      text.textContent = 'Sin agentes en línea';
    }
  } catch {
    // ignore
  }
}

async function startLiveAgentHandoff(reason: string, messagesList: HTMLElement | null, centerEl: HTMLElement | null): Promise<void> {
  isLiveMode = true;
  activeSessionId = localStorage.getItem(STORAGE_KEY_SESSION_ID) || `support_sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  localStorage.setItem(STORAGE_KEY_SESSION_ID, activeSessionId);
  activeTier = 'L1';
  activeAgentName = null;
  renderedMessageIds.clear();

  let isAvailable = true;
  try {
    const availRes = await getApi('/api/support/live/availability');
    if (availRes.ok) {
      const availData = (await availRes.json()) as { available?: boolean };
      isAvailable = Boolean(availData?.available);
    }
  } catch {
    // ignore
  }

  if (!isAvailable) {
    updateLiveBadge('Agentes no disponibles (En cola)', false);
  } else {
    updateLiveBadge('Conectando con agente en vivo... (Nivel L1)', false);
  }

  bindLiveSupportWebSocket(activeSessionId, messagesList, centerEl);

  try {
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
      const data = (await res.json()) as { chat?: { assigned_agent_name: string | null; id: string; session_id: string; tier: 'L1' | 'L2' | 'L3' } };
      if (data?.chat?.id) {
        activeChatId = data.chat.id;
        activeSessionId = data.chat.session_id;
        activeTier = data.chat.tier || activeTier;
        activeAgentName = data.chat.assigned_agent_name || activeAgentName;
        localStorage.setItem(STORAGE_KEY_CHAT_ID, activeChatId);
        localStorage.setItem(STORAGE_KEY_SESSION_ID, activeSessionId);
      }
      showEndChatButton(true);
      if (!isAvailable) {
        appendSystemBubble(messagesList, 'Aviso: En este momento no hay agentes de soporte disponibles en línea. Tu solicitud ha quedado registrada en cola y te responderemos en cuanto un agente se conecte.');
      } else {
        appendSystemBubble(messagesList, 'Solicitud enviada a la cola de agentes. Esperando asignación...');
      }
      scrollToBottom(centerEl);
    }
  } catch {
    appendSystemBubble(messagesList, 'Aviso: No se pudo enlazar en tiempo real. Reintentando...');
  }
}

async function handleSendMessage(): Promise<void> {
  if (!sidebarElement || isPending) return;
  const textarea = sidebarElement.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
  const btnSend = sidebarElement.querySelector<HTMLButtonElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');
  const inputBox = sidebarElement.querySelector<HTMLElement>('[data-ref="chat-input-box"], [data-ref="tech-support-input-box"]');
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
          const closedChatId = activeChatId;
          const closedAgentName = activeAgentName;
          updateLiveBadge('Caso cerrado', false);
          appendSystemBubble(messagesList, 'La sesión de soporte en vivo ha concluido.');
          showEndChatButton(false);
          textarea.disabled = true;
          btnSend.disabled = true;
          scrollToBottom(centerEl);
          isPending = false;
          if (closedChatId) {
            openSupportRatingModal(closedChatId, closedAgentName);
          }
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
        <div class="chat-panel__top-actions" data-ref="tech-support-top-actions" style="display: flex; align-items: center; gap: 6px;">
          <span class="support-online-badge" data-ref="support-online-badge" style="display: none; align-items: center; gap: 5px; font-size: 11px; padding: 2px 7px; border-radius: 10px; font-weight: 600;">
            <span class="support-online-dot" data-ref="support-online-dot" style="width: 6px; height: 6px; border-radius: 50%;"></span>
            <span data-ref="support-online-text"></span>
          </span>
          <button type="button" class="component-button component-button--ghost component-button--danger component-button--h28" data-ref="btn-end-live-chat" style="display: none; font-size: 11px; padding: 0 8px; font-weight: 600;">Finalizar</button>
          <button type="button" class="component-button component-button--icon-only component-button--h32" data-ref="btn-close-tech-support" data-tooltip="Cerrar" data-i18n-tooltip="common.close" data-i18n-aria="common.close" aria-label="Cerrar">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
          </button>
        </div>
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
        <div class="ai-chat-bottom-dock" data-ref="ai-chat-bottom">
          <div class="ai-staged-tray" data-ref="ai-staged-tray" style="display: none;">
            <div class="ai-staged-list" data-ref="ai-staged-list"></div>
          </div>

          <div class="ai-chat-input-wrapper" data-ref="ai-chat-input-wrapper">
            <input class="ai-hidden-file-input" data-ref="ai-file-input" type="file" multiple="" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt" />

            <div class="chat-pill-input has-attach" data-ref="chat-input-box">
              <div class="ai-dropdown-wrapper ai-attach-dropdown-wrapper" data-ref="ai-attach-dropdown-wrapper">
                <button type="button" class="component-button component-button--icon-only chat-pill-input__attach" data-ref="btn-attach-files" data-tooltip="Adjuntar archivos" aria-label="Adjuntar archivos" aria-haspopup="true" aria-expanded="false">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#attach_file"></use></svg>
                </button>
                <div class="ai-dropdown-menu ai-attach-dropdown-menu" data-ref="menu-attach-options" style="display: none;">
                  <button type="button" class="ai-dropdown-item" data-ref="btn-attach-device">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#upload_file"></use></svg>
                    <span class="ai-dropdown-item__text">Desde este dispositivo</span>
                  </button>
                  <button type="button" class="ai-dropdown-item" data-ref="btn-attach-drive">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#google_drive"></use></svg>
                    <span class="ai-dropdown-item__text">Google Drive</span>
                  </button>
                  <button type="button" class="ai-dropdown-item" data-ref="btn-attach-dropbox">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#dropbox"></use></svg>
                    <span class="ai-dropdown-item__text">Dropbox</span>
                  </button>
                </div>
              </div>
              <textarea class="chat-pill-input__field" data-ref="ai-chat-input" placeholder="${t('tech_support_panel.input_placeholder', 'Escribe tu consulta...')}" data-i18n-placeholder="tech_support_panel.input_placeholder" rows="1" maxlength="2000"></textarea>
              <button type="button" class="component-button component-button--icon-only chat-pill-input__btn" data-ref="btn-send-message" data-tooltip="Enviar mensaje" data-i18n-tooltip="tech_support_panel.send_btn" data-i18n-aria="tech_support_panel.send_btn" aria-label="Enviar mensaje">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#send"></use></svg>
              </button>
            </div>
            <p class="chat-disclaimer" data-ref="chat-disclaimer" data-i18n="ai.disclaimer">Canal seguro de atención y soporte técnico en vivo.</p>
          </div>

          <div class="banner banner--danger ai-chat-banner" data-ref="ai-error-banner" style="display: none;">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#error"></use></svg>
            <span class="banner__text" data-ref="ai-error-text"></span>
          </div>
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

  const btnEndChat = aside.querySelector<HTMLElement>('[data-ref="btn-end-live-chat"]');
  btnEndChat?.addEventListener('click', (e) => {
    e.preventDefault();
    promptEndLiveChat();
  });

  const textarea = aside.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
  const btnSend = aside.querySelector<HTMLElement>('[data-ref="btn-send-message"], [data-ref="btn-send-tech-support"]');
  const inputBox = aside.querySelector<HTMLElement>('[data-ref="chat-input-box"], [data-ref="tech-support-input-box"]');
  const centerEl = aside.querySelector<HTMLElement>('[data-ref="tech-support-center"]');
  const btnAttach = aside.querySelector<HTMLElement>('[data-ref="btn-attach-files"]');
  const menuAttach = aside.querySelector<HTMLElement>('[data-ref="menu-attach-options"]');
  const btnAttachDevice = aside.querySelector<HTMLElement>('[data-ref="btn-attach-device"]');
  const fileInput = aside.querySelector<HTMLInputElement>('[data-ref="ai-file-input"]');

  btnAttach?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!menuAttach) return;
    const isOpen = menuAttach.style.display === 'flex';
    menuAttach.style.display = isOpen ? 'none' : 'flex';
    btnAttach.setAttribute('aria-expanded', String(!isOpen));
  });

  btnAttachDevice?.addEventListener('click', (e) => {
    e.preventDefault();
    if (menuAttach) menuAttach.style.display = 'none';
    btnAttach?.setAttribute('aria-expanded', 'false');
    fileInput?.click();
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      showToast(`Adjuntado: ${fileInput.files[0].name}`, 'info');
    }
  });

  document.addEventListener('click', (e) => {
    if (menuAttach && menuAttach.style.display === 'flex' && !btnAttach?.contains(e.target as Node) && !menuAttach.contains(e.target as Node)) {
      menuAttach.style.display = 'none';
      btnAttach?.setAttribute('aria-expanded', 'false');
    }
  });

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
  void refreshAgentAvailability();
  return aside;
}

export function openTechSupportSidebar(): void {
  localStorage.setItem(STORAGE_KEY_SIDEBAR_OPEN, 'true');
  const sidebar = createTechSupportSidebar();
  const host = document.querySelector<HTMLElement>('.layout-content') || document.querySelector<HTMLElement>('[data-ref="app"]') || document.body;
  if (!sidebar.parentElement || sidebar.parentElement !== host) {
    host.appendChild(sidebar);
  }
  sidebar.classList.add('is-active');
  isTechSupportOpen = true;
  void refreshAgentAvailability();

  if (!isLiveMode) {
    void checkAndResumeActiveChat();
  }

  const textarea = sidebar.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"], [data-ref="input-tech-support"]');
  setTimeout(() => {
    textarea?.focus();
  }, 100);
}

export function closeTechSupportSidebar(): void {
  localStorage.setItem(STORAGE_KEY_SIDEBAR_OPEN, 'false');
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
