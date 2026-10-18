import { navigate } from '../../app-router.js';

export async function createWorkflowsView(): Promise<HTMLElement> {
  navigate('/workflows');
  return document.createElement('div');
}
