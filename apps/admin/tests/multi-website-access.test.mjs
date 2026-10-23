import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import {
  checkUserWebsiteAccess,
  findUserWithPermissionsById,
  getAdminAccessibleWebsites,
  hasPermission,
} from '../dist/services/auth.service.js';
import { getAllPurchases, getAllInquiries } from '../dist/services/db.service.js';

describe('Suite Multi-Web Hub & Spoke: Catálogo de Sitios, PBAC Scoped y Aislamiento', () => {
  const superAdminId = '50e0819a-7151-433c-8797-613f6cbf0b6a'; // aurora_admin (ADMIN / *)
  const devopsUserId = 'b7123456-3333-4000-8000-000000000003'; // carlos.mendoza (aurora-pdf)
  const opsAgentUserId = 'b7123456-2222-4000-8000-000000000002'; // valeria.torres (aurora-img)

  it('Debe consultar y listar los sitios web activos en la base de datos', async () => {
    const [rows] = await adminDbPool.query('SELECT id, name, slug, status FROM websites ORDER BY id ASC');
    assert.ok(Array.isArray(rows), 'websites debe retornar un arreglo');
    assert.ok(rows.length >= 2, 'Deben existir al menos aurora-pdf y aurora-img');

    const pdfSite = rows.find((r) => r.id === 'aurora-pdf');
    const imgSite = rows.find((r) => r.id === 'aurora-img');

    assert.ok(pdfSite, 'aurora-pdf debe existir en websites');
    assert.strictEqual(pdfSite.slug, 'pdf');
    assert.strictEqual(pdfSite.status, 'active');

    assert.ok(imgSite, 'aurora-img debe existir en websites');
    assert.strictEqual(imgSite.slug, 'img');
    assert.strictEqual(imgSite.status, 'active');
  });

  it('Super Administrador con permiso global (*) debe tener acceso a todos los sitios activos', async () => {
    const adminUser = await findUserWithPermissionsById(superAdminId);
    assert.ok(adminUser, 'El superadministrador debe existir');
    assert.ok(adminUser.permissions.includes('*'), 'Debe tener permiso wildcard *');

    const accessible = await getAdminAccessibleWebsites(adminUser);
    assert.ok(accessible.length >= 2, 'El superadministrador debe ver todas las webs');
    assert.ok(accessible.some((w) => w.id === 'aurora-pdf'));
    assert.ok(accessible.some((w) => w.id === 'aurora-img'));

    const canAccessPdf = await checkUserWebsiteAccess(adminUser, 'aurora-pdf');
    const canAccessImg = await checkUserWebsiteAccess(adminUser, 'aurora-img');
    assert.strictEqual(canAccessPdf, true, 'Debe tener acceso permitido a aurora-pdf');
    assert.strictEqual(canAccessImg, true, 'Debe tener acceso permitido a aurora-img');
  });

  it('Colaborador asignado solo a aurora-pdf debe tener acceso a aurora-pdf y denegado a aurora-img', async () => {
    const devopsUser = await findUserWithPermissionsById(devopsUserId);
    assert.ok(devopsUser, 'El usuario DevOps debe existir');

    const accessible = await getAdminAccessibleWebsites(devopsUser);
    assert.strictEqual(accessible.length, 1, 'DevOps solo debe tener 1 sitio asignado');
    assert.strictEqual(accessible[0].id, 'aurora-pdf');

    const canAccessPdf = await checkUserWebsiteAccess(devopsUser, 'aurora-pdf');
    const canAccessImg = await checkUserWebsiteAccess(devopsUser, 'aurora-img');
    assert.strictEqual(canAccessPdf, true, 'Debe tener acceso a aurora-pdf');
    assert.strictEqual(canAccessImg, false, 'No debe tener acceso a aurora-img');
  });

  it('Colaboradora asignada solo a aurora-img debe tener acceso a aurora-img y denegado a aurora-pdf', async () => {
    const opsUser = await findUserWithPermissionsById(opsAgentUserId);
    assert.ok(opsUser, 'El usuario Operations Agent debe existir');

    const accessible = await getAdminAccessibleWebsites(opsUser);
    assert.strictEqual(accessible.length, 1, 'Operations Agent solo debe tener 1 sitio asignado');
    assert.strictEqual(accessible[0].id, 'aurora-img');

    const canAccessPdf = await checkUserWebsiteAccess(opsUser, 'aurora-pdf');
    const canAccessImg = await checkUserWebsiteAccess(opsUser, 'aurora-img');
    assert.strictEqual(canAccessPdf, false, 'No debe tener acceso a aurora-pdf');
    assert.strictEqual(canAccessImg, true, 'Debe tener acceso a aurora-img');
  });

  it('getAllPurchases debe aislar y filtrar compras por website_id correctamente', async () => {
    // Insertamos una compra de prueba en aurora-pdf y otra en aurora-img
    await adminDbPool.query(`
      INSERT INTO purchases (user_id, stripe_session_id, plan_id, website_id, amount_total, status)
      VALUES 
      ('${superAdminId}', 'cs_test_pdf_001', 'pro', 'aurora-pdf', 19.99, 'completed'),
      ('${superAdminId}', 'cs_test_img_001', 'pro', 'aurora-img', 14.99, 'completed')
      ON DUPLICATE KEY UPDATE amount_total = VALUES(amount_total)
    `);

    const allPurchases = await getAllPurchases(null);
    const pdfPurchases = await getAllPurchases('aurora-pdf');
    const imgPurchases = await getAllPurchases('aurora-img');

    assert.ok(allPurchases.length >= 2, 'La consulta global debe devolver ambas');
    assert.ok(pdfPurchases.length >= 1, 'Debe devolver compras de PDF');
    assert.ok(imgPurchases.length >= 1, 'Debe devolver compras de IMG');

    // Limpieza
    await adminDbPool.query('DELETE FROM purchases WHERE stripe_session_id IN ("cs_test_pdf_001", "cs_test_img_001")');
  });

  it('getAllInquiries debe aislar y filtrar leads/contactos por website_id', async () => {
    await adminDbPool.query(`
      INSERT INTO enterprise_inquiries (id, first_name, last_name, company, email, message, website_id, status)
      VALUES 
      ('inq-test-pdf', 'Juan', 'Perez', 'Empresa PDF SA', 'juan@pdf.com', 'Interés en PDF', 'aurora-pdf', 'pending'),
      ('inq-test-img', 'Maria', 'Gomez', 'Estudio Grafico', 'maria@img.com', 'Interés en IMG', 'aurora-img', 'pending')
      ON DUPLICATE KEY UPDATE message = VALUES(message)
    `);

    const allInquiries = await getAllInquiries(null);
    const pdfInquiries = await getAllInquiries('aurora-pdf');
    const imgInquiries = await getAllInquiries('aurora-img');

    const foundPdfInAll = allInquiries.some((i) => i.id === 'inq-test-pdf');
    const foundImgInAll = allInquiries.some((i) => i.id === 'inq-test-img');
    assert.ok(foundPdfInAll && foundImgInAll, 'Consulta global debe contener ambos');

    const foundPdfInPdf = pdfInquiries.some((i) => i.id === 'inq-test-pdf');
    const foundImgInPdf = pdfInquiries.some((i) => i.id === 'inq-test-img');
    assert.ok(foundPdfInPdf, 'Filtro aurora-pdf debe contener inq-test-pdf');
    assert.strictEqual(foundImgInPdf, false, 'Filtro aurora-pdf no debe contener inq-test-img');

    const foundPdfInImg = imgInquiries.some((i) => i.id === 'inq-test-pdf');
    const foundImgInImg = imgInquiries.some((i) => i.id === 'inq-test-img');
    assert.strictEqual(foundPdfInImg, false, 'Filtro aurora-img no debe contener inq-test-pdf');
    assert.ok(foundImgInImg, 'Filtro aurora-img debe contener inq-test-img');

    // Limpieza
    await adminDbPool.query('DELETE FROM enterprise_inquiries WHERE id IN ("inq-test-pdf", "inq-test-img")');
  });

  after(async () => {
    // Cerramos el pool después del test
    await adminDbPool.end();
  });
});
