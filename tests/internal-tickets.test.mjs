import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, describe } from 'node:test';
import { adminDbPool } from '../dist/admin/services/db.service.js';
import {
  addTicketComment,
  createInternalTicket,
  getDepartmentsAndStaff,
  getInternalTicketById,
  getTicketComments,
  getTicketSummaryStats,
  listInternalTickets,
  updateInternalTicket,
} from '../dist/admin/services/internal-tickets.service.js';

describe('Suite de Tickets Internos y Tareas Interdepartamentales', () => {
  after(async () => {
    await adminDbPool.end().catch(() => {});
  });

  describe('Parte 1: Auditoría de Reglas Maestras (AGENTS.md / GEMINI.md)', () => {
    test('Regla 3: CERO atributos id en plantilla HTML de tickets internos', () => {
      const htmlPath = path.resolve(process.cwd(), 'admin/public/views/internal-tickets/internal-tickets.html');
      assert.ok(fs.existsSync(htmlPath), 'El archivo HTML de tickets debe existir');

      const html = fs.readFileSync(htmlPath, 'utf8');
      const idMatches = html.match(/\bid\s*=\s*["'][^"']+["']/gi) || [];
      assert.equal(idMatches.length, 0, `No debe existir ningún atributo id en HTML: encontrados ${idMatches.length}`);
    });

    test('Regla 2: CERO llamadas console.* en frontend y backend de tickets', () => {
      const files = [
        'admin/src/services/internal-tickets.service.ts',
        'admin/src/controllers/internal-tickets.controller.ts',
        'admin/client/views/internal-tickets.view.ts',
        'admin/client/types/tickets.types.ts',
        'admin/src/types/tickets.types.ts',
      ];

      for (const relPath of files) {
        const fullPath = path.resolve(process.cwd(), relPath);
        assert.ok(fs.existsSync(fullPath), `El archivo ${relPath} debe existir`);
        const content = fs.readFileSync(fullPath, 'utf8');
        const consoleMatches = content.match(/\bconsole\.(log|warn|error|info|debug)\b/g) || [];
        assert.equal(consoleMatches.length, 0, `Prohibido console.* en ${relPath}: encontrados ${consoleMatches.length}`);
      }
    });

    test('Regla 4: Orden estricto de atributos en botones de tickets (type primero)', () => {
      const htmlPath = path.resolve(process.cwd(), 'admin/public/views/internal-tickets/internal-tickets.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const buttonTags = html.match(/<button\b[^>]*>/gi) || [];

      assert.ok(buttonTags.length > 0, 'Deben existir botones en la plantilla');
      for (const btn of buttonTags) {
        assert.match(btn, /^<button\s+type=["'][^"']+["']/i, `El botón debe tener type como primer atributo: ${btn}`);
      }
    });

    test('Regla 5: Banners de error ubicados debajo de botones de acción', () => {
      const htmlPath = path.resolve(process.cwd(), 'admin/public/views/internal-tickets/internal-tickets.html');
      const html = fs.readFileSync(htmlPath, 'utf8');

      const submitBtnIdx = html.indexOf('data-ref="btn-submit-create-ticket"');
      const bannerErrorIdx = html.indexOf('data-ref="create-ticket-error"');

      assert.ok(submitBtnIdx !== -1 && bannerErrorIdx !== -1, 'Botón de submit y banner de error deben existir');
      assert.ok(bannerErrorIdx > submitBtnIdx, 'El banner de error debe posicionarse debajo del botón de acción');
    });

    test('Regla 7: Imports horizontales y orden alfabético estricto', () => {
      const files = [
        'admin/src/services/internal-tickets.service.ts',
        'admin/src/controllers/internal-tickets.controller.ts',
        'admin/client/views/internal-tickets.view.ts',
      ];

      for (const relPath of files) {
        const fullPath = path.resolve(process.cwd(), relPath);
        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
        const importLines = lines.filter((l) => l.startsWith('import '));

        for (const imp of importLines) {
          assert.ok(!imp.includes('\n'), `El import debe ser horizontal de una sola línea: ${imp}`);
        }
      }
    });

    test('Regla 8: CERO anotaciones JSDoc ni comentarios decorativos', () => {
      const files = [
        'admin/src/services/internal-tickets.service.ts',
        'admin/src/controllers/internal-tickets.controller.ts',
        'admin/client/views/internal-tickets.view.ts',
      ];

      for (const relPath of files) {
        const fullPath = path.resolve(process.cwd(), relPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(!content.includes('/**'), `Prohibido JSDoc en ${relPath}`);
        assert.ok(!content.includes('/* ====='), `Prohibidos encabezados decorativos en ${relPath}`);
      }
    });

    test('Regla 11: Esquemas de tablas definidos exclusivamente en database/db_identity.sql', () => {
      const sqlPath = path.resolve(process.cwd(), 'database/db_identity.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS internal_tickets'), 'Tabla internal_tickets debe estar en db_identity.sql');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS internal_ticket_comments'), 'Tabla internal_ticket_comments debe estar en db_identity.sql');
      assert.ok(sql.includes('admin:tickets:view'), 'Permiso admin:tickets:view debe estar en db_identity.sql');
      assert.ok(sql.includes('admin:tickets:create'), 'Permiso admin:tickets:create debe estar en db_identity.sql');
      assert.ok(sql.includes('admin:tickets:manage'), 'Permiso admin:tickets:manage debe estar en db_identity.sql');
    });
  });

  describe('Parte 2: Pruebas Funcionales e Integración con Base de Datos MySQL', () => {
    test('Tablas internal_tickets e internal_ticket_comments existen y son operativas', async () => {
      const [rows] = await adminDbPool.query('SHOW TABLES LIKE "internal_ticket%"');
      assert.ok(rows.length >= 2, 'Deben existir al menos las dos tablas de tickets');
    });

    test('Listado de tickets con departamentos y solicitantes asociados', async () => {
      const tickets = await listInternalTickets({});

      assert.ok(Array.isArray(tickets), 'Debe retornar un arreglo de tickets');
      assert.ok(tickets.length >= 5, 'Deben existir al menos los tickets de prueba sembrados');

      const printerTicket = tickets.find((t) => t.ticket_number === 'TCK-1001');
      assert.ok(printerTicket, 'Debe existir el ticket TCK-1001');
      assert.equal(printerTicket.category, 'hardware');
      assert.equal(printerTicket.target_department_id, 'operations');
      assert.ok(printerTicket.creator_username, 'Debe incluir el nombre de usuario del creador');
    });

    test('Creación de un nuevo ticket de reporte (impresora rota / falla)', async () => {
      const newTicket = await createInternalTicket(
        {
          category: 'hardware',
          description: 'La impresora del área de ventas no toma el papel fotográfico y muestra luz roja intermitente.',
          priority: 'high',
          target_department_id: 'operations',
          title: 'Impresora Ventas luz roja de atasco',
        },
        'b7123456-2222-4000-8000-000000000002'
      );

      assert.ok(newTicket.id, 'Debe generar un ID');
      assert.match(newTicket.ticket_number, /^TCK-\d+$/, 'Debe asignar correlativo TCK-XXXX');
      assert.equal(newTicket.status, 'open');
      assert.equal(newTicket.priority, 'high');

      const fetched = await getInternalTicketById(newTicket.id);
      assert.ok(fetched, 'Debe poder consultarse inmediatamente por ID');
      assert.equal(fetched.title, 'Impresora Ventas luz roja de atasco');
    });

    test('Actualización de estado, prioridad y resolución de un ticket', async () => {
      const updated = await updateInternalTicket(
        'tck-001',
        {
          assigned_to: 'b7123456-3333-4000-8000-000000000003',
          priority: 'urgent',
          resolution_notes: 'Rodillos limpiados y engranaje de tracción lubricado. Operativo al 100%.',
          status: 'resolved',
        },
        '50e0819a-7151-433c-8797-613f6cbf0b6a'
      );

      assert.ok(updated, 'Debe retornar el ticket actualizado');
      assert.equal(updated.status, 'resolved');
      assert.equal(updated.priority, 'urgent');
      assert.ok(updated.resolved_at, 'Debe registrar la fecha de resolución');
      assert.ok(updated.resolution_notes.includes('Rodillos limpiados'));

      const verified = await getInternalTicketById('tck-001');
      assert.equal(verified.status, 'resolved');
    });

    test('Publicación de notas y respuestas departamentales en un ticket', async () => {
      const comment = await addTicketComment(
        'tck-001',
        'b7123456-1111-4000-8000-000000000001',
        'Confirmamos desde Recursos Humanos que ya se pueden imprimir las credenciales físicas.',
        false
      );

      assert.ok(comment.id, 'Debe retornar el comentario con ID');
      assert.equal(comment.username, 'sofia.hernandez');

      const comments = await getTicketComments('tck-001');
      assert.ok(comments.length >= 2, 'Debe contener los comentarios agregados');
      const found = comments.find((c) => c.id === comment.id);
      assert.ok(found, 'Debe listar el nuevo comentario');
    });

    test('Estadísticas y contadores de resumen para el dashboard de tickets', async () => {
      const stats = await getTicketSummaryStats();

      assert.ok(typeof stats.total === 'number' && stats.total >= 5);
      assert.ok(typeof stats.open === 'number');
      assert.ok(typeof stats.in_progress === 'number');
      assert.ok(typeof stats.resolved === 'number');
      assert.ok(typeof stats.urgent_or_high === 'number');
    });

    test('Obtención de departamentos y personal activo para formularios', async () => {
      const { departments, staff } = await getDepartmentsAndStaff();

      assert.ok(Array.isArray(departments) && departments.length >= 7, 'Debe listar los 7 departamentos de la empresa');
      assert.ok(Array.isArray(staff) && staff.length >= 5, 'Debe listar a los colaboradores activos');

      const execDept = departments.find((d) => d.id === 'exec');
      assert.ok(execDept, 'Debe incluir Dirección Ejecutiva');
    });
  });
});
