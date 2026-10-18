import assert from 'node:assert';
import { describe, it } from 'node:test';
import { PDFDocument, rgb } from 'pdf-lib';
import { comparePdfDocuments, getStoredComparisonReport } from '../dist/tools/compare-pdf/compare-pdf.service.js';
import { comparePdfLimiter } from '../dist/middlewares/rate-limit.middleware.js';

describe('Compare PDF Tool - Functional & Security Suite', () => {
  it('Validates empty buffer error handling', async () => {
    await assert.rejects(
      async () => {
        await comparePdfDocuments({
          buffer1: Buffer.alloc(0),
          buffer2: Buffer.alloc(0),
        });
      },
      {
        message: 'EMPTY_PDF_BUFFERS',
      }
    );
  });

  it('Compares two identical PDFs and yields 100% similarity with 0 changes', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    page.drawText('Documento Idéntico de Prueba 2026', { x: 50, y: 350, size: 14 });
    const bytes = await doc.save();
    const buffer = Buffer.from(bytes);

    const result = await comparePdfDocuments({
      buffer1: buffer,
      buffer2: buffer,
      filename1: 'doc_base.pdf',
      filename2: 'doc_copia.pdf',
    });

    assert.ok(result, 'Result should exist');
    assert.ok(result.fileId.startsWith('comp_'), 'fileId should start with comp_');
    assert.strictEqual(result.similarityPercentage, 100);
    assert.strictEqual(result.totalChanges, 0);
    assert.strictEqual(result.pagesCompared, 1);
    assert.strictEqual(result.filename, 'doc_base_comparacion.pdf');

    const stored = await getStoredComparisonReport(result.fileId);
    assert.ok(stored, 'Stored report must be retrievable from temp storage');
    assert.strictEqual(stored.contentType, 'application/pdf');
    assert.ok(stored.buffer.length > 0, 'Report buffer should not be empty');
  });

  it('Compares two different PDFs and correctly identifies additions, deletions, and produces comparison report', async () => {
    const doc1 = await PDFDocument.create();
    const page1 = doc1.addPage([600, 400]);
    page1.drawText('UNIVERSIDAD TECNOLOGICA MATAMOROS ANALISIS DE UN EFE', { x: 50, y: 350, size: 12 });
    const buffer1 = Buffer.from(await doc1.save());

    const doc2 = await PDFDocument.create();
    const page2 = doc2.addPage([600, 400]);
    page2.drawText('UNIVERSIDAD TECNOLOGICA MATAMOROS PROYECTOS DE INVERSION Y AUDITORIA', { x: 50, y: 350, size: 12 });
    const buffer2 = Buffer.from(await doc2.save());

    const result = await comparePdfDocuments({
      buffer1,
      buffer2,
      filename1: 'archivo_antiguo.pdf',
      filename2: 'archivo_nuevo.pdf',
    });

    assert.ok(result, 'Result should exist');
    assert.strictEqual(result.pagesCompared, 1);
    assert.ok(result.totalChanges > 0, 'Should detect differences');
    assert.ok(result.similarityPercentage < 100, 'Similarity should be less than 100%');
    assert.ok(result.downloadUrl.includes(result.fileId), 'downloadUrl must contain fileId');

    const firstPageComp = result.pageComparisons[0];
    assert.ok(firstPageComp.hasDifferences, 'Page 1 must have differences');
    assert.ok(firstPageComp.changes.length > 0, 'Page 1 must have change items');

    const change = firstPageComp.changes[0];
    assert.ok(change.oldText || change.newText, 'Change item must contain snippet differences');

    const stored = await getStoredComparisonReport(result.fileId);
    assert.ok(stored, 'Report must be stored');
    const reportDoc = await PDFDocument.load(stored.buffer);
    assert.ok(reportDoc.getPageCount() >= 1, 'Report must have at least 1 page');
  });

  it('Verifies non-existent fileId returns null', async () => {
    const stored = await getStoredComparisonReport('comp_non_existent_123');
    assert.strictEqual(stored, null);
  });

  it('Verifies rate limiter middleware export exists', () => {
    assert.strictEqual(typeof comparePdfLimiter, 'function');
  });
});
