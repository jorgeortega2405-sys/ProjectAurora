import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  createBackup,
  deleteBackup,
  getBackupDownloadStream,
  getSystemStatus,
  restoreBackup,
} from '../dist/admin/services/backup.service.js';
import {
  adminDbPool,
  getAllBackups,
  getBackupById,
} from '../dist/admin/services/db.service.js';

const ROOT_DIR = process.cwd();
const BACKUP_HTML_PATH = path.resolve(ROOT_DIR, 'admin/public/views/backups/backups.html');
const BACKUP_VIEW_PATH = path.resolve(ROOT_DIR, 'admin/client/views/backups.view.ts');
const BACKUP_SERVICE_PATH = path.resolve(ROOT_DIR, 'admin/src/services/backup.service.ts');
const ADMIN_CONTROLLER_PATH = path.resolve(ROOT_DIR, 'admin/src/controllers/admin.controller.ts');
const ADMIN_ROUTES_PATH = path.resolve(ROOT_DIR, 'admin/src/routes/admin.routes.ts');
const DB_SQL_PATH = path.resolve(ROOT_DIR, 'database/db_identity.sql');

describe('Copias de Seguridad (Backups) - Arquitectura, Reglas y Pruebas de Integración', () => {
  let createdBackupId = null;
  let partialBackupId = null;

  after(async () => {
    if (createdBackupId) {
      await deleteBackup(createdBackupId).catch(() => {});
    }
    if (partialBackupId) {
      await deleteBackup(partialBackupId).catch(() => {});
    }
    await adminDbPool.end();
  });

  describe('Auditoría Estricta de Reglas del Proyecto (AGENTS.md / GEMINI.md)', () => {
    it('Regla 3: CERO atributos id="..." en plantillas HTML y vistas DOM', () => {
      const html = fs.readFileSync(BACKUP_HTML_PATH, 'utf8');
      const idMatches = html.match(/\bid="[^"]*"/g);
      assert.strictEqual(idMatches, null, `No deben existir atributos id="..." en backups.html. Encontrados: ${idMatches}`);

      const ts = fs.readFileSync(BACKUP_VIEW_PATH, 'utf8');
      assert.strictEqual(ts.includes('getElementById'), false, 'Prohibido usar document.getElementById');
      assert.strictEqual(/\bsetAttribute\(['"]id['"]/i.test(ts), false, 'Prohibido asignar setAttribute("id")');
    });

    it('Regla 4: Orden estricto de atributos HTML (botones: type primero; otros: class primero)', () => {
      const html = fs.readFileSync(BACKUP_HTML_PATH, 'utf8');
      const buttonRegex = /<button\s+([^>]+)>/gi;
      let match;
      while ((match = buttonRegex.exec(html)) !== null) {
        const attrs = match[1].trim();
        assert.ok(
          attrs.startsWith('type='),
          `En botones, el atributo type debe ser siempre el primero: <button ${attrs}>`
        );
      }

      const otherElementsRegex = /<(div|span|header|table|thead|tbody|tr|th|td|label)\s+([^>]+)>/gi;
      while ((match = otherElementsRegex.exec(html)) !== null) {
        const tag = match[1];
        const attrs = match[2].trim();
        if (attrs.includes('class=')) {
          assert.ok(
            attrs.startsWith('class='),
            `En elemento <${tag}>, class debe ser siempre el primer atributo: <${tag} ${attrs}>`
          );
        }
      }
    });

    it('Regla 5: Banners de error situados debajo de los botones de acción', () => {
      const html = fs.readFileSync(BACKUP_HTML_PATH, 'utf8');
      const modalCreateIdx = html.indexOf('data-ref="modal-create-backdrop"');
      const btnConfirmCreateIdx = html.indexOf('data-ref="btn-confirm-create"');
      const errorCreateIdx = html.indexOf('data-ref="modal-create-error"');

      assert.ok(modalCreateIdx !== -1 && btnConfirmCreateIdx !== -1 && errorCreateIdx !== -1);
      assert.ok(
        errorCreateIdx > btnConfirmCreateIdx,
        'El banner de error del modal de creación debe ubicarse después (debajo) de los botones de acción'
      );

      const btnConfirmRestoreIdx = html.indexOf('data-ref="btn-confirm-restore"');
      const errorRestoreIdx = html.indexOf('data-ref="modal-restore-error"');
      assert.ok(
        errorRestoreIdx > btnConfirmRestoreIdx,
        'El banner de error del modal de restauración debe ubicarse después (debajo) de los botones de acción'
      );
    });

    it('Regla 2: Prohibición total de console.* en frontend y backend', () => {
      const files = [BACKUP_VIEW_PATH, BACKUP_SERVICE_PATH, ADMIN_CONTROLLER_PATH];
      for (const f of files) {
        const code = fs.readFileSync(f, 'utf8');
        const hasConsole = /\bconsole\.(log|warn|error|info|debug)\b/.test(code);
        assert.strictEqual(
          hasConsole,
          false,
          `El archivo ${path.basename(f)} no debe contener llamadas a console.*`
        );
      }
    });

    it('Regla 7: Imports horizontales en una sola línea y ordenados alfabéticamente', () => {
      const files = [BACKUP_VIEW_PATH, BACKUP_SERVICE_PATH, ADMIN_CONTROLLER_PATH, ADMIN_ROUTES_PATH];
      for (const f of files) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (line.trim().startsWith('import ') && line.includes(' from ')) {
            assert.strictEqual(
              line.includes('\n'),
              false,
              `El import debe estar en una sola línea horizontal: ${line}`
            );
          }
        }
      }
    });

    it('Regla 8: Cero anotaciones JSDoc y cero comentarios decorativos/explicativos', () => {
      const files = [BACKUP_VIEW_PATH, BACKUP_SERVICE_PATH];
      for (const f of files) {
        const code = fs.readFileSync(f, 'utf8');
        assert.strictEqual(/\/\*\*[\s\S]*?\*\//.test(code), false, `No debe existir JSDoc en ${path.basename(f)}`);
        assert.strictEqual(/\/\*[\s=]+[A-Z\s]+[\s=]+\*\//.test(code), false, `No deben existir bloques decorativos en ${path.basename(f)}`);
      }
    });

    it('Regla 11: Esquema backup_records y permisos PBAC definidos en database/db_identity.sql', () => {
      const sql = fs.readFileSync(DB_SQL_PATH, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS backup_records'), 'La tabla backup_records debe existir en db_identity.sql');
      assert.ok(sql.includes('system:backup:create'), 'Permiso system:backup:create debe existir en db_identity.sql');
      assert.ok(sql.includes('system:backup:restore'), 'Permiso system:backup:restore debe existir en db_identity.sql');
      assert.ok(sql.includes('system:backup:read'), 'Permiso system:backup:read debe existir en db_identity.sql');
      assert.ok(sql.includes('system:backup:delete'), 'Permiso system:backup:delete debe existir en db_identity.sql');
    });
  });

  describe('Pruebas Funcionales e Integración con MySQL, Cassandra y MinIO', () => {
    it('getSystemStatus(): detecta conectividad operativa con MySQL, Cassandra y MinIO', async () => {
      const status = await getSystemStatus();
      assert.ok(status, 'Estado del sistema debe ser un objeto');

      assert.strictEqual(status.mysql.connected, true, 'MySQL debe estar conectado');
      assert.strictEqual(status.mysql.database, 'db_aurora');
      assert.ok(status.mysql.tablesCount > 10, 'MySQL debe tener al menos 10 tablas');

      assert.strictEqual(status.cassandra.connected, true, 'Cassandra debe estar conectado');
      assert.strictEqual(status.cassandra.keyspace, 'aurora_telemetry');
      assert.ok(status.cassandra.tables.includes('events_raw'), 'Cassandra debe tener tabla events_raw');
      assert.ok(status.cassandra.tables.includes('performance_metrics'), 'Cassandra debe tener tabla performance_metrics');

      assert.strictEqual(status.minio.connected, true, 'MinIO S3 debe estar conectado');
      assert.strictEqual(status.minio.bucket, 'aurora-storage');
    });

    it('createBackup(): genera respaldo completo (MySQL + Cassandra + S3), sube a MinIO y registra en base de datos', async () => {
      const backup = await createBackup({
        components: ['mysql', 'cassandra', 'minio'],
        name: 'Copia Completa de Integración',
        notes: 'Generada durante suite automatizada de pruebas',
      });

      assert.ok(backup, 'El respaldo creado no debe ser nulo');
      createdBackupId = backup.id;

      assert.ok(backup.id, 'Debe contener un UUID id');
      assert.strictEqual(backup.name, 'Copia Completa de Integración');
      assert.ok(backup.filename.startsWith('aurora-backup-'), 'Nombre de archivo debe tener prefijo aurora-backup-');
      assert.ok(backup.filename.endsWith('.zip'), 'Debe ser archivo .zip');
      assert.ok(backup.s3_key.startsWith('backups/'), 'Clave S3 debe estar en prefijo backups/');
      assert.strictEqual(backup.s3_bucket, 'aurora-storage');
      assert.ok(backup.size_bytes > 500, `Tamaño del zip debe ser mayor a 500 bytes (actual: ${backup.size_bytes})`);
      assert.strictEqual(backup.status, 'completed');
      assert.ok(backup.checksum_sha256, 'Debe incluir checksum SHA-256');
      assert.deepStrictEqual(backup.components.sort(), ['cassandra', 'minio', 'mysql'].sort());

      const fetched = await getBackupById(backup.id);
      assert.ok(fetched, 'getBackupById debe encontrar el respaldo registrado');
      assert.strictEqual(fetched.id, backup.id);

      const all = await getAllBackups();
      assert.ok(all.some((b) => b.id === backup.id), 'getAllBackups debe incluir el respaldo generado');
    });

    it('getBackupDownloadStream(): permite obtener el stream del archivo ZIP desde S3', async () => {
      assert.ok(createdBackupId, 'Debe existir un backup previo');
      const download = await getBackupDownloadStream(createdBackupId);

      assert.ok(download, 'Stream de descarga debe existir');
      assert.strictEqual(download.contentType, 'application/zip');
      assert.ok(download.contentLength > 500);
      assert.ok(download.stream, 'Debe retornar un stream legible');
    });

    it('restoreBackup(): restaura los datos del respaldo en MySQL, Cassandra y MinIO', async () => {
      assert.ok(createdBackupId, 'Debe existir un backup previo');
      const result = await restoreBackup(createdBackupId, {
        components: ['mysql', 'cassandra', 'minio'],
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.restoredSummary.mysql, true, 'Debe haber restaurado MySQL');
      assert.strictEqual(result.restoredSummary.cassandra, true, 'Debe haber restaurado Cassandra');
      assert.strictEqual(result.restoredSummary.minio, true, 'Debe haber restaurado MinIO');

      const updatedBackup = await getBackupById(createdBackupId);
      assert.ok(updatedBackup.restored_at, 'La fecha de restauración debe actualizarse en base de datos');
    });

    it('createBackup() parcial: genera respaldo selectivo solo con MySQL', async () => {
      const partial = await createBackup({
        components: ['mysql'],
        name: 'Copia Solo MySQL',
      });

      assert.ok(partial);
      partialBackupId = partial.id;
      assert.deepStrictEqual(partial.components, ['mysql']);

      const restoreResult = await restoreBackup(partial.id, { components: ['mysql'] });
      assert.strictEqual(restoreResult.success, true);
      assert.strictEqual(restoreResult.restoredSummary.mysql, true);
      assert.strictEqual(restoreResult.restoredSummary.cassandra, undefined);
    });

    it('deleteBackup(): elimina el archivo de S3 y el registro de la base de datos', async () => {
      assert.ok(partialBackupId);
      const deleted = await deleteBackup(partialBackupId);
      assert.strictEqual(deleted, true, 'deleteBackup debe retornar true');

      const check = await getBackupById(partialBackupId);
      assert.strictEqual(check, null, 'El registro en base de datos debe ser eliminado');
      partialBackupId = null;
    });
  });
});
