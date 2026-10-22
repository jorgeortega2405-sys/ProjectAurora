import { navigate } from '../../app-router.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, deleteApi, escapeHtml, getApi, hasPermission, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { OrganizationDetailsResponse, OrganizationMember } from '../../types/enterprise.types.js';
import { createBannerManager, setupDropdown, withButtonLoading } from '../../utils/dom.util.js';

export class OrganizationMembersViewController implements ViewController {
  private abortController: AbortController | null = null;
  private bannerManager: ReturnType<typeof createBannerManager> | null = null;
  private container: HTMLElement;
  private currentOrg: OrganizationDetailsResponse | null = null;
  private selectedInviteRole = 'ORG_MEMBER';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    translateElement(this.container);
    renderIcons(this.container);

    this.bannerManager = createBannerManager(this.container, {
      errorRef: 'invite-member-error',
      successRef: 'invite-member-success',
    });

    this.bindEvents();
    await this.loadData();
  }

  public destroy(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private bindEvents(): void {
    const btnOpenInvite = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-invite-modal"]');
    btnOpenInvite?.addEventListener('click', () => this.openInviteModal(), { signal: this.abortController?.signal });

    const btnCloseInvite = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-invite-modal"]');
    btnCloseInvite?.addEventListener('click', () => this.closeInviteModal(), { signal: this.abortController?.signal });

    const inviteBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-invite"]');
    inviteBackdrop?.addEventListener('click', (e) => {
      if (e.target === inviteBackdrop) this.closeInviteModal();
    }, { signal: this.abortController?.signal });

    const roleDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-invite-role"]');
    if (roleDropdown) {
      setupDropdown(roleDropdown, {
        isSelect: true,
        onSelect: (val: string) => {
          this.selectedInviteRole = val;
        },
      });
    }

    const inviteForm = this.container.querySelector<HTMLFormElement>('[data-ref="form-invite-member"]');
    inviteForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleInviteMember();
    }, { signal: this.abortController?.signal });
  }

  private openInviteModal(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-invite"]');
    if (!backdrop) return;
    this.bannerManager?.hideAll();
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
    });
    renderIcons(backdrop);
  }

  private closeInviteModal(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-invite"]');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 150);
  }

  private async loadData(): Promise<void> {
    try {
      const resOrg = await getApi(API_ROUTES.organization.me);
      if (!resOrg.ok) {
        navigate('/organization');
        return;
      }
      this.currentOrg = (await resOrg.json()) as OrganizationDetailsResponse;
      await this.loadMembers();
    } catch {
      navigate('/organization');
    }
  }

  private async loadMembers(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="members-table-body"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="members-count-badge"]');
    if (!tbody) return;

    try {
      const res = await getApi(API_ROUTES.organization.members);
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">Error al cargar los miembros.</td></tr>';
        return;
      }

      const data = await res.json();
      const members = (data.members || []) as OrganizationMember[];
      if (badge) badge.textContent = String(members.length);

      if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--text-secondary);">No hay miembros registrados en esta organización.</td></tr>';
        return;
      }

      tbody.innerHTML = members
        .map((m) => {
          const isOwner = m.role === 'ORG_OWNER';
          const isCurrent = currentUser?.id === m.user_id;
          const canDelete = hasPermission(currentUser, 'org:members:remove') && !isOwner && !isCurrent;
          const roleLabel = isOwner ? 'Propietario' : m.role === 'ORG_ADMIN' ? 'Administrador' : 'Miembro';
          const roleBadgeClass = isOwner ? 'component-badge--black' : m.role === 'ORG_ADMIN' ? 'component-badge--brand' : '';
          const nameStr = m.username || m.email || 'Usuario';
          const emailStr = m.email || '';
          const initial = escapeHtml(nameStr.charAt(0).toUpperCase());
          const avatarHtml = `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-surface-secondary); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 13px; color: var(--text-primary);">${initial}</div>`;
          const formattedDate = m.created_at ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(m.created_at)) : '-';

          return `
            <tr data-ref="member-row-${m.id}">
              <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                  ${avatarHtml}
                  <div style="display: flex; flex-direction: column;">
                    <strong style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(nameStr)}</strong>
                    <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(emailStr)}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="component-badge component-badge--sm ${roleBadgeClass}">${roleLabel}</span>
              </td>
              <td>
                <span class="component-badge component-badge--sm" style="color: var(--color-success, #16a34a); background: rgba(22, 163, 74, 0.1);">Activo</span>
              </td>
              <td style="color: var(--text-secondary); font-size: 13px;">${formattedDate}</td>
              <td class="text-right">
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                  ${canDelete ? `
                    <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--danger" data-ref="btn-remove-member-${m.id}" data-id="${m.id}" data-tooltip="Remover miembro" aria-label="Remover miembro">
                      <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      renderIcons(tbody);
      this.bindMemberRowActions(tbody);
    } catch {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">Error de red al consultar miembros.</td></tr>';
    }
  }

  private bindMemberRowActions(tbody: HTMLElement): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="members-page-error"]');

    const removeBtns = tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-remove-member-"]');
    removeBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('¿Estás seguro de que deseas eliminar este miembro de la organización? Perderá acceso a las herramientas empresariales.')) {
          return;
        }

        await withButtonLoading(btn, async () => {
          if (errorBanner) errorBanner.style.display = 'none';
          try {
            const res = await deleteApi(API_ROUTES.organization.removeMember(id));
            if (!res.ok) {
              const err = await res.json();
              if (errorBanner) {
                errorBanner.textContent = err.error || 'No se pudo remover el miembro.';
                errorBanner.style.display = 'block';
              }
              return;
            }
            showToast('Miembro eliminado de la organización', 'success');
            await this.loadMembers();
          } catch {
            if (errorBanner) {
              errorBanner.textContent = 'Error de conexión al eliminar el miembro.';
              errorBanner.style.display = 'block';
            }
          }
        });
      }, { signal: this.abortController?.signal });
    });
  }

  private async handleInviteMember(): Promise<void> {
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-invite-email"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-invite"]');
    const email = emailInput?.value.trim();
    if (!email) return;

    await withButtonLoading(submitBtn, async () => {
      this.bannerManager?.hideAll();
      try {
        const res = await postApi(API_ROUTES.organization.members, {
          email,
          role: this.selectedInviteRole || 'ORG_MEMBER',
        });
        const data = await res.json();
        if (!res.ok) {
          this.bannerManager?.showError(data.error || 'No fue posible enviar la invitación.');
          return;
        }

        if (emailInput) emailInput.value = '';
        showToast('Invitación corporativa enviada con éxito', 'success');
        this.closeInviteModal();
        await this.loadMembers();
      } catch {
        this.bannerManager?.showError('Error de red al procesar la invitación.');
      }
    });
  }
}

export async function createOrganizationMembersView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/organization-members.html');
  const controller = new OrganizationMembersViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
