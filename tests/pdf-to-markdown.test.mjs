import assert from 'node:assert';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { convertPdfToMarkdown, getStoredMarkdown } from '../dist/tools/pdf-to-markdown/pdf-to-markdown.service.js';
import { pdfToMarkdownLimiter } from '../dist/middlewares/rate-limit.middleware.js';

describe('PDF to Markdown Tool - Functional Suite', () => {
  it('Validates empty buffer error handling', async () => {
    await assert.rejects(
      async () => {
        await convertPdfToMarkdown({
          buffer: Buffer.alloc(0),
          originalname: 'empty.pdf',
        });
      },
      {
        message: 'EMPTY_PDF_BUFFER',
      }
    );
  });

  it('Converts a valid PDF document with headings and table to structured Markdown', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Reporte Financiero Anual\n\nResumen del periodo 2026.');
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const result = await convertPdfToMarkdown({
      buffer: pdfBuffer,
      mode: 'structured',
      originalname: 'reporte.pdf',
      preserveTables: true,
      removeHeadersFooters: true,
    });

    assert.ok(result, 'Result should exist');
    assert.ok(result.fileId.startsWith('md_'), 'fileId should start with md_');
    assert.strictEqual(result.filename, 'reporte.md');
    assert.ok(result.markdown.length > 0, 'Generated markdown should not be empty');
    assert.ok(result.wordCount > 0, 'Word count should be greater than zero');
    assert.ok(result.characterCount > 0, 'Character count should be greater than zero');
    assert.ok(result.lineCount > 0, 'Line count should be greater than zero');
    assert.strictEqual(result.mode, 'structured');
    assert.ok(result.downloadUrl.includes(result.fileId), 'Download URL must include fileId');

    const stored = await getStoredMarkdown(result.fileId);
    assert.ok(stored, 'Stored file should be retrievable from temp-storage');
    assert.strictEqual(stored.filename, 'reporte.md');
    assert.strictEqual(stored.contentType, 'text/markdown; charset=utf-8');
    assert.strictEqual(stored.markdown, result.markdown);
  });

  it('Verifies non-existent fileId returns null', async () => {
    const stored = await getStoredMarkdown('md_non_existent_12345');
    assert.strictEqual(stored, null);
  });

  it('Verifies rate limiter configuration exists', () => {
    assert.strictEqual(typeof pdfToMarkdownLimiter, 'function');
  });
});
