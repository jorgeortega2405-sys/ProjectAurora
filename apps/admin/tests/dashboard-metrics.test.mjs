import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { getDashboardStats } from '../dist/services/dashboard.service.js';
import { adminDbPool } from '../dist/services/db.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;

describe('Suite de Métricas y Gráficos del Dashboard Admin (Chart.js y Datos Reales)', () => {
  after(async () => {
    await adminDbPool.end().catch(() => {});
  });

  describe('Parte 1: Servicio Backend y Consulta de Datos Reales en MySQL', () => {
    it('getDashboardStats() devuelve estructura completa de métricas, tendencias, tiers y tickets', async () => {
      const stats = await getDashboardStats();

      assert.ok(stats, 'El servicio debe retornar las estadísticas del dashboard');
      assert.ok(stats.summary, 'Debe incluir objeto summary');
      assert.ok(Array.isArray(stats.trends), 'Debe incluir array de tendencias');
      assert.ok(stats.tiers, 'Debe incluir distribución de niveles de suscripción');
      assert.ok(stats.tickets, 'Debe incluir estado de tickets');

      assert.strictEqual(typeof stats.summary.accountsToday, 'number');
      assert.strictEqual(typeof stats.summary.accountsYesterday, 'number');
      assert.strictEqual(typeof stats.summary.accountsTotal, 'number');
      assert.ok(stats.summary.accountsTotal >= 1, 'Debe contar al menos un usuario registrado');

      assert.strictEqual(typeof stats.summary.workflowsToday, 'number');
      assert.strictEqual(typeof stats.summary.workflowsTotal, 'number');

      assert.strictEqual(typeof stats.summary.ticketsActive, 'number');
      assert.strictEqual(typeof stats.summary.ticketsResolved, 'number');
      assert.strictEqual(typeof stats.summary.ticketsTotal, 'number');

      assert.strictEqual(stats.trends.length, 14, 'Debe retornar exactamente 14 puntos diarios de tendencia');
      for (const point of stats.trends) {
        assert.ok(point.date && /^\d{4}-\d{2}-\d{2}$/.test(point.date), `Fecha inválida: ${point.date}`);
        assert.ok(point.label && point.label.length > 0, `Etiqueta inválida: ${point.label}`);
        assert.strictEqual(typeof point.accounts, 'number');
        assert.strictEqual(typeof point.workflows, 'number');
      }

      assert.strictEqual(typeof stats.tiers.free, 'number');
      assert.strictEqual(typeof stats.tiers.pro, 'number');
      assert.strictEqual(typeof stats.tiers.enterprise, 'number');

      assert.strictEqual(typeof stats.tickets.open, 'number');
      assert.strictEqual(typeof stats.tickets.in_progress, 'number');
      assert.strictEqual(typeof stats.tickets.urgent, 'number');
      assert.strictEqual(typeof stats.tickets.resolved, 'number');
      assert.strictEqual(typeof stats.tickets.closed, 'number');
    });
  });

  describe('Parte 2: Reglas Maestras de HTML y DOM en dashboard.html', () => {
    const htmlPath = path.resolve(ADMIN_DIR, 'public/views/dashboard/dashboard.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    it('Regla 3: CERO atributos id en dashboard.html', () => {
      assert.strictEqual(html.includes('id="'), false, 'No deben existir atributos id="..." en dashboard.html');
      assert.strictEqual(html.includes("id='"), false, "No deben existir atributos id='...' en dashboard.html");
    });

    it('Contiene los 3 lienzos canvas para Chart.js y los elementos semánticos data-ref', () => {
      assert.ok(html.includes('data-ref="canvas-chart-trends"'), 'Debe incluir canvas de tendencias temporales');
      assert.ok(html.includes('data-ref="canvas-chart-tiers"'), 'Debe incluir canvas de distribución de planes');
      assert.ok(html.includes('data-ref="canvas-chart-tickets"'), 'Debe incluir canvas de estado de tickets');

      assert.ok(html.includes('data-ref="stat-accounts-today"'), 'Debe incluir stat-accounts-today');
      assert.ok(html.includes('data-ref="stat-workflows-today"'), 'Debe incluir stat-workflows-today');
      assert.ok(html.includes('data-ref="stat-tickets-active"'), 'Debe incluir stat-tickets-active');
      assert.ok(html.includes('data-ref="stat-subscribers-active"'), 'Debe incluir stat-subscribers-active');

      assert.ok(html.includes('data-ref="tier-count-free"'), 'Debe incluir contador free');
      assert.ok(html.includes('data-ref="tier-count-pro"'), 'Debe incluir contador pro');
      assert.ok(html.includes('data-ref="tier-count-enterprise"'), 'Debe incluir contador enterprise');
    });

    it('Regla 4: Orden estricto de atributos (class primero en no-botones)', () => {
      const tagRegex = /<(div|span|h1|h3|p|label|input|canvas)\s+([^>]+)>/gi;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const tag = match[1];
        const attrs = match[2].trim();
        if (attrs.includes('class=')) {
          assert.match(
            attrs,
            /^class=["'][^"']+["']/,
            `En elemento <${tag}> el atributo class debe ser el primero: ${match[0]}`
          );
        }
      }
    });
  });

  describe('Parte 3: Reglas Maestras de Código (AGENTS.md / GEMINI.md)', () => {
    it('Regla 2: Prohibición total de console.* en dashboard.service.ts y dashboard.view.ts', () => {
      const files = [
        path.resolve(ADMIN_DIR, 'src/services/dashboard.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/dashboard.view.ts'),
      ];

      for (const f of files) {
        const code = fs.readFileSync(f, 'utf8');
        const hasConsole = /\bconsole\.(log|warn|error|info|debug)\b/.test(code);
        assert.strictEqual(hasConsole, false, `El archivo ${path.basename(f)} no debe contener llamadas a console.*`);
      }
    });

    it('Regla 7: Imports horizontales en una sola línea', () => {
      const files = [
        path.resolve(ADMIN_DIR, 'src/services/dashboard.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/dashboard.view.ts'),
        path.resolve(ADMIN_DIR, 'src/types/dashboard.types.ts'),
        path.resolve(ADMIN_DIR, 'client/types/dashboard.types.ts'),
      ];

      for (const f of files) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (line.trim().startsWith('import ') && line.includes(' from ')) {
            assert.strictEqual(line.includes('\n'), false, `Import horizontal en ${path.basename(f)}: ${line}`);
          }
        }
      }
    });

    it('Regla 8: CERO anotaciones JSDoc y cero bloques decorativos', () => {
      const files = [
        path.resolve(ADMIN_DIR, 'src/services/dashboard.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/dashboard.view.ts'),
      ];

      for (const f of files) {
        const code = fs.readFileSync(f, 'utf8');
        assert.strictEqual(/\/\*\*[\s\S]*?\*\//.test(code), false, `No debe existir JSDoc en ${path.basename(f)}`);
        assert.strictEqual(/\/\*[\s=]+[A-Z\s]+[\s=]+\*\//.test(code), false, `No deben existir bloques decorativos en ${path.basename(f)}`);
      }
    });
  });
});
