import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

export class HelpCookiesController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createHelpCookiesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/help/cookies.html');
  const controller = new HelpCookiesController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
