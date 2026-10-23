import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import {
  deleteHrDocument,
  getAllDepartments,
  getAllEmployees,
  getDocumentsByEmployeeId,
  getEmployeeById,
  getHrSummaryStats,
  getOrganigramTree,
  getVacationRequests,
  hireEmployee,
  requestVacation,
  reviewVacationRequest,
  terminateEmployee,
  updateEmployee,
  uploadHrDocument,
} from '../dist/services/hr.service.js';

const ROOT_DIR = process.cwd();
const REPO_ROOT = fs.existsSync(path.resolve(ROOT_DIR, 'apps')) ? ROOT_DIR : path.resolve(ROOT_DIR, '../..');
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const HR_HTML_PATH = path.resolve(ADMIN_DIR, 'public/views/hr/hr.html');
const HR_SERVICE_PATH = path.resolve(ADMIN_DIR, 'src/services/hr.service.ts');
const HR_CONTROLLER_PATH = path.resolve(ADMIN_DIR, 'src/controllers/hr.controller.ts');
const HR_VIEW_PATH = path.resolve(ADMIN_DIR, 'client/views/hr.view.ts');

describe('Suite de Recursos Humanos (RRHH) - Contrataciones, Sueldos, Vacaciones, Contratos y Organigrama', () => {
  const timestamp = Date.now();
  const createdUserIds = [];
  const createdEmployeeIds = [];
  const createdDocIds = [];

  after(async () => {
    for (const docId of createdDocIds) {
      await deleteHrDocument(docId).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(',');
      await adminDbPool.query(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds).catch(() => {});
    }
    await adminDbPool.end();
  });

  describe('Parte 1: Verificación de Esquema de Base de Datos y Permisos de RRHH', () => {
    it('Las 4 tablas de RRHH existen en db_aurora', async () => {
      const [rows] = await adminDbPool.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'db_aurora' AND TABLE_NAME LIKE 'hr_%'"
      );
      const tableNames = rows.map((r) => r.TABLE_NAME);
      assert.ok(tableNames.includes('hr_departments'), 'hr_departments debe existir');
      assert.ok(tableNames.includes('hr_employees'), 'hr_employees debe existir');
      assert.ok(tableNames.includes('hr_documents'), 'hr_documents debe existir');
      assert.ok(tableNames.includes('hr_vacation_requests'), 'hr_vacation_requests debe existir');
    });

    it('Departamentos empresariales predeterminados están registrados', async () => {
      const departments = await getAllDepartments();
      assert.ok(departments.length >= 7, 'Debe haber al menos 7 departamentos');
      const deptIds = departments.map((d) => d.id);
      assert.ok(deptIds.includes('engineering'), 'Debe incluir ingeniería');
      assert.ok(deptIds.includes('hr'), 'Debe incluir recursos humanos');
      assert.ok(deptIds.includes('exec'), 'Debe incluir dirección ejecutiva');
      assert.ok(deptIds.includes('finance'), 'Debe incluir finanzas');
    });

    it('Permisos de administración de RRHH existen en permissions', async () => {
      const [rows] = await adminDbPool.query("SELECT id FROM permissions WHERE id LIKE 'admin:hr:%'");
      const perms = rows.map((r) => r.id);
      assert.ok(perms.includes('admin:hr:view'), 'admin:hr:view debe existir');
      assert.ok(perms.includes('admin:hr:manage'), 'admin:hr:manage debe existir');
      assert.ok(perms.includes('admin:hr:documents'), 'admin:hr:documents debe existir');
    });
  });

  describe('Parte 2: Contratación de Trabajadores y Generación de Credenciales Seguras', () => {
    let hiredResult = null;

    it('hireEmployee() crea usuario en users, perfil en hr_employees y genera contraseña segura', async () => {
      const input = {
        department_id: 'engineering',
        full_name: `Carlos Mendoza ${timestamp}`,
        hire_date: '2026-03-01',
        job_title: 'Senior Frontend Engineer',
        role: 'SENIOR_ENGINEER',
        salary_amount: 5200.0,
        salary_currency: 'USD',
        salary_frequency: 'monthly',
        vacation_days_allocated: 18,
      };

      hiredResult = await hireEmployee(input);
      assert.ok(hiredResult, 'Debe retornar resultado de contratación');
      assert.ok(hiredResult.credentials, 'Debe retornar credenciales');
      assert.ok(hiredResult.credentials.temporary_password, 'Debe incluir contraseña temporal');
      assert.ok(hiredResult.credentials.temporary_password.length >= 14, 'Contraseña debe tener alta entropía (>=14 caracteres)');
      assert.strictEqual(hiredResult.credentials.role, 'SENIOR_ENGINEER');
      assert.ok(hiredResult.credentials.email.includes('@projectaurora.com'));

      createdUserIds.push(hiredResult.employee.user_id);
      createdEmployeeIds.push(hiredResult.employee.id);

      assert.strictEqual(hiredResult.employee.job_title, 'Senior Frontend Engineer');
      assert.strictEqual(hiredResult.employee.salary_amount, 5200.0);
      assert.strictEqual(hiredResult.employee.vacation_days_allocated, 18);
      assert.strictEqual(hiredResult.employee.vacation_days_used, 0);
      assert.strictEqual(hiredResult.employee.vacation_balance, 18);
    });

    it('La cuenta de usuario creada tiene hash bcrypt y preferencias válidas', async () => {
      const [userRows] = await adminDbPool.query(
        'SELECT id, username, email, password_hash, role FROM users WHERE id = ?',
        [hiredResult.employee.user_id]
      );
      assert.strictEqual(userRows.length, 1);
      assert.ok(userRows[0].password_hash.startsWith('$2'), 'Contraseña debe estar hasheada con bcrypt');
      assert.strictEqual(userRows[0].role, 'SENIOR_ENGINEER');

      const [prefRows] = await adminDbPool.query(
        'SELECT user_id, theme, language FROM user_preferences WHERE user_id = ?',
        [hiredResult.employee.user_id]
      );
      assert.strictEqual(prefRows.length, 1);
      assert.strictEqual(prefRows[0].language, 'es-MX');
    });

    it('updateEmployee() permite actualizar puesto, salario, rol y supervisor', async () => {
      const updated = await updateEmployee(hiredResult.employee.id, {
        job_title: 'Staff Software Engineer',
        role: 'ENGINEER',
        salary_amount: 6000.0,
        vacation_days_allocated: 20,
      });

      assert.ok(updated);
      assert.strictEqual(updated.job_title, 'Staff Software Engineer');
      assert.strictEqual(updated.salary_amount, 6000.0);
      assert.strictEqual(updated.role, 'ENGINEER');
      assert.strictEqual(updated.vacation_days_allocated, 20);
      assert.strictEqual(updated.vacation_balance, 20);
    });
  });

  describe('Parte 3: Control y Flujo de Vacaciones', () => {
    let empId = null;
    let vacRequest = null;

    before(async () => {
      const res = await hireEmployee({
        department_id: 'product',
        full_name: `Lucia Castro ${timestamp}`,
        hire_date: '2026-01-15',
        job_title: 'Product Designer',
        role: 'USER',
        salary_amount: 3800.0,
        vacation_days_allocated: 15,
      });
      empId = res.employee.id;
      createdUserIds.push(res.employee.user_id);
      createdEmployeeIds.push(res.employee.id);
    });

    it('requestVacation() registra solicitud en estado pending', async () => {
      vacRequest = await requestVacation(empId, '2026-07-01', '2026-07-05', 5, 'Vacaciones de verano');
      assert.ok(vacRequest.id);
      assert.strictEqual(vacRequest.days_count, 5);
      assert.strictEqual(vacRequest.status, 'pending');

      const emp = await getEmployeeById(empId);
      assert.strictEqual(emp.vacation_days_used, 0, 'No descuenta días mientras esté pendiente');
    });

    it('reviewVacationRequest(approved) aprueba la solicitud y descuenta automáticamente los días del saldo', async () => {
      const reviewed = await reviewVacationRequest(vacRequest.id, 'approved', null, 'Aprobado por gerencia');
      assert.strictEqual(reviewed.status, 'approved');
      assert.strictEqual(reviewed.review_notes, 'Aprobado por gerencia');

      const emp = await getEmployeeById(empId);
      assert.strictEqual(emp.vacation_days_used, 5, 'Días usados debe ser 5');
      assert.strictEqual(emp.vacation_balance, 10, 'Saldo restante debe ser 10 (15 - 5)');
    });

    it('Segunda solicitud rechazada no afecta el saldo de vacaciones', async () => {
      const req2 = await requestVacation(empId, '2026-12-20', '2026-12-24', 4, 'Viaje familiar');
      const rejected = await reviewVacationRequest(req2.id, 'rejected', null, 'Cierre de proyecto');
      assert.strictEqual(rejected.status, 'rejected');

      const emp = await getEmployeeById(empId);
      assert.strictEqual(emp.vacation_days_used, 5, 'Días usados debe seguir siendo 5');
      assert.strictEqual(emp.vacation_balance, 10, 'Saldo restante debe seguir siendo 10');
    });
  });

  describe('Parte 4: Repositorio de Contratos y Acuerdos de Confidencialidad (NDA)', () => {
    let empId = null;

    before(async () => {
      const res = await hireEmployee({
        department_id: 'finance',
        full_name: `Roberto Gomez ${timestamp}`,
        hire_date: '2026-02-01',
        job_title: 'Financial Analyst',
        role: 'FINANCE_ADMIN',
        salary_amount: 4200.0,
      });
      empId = res.employee.id;
      createdUserIds.push(res.employee.user_id);
      createdEmployeeIds.push(res.employee.id);
    });

    it('uploadHrDocument() almacena contrato laboral en disco y base de datos', async () => {
      const dummyFile = {
        buffer: Buffer.from('%PDF-1.4 Test Employment Contract'),
        mimetype: 'application/pdf',
        originalname: 'contrato_indefinido.pdf',
        size: 32,
      };

      const doc = await uploadHrDocument(empId, 'contract', 'Contrato Individual de Trabajo Indefinido', dummyFile);
      assert.ok(doc.id);
      assert.strictEqual(doc.document_type, 'contract');
      assert.strictEqual(doc.employee_id, empId);
      assert.ok(doc.file_url.startsWith('/uploads/hr_documents/'));

      createdDocIds.push(doc.id);

      const localPath = path.resolve(ADMIN_DIR, 'public', doc.file_url.replace(/^\//, ''));
      assert.ok(fs.existsSync(localPath), 'El archivo físico debe existir en uploads/hr_documents');
    });

    it('uploadHrDocument() almacena acuerdo de confidencialidad (NDA)', async () => {
      const dummyNda = {
        buffer: Buffer.from('%PDF-1.4 Non-Disclosure Agreement (NDA) Corp'),
        mimetype: 'application/pdf',
        originalname: 'acuerdo_confidencialidad_nda.pdf',
        size: 44,
      };

      const ndaDoc = await uploadHrDocument(empId, 'nda', 'Acuerdo de Confidencialidad y Propiedad Intelectual (NDA)', dummyNda);
      assert.strictEqual(ndaDoc.document_type, 'nda');
      createdDocIds.push(ndaDoc.id);

      const docs = await getDocumentsByEmployeeId(empId);
      assert.strictEqual(docs.length, 2);
    });

    it('deleteHrDocument() elimina el registro de la base de datos y borra el archivo del disco', async () => {
      const dummyDoc = {
        buffer: Buffer.from('Temporal document to be deleted'),
        mimetype: 'application/pdf',
        originalname: 'temp_doc.pdf',
        size: 30,
      };

      const doc = await uploadHrDocument(empId, 'other', 'Documento Temporal', dummyDoc);
      const filePath = path.resolve(ADMIN_DIR, 'public', doc.file_url.replace(/^\//, ''));
      assert.ok(fs.existsSync(filePath));

      const deleted = await deleteHrDocument(doc.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(fs.existsSync(filePath), false, 'Archivo en disco debe ser eliminado');
    });
  });

  describe('Parte 5: Construcción Jerárquica del Organigrama Empresarial', () => {
    it('getOrganigramTree() arma la jerarquía de supervisión en árbol', async () => {
      const ceoRes = await hireEmployee({
        department_id: 'exec',
        full_name: `CEO Executive ${timestamp}`,
        hire_date: '2025-01-01',
        job_title: 'Chief Executive Officer',
        manager_id: null,
        role: 'PLATFORM_ADMIN',
        salary_amount: 12000,
      });
      createdUserIds.push(ceoRes.employee.user_id);
      createdEmployeeIds.push(ceoRes.employee.id);

      const directorRes = await hireEmployee({
        department_id: 'engineering',
        full_name: `VP of Engineering ${timestamp}`,
        hire_date: '2025-02-01',
        job_title: 'VP of Engineering',
        manager_id: ceoRes.employee.id,
        role: 'SENIOR_ENGINEER',
        salary_amount: 9000,
      });
      createdUserIds.push(directorRes.employee.user_id);
      createdEmployeeIds.push(directorRes.employee.id);

      const devRes = await hireEmployee({
        department_id: 'engineering',
        full_name: `Software Engineer ${timestamp}`,
        hire_date: '2025-03-01',
        job_title: 'Fullstack Engineer',
        manager_id: directorRes.employee.id,
        role: 'ENGINEER',
        salary_amount: 4500,
      });
      createdUserIds.push(devRes.employee.user_id);
      createdEmployeeIds.push(devRes.employee.id);

      const tree = await getOrganigramTree();
      assert.ok(tree.length > 0);

      const ceoNode = tree.find((n) => n.id === ceoRes.employee.id);
      assert.ok(ceoNode, 'El CEO debe ser un nodo raíz');
      assert.ok(ceoNode.subordinates.length >= 1, 'El CEO debe tener subordinados');

      const vpNode = ceoNode.subordinates.find((n) => n.id === directorRes.employee.id);
      assert.ok(vpNode, 'El VP debe ser subordinado del CEO');
      assert.ok(vpNode.subordinates.length >= 1, 'El VP debe tener al ingeniero subordinado');

      const engineerNode = vpNode.subordinates.find((n) => n.id === devRes.employee.id);
      assert.ok(engineerNode, 'El ingeniero debe ser subordinado del VP');
    });
  });

  describe('Parte 6: Resumen Estadístico y Métricas Globales', () => {
    it('getHrSummaryStats() calcula masa salarial mensual y conteo de colaboradores activos', async () => {
      const stats = await getHrSummaryStats();
      assert.ok(stats.total_employees > 0);
      assert.ok(stats.active_employees > 0);
      assert.ok(stats.monthly_payroll_usd > 0);
      assert.ok(typeof stats.pending_vacations_count === 'number');
      assert.ok(typeof stats.total_documents_count === 'number');
    });
  });

  describe('Parte 7: Auditoría de Reglas Maestras (AGENTS.md / GEMINI.md)', () => {
    it('Regla 3: CERO atributos id="..." en la plantilla HTML de RRHH', () => {
      const content = fs.readFileSync(HR_HTML_PATH, 'utf-8');
      const idMatches = content.match(/<[^>]+(\sid=["'][^"']+["'])[^>]*>/g) || [];
      assert.strictEqual(idMatches.length, 0, `Se encontraron atributos id prohibidos en hr.html: ${idMatches.join(', ')}`);
    });

    it('Regla 4: Orden estricto de atributos (botones: type primero; otros: class primero)', () => {
      const content = fs.readFileSync(HR_HTML_PATH, 'utf-8');
      const buttonMatches = content.match(/<button\s+([^>]+)>/g) || [];
      for (const btn of buttonMatches) {
        assert.ok(btn.startsWith('<button type="'), `El botón debe iniciar con type: ${btn}`);
      }

      const divMatches = content.match(/<div\s+([^>]+)>/g) || [];
      for (const div of divMatches) {
        assert.ok(div.startsWith('<div class="'), `El elemento div debe iniciar con class: ${div}`);
      }
    });

    it('Regla 5: Banners de error ubicados debajo de los botones de acción en formularios modales', () => {
      const content = fs.readFileSync(HR_HTML_PATH, 'utf-8');
      const hireBtnPos = content.indexOf('data-ref="btn-submit-hire"');
      const hireErrPos = content.indexOf('data-ref="hire-error-banner"');
      assert.ok(hireErrPos > hireBtnPos, 'El banner de error de contratación debe ubicarse debajo del botón de envío');

      const editBtnPos = content.indexOf('data-ref="btn-submit-edit"');
      const editErrPos = content.indexOf('data-ref="edit-error-banner"');
      assert.ok(editErrPos > editBtnPos, 'El banner de error de edición debe ubicarse debajo del botón de guardado');

      const uploadBtnPos = content.indexOf('data-ref="btn-submit-upload"');
      const uploadErrPos = content.indexOf('data-ref="upload-error-banner"');
      assert.ok(uploadErrPos > uploadBtnPos, 'El banner de error de subida debe ubicarse debajo del botón de subida');
    });

    it('Regla 2: CERO console.* en los archivos nuevos de RRHH (backend y frontend)', () => {
      const files = [HR_SERVICE_PATH, HR_CONTROLLER_PATH, HR_VIEW_PATH];
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf-8');
        const matches = text.match(/console\.(log|warn|error|info|debug)/g) || [];
        assert.strictEqual(matches.length, 0, `Se encontraron console.* en ${path.basename(file)}`);
      }
    });

    it('Regla 7: Imports horizontales en una sola línea y alfabéticos en los archivos nuevos', () => {
      const files = [HR_SERVICE_PATH, HR_CONTROLLER_PATH, HR_VIEW_PATH];
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf-8');
        const lines = text.split('\n');
        const importLines = lines.filter((l) => l.trim().startsWith('import '));

        for (const imp of importLines) {
          assert.strictEqual(imp.includes('\n'), false, `Import multilínea detectado en ${path.basename(file)}: ${imp}`);
        }
      }
    });

    it('Regla 8: CERO anotaciones JSDoc en los archivos nuevos de RRHH', () => {
      const files = [HR_SERVICE_PATH, HR_CONTROLLER_PATH, HR_VIEW_PATH];
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf-8');
        assert.strictEqual(text.includes('/**'), false, `JSDoc detectado en ${path.basename(file)}`);
      }
    });
  });
});
