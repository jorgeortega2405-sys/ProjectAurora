import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

export class HelpTermsController implements ViewController {
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

export async function createHelpTermsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/help/terms.html');
  const controller = new HelpTermsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
