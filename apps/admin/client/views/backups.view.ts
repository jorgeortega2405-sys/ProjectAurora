import { hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml, withButtonLoading } from '../utils/dom.util.js';

export interface AdminBackupItem {
  checksum_sha256: string | null;
  components: ('mysql' | 'cassandra' | 'minio')[];
  created_at: string;
  filename: string;
  id: string;
  metadata: Record<string, unknown> | null;
  name: string;
  notes: string | null;
  restored_at: string | null;
  s3_bucket: string;
  s3_key: string;
  size_bytes: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AdminSystemStatus {
  cassandra: {
    connected: boolean;
    keyspace: string;
    tables: string[];
  };
  minio: {
    bucket: string;
    connected: boolean;
    objectsCount: number;
  };
  mysql: {
    connected: boolean;
    database: string;
    tablesCount: number;
  };
}

export class BackupsController implements ViewController {
  private abortController: AbortController | null = null;
  private backups: AdminBackupItem[] = [];
  private btnActionDelete: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionDownload: HTMLButtonElement | null = null;
  private btnActionRestore: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private defaultActions: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedBackup: AdminBackupItem | null = null;
  private selectedRestoreBackup: AdminBackupItem | null = null;
  private status: AdminSystemStatus | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    this.setupCreateModal();
    this.setupRestoreModal();
    this.setupTopButtons();
    await Promise.all([this.loadSystemStatus(), this.loadBackups()]);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private setupTopButtons(): void {
    const signal = this.abortController?.signal;
    const btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-backups"]');
    const btnOpenCreate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-create-modal"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="backups-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="backups-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionRestore = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-restore"]');
    this.btnActionDownload = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-download"]');
    this.btnActionDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');

    if (btnOpenCreate) {
      btnOpenCreate.style.display = hasPermission('system:backup:create') ? '' : 'none';
    }

    btnRefresh?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void withButtonLoading(btnRefresh, async () => {
          await Promise.all([this.loadSystemStatus(), this.loadBackups()]);
          toast.success('Lista y métricas de respaldos actualizadas.');
        });
      },
      { signal }
    );

    btnOpenCreate?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.openCreateModal();
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedBackup = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionRestore?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedBackup) {
          this.openRestoreModal(this.selectedBackup);
        }
      },
      { signal }
    );

    this.btnActionDownload?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedBackup) {
          window.open(`/api/admin/backups/${this.selectedBackup.id}/download`, '_blank');
        }
      },
      { signal }
    );

    this.btnActionDelete?.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        if (!this.selectedBackup || !this.btnActionDelete) return;
        const backup = this.selectedBackup;
        const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar la copia de seguridad "${backup.name}"? Esta acción no se puede deshacer.`);
        if (!confirmed) return;

        await withButtonLoading(this.btnActionDelete, async () => {
          try {
            const res = await fetch(`/api/admin/backups/${backup.id}`, { method: 'DELETE' });
            if (!res.ok) {
              throw new Error('Error al eliminar');
            }
            toast.success('Copia de seguridad eliminada exitosamente.');
            this.selectedBackup = null;
            this.backups = this.backups.filter((b) => b.id !== backup.id);
            this.renderBackups(this.backups);
            await this.loadSystemStatus();
          } catch {
            toast.error('No se pudo eliminar la copia de seguridad.');
          }
        });
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.selectedBackup) {
          this.selectedBackup = null;
          this.updateSelectionUi();
        }
      },
      { signal }
    );
  }

  private toggleBackupSelection(item: AdminBackupItem): void {
    if (this.selectedBackup?.id === item.id) {
      this.selectedBackup = null;
    } else {
      this.selectedBackup = item;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedBackup !== null;
    if (this.defaultActions) {
      this.defaultActions.style.display = isSelected ? 'none' : 'flex';
    }
    if (this.selectedActions) {
      this.selectedActions.style.display = isSelected ? 'flex' : 'none';
    }
    if (this.btnActionRestore) {
      this.btnActionRestore.style.display = hasPermission('system:backup:restore') ? '' : 'none';
    }
    if (this.btnActionDelete) {
      this.btnActionDelete.style.display = hasPermission('system:backup:delete') ? '' : 'none';
    }
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="backups-tbody"]');
    if (tbody) {
      this.backups.forEach((b) => {
        const row = tbody.querySelector<HTMLElement>(`[data-ref="row-backup-${b.id}"]`);
        if (row) {
          row.classList.toggle('is-selected', this.selectedBackup?.id === b.id);
        }
      });
    }
  }

  private async loadSystemStatus(): Promise<void> {
    const signal = this.abortController?.signal;
    try {
      const res = await fetch('/api/admin/backups/status', { signal });
      if (!res.ok) return;

      const data = (await res.json()) as { status: AdminSystemStatus; success: boolean };
      if (data.success && data.status) {
        this.status = data.status;
        this.renderSystemStatus(data.status);
      }
    } catch {
      // Estado de red silencioso
    }
  }

  private renderSystemStatus(status: AdminSystemStatus): void {
    const textTablesMysql = this.container.querySelector<HTMLElement>('[data-ref="text-tables-mysql"]');
    const badgeMysql = this.container.querySelector<HTMLElement>('[data-ref="badge-status-mysql"]');
    const textTablesCassandra = this.container.querySelector<HTMLElement>('[data-ref="text-tables-cassandra"]');
    const badgeCassandra = this.container.querySelector<HTMLElement>('[data-ref="badge-status-cassandra"]');
    const textObjectsMinio = this.container.querySelector<HTMLElement>('[data-ref="text-objects-minio"]');
    const badgeMinio = this.container.querySelector<HTMLElement>('[data-ref="badge-status-minio"]');

    if (textTablesMysql) {
      textTablesMysql.textContent = `${status.mysql.tablesCount} tablas activas`;
    }
    if (badgeMysql) {
      badgeMysql.textContent = status.mysql.connected ? 'Conectado' : 'Desconectado';
      badgeMysql.style.backgroundColor = status.mysql.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      badgeMysql.style.color = status.mysql.connected ? '#10b981' : '#ef4444';
    }

    if (textTablesCassandra) {
      textTablesCassandra.textContent = `${status.cassandra.tables.length} tablas activas`;
    }
    if (badgeCassandra) {
      badgeCassandra.textContent = status.cassandra.connected ? 'Conectado' : 'Desconectado';
      badgeCassandra.style.backgroundColor = status.cassandra.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      badgeCassandra.style.color = status.cassandra.connected ? '#10b981' : '#ef4444';
    }

    if (textObjectsMinio) {
      textObjectsMinio.textContent = `${status.minio.objectsCount} objetos en bucket`;
    }
    if (badgeMinio) {
      badgeMinio.textContent = status.minio.connected ? 'Conectado' : 'Desconectado';
      badgeMinio.style.backgroundColor = status.minio.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      badgeMinio.style.color = status.minio.connected ? '#10b981' : '#ef4444';
    }
  }

  private async loadBackups(): Promise<void> {
    const signal = this.abortController?.signal;
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="backups-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="backups-count-badge"]');
    const valBackupsCount = this.container.querySelector<HTMLElement>('[data-ref="val-status-backups-count"]');
    const textLatestBackup = this.container.querySelector<HTMLElement>('[data-ref="text-latest-backup"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="backups-page-error"]');

    try {
      const res = await fetch('/api/admin/backups', { signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar las copias de seguridad.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo consultar el registro de respaldos. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = (await res.json()) as { backups: AdminBackupItem[]; success: boolean };
      this.backups = Array.isArray(data.backups) ? data.backups : [];
      this.selectedBackup = null;
      this.updateSelectionUi();

      if (badge) badge.textContent = String(this.backups.length);
      if (valBackupsCount) valBackupsCount.textContent = `${this.backups.length} Respaldos`;

      if (textLatestBackup) {
        if (this.backups.length > 0) {
          const latestDate = new Date(this.backups[0].created_at);
          textLatestBackup.textContent = `Último: ${latestDate.toLocaleDateString('es-MX')} ${latestDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
          textLatestBackup.textContent = 'Sin copias registradas';
        }
      }

      if (errorBanner) {
        errorBanner.style.display = 'none';
      }

      this.renderBackups(this.backups);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de conexión al cargar copias de seguridad.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar copias de seguridad.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderBackups(items: AdminBackupItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="backups-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="backups-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#save"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay copias de seguridad registradas</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">Crea tu primera copia de seguridad haciendo clic en el botón "Nueva Copia".</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        let dateFormatted = '—';
        try {
          const d = new Date(item.created_at);
          if (!isNaN(d.getTime())) {
            dateFormatted = `${d.toLocaleDateString('es-MX')} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
          }
        } catch {
          dateFormatted = '—';
        }

        let restoredFormatted = '<span class="component-badge component-badge--sm">Nunca</span>';
        if (item.restored_at) {
          try {
            const rd = new Date(item.restored_at);
            if (!isNaN(rd.getTime())) {
              restoredFormatted = `<span class="component-badge component-badge--sm">${rd.toLocaleDateString('es-MX')}</span>`;
            }
          } catch {
            restoredFormatted = '<span class="component-badge component-badge--sm">Nunca</span>';
          }
        }

        const sizeFormatted = this.formatBytes(item.size_bytes);

        const componentsBadges = item.components
          .map((c) => {
            const label = c === 'mysql' ? 'MySQL' : (c === 'cassandra' ? 'Cassandra' : (c === 'minio' ? 'S3/MinIO' : c));
            return `<span class="component-badge component-badge--sm">${escapeHtml(label)}</span>`;
          })
          .join(' ');

        const notesHtml = item.notes
          ? `<span style="font-size: 11.5px; color: var(--text-tertiary); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.notes)}</span>`
          : '';

        const isSelected = this.selectedBackup?.id === item.id;

        return `
          <tr class="is-selectable${isSelected ? ' is-selected' : ''}" data-ref="row-backup-${escapeHtml(item.id)}" data-backup-id="${escapeHtml(item.id)}">
            <td style="padding: 14px 16px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <strong style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">${escapeHtml(item.name)}</strong>
                <span style="font-size: 12px; font-family: monospace; color: var(--text-secondary);">${escapeHtml(item.filename)}</span>
                ${notesHtml}
              </div>
            </td>
            <td style="padding: 14px 16px;">
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${componentsBadges}
              </div>
            </td>
            <td style="padding: 14px 16px; font-size: 13px; color: var(--text-secondary); font-weight: 500;">
              ${sizeFormatted}
            </td>
            <td style="padding: 14px 16px; font-size: 13px; color: var(--text-secondary);">
              ${dateFormatted}
            </td>
            <td style="padding: 14px 16px;">
              ${restoredFormatted}
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
    this.bindRowActions();
  }

  private bindRowActions(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="backups-tbody"]');
    if (!tbody) return;
    const rows = tbody.querySelectorAll<HTMLTableRowElement>('[data-ref^="row-backup-"]');
    rows.forEach((row) => {
      row.addEventListener('click', () => {
        const backupId = row.getAttribute('data-backup-id');
        const backup = this.backups.find((b) => b.id === backupId);
        if (backup) {
          this.toggleBackupSelection(backup);
        }
      });
    });
  }

  private setupCreateModal(): void {
    const signal = this.abortController?.signal;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-create-backdrop"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-create"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-create"]');
    const btnConfirm = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-create"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-create-error"]');

    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-backup-name"]');
    const notesInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-backup-notes"]');
    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-mysql"]');
    const checkCassandra = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-cassandra"]');
    const checkMinio = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-minio"]');

    const closeModal = () => {
      if (backdrop) backdrop.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
    };

    btnClose?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    }, { signal });

    btnCancel?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    }, { signal });

    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    }, { signal });

    btnConfirm?.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        const components: ('mysql' | 'cassandra' | 'minio')[] = [];
        if (checkMysql?.checked) components.push('mysql');
        if (checkCassandra?.checked) components.push('cassandra');
        if (checkMinio?.checked) components.push('minio');

        if (components.length === 0) {
          if (errorEl) {
            errorEl.textContent = 'Debes seleccionar al menos un componente para realizar la copia de seguridad.';
            errorEl.style.display = 'block';
          }
          return;
        }

        if (errorEl) errorEl.style.display = 'none';

        await withButtonLoading(btnConfirm, async () => {
          try {
            const res = await fetch('/api/admin/backups', {
              body: JSON.stringify({
                components,
                name: nameInput?.value.trim() || undefined,
                notes: notesInput?.value.trim() || undefined,
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            });

            if (!res.ok) {
              const errData = (await res.json()) as { error?: string };
              throw new Error(errData.error || 'Error al procesar la copia');
            }

            const data = (await res.json()) as { backup: AdminBackupItem; message?: string };
            toast.success(data.message || 'Copia de seguridad generada y almacenada en S3 exitosamente.');
            closeModal();
            await Promise.all([this.loadBackups(), this.loadSystemStatus()]);
          } catch (err: any) {
            if (errorEl) {
              errorEl.textContent = err?.message || 'Ha ocurrido un error inesperado al procesar la copia.';
              errorEl.style.display = 'block';
            }
          }
        });
      },
      { signal }
    );
  }

  private openCreateModal(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-create-backdrop"]');
    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-backup-name"]');
    const notesInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-backup-notes"]');
    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-mysql"]');
    const checkCassandra = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-cassandra"]');
    const checkMinio = this.container.querySelector<HTMLInputElement>('[data-ref="check-component-minio"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-create-error"]');

    if (nameInput) nameInput.value = '';
    if (notesInput) notesInput.value = '';
    if (checkMysql) checkMysql.checked = true;
    if (checkCassandra) checkCassandra.checked = true;
    if (checkMinio) checkMinio.checked = true;
    if (errorEl) errorEl.style.display = 'none';

    if (backdrop) backdrop.style.display = 'flex';
  }

  private setupRestoreModal(): void {
    const signal = this.abortController?.signal;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-backdrop"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-restore"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-restore"]');
    const btnConfirm = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-restore"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-error"]');

    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-mysql"]');
    const checkCassandra = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-cassandra"]');
    const checkMinio = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-minio"]');

    const closeModal = () => {
      if (backdrop) backdrop.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      this.selectedRestoreBackup = null;
    };

    btnClose?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    }, { signal });

    btnCancel?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    }, { signal });

    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    }, { signal });

    btnConfirm?.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        if (!this.selectedRestoreBackup) return;

        const components: ('mysql' | 'cassandra' | 'minio')[] = [];
        if (checkMysql?.checked) components.push('mysql');
        if (checkCassandra?.checked) components.push('cassandra');
        if (checkMinio?.checked) components.push('minio');

        if (components.length === 0) {
          if (errorEl) {
            errorEl.textContent = 'Debes seleccionar al menos un componente para restaurar.';
            errorEl.style.display = 'block';
          }
          return;
        }

        if (errorEl) errorEl.style.display = 'none';

        await withButtonLoading(btnConfirm, async () => {
          try {
            const res = await fetch(`/api/admin/backups/${this.selectedRestoreBackup!.id}/restore`, {
              body: JSON.stringify({ components }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            });

            if (!res.ok) {
              const errData = (await res.json()) as { error?: string };
              throw new Error(errData.error || 'Error al restaurar');
            }

            const data = (await res.json()) as { message?: string };
            toast.success(data.message || 'Copia de seguridad restaurada exitosamente.');
            closeModal();
            await Promise.all([this.loadBackups(), this.loadSystemStatus()]);
          } catch (err: any) {
            if (errorEl) {
              errorEl.textContent = err?.message || 'Ha ocurrido un error al restaurar la copia de seguridad.';
              errorEl.style.display = 'block';
            }
          }
        });
      },
      { signal }
    );
  }

  private openRestoreModal(backup: AdminBackupItem): void {
    this.selectedRestoreBackup = backup;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-backdrop"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="restore-modal-name"]');
    const filenameEl = this.container.querySelector<HTMLElement>('[data-ref="restore-modal-filename"]');
    const dateEl = this.container.querySelector<HTMLElement>('[data-ref="restore-modal-date"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-error"]');

    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-mysql"]');
    const checkCassandra = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-cassandra"]');
    const checkMinio = this.container.querySelector<HTMLInputElement>('[data-ref="check-restore-minio"]');
    const labelMysql = this.container.querySelector<HTMLElement>('[data-ref="label-restore-mysql"]');
    const labelCassandra = this.container.querySelector<HTMLElement>('[data-ref="label-restore-cassandra"]');
    const labelMinio = this.container.querySelector<HTMLElement>('[data-ref="label-restore-minio"]');

    if (nameEl) nameEl.textContent = backup.name;
    if (filenameEl) filenameEl.textContent = `${backup.filename} (${this.formatBytes(backup.size_bytes)})`;
    if (dateEl) {
      try {
        const d = new Date(backup.created_at);
        dateEl.textContent = `Generado el: ${d.toLocaleString('es-MX')}`;
      } catch {
        dateEl.textContent = backup.created_at;
      }
    }

    const hasMysql = backup.components.includes('mysql');
    const hasCassandra = backup.components.includes('cassandra');
    const hasMinio = backup.components.includes('minio');

    if (checkMysql) checkMysql.checked = hasMysql;
    if (labelMysql) labelMysql.style.display = hasMysql ? 'flex' : 'none';

    if (checkCassandra) checkCassandra.checked = hasCassandra;
    if (labelCassandra) labelCassandra.style.display = hasCassandra ? 'flex' : 'none';

    if (checkMinio) checkMinio.checked = hasMinio;
    if (labelMinio) labelMinio.style.display = hasMinio ? 'flex' : 'none';

    if (errorEl) errorEl.style.display = 'none';
    if (backdrop) backdrop.style.display = 'flex';
  }

  private setupSearchToolbar(): void {
    const signal = this.abortController?.signal;
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="backups-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!searchToolbar) return;
        const isHidden = searchToolbar.classList.contains('is-hidden');
        if (isHidden) {
          searchToolbar.classList.remove('is-hidden');
          searchInput?.focus();
        } else {
          searchToolbar.classList.add('is-hidden');
          if (searchInput) {
            searchInput.value = '';
            this.renderBackups(this.backups);
          }
          if (btnClearSearch) btnClearSearch.style.display = 'none';
        }
      },
      { signal }
    );

    searchInput?.addEventListener(
      'input',
      () => {
        const query = (searchInput.value || '').trim().toLowerCase();
        if (btnClearSearch) {
          btnClearSearch.style.display = query.length > 0 ? 'inline-flex' : 'none';
        }

        if (!query) {
          this.renderBackups(this.backups);
          return;
        }

        const filtered = this.backups.filter((item) => {
          return (
            item.name.toLowerCase().includes(query) ||
            item.filename.toLowerCase().includes(query) ||
            (item.notes && item.notes.toLowerCase().includes(query)) ||
            item.components.some((c) => c.toLowerCase().includes(query))
          );
        });

        this.renderBackups(filtered);
      },
      { signal }
    );

    btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (searchInput) searchInput.value = '';
        btnClearSearch.style.display = 'none';
        this.renderBackups(this.backups);
        searchInput?.focus();
      },
      { signal }
    );
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0 || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

export async function createBackupsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/backups/backups.html');
  const controller = new BackupsController(container);
  await controller.init();
  return container;
}
