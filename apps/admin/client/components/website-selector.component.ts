import { fetchAccessibleWebsites, getCachedWebsites, getIsGlobalScope, getSelectedWebsiteId, setSelectedWebsiteId, WebsiteItem } from '../services/website.service.js';

export class WebsiteSelectorComponent {
  private abortController: AbortController | null = null;
  private container: HTMLElement | null = null;
  private isOpen: boolean = false;

  constructor() {
    this.handleTriggerClick = this.handleTriggerClick.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleOptionClick = this.handleOptionClick.bind(this);
  }

  public async init(container: HTMLElement): Promise<void> {
    this.container = container;
    this.abortController = new AbortController();
    await fetchAccessibleWebsites();
    this.render();
    this.bindEvents();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isOpen = false;
  }

  private render(): void {
    if (!this.container) return;

    const websites = getCachedWebsites();
    const isGlobal = getIsGlobalScope();
    const selectedId = getSelectedWebsiteId();

    let activeName = 'Aurora PDF';
    let activeColor = '#e11d48';

    if (selectedId === '*' && isGlobal) {
      activeName = 'Todas las webs (Global)';
      activeColor = '#6366f1';
    } else {
      const match = websites.find((w) => w.id === selectedId);
      if (match) {
        activeName = match.name;
        activeColor = match.accent_color;
      } else if (websites.length > 0) {
        activeName = websites[0].name;
        activeColor = websites[0].accent_color;
      }
    }

    const canSwitch = websites.length > 1 || isGlobal;

    let optionsHtml = '';
    if (isGlobal) {
      optionsHtml += `
        <button type="button" class="website-selector__option ${selectedId === '*' ? 'is-active' : ''}" data-ref="opt-website-all" data-website-id="*">
          <span class="website-selector__badge" data-ref="badge-opt-all" style="background-color: #6366f1;"></span>
          <span class="website-selector__option-text" data-ref="text-opt-all">Todas las webs (Global)</span>
        </button>
      `;
    }

    for (const site of websites) {
      const isActive = site.id === selectedId;
      optionsHtml += `
        <button type="button" class="website-selector__option ${isActive ? 'is-active' : ''}" data-ref="opt-website-${site.id}" data-website-id="${site.id}">
          <span class="website-selector__badge" data-ref="badge-opt-${site.id}" style="background-color: ${site.accent_color};"></span>
          <div class="website-selector__option-info" data-ref="info-opt-${site.id}">
            <span class="website-selector__option-name" data-ref="name-opt-${site.id}">${site.name}</span>
            <span class="website-selector__option-role" data-ref="role-opt-${site.id}">${site.role}</span>
          </div>
        </button>
      `;
    }

    this.container.innerHTML = `
      <div class="website-selector ${canSwitch ? 'has-dropdown' : 'is-single'}" data-ref="admin-website-selector">
        <button type="button" class="website-selector__trigger" data-ref="btn-website-selector-trigger" ${!canSwitch ? 'disabled' : ''}>
          <span class="website-selector__badge" data-ref="active-website-indicator" style="background-color: ${activeColor};"></span>
          <div class="website-selector__meta" data-ref="active-website-meta">
            <span class="website-selector__label" data-ref="active-website-label">Portal Activo</span>
            <span class="website-selector__title" data-ref="active-website-name">${activeName}</span>
          </div>
          ${canSwitch ? '<svg class="component-icon website-selector__arrow" data-ref="website-selector-arrow" aria-hidden="true"><use href="/icons.svg#chevron-down"></use></svg>' : ''}
        </button>
        <div class="website-selector__dropdown is-hidden" data-ref="website-selector-dropdown">
          <div class="website-selector__list" data-ref="website-options-list">
            ${optionsHtml}
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container || !this.abortController) return;
    const { signal } = this.abortController;

    const trigger = this.container.querySelector<HTMLElement>('[data-ref="btn-website-selector-trigger"]');
    if (trigger) {
      trigger.addEventListener('click', this.handleTriggerClick, { signal });
    }

    const options = this.container.querySelectorAll<HTMLElement>('[data-website-id]');
    options.forEach((opt) => {
      opt.addEventListener('click', this.handleOptionClick, { signal });
    });

    document.addEventListener('click', this.handleDocumentClick, { signal });
  }

  private handleTriggerClick(e: MouseEvent): void {
    e.stopPropagation();
    this.toggleDropdown(!this.isOpen);
  }

  private handleDocumentClick(e: MouseEvent): void {
    if (!this.container) return;
    const target = e.target as Node;
    if (!this.container.contains(target)) {
      this.toggleDropdown(false);
    }
  }

  private handleOptionClick(e: MouseEvent): void {
    const target = (e.currentTarget as HTMLElement);
    const siteId = target.getAttribute('data-website-id');
    if (siteId) {
      setSelectedWebsiteId(siteId);
      this.toggleDropdown(false);
      this.render();
      this.bindEvents();
    }
  }

  private toggleDropdown(open: boolean): void {
    this.isOpen = open;
    const dropdown = this.container?.querySelector<HTMLElement>('[data-ref="website-selector-dropdown"]');
    const arrow = this.container?.querySelector<HTMLElement>('[data-ref="website-selector-arrow"]');
    if (dropdown) {
      if (open) {
        dropdown.classList.remove('is-hidden');
      } else {
        dropdown.classList.add('is-hidden');
      }
    }
    if (arrow) {
      if (open) {
        arrow.classList.add('is-rotated');
      } else {
        arrow.classList.remove('is-rotated');
      }
    }
  }
}
