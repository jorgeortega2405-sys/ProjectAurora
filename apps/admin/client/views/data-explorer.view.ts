import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { debounce, escapeHtml, withButtonLoading } from '../utils/dom.util.js';

export interface ColumnSchemaItem {
  comment?: string;
  dataType: string;
  isClusteringKey?: boolean;
  isNullable: boolean;
  isPartitionKey?: boolean;
  isPrimaryKey: boolean;
  isSensitive: boolean;
  name: string;
}

export interface TableSchemaItem {
  columns: ColumnSchemaItem[];
  comment?: string;
  name: string;
  rowCountEstimate: number;
}

export interface DatabaseSchemaItem {
  engine: string;
  name: string;
  tables: TableSchemaItem[];
  type: 'cassandra' | 'mysql';
}

export interface QueryTemplateItem {
  category: string;
  database: 'cassandra' | 'mysql';
  description: string;
  id: string;
  query: string;
  title: string;
}

export interface QueryHistoryItem {
  database: 'cassandra' | 'mysql';
  durationMs: number;
  id: string;
  query: string;
  rowCount: number;
  status: 'error' | 'success';
  timestamp: string;
}

export class DataExplorerController implements ViewController {
  private abortController: AbortController | null = null;
  private activeDatabase: 'cassandra' | 'mysql' = 'mysql';
  private activeTab: 'history' | 'results' = 'results';
  private cassandraSchema: DatabaseSchemaItem | null = null;
  private container: HTMLElement;
  private currentColumns: string[] = [];
  private currentRows: Record<string, unknown>[] = [];
  private history: QueryHistoryItem[] = [];
  private mysqlSchema: DatabaseSchemaItem | null = null;
  private searchFilter = '';
  private templates: QueryTemplateItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.loadHistoryFromStorage();
    this.bindEvents();
    await Promise.all([
      this.loadSchemas(),
      this.loadTemplates(),
    ]);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private loadHistoryFromStorage(): void {
    try {
      const raw = localStorage.getItem('data_explorer_query_history');
      if (raw) {
        this.history = JSON.parse(raw);
        this.updateHistoryBadge();
      }
    } catch {
      this.history = [];
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem('data_explorer_query_history', JSON.stringify(this.history.slice(0, 30)));
      this.updateHistoryBadge();
    } catch {
      // ignore storage failure
    }
  }

  private updateHistoryBadge(): void {
    const badge = this.container.querySelector<HTMLElement>('[data-ref="badge-history-count"]');
    if (badge) {
      badge.textContent = String(this.history.length);
    }
  }

  private bindEvents(): void {
    const tabMysql = this.container.querySelector<HTMLElement>('[data-ref="tab-select-mysql"]');
    const tabCassandra = this.container.querySelector<HTMLElement>('[data-ref="tab-select-cassandra"]');
    const selectTargetDb = this.container.querySelector<HTMLSelectElement>('[data-ref="select-target-db"]');
    const selectTemplate = this.container.querySelector<HTMLSelectElement>('[data-ref="select-query-template"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-schema"]');
    const btnRun = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-run-query"]');
    const btnClear = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-editor"]');
    const btnRefresh = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-all"]');
    const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="query-textarea"]');

    const tabResults = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-results"]');
    const tabHistory = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-history"]');
    const btnExportCsv = this.container.querySelector<HTMLElement>('[data-ref="btn-export-csv"]');
    const btnExportJson = this.container.querySelector<HTMLElement>('[data-ref="btn-export-json"]');

    tabMysql?.addEventListener('click', () => {
      this.activeDatabase = 'mysql';
      tabMysql.classList.add('is-active');
      tabCassandra?.classList.remove('is-active');
      if (selectTargetDb) selectTargetDb.value = 'mysql';
      this.renderSchemaTree();
    });

    tabCassandra?.addEventListener('click', () => {
      this.activeDatabase = 'cassandra';
      tabCassandra.classList.add('is-active');
      tabMysql?.classList.remove('is-active');
      if (selectTargetDb) selectTargetDb.value = 'cassandra';
      this.renderSchemaTree();
    });

    selectTargetDb?.addEventListener('change', () => {
      const selected = selectTargetDb.value as 'cassandra' | 'mysql';
      this.activeDatabase = selected;
      if (selected === 'mysql') {
        tabMysql?.classList.add('is-active');
        tabCassandra?.classList.remove('is-active');
      } else {
        tabCassandra?.classList.add('is-active');
        tabMysql?.classList.remove('is-active');
      }
      this.renderSchemaTree();
    });

    selectTemplate?.addEventListener('change', () => {
      const templateId = selectTemplate.value;
      if (!templateId) return;
      const found = this.templates.find((t) => t.id === templateId);
      if (found && textarea) {
        textarea.value = found.query;
        this.activeDatabase = found.database;
        if (selectTargetDb) selectTargetDb.value = found.database;
        if (found.database === 'mysql') {
          tabMysql?.classList.add('is-active');
          tabCassandra?.classList.remove('is-active');
        } else {
          tabCassandra?.classList.add('is-active');
          tabMysql?.classList.remove('is-active');
        }
        this.renderSchemaTree();
        textarea.focus();
      }
    });

    searchInput?.addEventListener(
      'input',
      debounce(() => {
        this.searchFilter = searchInput.value.trim().toLowerCase();
        this.renderSchemaTree();
      }, 200)
    );

    btnClear?.addEventListener('click', () => {
      if (textarea) {
        textarea.value = '';
        textarea.focus();
      }
      this.hideError();
    });

    btnRefresh?.addEventListener('click', async () => {
      await Promise.all([this.loadSchemas(), this.loadTemplates()]);
      toast.info('Esquemas y plantillas actualizados.');
    });

    textarea?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (btnRun) {
          void this.executeQuery(btnRun);
        }
      }
    });

    btnRun?.addEventListener('click', () => {
      void this.executeQuery(btnRun);
    });

    tabResults?.addEventListener('click', () => {
      this.switchResultsTab('results');
    });

    tabHistory?.addEventListener('click', () => {
      this.switchResultsTab('history');
    });

    btnExportCsv?.addEventListener('click', () => {
      this.exportCsv();
    });

    btnExportJson?.addEventListener('click', () => {
      this.exportJson();
    });
  }

  private switchResultsTab(tab: 'history' | 'results'): void {
    this.activeTab = tab;
    const tabResults = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-results"]');
    const tabHistory = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-history"]');
    const table = this.container.querySelector<HTMLElement>('[data-ref="results-table"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="results-empty-state"]');
    const historyList = this.container.querySelector<HTMLElement>('[data-ref="history-list"]');

    if (tab === 'results') {
      tabResults?.classList.add('is-active');
      tabHistory?.classList.remove('is-active');
      historyList?.classList.add('is-hidden');

      if (this.currentRows.length > 0) {
        table?.classList.remove('is-hidden');
        emptyState?.classList.add('is-hidden');
      } else {
        table?.classList.add('is-hidden');
        emptyState?.classList.remove('is-hidden');
      }
    } else {
      tabHistory?.classList.add('is-active');
      tabResults?.classList.remove('is-active');
      table?.classList.add('is-hidden');
      emptyState?.classList.add('is-hidden');
      historyList?.classList.remove('is-hidden');
      this.renderHistory();
    }
  }

  private async loadSchemas(): Promise<void> {
    const treeEl = this.container.querySelector<HTMLElement>('[data-ref="schema-tree"]');
    try {
      const res = await fetch('/api/admin/analytics/schema', {
        headers: { 'Content-Type': 'application/json' },
        signal: this.abortController?.signal,
      });

      if (!res.ok) {
        if (treeEl) {
          treeEl.innerHTML = '<div style="padding: 16px; color: var(--danger, #ef4444); font-size: 12px;">Error al cargar el esquema.</div>';
        }
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        this.mysqlSchema = json.data.mysql;
        this.cassandraSchema = json.data.cassandra;
        this.renderSchemaTree();
      }
    } catch {
      if (treeEl) {
        treeEl.innerHTML = '<div style="padding: 16px; color: var(--danger, #ef4444); font-size: 12px;">Fallo de conexión al cargar esquemas.</div>';
      }
    }
  }

  private async loadTemplates(): Promise<void> {
    const selectTemplate = this.container.querySelector<HTMLSelectElement>('[data-ref="select-query-template"]');
    try {
      const res = await fetch('/api/admin/analytics/templates', {
        headers: { 'Content-Type': 'application/json' },
        signal: this.abortController?.signal,
      });

      if (!res.ok) return;

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        this.templates = json.data;
        if (selectTemplate) {
          selectTemplate.innerHTML = '<option value="">-- Plantillas analíticas predefinidas --</option>';
          this.templates.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `[${t.database.toUpperCase()}] ${t.title}`;
            selectTemplate.appendChild(opt);
          });
        }
      }
    } catch {
      // ignore
    }
  }

  private renderSchemaTree(): void {
    const treeEl = this.container.querySelector<HTMLElement>('[data-ref="schema-tree"]');
    if (!treeEl) return;

    const currentSchema = this.activeDatabase === 'mysql' ? this.mysqlSchema : this.cassandraSchema;
    if (!currentSchema) {
      treeEl.innerHTML = '<div class="loading-spinner">Cargando tablas...</div>';
      return;
    }

    let tables = currentSchema.tables;
    if (this.searchFilter) {
      tables = tables.filter((table) => {
        const matchesTable = table.name.toLowerCase().includes(this.searchFilter);
        const matchesColumn = table.columns.some((c) => c.name.toLowerCase().includes(this.searchFilter));
        return matchesTable || matchesColumn;
      });
    }

    if (tables.length === 0) {
      treeEl.innerHTML = '<div style="padding: 24px 12px; font-size: 12px; color: var(--text-tertiary); text-align: center;">No se encontraron tablas.</div>';
      return;
    }

    treeEl.innerHTML = '';
    tables.forEach((table) => {
      const item = document.createElement('div');
      item.className = 'schema-table-item';
      item.setAttribute('data-ref', `schema-table-${table.name}`);

      const rowCountText = table.rowCountEstimate >= 0
        ? `~${table.rowCountEstimate.toLocaleString()} filas`
        : 'telemetría';

      item.innerHTML = `
        <div class="schema-table-header" data-ref="header-${table.name}">
          <div class="schema-table-info" data-ref="info-${table.name}">
            <svg class="component-icon" style="width: 14px; height: 14px; color: var(--text-tertiary);" aria-hidden="true"><use href="/icons.svg#table_chart"></use></svg>
            <span class="schema-table-name" data-ref="name-${table.name}">${escapeHtml(table.name)}</span>
          </div>
          <span class="schema-table-badge" data-ref="badge-${table.name}">${rowCountText}</span>
        </div>
        <div class="schema-columns-list" data-ref="cols-${table.name}">
          ${table.columns
            .map((col) => {
              let badgeHtml = '';
              if (col.isPrimaryKey) {
                badgeHtml = col.isPartitionKey
                  ? '<span class="badge-pk">PART</span>'
                  : col.isClusteringKey
                    ? '<span class="badge-clustering">CLUS</span>'
                    : '<span class="badge-pk">PK</span>';
              }
              if (col.isSensitive) {
                badgeHtml += ' <span class="badge-sensitive">ENM</span>';
              }
              return `
                <div class="schema-column-row" data-ref="col-row-${col.name}">
                  <span class="schema-column-name" data-ref="col-name-${col.name}">
                    ${escapeHtml(col.name)}
                    ${badgeHtml}
                  </span>
                  <span class="schema-column-type" data-ref="col-type-${col.name}">${escapeHtml(col.dataType)}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      `;

      const header = item.querySelector<HTMLElement>(`[data-ref="header-${table.name}"]`);
      header?.addEventListener('click', (e) => {
        const isClickOnName = (e.target as HTMLElement).closest('.schema-table-name');
        if (isClickOnName) {
          this.insertTableQuery(table.name);
        } else {
          item.classList.toggle('is-expanded');
        }
      });

      treeEl.appendChild(item);
    });

    renderIcons(treeEl);
  }

  private insertTableQuery(tableName: string): void {
    const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="query-textarea"]');
    const selectTargetDb = this.container.querySelector<HTMLSelectElement>('[data-ref="select-target-db"]');
    if (!textarea) return;

    textarea.value = `SELECT * FROM ${tableName} LIMIT 50;`;
    if (selectTargetDb) selectTargetDb.value = this.activeDatabase;
    textarea.focus();
    toast.info(`Consulta para "${tableName}" insertada.`);
  }

  private async executeQuery(button: HTMLButtonElement): Promise<void> {
    const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="query-textarea"]');
    const selectTargetDb = this.container.querySelector<HTMLSelectElement>('[data-ref="select-target-db"]');
    const query = textarea?.value.trim() || '';
    const database = (selectTargetDb?.value as 'cassandra' | 'mysql') || this.activeDatabase;

    if (!query) {
      this.showError('Por favor escribe una consulta SQL o CQL para ejecutar.');
      return;
    }

    this.hideError();

    await withButtonLoading(button, async () => {
      const startTime = performance.now();
      try {
        const res = await fetch('/api/admin/analytics/query', {
          body: JSON.stringify({ database, query }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: this.abortController?.signal,
        });

        const json = await res.json();
        const durationMs = Math.round(performance.now() - startTime);

        if (!res.ok || !json.success) {
          const errMessage = json.error || 'Error al ejecutar la consulta.';
          this.showError(errMessage);
          this.addHistoryRecord({
            database,
            durationMs,
            id: String(Date.now()),
            query,
            rowCount: 0,
            status: 'error',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const data = json.data;
        this.currentColumns = data.columns || [];
        this.currentRows = data.rows || [];

        this.updateExecutionStatus(data.executionTimeMs, this.currentRows.length);
        this.renderResultsTable();
        this.switchResultsTab('results');

        this.addHistoryRecord({
          database,
          durationMs: data.executionTimeMs,
          id: String(Date.now()),
          query: data.query || query,
          rowCount: this.currentRows.length,
          status: 'success',
          timestamp: new Date().toISOString(),
        });

        toast.success(`Consulta completada: ${this.currentRows.length} filas en ${data.executionTimeMs}ms`);
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const message = (err as Error).message || 'Fallo de conexión con el servidor.';
        this.showError(message);
        this.addHistoryRecord({
          database,
          durationMs,
          id: String(Date.now()),
          query,
          rowCount: 0,
          status: 'error',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private addHistoryRecord(record: QueryHistoryItem): void {
    this.history.unshift(record);
    if (this.history.length > 30) {
      this.history = this.history.slice(0, 30);
    }
    this.saveHistoryToStorage();
  }

  private updateExecutionStatus(ms: number, rowCount: number): void {
    const statusTime = this.container.querySelector<HTMLElement>('[data-ref="status-execution-time"]');
    const badgeRows = this.container.querySelector<HTMLElement>('[data-ref="badge-row-count"]');

    if (statusTime) {
      statusTime.textContent = `Ejecutado en ${ms} ms | ${rowCount} filas retornadas`;
    }
    if (badgeRows) {
      badgeRows.textContent = String(rowCount);
    }
  }

  private renderResultsTable(): void {
    const table = this.container.querySelector<HTMLElement>('[data-ref="results-table"]');
    const thead = this.container.querySelector<HTMLElement>('[data-ref="results-thead"]');
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="results-tbody"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="results-empty-state"]');

    if (!table || !thead || !tbody) return;

    if (this.currentRows.length === 0) {
      table.classList.add('is-hidden');
      if (emptyState) {
        emptyState.classList.remove('is-hidden');
        emptyState.innerHTML = `
          <svg class="component-icon" style="width: 44px; height: 44px; margin-bottom: 12px; opacity: 0.5;" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">Consulta exitosa (0 filas)</div>
          <div style="font-size: 12px; color: var(--text-tertiary);">La sentencia se ejecutó correctamente pero no arrojó resultados coincidentes.</div>
        `;
        renderIcons(emptyState);
      }
      return;
    }

    if (emptyState) emptyState.classList.add('is-hidden');
    table.classList.remove('is-hidden');

    let theadHtml = '<tr><th class="data-explorer-row-num">#</th>';
    for (const col of this.currentColumns) {
      theadHtml += `<th data-ref="th-${col}">${escapeHtml(col)}</th>`;
    }
    theadHtml += '</tr>';
    thead.innerHTML = theadHtml;

    let tbodyHtml = '';
    this.currentRows.forEach((row, idx) => {
      tbodyHtml += `<tr><td class="data-explorer-row-num">${idx + 1}</td>`;
      for (const col of this.currentColumns) {
        const val = row[col];
        if (val === '••••••••[ENMASCARADO]••••••••') {
          tbodyHtml += `<td class="cell-masked" title="Campo sensible protegido">${escapeHtml(String(val))}</td>`;
        } else if (val === null || val === undefined) {
          tbodyHtml += '<td class="cell-null">null</td>';
        } else if (typeof val === 'object') {
          tbodyHtml += `<td title="${escapeHtml(JSON.stringify(val))}">${escapeHtml(JSON.stringify(val))}</td>`;
        } else {
          tbodyHtml += `<td title="${escapeHtml(String(val))}">${escapeHtml(String(val))}</td>`;
        }
      }
      tbodyHtml += '</tr>';
    });
    tbody.innerHTML = tbodyHtml;
  }

  private renderHistory(): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="history-list"]');
    if (!list) return;

    if (this.history.length === 0) {
      list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No hay consultas en el historial de esta sesión.</div>';
      return;
    }

    list.innerHTML = '';
    this.history.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'query-history-card';
      card.setAttribute('data-ref', `history-card-${item.id}`);

      const timeStr = new Date(item.timestamp).toLocaleTimeString();
      const statusBadge = item.status === 'success'
        ? `<span class="badge badge--success" style="font-size: 10px; padding: 1px 6px;">${item.rowCount} filas (${item.durationMs}ms)</span>`
        : '<span class="badge badge--danger" style="font-size: 10px; padding: 1px 6px;">Error</span>';

      card.innerHTML = `
        <div class="query-history-meta" data-ref="history-meta-${item.id}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge" style="font-size: 10px; text-transform: uppercase; font-weight: 700;">${item.database}</span>
            <span>${timeStr}</span>
            ${statusBadge}
          </div>
          <button type="button" class="component-button component-button--h24 component-button--ghost" data-ref="btn-load-history-${item.id}" style="font-size: 11px;">
            <svg class="component-icon" style="width: 12px; height: 12px;" aria-hidden="true"><use href="/icons.svg#code"></use></svg>
            <span>Cargar en editor</span>
          </button>
        </div>
        <div class="query-history-code" data-ref="history-code-${item.id}">${escapeHtml(item.query)}</div>
      `;

      const btnLoad = card.querySelector<HTMLElement>(`[data-ref="btn-load-history-${item.id}"]`);
      btnLoad?.addEventListener('click', () => {
        const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="query-textarea"]');
        const selectTargetDb = this.container.querySelector<HTMLSelectElement>('[data-ref="select-target-db"]');
        if (textarea) {
          textarea.value = item.query;
          if (selectTargetDb) selectTargetDb.value = item.database;
          this.activeDatabase = item.database;
          this.renderSchemaTree();
          this.switchResultsTab('results');
          textarea.focus();
          toast.info('Consulta cargada en el editor.');
        }
      });

      list.appendChild(card);
    });

    renderIcons(list);
  }

  private exportCsv(): void {
    if (this.currentRows.length === 0 || this.currentColumns.length === 0) {
      toast.warning('No hay datos para exportar.');
      return;
    }

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headerLine = this.currentColumns.map(escapeCsv).join(',');
    const rowsLines = this.currentRows.map((row) => {
      return this.currentColumns.map((col) => escapeCsv(row[col])).join(',');
    });

    const csvContent = [headerLine, ...rowsLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consulta_${this.activeDatabase}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Archivo CSV descargado con éxito.');
  }

  private exportJson(): void {
    if (this.currentRows.length === 0) {
      toast.warning('No hay datos para exportar.');
      return;
    }

    const jsonStr = JSON.stringify(this.currentRows, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `consulta_${this.activeDatabase}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Archivo JSON descargado con éxito.');
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="query-error-banner"]');
    const text = this.container.querySelector<HTMLElement>('[data-ref="query-error-text"]');
    if (banner && text) {
      text.textContent = msg;
      banner.classList.remove('is-hidden');
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="query-error-banner"]');
    if (banner) {
      banner.classList.add('is-hidden');
    }
  }
}

export async function createDataExplorerView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/data-explorer/data-explorer.html');
  const controller = new DataExplorerController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
