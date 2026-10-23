import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core';

let activeTarget: HTMLElement | null = null;
let currentPopperInstance: PopperInstance | null = null;
let tooltipArrow: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let tooltipText: HTMLElement | null = null;

function createTooltipElement(text: string): { arrow: HTMLElement; content: HTMLElement; el: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.setAttribute('data-ref', 'admin-tooltip');
  el.setAttribute('role', 'tooltip');

  const content = document.createElement('span');
  content.className = 'tooltip__content';
  content.setAttribute('data-ref', 'tooltip-text');
  content.textContent = text;

  const arrow = document.createElement('div');
  arrow.className = 'tooltip__arrow';
  arrow.setAttribute('data-ref', 'tooltip-arrow');
  arrow.setAttribute('data-popper-arrow', '');

  el.appendChild(content);
  el.appendChild(arrow);

  return { arrow, content, el };
}

export function showTooltip(target: HTMLElement | null): void {
  if (!target) return;
  const text = target.getAttribute('data-tooltip');
  if (!text || !text.trim()) {
    hideTooltip();
    return;
  }

  if (activeTarget === target && tooltipEl && tooltipText) {
    if (tooltipText.textContent !== text) {
      tooltipText.textContent = text;
      if (currentPopperInstance) {
        currentPopperInstance.update();
      }
    }
    return;
  }

  hideTooltip();

  activeTarget = target;
  const created = createTooltipElement(text);
  tooltipEl = created.el;
  tooltipText = created.content;
  tooltipArrow = created.arrow;

  document.body.appendChild(tooltipEl);

  const preferredPlacement = (target.getAttribute('data-tooltip-placement') as Placement) || 'right';

  currentPopperInstance = createPopper(target, tooltipEl, {
    modifiers: [
      {
        name: 'offset',
        options: { offset: [0, 8] },
      },
      {
        name: 'preventOverflow',
        options: { padding: 8 },
      },
      {
        name: 'arrow',
        options: { element: tooltipArrow },
      },
    ],
    placement: preferredPlacement,
  });

  requestAnimationFrame(() => {
    if (tooltipEl) {
      tooltipEl.classList.add('is-visible');
    }
  });
}

export function hideTooltip(): void {
  if (currentPopperInstance) {
    currentPopperInstance.destroy();
    currentPopperInstance = null;
  }
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
    tooltipText = null;
    tooltipArrow = null;
  }
  activeTarget = null;
}

export function initTooltips(): void {
  document.addEventListener('mouseover', (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]');
    if (target) {
      showTooltip(target);
    }
  });

  document.addEventListener('mouseout', (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]');
    const related = e.relatedTarget as HTMLElement | null;
    if (target && (!related || !target.contains(related))) {
      hideTooltip();
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]');
    if (target) {
      hideTooltip();
    }
  });
}
