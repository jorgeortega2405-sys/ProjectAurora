import assert from 'node:assert';
import { describe, it } from 'node:test';
import { PDFDocument, rgb } from 'pdf-lib';
import { redactPdf, getStoredRedactedPdf } from '../dist/tools/redact-pdf/redact-pdf.service.js';
import { redactPdfLimiter } from '../dist/middlewares/rate-limit.middleware.js';
import { executeWorkflowSteps } from '../dist/services/workflow.service.js';

describe('Redact PDF Tool - Functional & Security Suite', () => {
  it('Validates empty buffer error handling', async () => {
    await assert.rejects(
      async () => {
        await redactPdf({
          buffer: Buffer.alloc(0),
          originalFilename: 'empty.pdf',
          redactions: [],
        });
      },
      {
        message: 'EMPTY_PDF_BUFFER',
      }
    );
  });

  it('Redacts specific text, applies black rectangles, sanitizes metadata, and deletes full pages', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle('Sensitive Title 2026');
    pdfDoc.setAuthor('Secret Author');
    pdfDoc.setSubject('Classified Subject');

    const page1 = pdfDoc.addPage([600, 400]);
    page1.drawText('CONFIDENTIAL_BOARDPDF_DATA and PUBLIC_INFO', {
      x: 50,
      y: 350,
      size: 14,
      color: rgb(0, 0, 0),
    });

    const page2 = pdfDoc.addPage([600, 400]);
    page2.drawText('TOP_SECRET_PAGE_2_DATA', {
      x: 50,
      y: 350,
      size: 14,
      color: rgb(0, 0, 0),
    });

    const initialPdfBytes = await pdfDoc.save();
    const initialBuffer = Buffer.from(initialPdfBytes);

    const result = await redactPdf({
      buffer: initialBuffer,
      originalFilename: 'documento_clasificado.pdf',
      redactions: [
        {
          pageIndex: 0,
          fullPage: false,
          boxes: [
            {
              x: 50,
              y: 36,
              width: 150,
              height: 18,
              text: 'CONFIDENTIAL_BOARDPDF_DATA',
            },
          ],
        },
        {
          pageIndex: 1,
          fullPage: true,
          boxes: [],
        },
      ],
      sanitizeMetadata: true,
    });

    assert.ok(result, 'Result should exist');
    assert.ok(result.fileId.startsWith('redact_'), 'fileId must start with redact_');
    assert.strictEqual(result.filename, 'documento_clasificado_censurado.pdf');
    assert.strictEqual(result.totalPages, 2);
    assert.strictEqual(result.redactedPagesCount, 2);
    assert.strictEqual(result.redactedBoxesCount, 1);
    assert.ok(result.downloadUrl.includes(result.fileId), 'downloadUrl must contain fileId');

    const stored = await getStoredRedactedPdf(result.fileId);
    assert.ok(stored, 'Redacted PDF must be stored in temp storage');
    assert.strictEqual(stored.filename, 'documento_clasificado_censurado.pdf');
    assert.strictEqual(stored.contentType, 'application/pdf');

    const verifiedDoc = await PDFDocument.load(stored.buffer);
    assert.strictEqual(verifiedDoc.getPageCount(), 2);
    assert.strictEqual(verifiedDoc.getTitle() || '', '');
    assert.strictEqual(verifiedDoc.getAuthor() || '', '');
    assert.strictEqual(verifiedDoc.getSubject() || '', '');

    const stringifiedBuffer = stored.buffer.toString('binary');
    assert.ok(
      !stringifiedBuffer.includes('TOP_SECRET_PAGE_2_DATA'),
      'Full page redaction must purge underlying page 2 stream text'
    );
  });

  it('Verifies non-existent fileId returns null', async () => {
    const stored = await getStoredRedactedPdf('redact_non_existent_id');
    assert.strictEqual(stored, null);
  });

  it('Verifies rate limiter middleware export exists', () => {
    assert.strictEqual(typeof redactPdfLimiter, 'function');
  });

  it('Verifies workflow runner step integration for redact-pdf', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([500, 300]);
    page.drawText('Workflow Redaction Test');
    const bytes = await pdfDoc.save();

    const execution = await executeWorkflowSteps(
      [
        {
          id: 'step_1',
          options: {
            redactions: [
              {
                pageIndex: 0,
                fullPage: true,
                boxes: [],
              },
            ],
          },
          tool: 'redact-pdf',
        },
      ],
      Buffer.from(bytes),
      'test.pdf'
    );

    assert.ok(execution, 'Workflow execution must return result');
    assert.strictEqual(execution.success, true);
    assert.ok(execution.downloadUrl, 'downloadUrl must be present');
    assert.ok(execution.filename.includes('test_censurado.pdf'));
    assert.strictEqual(execution.steps.length, 1);
    assert.strictEqual(execution.steps[0].tool, 'redact-pdf');
    assert.strictEqual(execution.steps[0].success, true);
  });
});
