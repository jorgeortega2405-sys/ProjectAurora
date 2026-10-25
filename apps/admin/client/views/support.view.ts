import { hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { adminWsService } from '../services/websocket.service.js';
import { ViewController } from '../types/common.types.js';
import { debounce, DropdownController, escapeHtml, setupDropdown } from '../utils/dom.util.js';
import { getFallbackTierColor } from '../utils/tier.util.js';

export interface AdminChatSummary {
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  closed_at: string | null;
  created_at: string;
  feedback_comment?: string | null;
  id: string;
  last_message?: string;
  message_count?: number;
  rated_at?: string | null;
  rating?: number | null;
  session_id: string;
  status: 'pending' | 'active' | 'closed';
  subject: string;
  tier: 'L1' | 'L2' | 'L3';
  updated_at: string;
  user_avatar_url?: string | null;
  user_email: string;
  user_id: string | null;
  user_name: string;
  user_tier?: string | null;
}

export interface AdminChatMessage {
  chat_id: string;
  created_at: string;
  id: string;
  message: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: 'user' | 'agent' | 'system';
}

export class LiveSupportController implements ViewController {
  private abortController: AbortController | null = null;
  private activeChat: AdminChatSummary | null = null;
  private approvedMessageText: string | null = null;
  private chatMessages: AdminChatMessage[] = [];
  private chats: AdminChatSummary[] = [];
  private container: HTMLElement;
  private currentSearch = '';
  private currentStatus = 'all';
  private currentTier = 'all';
  private isRefiningMessage = false;
  private isSoundEnabled = true;
  private notifiedChatCreatedIds = new Set<string>();
  private renderedMessageIds = new Set<string>();
  private soundNewChat: HTMLAudioElement | null = null;
  private soundNewMessage: HTMLAudioElement | null = null;
  private tierDropdown: DropdownController | null = null;
  private wsChatUnsubscribe: (() => void) | null = null;
  private wsGlobalUnsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.initAudio();
    renderIcons(this.container);
    this.setupSearch();
    this.setupFilters();
    this.setupChatListDelegation();
    this.setupChatActions();
    this.setupTransferModal();
    this.setupPresence();
    this.setupAuditModal();
    this.setupRatingsModal();
    this.setupWebSocket();
    await this.loadChats();
    await this.loadAgentPresence();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.wsGlobalUnsubscribe) {
      this.wsGlobalUnsubscribe();
      this.wsGlobalUnsubscribe = null;
    }
    if (this.wsChatUnsubscribe) {
      this.wsChatUnsubscribe();
      this.wsChatUnsubscribe = null;
    }
    if (this.tierDropdown) {
      this.tierDropdown.destroy();
      this.tierDropdown = null;
    }
    this.approvedMessageText = null;
    this.isRefiningMessage = false;
    this.soundNewChat = null;
    this.soundNewMessage = null;
    this.notifiedChatCreatedIds.clear();
    this.renderedMessageIds.clear();
  }

  private initAudio(): void {
    this.isSoundEnabled = true;

    try {
      this.soundNewChat = new Audio('/sounds/support-new-chat.wav');
      this.soundNewChat.volume = 0.35;
      this.soundNewMessage = new Audio('/sounds/support-new-message.wav');
      this.soundNewMessage.volume = 0.3;
    } catch {
      this.soundNewChat = null;
      this.soundNewMessage = null;
    }
  }

  private playNotificationSound(type: 'chat' | 'message'): void {
    if (!this.isSoundEnabled) return;
    try {
      const audio = type === 'chat' ? this.soundNewChat : this.soundNewMessage;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    } catch {}
  }

  private setupWebSocket(): void {
    if (this.wsGlobalUnsubscribe) {
      this.wsGlobalUnsubscribe();
      this.wsGlobalUnsubscribe = null;
    }

    void adminWsService.connect('admin_support');

    this.wsGlobalUnsubscribe = adminWsService.subscribe('admin_support', (event: any) => {
      if (!event || typeof event !== 'object') return;

      if (event.type === 'chat_created') {
        const eventChatId = event.chatId || event.sessionId;
        if (eventChatId && (this.notifiedChatCreatedIds.has(eventChatId) || this.chats.some((c) => c.id === eventChatId))) {
          return;
        }
        if (eventChatId) {
          this.notifiedChatCreatedIds.add(eventChatId);
        }
        toast.info(`Nuevo chat de soporte: ${event.userName || 'Usuario'} (Nivel ${event.tier || 'L1'})`);
        this.playNotificationSound('chat');
        void this.loadChats();
      } else if (event.type === 'chat_claimed' || event.type === 'chat_transferred' || event.type === 'chat_closed') {
        void this.loadChats();
        if (this.activeChat && this.activeChat.id === event.chatId) {
          if (event.status) this.activeChat.status = event.status;
          if (event.tier) this.activeChat.tier = event.tier;
          if (event.agentName) this.activeChat.assigned_agent_name = event.agentName;
          this.renderChatHeader();
        }
      } else if (event.type === 'agent_presence_updated') {
        void this.loadAgentPresence();
      }
    });
  }

  private setupSearch(): void {
    const signal = this.abortController?.signal;
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="support-search-input"]');
    const btnClear = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    const btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-chats"]');

    btnToggleSearch?.addEventListener(
      'click',
      () => {
        searchToolbar?.classList.toggle('is-hidden');
        if (searchToolbar && !searchToolbar.classList.contains('is-hidden')) {
          searchInput?.focus();
        }
      },
      { signal }
    );

    btnRefresh?.addEventListener(
      'click',
      () => {
        void this.loadChats();
      },
      { signal }
    );

    const onSearchChange = debounce(() => {
      this.currentSearch = searchInput?.value.trim() || '';
      if (btnClear) {
        btnClear.style.display = this.currentSearch ? 'flex' : 'none';
      }
      void this.loadChats();
    }, 300);

    searchInput?.addEventListener('input', onSearchChange, { signal });

    btnClear?.addEventListener(
      'click',
      () => {
        if (searchInput) searchInput.value = '';
        this.currentSearch = '';
        if (btnClear) btnClear.style.display = 'none';
        void this.loadChats();
      },
      { signal }
    );
  }

  private setupFilters(): void {
    const signal = this.abortController?.signal;
    const tabButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="tab-status-"]');
    const tierWrapper =
      this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-support-tier"]') ||
      this.container.querySelector<HTMLElement>('[data-ref="wrapper-tier-filter"]');
    const tierSearchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-support-tier"]');
    const tierList = this.container.querySelector<HTMLElement>('[data-ref="list-support-tiers"]');
    const tierEmpty = this.container.querySelector<HTMLElement>('[data-ref="empty-support-tiers"]');

    tabButtons.forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          tabButtons.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          this.currentStatus = btn.getAttribute('data-status') || 'all';
          void this.loadChats();
        },
        { signal }
      );
    });

    if (tierSearchInput && tierList) {
      tierSearchInput.addEventListener(
        'input',
        () => {
          const query = tierSearchInput.value.toLowerCase().trim();
          let matchCount = 0;
          const items = tierList.querySelectorAll<HTMLButtonElement>('.menu-item');
          items.forEach((item) => {
            const text = item.textContent?.toLowerCase() || '';
            const match = !query || text.includes(query);
            item.style.display = match ? 'flex' : 'none';
            if (match) matchCount++;
          });
          if (tierEmpty) {
            tierEmpty.style.display = matchCount === 0 ? 'block' : 'none';
          }
          this.tierDropdown?.update();
        },
        { signal }
      );
    }

    if (tierWrapper) {
      this.tierDropdown = setupDropdown(tierWrapper, {
        onSelect: (val) => {
          this.currentTier = val || 'all';
          void this.loadChats();
        },
      });
    }
  }

  private async loadChats(): Promise<void> {
    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="support-count-badge"]');
    const container = this.container.querySelector<HTMLElement>('[data-ref="support-chats-container"]');
    const emptyList = this.container.querySelector<HTMLElement>('[data-ref="support-empty-list"]');

    try {
      const params = new URLSearchParams();
      if (this.currentStatus !== 'all') params.set('status', this.currentStatus);
      if (this.currentTier !== 'all') params.set('tier', this.currentTier);
      if (this.currentSearch) params.set('search', this.currentSearch);

      const res = await fetch(`/api/admin/support/chats?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Error al consultar lista de chats');
      }

      const data = (await res.json()) as { chats?: AdminChatSummary[] };
      this.chats = data.chats || [];

      if (countBadge) {
        countBadge.textContent = String(this.chats.length);
      }

      if (container && emptyList) {
        if (this.chats.length === 0) {
          container.innerHTML = '';
          emptyList.style.display = 'block';
        } else {
          emptyList.style.display = 'none';
          this.renderChatList(container);
        }
      }
    } catch {
      toast.error('Error al cargar lista de chats de soporte.');
    }
  }

  private renderChatList(container: HTMLElement): void {
    container.innerHTML = this.chats
      .map((chat) => {
        const isSelected = this.activeChat?.id === chat.id;
        const statusLabel =
          chat.status === 'active'
            ? 'Activo'
            : chat.status === 'pending'
            ? 'Pendiente'
            : 'Cerrado';

        const ratingBadge = chat.rating
          ? `<span class="component-badge component-badge--sm">★ ${chat.rating}</span>`
          : '';

        const lastMsg = chat.last_message || chat.subject || 'Sin mensajes';

        return `
          <div class="support-chat-card ${isSelected ? 'is-selected' : ''}" data-ref="chat-card-${escapeHtml(chat.id)}" data-chat-item="${escapeHtml(chat.id)}" style="padding: 10px 12px; border: 1px solid ${isSelected ? 'var(--text-primary)' : 'var(--border-color)'}; border-radius: var(--radius-md, 8px); background: ${isSelected ? 'var(--bg-hover)' : 'var(--bg-surface)'}; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${escapeHtml(chat.user_name)}</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                ${ratingBadge}
                <span class="component-badge component-badge--sm">${statusLabel}</span>
                <span class="component-badge component-badge--sm">${escapeHtml(chat.tier)}</span>
              </div>
            </div>
            <div style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(lastMsg)}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; color: var(--text-tertiary);">
              <span>${chat.assigned_agent_name ? `Agente: ${escapeHtml(chat.assigned_agent_name)}` : 'Sin asignar'}</span>
              <span>${this.formatTime(chat.created_at)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    renderIcons(container);
  }

  private setupChatListDelegation(): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="support-chats-container"]');
    listContainer?.addEventListener(
      'click',
      (e) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-chat-item]');
        if (!target) return;
        const id = target.getAttribute('data-chat-item');
        const selected = this.chats.find((c) => c.id === id);
        if (selected) {
          void this.selectChat(selected);
        }
      },
      { signal: this.abortController?.signal }
    );
  }

  private async selectChat(chat: AdminChatSummary): Promise<void> {
    this.activeChat = chat;
    this.approvedMessageText = null;
    this.isRefiningMessage = false;
    this.resetQualityBanners();
    this.renderedMessageIds.clear();

    const noSelection = this.container.querySelector<HTMLElement>('[data-ref="support-no-selection"]');
    const activeChatEl = this.container.querySelector<HTMLElement>('[data-ref="support-active-chat"]');

    if (noSelection) noSelection.style.display = 'none';
    if (activeChatEl) activeChatEl.style.display = 'flex';

    const cards = this.container.querySelectorAll<HTMLElement>('[data-chat-item]');
    cards.forEach((c) => {
      const isCurrent = c.getAttribute('data-chat-item') === chat.id;
      c.classList.toggle('is-selected', isCurrent);
      c.style.borderColor = isCurrent ? 'var(--text-primary)' : 'var(--border-color)';
      c.style.background = isCurrent ? 'var(--bg-hover)' : 'var(--bg-surface)';
    });

    this.renderChatHeader();

    if (this.wsChatUnsubscribe) {
      this.wsChatUnsubscribe();
      this.wsChatUnsubscribe = null;
    }

    this.wsChatUnsubscribe = adminWsService.subscribe(chat.session_id, (event: any) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'chat_message') {
        const isUser = event.senderType === 'user';
        this.appendMessageBubble({
          chat_id: chat.id,
          created_at: event.createdAt || new Date().toISOString(),
          id: event.id || `msg-${Date.now()}`,
          message: event.message,
          sender_id: event.senderId || null,
          sender_name: event.senderName || (isUser ? 'Usuario' : 'Agente'),
          sender_type: event.senderType || 'user',
        });
        if (isUser) {
          this.playNotificationSound('message');
        }
      }
    });

    await this.loadMessages(chat.id);
  }

  private renderChatHeader(): void {
    if (!this.activeChat) return;

    const avatarRingEl = this.container.querySelector<HTMLElement>('[data-ref="support-header-avatar-ring"]');
    const avatarImgEl = this.container.querySelector<HTMLImageElement>('[data-ref="support-header-avatar-img"]');
    const userNameEl = this.container.querySelector<HTMLElement>('[data-ref="support-header-user"]');
    const statusBadge = this.container.querySelector<HTMLElement>('[data-ref="support-header-status-badge"]');
    const tierBadge = this.container.querySelector<HTMLElement>('[data-ref="support-header-tier-badge"]');
    const emailEl = this.container.querySelector<HTMLElement>('[data-ref="support-header-email"]');
    const subjectEl = this.container.querySelector<HTMLElement>('[data-ref="support-header-subject"]');
    const btnClaim = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-claim-chat"]');
    const btnTransfer = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-transfer"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-chat"]');
    const input = this.container.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      '[data-ref="ai-chat-input"], [data-ref="support-agent-input"]'
    );
    const btnSend = this.container.querySelector<HTMLButtonElement>(
      '[data-ref="btn-send-message"], [data-ref="btn-send-agent-message"]'
    );
    const hintEl = this.container.querySelector<HTMLElement>('[data-ref="support-input-hint"]');

    const avatarUrl = this.activeChat.user_avatar_url || `/api/avatar?name=${encodeURIComponent(this.activeChat.user_name || 'user')}`;
    const tierColor = getFallbackTierColor(this.activeChat.user_tier || this.activeChat.tier);

    if (avatarRingEl) {
      avatarRingEl.style.setProperty('--avatar-tier-bg', tierColor);
      avatarRingEl.style.setProperty('--tier-border-color', tierColor);
    }
    if (avatarImgEl) {
      avatarImgEl.src = avatarUrl;
      avatarImgEl.alt = this.activeChat.user_name;
      avatarImgEl.onerror = () => {
        avatarImgEl.src = `/api/avatar?name=${encodeURIComponent(this.activeChat?.user_name || 'user')}`;
      };
    }

    if (userNameEl) userNameEl.textContent = this.activeChat.user_name;
    if (emailEl) emailEl.textContent = this.activeChat.user_email;
    if (subjectEl) subjectEl.textContent = this.activeChat.subject;

    if (statusBadge) {
      statusBadge.removeAttribute('style');
      statusBadge.textContent =
        this.activeChat.status === 'active'
          ? 'Activo'
          : this.activeChat.status === 'pending'
          ? 'Pendiente'
          : 'Cerrado';
      if (this.activeChat.rating) {
        statusBadge.textContent = `${statusBadge.textContent} • ★ ${this.activeChat.rating}/5`;
        if (this.activeChat.feedback_comment) {
          statusBadge.setAttribute('data-tooltip', `Calificación: ${this.activeChat.rating}/5 - "${this.activeChat.feedback_comment}"`);
        }
      }
    }

    if (tierBadge) {
      tierBadge.removeAttribute('style');
      tierBadge.textContent = this.activeChat.tier;
    }

    const isActive = this.activeChat.status === 'active';

    if (input) {
      input.disabled = !isActive;
      if (this.activeChat.status === 'pending') {
        input.placeholder = 'Debes tomar el caso antes de responder...';
      } else if (this.activeChat.status === 'closed') {
        input.placeholder = 'Este caso ha sido cerrado (solo lectura).';
      } else {
        input.placeholder = 'Escribe una respuesta para el usuario...';
      }
    }

    if (btnSend) {
      btnSend.disabled = !isActive;
    }

    if (hintEl) {
      if (this.activeChat.status === 'pending') {
        hintEl.style.display = 'block';
        hintEl.style.background = '#000000';
        hintEl.style.color = '#ffffff';
        hintEl.textContent = 'Caso pendiente de asignación. Haz clic en "Tomar caso" para responder.';
      } else if (this.activeChat.status === 'closed') {
        hintEl.style.display = 'block';
        hintEl.style.background = '#000000';
        hintEl.style.color = '#ffffff';
        hintEl.textContent = 'Este caso ha sido cerrado y marcado como resuelto. No se permiten nuevos mensajes.';
      } else {
        hintEl.style.display = 'none';
        hintEl.textContent = '';
      }
    }

    const canManage = hasPermission('admin:support:manage');

    if (btnClaim) {
      btnClaim.style.display =
        canManage && this.activeChat.status === 'pending' ? 'inline-flex' : 'none';
    }

    if (btnTransfer) {
      btnTransfer.style.display =
        canManage && this.activeChat.status !== 'closed' ? 'inline-flex' : 'none';
    }

    if (btnClose) {
      btnClose.style.display =
        canManage && this.activeChat.status !== 'closed' ? 'inline-flex' : 'none';
    }
  }

  private async loadMessages(chatId: string): Promise<void> {
    const feed = this.container.querySelector<HTMLElement>('[data-ref="support-messages-feed"]');
    if (!feed) return;

    try {
      const loadingEl = document.createElement('div');
      loadingEl.setAttribute('data-ref', 'support-loading-messages');
      loadingEl.style.cssText = 'padding: 20px; text-align: center; color: var(--text-tertiary); font-size: 12px;';
      loadingEl.textContent = 'Cargando mensajes...';
      feed.innerHTML = '';
      feed.appendChild(loadingEl);

      const res = await fetch(`/api/admin/support/chats/${chatId}/messages`);
      if (!res.ok) throw new Error('Error al cargar mensajes');

      const data = (await res.json()) as { messages?: AdminChatMessage[] };
      if (this.activeChat?.id !== chatId) return;

      this.chatMessages = data.messages || [];
      loadingEl.remove();

      for (const msg of this.chatMessages) {
        this.appendMessageBubble(msg);
      }
    } catch {
      if (this.activeChat?.id === chatId) {
        feed.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-danger, #ef4444); font-size: 12px;">Error al cargar historial del chat.</div>';
      }
    }
  }

  private appendMessageBubble(msg: AdminChatMessage): void {
    const feed = this.container.querySelector<HTMLElement>('[data-ref="support-messages-feed"]');
    if (!feed) return;

    if (msg.id && this.renderedMessageIds.has(msg.id)) {
      return;
    }
    if (msg.id) {
      this.renderedMessageIds.add(msg.id);
    }

    const div = document.createElement('div');

    if (msg.sender_type === 'system') {
      div.className = 'chat-message chat-message--system';
      div.setAttribute('data-ref', 'support-msg-system');
      div.textContent = msg.message;
      div.style.alignSelf = 'center';
      div.style.background = 'transparent';
      div.style.color = 'var(--text-tertiary)';
      div.style.fontSize = '11px';
      div.style.padding = '4px 10px';
      div.style.borderRadius = '12px';
      div.style.border = '1px dashed var(--border-color)';
    } else if (msg.sender_type === 'agent') {
      div.className = 'chat-message chat-message--agent';
      div.setAttribute('data-ref', 'support-msg-agent');
      div.style.alignSelf = 'flex-end';
      div.style.background = '#000000';
      div.style.color = '#ffffff';
      div.style.borderRadius = '12px 12px 2px 12px';
      div.style.padding = '8px 12px';
      div.style.maxWidth = '75%';
      div.style.fontSize = '13px';
      div.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; opacity: 0.85; margin-bottom: 2px;">${escapeHtml(msg.sender_name)}</div>
        <div style="line-height: 1.4;">${escapeHtml(msg.message)}</div>
      `;
    } else {
      div.className = 'chat-message chat-message--user';
      div.setAttribute('data-ref', 'support-msg-user');
      div.style.alignSelf = 'flex-start';
      div.style.background = '#ffffff';
      div.style.border = '1px solid var(--border-color)';
      div.style.color = 'var(--text-primary)';
      div.style.borderRadius = '12px 12px 12px 2px';
      div.style.padding = '8px 12px';
      div.style.maxWidth = '75%';
      div.style.fontSize = '13px';
      div.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px;">${escapeHtml(msg.sender_name)}</div>
        <div style="line-height: 1.4;">${escapeHtml(msg.message)}</div>
      `;
    }

    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  private resetQualityBanners(): void {
    const offensiveBanner = this.container.querySelector<HTMLElement>('[data-ref="support-offensive-error"]');
    const refinementBanner = this.container.querySelector<HTMLElement>('[data-ref="support-refinement-info"]');
    const input = this.container.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      '[data-ref="ai-chat-input"], [data-ref="support-agent-input"]'
    );
    if (offensiveBanner) {
      offensiveBanner.style.display = 'none';
      offensiveBanner.classList.add('is-hidden');
    }
    if (refinementBanner) {
      refinementBanner.style.display = 'none';
      refinementBanner.classList.add('is-hidden');
    }
    if (input) {
      input.style.borderColor = '';
    }
  }

  private setupChatActions(): void {
    const signal = this.abortController?.signal;
    const btnClaim = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-claim-chat"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-chat"]');
    const btnSend = this.container.querySelector<HTMLButtonElement>(
      '[data-ref="btn-send-message"], [data-ref="btn-send-agent-message"]'
    );
    const input = this.container.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      '[data-ref="ai-chat-input"], [data-ref="support-agent-input"]'
    );
    const inputBox = this.container.querySelector<HTMLElement>('[data-ref="chat-input-box"]');
    const btnAttach = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-attach-files"]');
    const menuAttach = this.container.querySelector<HTMLElement>('[data-ref="menu-attach-options"]');
    const btnAttachDevice = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-attach-device"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="ai-file-input"]');
    const offensiveBanner = this.container.querySelector<HTMLElement>('[data-ref="support-offensive-error"]');
    const offensiveText = this.container.querySelector<HTMLElement>('[data-ref="support-offensive-error-text"]');
    const refinementBanner = this.container.querySelector<HTMLElement>('[data-ref="support-refinement-info"]');
    const sendLabel = this.container.querySelector<HTMLElement>('[data-ref="support-send-label"]');

    const adjustInputHeight = () => {
      if (!input || !inputBox) return;
      input.style.height = 'auto';
      const newHeight = Math.min(Math.max(input.scrollHeight, 20), 120);
      input.style.height = `${newHeight}px`;
      if (newHeight > 24 || input.value.includes('\n')) {
        inputBox.classList.add('is-multiline');
      } else {
        inputBox.classList.remove('is-multiline');
      }
    };

    btnAttach?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!menuAttach) return;
        const isOpen = menuAttach.style.display === 'flex';
        menuAttach.style.display = isOpen ? 'none' : 'flex';
        btnAttach.setAttribute('aria-expanded', String(!isOpen));
      },
      { signal }
    );

    btnAttachDevice?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (menuAttach) menuAttach.style.display = 'none';
        btnAttach?.setAttribute('aria-expanded', 'false');
        fileInput?.click();
      },
      { signal }
    );

    fileInput?.addEventListener(
      'change',
      () => {
        if (fileInput.files && fileInput.files.length > 0) {
          toast.info(`Adjuntado: ${fileInput.files[0].name}`);
        }
      },
      { signal }
    );

    document.addEventListener(
      'click',
      (e) => {
        if (menuAttach && menuAttach.style.display === 'flex' && !btnAttach?.contains(e.target as Node) && !menuAttach.contains(e.target as Node)) {
          menuAttach.style.display = 'none';
          btnAttach?.setAttribute('aria-expanded', 'false');
        }
      },
      { signal }
    );

    btnClaim?.addEventListener(
      'click',
      async () => {
        if (!this.activeChat) return;
        try {
          btnClaim.disabled = true;
          const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/claim`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Error al tomar el caso');
          const data = (await res.json()) as { chat?: AdminChatSummary };
          if (data.chat) {
            this.activeChat = data.chat;
            toast.success('Has tomado este caso de soporte con éxito.');
            this.renderChatHeader();
            void this.loadChats();
            void this.loadMessages(this.activeChat.id);
            input?.focus();
          }
        } catch {
          toast.error('No se pudo tomar el caso.');
        } finally {
          btnClaim.disabled = false;
        }
      },
      { signal }
    );

    btnClose?.addEventListener(
      'click',
      async () => {
        if (!this.activeChat) return;
        const confirmed = window.confirm('¿Confirmas que deseas cerrar y dar por resuelto este caso de soporte?');
        if (!confirmed) return;

        try {
          btnClose.disabled = true;
          const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/close`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Error al cerrar el caso');
          const data = (await res.json()) as { chat?: AdminChatSummary };
          if (data.chat) {
            this.activeChat = data.chat;
            toast.success('Caso de soporte cerrado.');
            this.renderChatHeader();
            void this.loadChats();
            void this.loadMessages(this.activeChat.id);
          }
        } catch {
          toast.error('No se pudo cerrar el caso.');
        } finally {
          btnClose.disabled = false;
        }
      },
      { signal }
    );

    const sendMessage = async () => {
      if (!this.activeChat || !input || this.activeChat.status !== 'active' || this.isRefiningMessage) return;
      const text = input.value.trim();
      if (!text) return;

      if (this.approvedMessageText !== null && this.approvedMessageText === text) {
        input.value = '';
        input.style.height = '';
        inputBox?.classList.remove('is-multiline');
        input.disabled = true;
        if (btnSend) btnSend.disabled = true;
        this.approvedMessageText = null;
        this.resetQualityBanners();
        if (sendLabel) sendLabel.textContent = 'Enviar';

        try {
          const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/messages`, {
            body: JSON.stringify({ message: text }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });
          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
            if (errData.error?.includes('cerrado') || errData.error?.includes('cerrada')) {
              if (this.activeChat) this.activeChat.status = 'closed';
              this.renderChatHeader();
              void this.loadChats();
            }
            if (errData.reason && offensiveBanner && offensiveText) {
              offensiveBanner.style.display = 'block';
              offensiveBanner.classList.remove('is-hidden');
              offensiveText.textContent = errData.reason;
              input.value = text;
              input.style.borderColor = 'var(--color-error, #ef4444)';
            }
            throw new Error(errData.error || 'Error al persistir mensaje');
          }
          const data = (await res.json()) as { message?: AdminChatMessage };
          if (data?.message) {
            this.appendMessageBubble(data.message);
          }
        } catch {
          toast.error('Error al enviar el mensaje de soporte.');
        } finally {
          if (this.activeChat && this.activeChat.status === 'active') {
            input.disabled = false;
            if (btnSend) btnSend.disabled = false;
          }
          input.focus();
        }
        return;
      }

      this.isRefiningMessage = true;
      input.disabled = true;
      if (btnSend) btnSend.disabled = true;
      if (sendLabel) sendLabel.textContent = 'Corrigiendo con IA...';
      this.resetQualityBanners();

      try {
        const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/refine-message`, {
          body: JSON.stringify({ message: text }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!res.ok) {
          throw new Error('Error al evaluar calidad del mensaje');
        }

        const data = (await res.json()) as {
          isOffensive?: boolean;
          reason?: string | null;
          refinedMessage?: string | null;
        };

        if (data.isOffensive) {
          this.approvedMessageText = null;
          if (offensiveBanner && offensiveText) {
            offensiveBanner.style.display = 'block';
            offensiveBanner.classList.remove('is-hidden');
            offensiveText.textContent = data.reason || 'El mensaje contiene expresiones ofensivas o inadecuadas. Debes corregirlo antes de enviarlo.';
          }
          input.style.borderColor = 'var(--color-error, #ef4444)';
          toast.warning('Mensaje bloqueado: contiene contenido ofensivo o inapropiado.');
        } else {
          const polished = data.refinedMessage || text;
          input.value = polished;
          adjustInputHeight();
          this.approvedMessageText = polished;
          input.style.borderColor = '';
          if (refinementBanner) {
            refinementBanner.style.display = 'flex';
            refinementBanner.classList.remove('is-hidden');
          }
          toast.info('Mensaje corregido y formalizado con IA. Haz clic en Enviar para despacharlo.');
        }
      } catch {
        toast.error('Error al procesar la revisión de calidad con IA.');
      } finally {
        this.isRefiningMessage = false;
        if (sendLabel) sendLabel.textContent = 'Enviar';
        if (this.activeChat && this.activeChat.status === 'active') {
          input.disabled = false;
          if (btnSend) btnSend.disabled = false;
        }
        input.focus();
      }
    };

    btnSend?.addEventListener('click', () => void sendMessage(), { signal });
    input?.addEventListener(
      'keydown',
      (e: Event) => {
        const evt = e as KeyboardEvent;
        if (evt.key === 'Enter' && !evt.shiftKey) {
          evt.preventDefault();
          void sendMessage();
        }
      },
      { signal }
    );

    input?.addEventListener(
      'input',
      () => {
        adjustInputHeight();
        if (this.approvedMessageText !== null && input.value !== this.approvedMessageText) {
          this.approvedMessageText = null;
          if (refinementBanner) {
            refinementBanner.style.display = 'none';
            refinementBanner.classList.add('is-hidden');
          }
        }
        if (offensiveBanner && !offensiveBanner.classList.contains('is-hidden')) {
          offensiveBanner.style.display = 'none';
          offensiveBanner.classList.add('is-hidden');
          input.style.borderColor = '';
        }
      },
      { signal }
    );
  }

  private setupTransferModal(): void {
    const signal = this.abortController?.signal;
    const btnOpen = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-transfer"]');
    const modalBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-transfer-backdrop"]');
    const btnCloseModal = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-transfer-modal"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-transfer"]');
    const btnConfirm = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-transfer"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="transfer-notes-input"]');

    const openModal = () => {
      if (!modalBackdrop || !this.activeChat) return;
      modalBackdrop.style.display = 'flex';
      const radios = modalBackdrop.querySelectorAll<HTMLInputElement>('input[name="target-tier"]');
      radios.forEach((r) => {
        r.checked = r.value !== this.activeChat?.tier;
      });
      if (notesInput) notesInput.value = '';
    };

    const closeModal = () => {
      if (modalBackdrop) modalBackdrop.style.display = 'none';
    };

    btnOpen?.addEventListener('click', openModal, { signal });
    btnCloseModal?.addEventListener('click', closeModal, { signal });
    btnCancel?.addEventListener('click', closeModal, { signal });

    btnConfirm?.addEventListener(
      'click',
      async () => {
        if (!this.activeChat || !modalBackdrop) return;
        const selectedRadio = modalBackdrop.querySelector<HTMLInputElement>('input[name="target-tier"]:checked');
        const targetTier = selectedRadio?.value;

        if (!targetTier || !['L1', 'L2', 'L3'].includes(targetTier)) {
          toast.warning('Por favor selecciona el nivel de soporte de destino.');
          return;
        }

        const notes = notesInput?.value.trim() || undefined;

        try {
          if (btnConfirm) btnConfirm.disabled = true;
          const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/transfer`, {
            body: JSON.stringify({ notes, tier: targetTier }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });

          if (!res.ok) throw new Error('Error al transferir caso');
          const data = (await res.json()) as { chat?: AdminChatSummary };

          if (data.chat) {
            this.activeChat = data.chat;
            toast.success(`Caso transferido y escalado a Nivel ${targetTier} con éxito.`);
            closeModal();
            this.renderChatHeader();
            void this.loadChats();
            void this.loadMessages(this.activeChat.id);
          }
        } catch {
          toast.error('Error al transferir el caso de soporte.');
        } finally {
          if (btnConfirm) btnConfirm.disabled = false;
        }
      },
      { signal }
    );
  }

  private setupPresence(): void {
    const signal = this.abortController?.signal;
    const btnTrigger = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-support-presence"]');
    const dropdownMenu = this.container.querySelector<HTMLElement>('[data-ref="dropdown-backdrop-support-presence"]');
    const options = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="opt-presence-"]');

    btnTrigger?.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        if (dropdownMenu) {
          const isOpen = dropdownMenu.style.display === 'block';
          dropdownMenu.style.display = isOpen ? 'none' : 'block';
        }
      },
      { signal }
    );

    document.addEventListener(
      'click',
      (e) => {
        if (dropdownMenu && !dropdownMenu.contains(e.target as Node) && e.target !== btnTrigger) {
          dropdownMenu.style.display = 'none';
        }
      },
      { signal }
    );

    options.forEach((opt) => {
      opt.addEventListener(
        'click',
        async () => {
          const val = opt.getAttribute('data-value');
          if (val) {
            if (dropdownMenu) dropdownMenu.style.display = 'none';
            await this.setAgentPresence(val);
          }
        },
        { signal }
      );
    });
  }

  private async loadAgentPresence(): Promise<void> {
    try {
      const res = await fetch('/api/admin/support/presence');
      if (!res.ok) return;
      const data = (await res.json()) as { myPresence?: { status: string } | null; presences?: any[] };
      const status = data.myPresence?.status || 'offline';
      this.updatePresenceVisuals(status);
    } catch {
      // ignore
    }
  }

  private async setAgentPresence(status: string): Promise<void> {
    try {
      const res = await fetch('/api/admin/support/presence', {
        body: JSON.stringify({ status }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!res.ok) {
        toast.error('No se pudo actualizar el estado de disponibilidad.');
        return;
      }
      this.updatePresenceVisuals(status);
      toast.success(`Estado actualizado a: ${this.getPresenceLabel(status)}`);
    } catch {
      toast.error('Error de red al actualizar disponibilidad.');
    }
  }

  private updatePresenceVisuals(status: string): void {
    const dot = this.container.querySelector<HTMLElement>('[data-ref="presence-dot-indicator"]');
    const text = this.container.querySelector<HTMLElement>('[data-ref="presence-status-text"]');

    const colors: Record<string, string> = {
      available: '#10b981',
      away: '#f59e0b',
      busy: '#ef4444',
      offline: '#9ca3af',
    };

    if (dot) {
      dot.style.background = colors[status] || '#9ca3af';
    }
    if (text) {
      text.textContent = this.getPresenceLabel(status);
    }
  }

  private getPresenceLabel(status: string): string {
    const labels: Record<string, string> = {
      available: 'Disponible',
      away: 'Ausente',
      busy: 'Ocupado',
      offline: 'No disponible',
    };
    return labels[status] || 'No disponible';
  }

  private setupAuditModal(): void {
    const signal = this.abortController?.signal;
    const btnOpen = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-audit"]');
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-audit-backdrop"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-audit-modal"]');
    const btnDismiss = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-dismiss-audit"]');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    btnOpen?.addEventListener(
      'click',
      async () => {
        if (!this.activeChat || !modal) return;
        modal.style.display = 'flex';

        const subjectEl = modal.querySelector<HTMLElement>('[data-ref="audit-chat-subject"]');
        const tierEl = modal.querySelector<HTMLElement>('[data-ref="audit-current-tier"]');
        const idEl = modal.querySelector<HTMLElement>('[data-ref="audit-chat-id"]');
        const userEl = modal.querySelector<HTMLElement>('[data-ref="audit-chat-user"]');
        const feed = modal.querySelector<HTMLElement>('[data-ref="audit-timeline-feed"]');

        if (subjectEl) subjectEl.textContent = this.activeChat.subject;
        if (tierEl) tierEl.textContent = this.activeChat.tier;
        if (idEl) idEl.textContent = this.activeChat.id;
        if (userEl) userEl.textContent = `${this.activeChat.user_name} (${this.activeChat.user_email})`;

        if (feed) {
          feed.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">Consultando registros inmutables en Cassandra...</div>';
        }

        try {
          const res = await fetch(`/api/admin/support/chats/${this.activeChat.id}/audit`);
          if (!res.ok) throw new Error('Error al consultar auditoría');
          const data = (await res.json()) as {
            auditTrail?: any[];
            immutableMessages?: any[];
            transfers?: any[];
          };

          if (feed) {
            feed.innerHTML = '';
            const events = Array.isArray(data.auditTrail) ? data.auditTrail : [];
            const transfers = Array.isArray(data.transfers) ? data.transfers : [];

            if (events.length === 0 && transfers.length === 0) {
              feed.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No hay eventos registrados en Cassandra para este caso.</div>';
              return;
            }

            const combined = [...events];
            for (const t of transfers) {
              if (!combined.some((e) => e.eventType === 'transferred' && e.payload?.toTier === t.toTier)) {
                combined.push({
                  actorName: t.transferredByName,
                  actorType: 'agent',
                  auditId: t.transferId,
                  currentTier: t.toTier,
                  eventTime: t.timestamp,
                  eventType: 'transferred',
                  payload: { fromTier: t.fromTier, notes: t.notes, reason: t.reason, toTier: t.toTier },
                });
              }
            }

            combined.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

            for (const ev of combined) {
              const card = document.createElement('div');
              card.className = 'audit-event-card';
              card.setAttribute('data-ref', 'audit-event-card');
              card.style.cssText = 'padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); display: flex; flex-direction: column; gap: 4px; font-size: 12px;';

              let title = `Evento: ${ev.eventType}`;
              let details = '';
              const timeStr = new Date(ev.eventTime).toLocaleString();

              if (ev.eventType === 'created') {
                title = `Caso Creado (${ev.currentTier || 'L1'})`;
                details = `Iniciado por ${escapeHtml(ev.actorName)} para atención de soporte.`;
              } else if (ev.eventType === 'claimed') {
                title = 'Caso Tomado por Agente';
                details = `El agente ${escapeHtml(ev.actorName)} tomó la conversación para soporte activo.`;
              } else if (ev.eventType === 'transferred') {
                const toT = ev.payload?.toTier || ev.currentTier || 'L2';
                const fromT = ev.payload?.fromTier || 'L1';
                title = `Escalación Multinivel: ${fromT} → ${toT}`;
                const reasonText = ev.payload?.notes || ev.payload?.reason || 'Sin observaciones adicionales';
                details = `Transferido por ${escapeHtml(ev.actorName)}. Motivo: ${escapeHtml(reasonText)}`;
              } else if (ev.eventType === 'closed') {
                title = 'Caso Cerrado y Resuelto';
                details = `Concluido formalmente por ${escapeHtml(ev.actorName)}.`;
              } else if (ev.eventType === 'rated') {
                const rVal = ev.payload?.rating || '5';
                const comm = ev.payload?.comment ? ` — «${escapeHtml(ev.payload.comment)}»` : '';
                title = `Calificación de Usuario: ${rVal} ★`;
                details = `Evaluación registrada de forma inmutable${comm}`;
              }

              card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: var(--text-primary); font-size: 12.5px;">${title}</strong>
                  <span style="font-size: 11px; color: var(--text-tertiary);">${timeStr}</span>
                </div>
                <div style="color: var(--text-secondary); font-size: 11.5px;">${details}</div>
              `;
              feed.appendChild(card);
            }
          }
        } catch {
          if (feed) {
            feed.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--color-error); font-size: 13px;">Fallo al conectar con el cluster de Cassandra.</div>';
          }
        }
      },
      { signal }
    );

    btnClose?.addEventListener('click', closeModal, { signal });
    btnDismiss?.addEventListener('click', closeModal, { signal });
  }

  private setupRatingsModal(): void {
    const signal = this.abortController?.signal;
    const btnOpen = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-ratings"]');
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-ratings-backdrop"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-ratings-modal"]');
    const btnDismiss = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-dismiss-ratings"]');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    btnOpen?.addEventListener(
      'click',
      async () => {
        if (!modal) return;
        modal.style.display = 'flex';

        const avgEl = modal.querySelector<HTMLElement>('[data-ref="ratings-avg-number"]');
        const countEl = modal.querySelector<HTMLElement>('[data-ref="ratings-total-count"]');
        const barsEl = modal.querySelector<HTMLElement>('[data-ref="ratings-breakdown-bars"]');
        const listEl = modal.querySelector<HTMLElement>('[data-ref="ratings-feed-list"]');

        if (listEl) {
          listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">Cargando calificaciones y métricas...</div>';
        }

        try {
          const res = await fetch('/api/admin/support/ratings');
          if (!res.ok) throw new Error('Error al consultar calificaciones');
          const data = (await res.json()) as {
            ratings?: any[];
            summary?: {
              averageRating: number;
              starBreakdown: Record<number, number>;
              totalRatings: number;
            };
          };

          const summary = data.summary || {
            averageRating: 5.0,
            starBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            totalRatings: 0,
          };

          if (avgEl) avgEl.textContent = summary.averageRating.toFixed(1);
          if (countEl) countEl.textContent = `${summary.totalRatings} calificaciones`;

          if (barsEl) {
            barsEl.innerHTML = '';
            for (let star = 5; star >= 1; star--) {
              const count = summary.starBreakdown[star] || 0;
              const pct = summary.totalRatings > 0 ? Math.round((count / summary.totalRatings) * 100) : 0;
              const row = document.createElement('div');
              row.className = 'ratings-bar-row';
              row.setAttribute('data-ref', `rating-bar-row-${star}`);
              row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11.5px;';
              row.innerHTML = `
                <span style="width: 38px; color: var(--text-secondary);">${star} ★</span>
                <div style="flex: 1; height: 6px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                  <div style="width: ${pct}%; height: 100%; background: #f59e0b; border-radius: 3px;"></div>
                </div>
                <span style="width: 32px; text-align: right; color: var(--text-tertiary);">${pct}%</span>
              `;
              barsEl.appendChild(row);
            }
          }

          if (listEl) {
            listEl.innerHTML = '';
            const ratings = Array.isArray(data.ratings) ? data.ratings : [];
            if (ratings.length === 0) {
              listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 13px;">Aún no se han recibido calificaciones de usuarios.</div>';
              return;
            }

            for (const r of ratings) {
              const card = document.createElement('div');
              card.className = 'rating-review-card';
              card.setAttribute('data-ref', 'rating-review-card');
              card.style.cssText = 'padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-surface); display: flex; flex-direction: column; gap: 6px; font-size: 12px;';

              const starSymbols = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
              const dateStr = new Date(r.ratedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
              const userStr = r.userName ? escapeHtml(r.userName) : 'Usuario';
              const agentStr = r.agentName ? `Atendido por ${escapeHtml(r.agentName)}` : 'Soporte';
              const commentStr = r.feedbackComment ? `<div style="font-style: italic; color: var(--text-primary); margin-top: 2px;">«${escapeHtml(r.feedbackComment)}»</div>` : '<div style="color: var(--text-tertiary); font-size: 11px;">Sin comentario escrito</div>';

              card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #f59e0b; font-size: 13px; font-weight: 700;">${starSymbols}</span>
                  <span style="font-size: 11px; color: var(--text-tertiary);">${dateStr}</span>
                </div>
                <div style="font-size: 11.5px; color: var(--text-secondary); display: flex; gap: 8px;">
                  <strong>${userStr}</strong>
                  <span>•</span>
                  <span>${agentStr}</span>
                  <span>•</span>
                  <span class="component-badge component-badge--sm">${r.tier || 'L1'}</span>
                </div>
                ${commentStr}
              `;
              listEl.appendChild(card);
            }
          }
        } catch {
          if (listEl) {
            listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--color-error); font-size: 13px;">Error al cargar las calificaciones.</div>';
          }
        }
      },
      { signal }
    );

    btnClose?.addEventListener('click', closeModal, { signal });
    btnDismiss?.addEventListener('click', closeModal, { signal });
  }

  private formatTime(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
}

export async function createLiveSupportView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/support/support.html');
  const controller = new LiveSupportController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
