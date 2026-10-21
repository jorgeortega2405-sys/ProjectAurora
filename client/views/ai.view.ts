import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';

export class AiController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

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
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    const btnSend = this.container.querySelector<HTMLElement>('[data-ref="btn-send-message"]');
    const btnNewChat = this.container.querySelector<HTMLElement>('[data-ref="btn-new-chat"]');

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
        this.handleNewChat();
      },
      { signal }
    );
  }

  private handleSend(): void {
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
  }

  private handleNewChat(): void {
    const input = this.container.querySelector<HTMLTextAreaElement>('[data-ref="ai-chat-input"]');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
      input.focus();
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
