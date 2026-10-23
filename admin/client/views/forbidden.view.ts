import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';

export class ForbiddenController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.bindEvents();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;
    const btnHome = this.container.querySelector<HTMLElement>('[data-ref="btn-forbidden-home"]');
    btnHome?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/');
      },
      { signal }
    );
  }
}

export async function createForbiddenView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/error/forbidden.html');
  const controller = new ForbiddenController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
