import { getFooterHtml, mountSiteFooter } from '../components/footer.component.js';
import { getApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { setupDropdown, withButtonLoading } from '../utils/dom.util.js';
import { validateEmail } from '../utils/validators.util.js';

interface TicketMessageData {
  createdAt: string;
  id: string;
  message: string;
  senderName: string;
  senderType: 'agent' | 'customer' | 'system';
}

interface TicketDetailsData {
  category: string;
  createdAt: string;
  email: string;
  id: string;
  messages: TicketMessageData[];
  name: string;
  priority: string;
  status: string;
  subject: string;
  ticketNumber: string;
  updatedAt: string;
}

export class ContactController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentTrackingToken: string | null = null;
  private dropdownController: { destroy: () => void } | null = null;
  private footerController: { destroy: () => void } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderFooter();
    this.bindEvents();
    renderIcons(this.container);

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      this.currentTrackingToken = token;
      await this.loadTicket(token);
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.dropdownController) {
      this.dropdownController.destroy();
      this.dropdownController = null;
    }
    if (this.footerController) {
      this.footerController.destroy();
      this.footerController = null;
    }
  }

  private renderFooter(): void {
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="contact-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="contact-form"]');
    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-name"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-email"]');
    const subjectDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-contact-subject"]');
    const subjectInput = this.container.querySelector<HTMLInputElement>('[data-ref="contact-subject"]');
    const subjectText = this.container.querySelector<HTMLElement>('[data-ref="contact-subject-selected-text"]');
    const messageInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="contact-message"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-contact"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-error"]');
    const successBanner = this.container.querySelector<HTMLElement>('[data-ref="contact-success"]');

    if (subjectDropdown) {
      this.dropdownController = setupDropdown(subjectDropdown, {
        onSelect: (val: string, item?: HTMLElement) => {
          if (subjectInput) subjectInput.value = val;
          if (subjectText && item) {
            const text = item.querySelector('.menu-item__text')?.textContent || '';
            subjectText.textContent = text;
          }
        },
      });
    }

    const showError = (msg: string) => {
      if (successBanner) successBanner.style.display = 'none';
      if (errorBanner) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
      }
    };

    const showSuccess = (msg: string) => {
      if (errorBanner) errorBanner.style.display = 'none';
      if (successBanner) {
        successBanner.textContent = msg;
        successBanner.style.display = 'block';
      }
    };

    form?.addEventListener(
      'submit',
      async (e: Event) => {
        e.preventDefault();

        const name = (nameInput?.value || '').trim();
        const email = (emailInput?.value || '').trim();
        const subject = (subjectInput?.value || '').trim();
        const message = (messageInput?.value || '').trim();

        if (name.length < 2) {
          showError('Por favor ingresa tu nombre completo.');
          nameInput?.focus();
          return;
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          showError(emailValidation.error || 'Ingresa un correo electrónico válido.');
          emailInput?.focus();
          return;
        }

        if (!subject) {
          showError('Por favor selecciona el asunto de tu consulta.');
          return;
        }

        if (message.length < 10) {
          showError('Por favor escribe un mensaje de al menos 10 caracteres para entender tu consulta.');
          messageInput?.focus();
          return;
        }

        if (errorBanner) errorBanner.style.display = 'none';

        await withButtonLoading(submitBtn, 'Enviando mensaje...', async () => {
          form.reset();
          if (subjectInput) subjectInput.value = '';
          if (subjectText) subjectText.textContent = 'Selecciona un asunto...';
          showSuccess('¡Tu mensaje ha sido enviado correctamente! Te responderemos a la brevedad posible.');
          showToast('Mensaje enviado con éxito', 'success');
        });
      },
      { signal: this.abortController?.signal }
    );

    this.bindTicketReplyEvent();
  }

  private bindTicketReplyEvent(): void {
    const replyForm = this.container.querySelector<HTMLFormElement>('[data-ref="ticket-reply-form"]');
    const replyTextarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ticket-reply-message"]');
    const replyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-ticket-reply"]');
    const replyError = this.container.querySelector<HTMLElement>('[data-ref="ticket-reply-error"]');
    const replySuccess = this.container.querySelector<HTMLElement>('[data-ref="ticket-reply-success"]');
    const messagesList = this.container.querySelector<HTMLElement>('[data-ref="ticket-messages-list"]');

    replyForm?.addEventListener(
      'submit',
      async (e: Event) => {
        e.preventDefault();
        if (!this.currentTrackingToken) return;

        const message = (replyTextarea?.value || '').trim();
        if (message.length < 2) {
          if (replyError) {
            replyError.textContent = 'Por favor escribe tu mensaje antes de enviar.';
            replyError.style.display = 'block';
          }
          return;
        }

        if (replyError) replyError.style.display = 'none';

        await withButtonLoading(replyBtn, 'Enviando respuesta...', async () => {
          const res = await postApi(`/api/support/tickets/${encodeURIComponent(this.currentTrackingToken!)}/reply`, {
            message,
          });

          const data = (await res.json().catch(() => ({}))) as { error?: string; message?: TicketMessageData };
          if (!res.ok || !data.message) {
            if (replyError) {
              replyError.textContent = data.error || 'No se pudo enviar la respuesta.';
              replyError.style.display = 'block';
            }
            return;
          }

          if (replyTextarea) replyTextarea.value = '';
          if (replySuccess) {
            replySuccess.textContent = 'Tu respuesta ha sido registrada y notificada a soporte.';
            replySuccess.style.display = 'block';
            setTimeout(() => {
              if (replySuccess) replySuccess.style.display = 'none';
            }, 4000);
          }

          if (messagesList) {
            this.appendTicketMessage(data.message, messagesList);
            messagesList.scrollTop = messagesList.scrollHeight;
          }
          showToast('Respuesta enviada', 'success');
        });
      },
      { signal: this.abortController?.signal }
    );
  }

  private async loadTicket(token: string): Promise<void> {
    const formCard = this.container.querySelector<HTMLElement>('[data-ref="contact-card-form"]');
    const ticketCard = this.container.querySelector<HTMLElement>('[data-ref="contact-card-ticket"]');
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="ticket-title"]');
    const numberEl = this.container.querySelector<HTMLElement>('[data-ref="ticket-number"]');
    const badgeEl = this.container.querySelector<HTMLElement>('[data-ref="ticket-status-badge"]');
    const authorEl = this.container.querySelector<HTMLElement>('[data-ref="ticket-author"]');
    const messagesList = this.container.querySelector<HTMLElement>('[data-ref="ticket-messages-list"]');
    const replyForm = this.container.querySelector<HTMLFormElement>('[data-ref="ticket-reply-form"]');
    const closedNotice = this.container.querySelector<HTMLElement>('[data-ref="ticket-closed-notice"]');

    if (formCard) formCard.style.display = 'none';
    if (ticketCard) ticketCard.style.display = 'flex';

    try {
      const res = await getApi(`/api/support/tickets/${encodeURIComponent(token)}`);

      if (!res.ok) {
        if (titleEl) titleEl.textContent = 'Incidencia no encontrada';
        if (numberEl) numberEl.textContent = '#ERROR';
        if (badgeEl) {
          badgeEl.textContent = 'Inválido';
          badgeEl.className = 'contact-ticket-status-badge contact-ticket-status-badge--closed';
        }
        if (replyForm) replyForm.style.display = 'none';
        if (closedNotice) {
          closedNotice.textContent = 'El enlace de seguimiento no es válido o ha expirado.';
          closedNotice.style.display = 'block';
        }
        return;
      }

      const ticket = (await res.json()) as TicketDetailsData;

      if (titleEl) titleEl.textContent = ticket.subject;
      if (numberEl) numberEl.textContent = `#${ticket.ticketNumber}`;
      if (authorEl) authorEl.textContent = `${ticket.name} (${ticket.category})`;

      if (badgeEl) {
        const statusMap: Record<string, { label: string; modifier: string }> = {
          closed: { label: 'Cerrado', modifier: 'closed' },
          in_progress: { label: 'En progreso', modifier: 'waiting' },
          open: { label: 'Abierto', modifier: 'open' },
          resolved: { label: 'Resuelto', modifier: 'resolved' },
          waiting_customer: { label: 'Esperando respuesta', modifier: 'waiting' },
        };
        const mapped = statusMap[ticket.status] || { label: ticket.status, modifier: 'open' };
        badgeEl.textContent = mapped.label;
        badgeEl.className = `contact-ticket-status-badge contact-ticket-status-badge--${mapped.modifier}`;
      }

      if (messagesList) {
        messagesList.innerHTML = '';
        for (const msg of ticket.messages) {
          this.appendTicketMessage(msg, messagesList);
        }
        messagesList.scrollTop = messagesList.scrollHeight;
      }

      if (ticket.status === 'closed') {
        if (replyForm) replyForm.style.display = 'none';
        if (closedNotice) closedNotice.style.display = 'block';
      } else {
        if (replyForm) replyForm.style.display = 'flex';
        if (closedNotice) closedNotice.style.display = 'none';
      }

      renderIcons(ticketCard || this.container);
    } catch {
      if (titleEl) titleEl.textContent = 'Error al cargar la incidencia';
      if (replyForm) replyForm.style.display = 'none';
    }
  }

  private appendTicketMessage(msg: TicketMessageData, container: HTMLElement): void {
    const isCustomer = msg.senderType === 'customer';
    const row = document.createElement('div');
    row.className = `contact-ticket-msg contact-ticket-msg--${isCustomer ? 'customer' : 'agent'}`;
    row.setAttribute('data-ref', `ticket-msg-${msg.id}`);

    const meta = document.createElement('div');
    meta.className = 'contact-ticket-msg__meta';

    const author = document.createElement('span');
    author.className = 'contact-ticket-msg__author';
    author.textContent = isCustomer ? msg.senderName : msg.senderName || 'Soporte Aurora';
    meta.appendChild(author);

    if (!isCustomer) {
      const badge = document.createElement('span');
      badge.className = 'contact-ticket-msg__badge';
      badge.textContent = 'Agente';
      meta.appendChild(badge);
    }

    const date = document.createElement('span');
    date.className = 'contact-ticket-msg__date';
    date.textContent = new Date(msg.createdAt).toLocaleString();
    meta.appendChild(date);

    const bubble = document.createElement('div');
    bubble.className = 'contact-ticket-msg__bubble';
    bubble.textContent = msg.message;

    row.appendChild(meta);
    row.appendChild(bubble);
    container.appendChild(row);
  }
}

export async function createContactView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/contact/contact.html');
  const controller = new ContactController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
