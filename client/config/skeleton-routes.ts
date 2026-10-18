import { AUTH_SKELETON_TEMPLATE, HOME_SKELETON_TEMPLATE, NOT_FOUND_SKELETON_TEMPLATE, UPGRADE_SKELETON_TEMPLATE } from './skeleton-templates.js';

export function getSkeletonTemplateForRouteId(routeId: string): string {
  switch (routeId) {
    case 'home':
    case 'pdf-to-jpg':
    case 'pdf-to-word':
    case 'pdf-to-powerpoint':
    case 'pdf-to-excel':
    case 'pdf-to-pdfa':
    case 'compress-pdf':
    case 'repair-pdf':
    case 'ocr-pdf':
    case 'summarize-pdf':
    case 'translate-pdf':
      return HOME_SKELETON_TEMPLATE;
    case 'upgrade':
      return UPGRADE_SKELETON_TEMPLATE;
    case 'login':
    case 'register':
    case 'register-stage2':
    case 'register-stage3':
    case 'auth-forgot-password':
    case 'auth-reset-password':
      return AUTH_SKELETON_TEMPLATE;
    case 'not-found':
      return NOT_FOUND_SKELETON_TEMPLATE;
    default:
      return HOME_SKELETON_TEMPLATE;
  }
}

export function createSkeletonElement(routeId: string): HTMLElement {
  const templateHtml = getSkeletonTemplateForRouteId(routeId);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = templateHtml.trim();
  return (tempDiv.firstElementChild as HTMLElement) || tempDiv;
}
