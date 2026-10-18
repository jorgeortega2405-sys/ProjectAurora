import { ZipArchive } from 'archiver';
import crypto from 'crypto';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { SplitPdfOptions, SplitPdfResponse, StoredSplitResult } from './split-pdf.types.js';

function sanitizeBaseFilename(rawName?: string, defaultName = 'documento_dividido'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_').replace(/\.pdf$/i, '').replace(/\.zip$/i, '');
  return clean || defaultName;
}

function createZipBuffer(files: Array<{ buffer: Buffer; name: string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err: unknown) => reject(err));

    for (const f of files) {
      archive.append(f.buffer, { name: f.name });
    }

    void archive.finalize();
  });
}

export async function splitPdfFile(
  fileBuffer: Buffer,
  originalFilename: string,
  options: SplitPdfOptions
): Promise<SplitPdfResponse> {
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    logger.app.error(`Error al cargar el documento PDF para dividir: ${originalFilename}`, err);
    throw new Error('El archivo seleccionado no es un documento PDF válido o está protegido contra lectura.');
  }

  const totalPages = srcDoc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento PDF no contiene páginas para dividir.');
  }

  const baseName = sanitizeBaseFilename(options.filename || originalFilename, 'documento_dividido');
  const generatedPdfs: Array<{ buffer: Buffer; name: string }> = [];

  if (options.mode === 'range') {
    if (options.submode === 'fixed') {
      const fixedSize = Math.max(1, Math.min(totalPages, options.fixedPageCount || 1));
      let currentStart = 1;
      let partIdx = 1;

      while (currentStart <= totalPages) {
        const currentEnd = Math.min(totalPages, currentStart + fixedSize - 1);
        const pageIndices: number[] = [];
        for (let p = currentStart; p <= currentEnd; p++) {
          pageIndices.push(p - 1);
        }

        const partDoc = await PDFDocument.create();
        const copied = await partDoc.copyPages(srcDoc, pageIndices);
        copied.forEach((cp) => partDoc.addPage(cp));
        const bytes = await partDoc.save();

        generatedPdfs.push({
          buffer: Buffer.from(bytes),
          name: `${baseName}_paginas_${currentStart}-${currentEnd}.pdf`,
        });

        currentStart = currentEnd + 1;
        partIdx++;
      }
    } else {
      const ranges = options.ranges && options.ranges.length > 0 ? options.ranges : [{ from: 1, to: totalPages }];
      const validRanges = ranges.map((r) => ({
        from: Math.max(1, Math.min(totalPages, r.from)),
        to: Math.max(1, Math.min(totalPages, r.to)),
      })).filter((r) => r.from <= r.to);

      if (validRanges.length === 0) {
        throw new Error('Debes especificar al menos un rango de páginas válido.');
      }

      if (options.mergeSelected) {
        const mergedDoc = await PDFDocument.create();
        for (const range of validRanges) {
          const pageIndices: number[] = [];
          for (let p = range.from; p <= range.to; p++) {
            pageIndices.push(p - 1);
          }
          const copied = await mergedDoc.copyPages(srcDoc, pageIndices);
          copied.forEach((cp) => mergedDoc.addPage(cp));
        }
        const bytes = await mergedDoc.save();
        generatedPdfs.push({
          buffer: Buffer.from(bytes),
          name: `${baseName}.pdf`,
        });
      } else {
        for (let i = 0; i < validRanges.length; i++) {
          const range = validRanges[i];
          const pageIndices: number[] = [];
          for (let p = range.from; p <= range.to; p++) {
            pageIndices.push(p - 1);
          }

          const partDoc = await PDFDocument.create();
          const copied = await partDoc.copyPages(srcDoc, pageIndices);
          copied.forEach((cp) => partDoc.addPage(cp));
          const bytes = await partDoc.save();

          generatedPdfs.push({
            buffer: Buffer.from(bytes),
            name: `${baseName}_rango_${i + 1}_pag_${range.from}-${range.to}.pdf`,
          });
        }
      }
    }
  } else if (options.mode === 'pages') {
    if (options.submode === 'all') {
      for (let p = 1; p <= totalPages; p++) {
        const partDoc = await PDFDocument.create();
        const copied = await partDoc.copyPages(srcDoc, [p - 1]);
        partDoc.addPage(copied[0]);
        const bytes = await partDoc.save();

        generatedPdfs.push({
          buffer: Buffer.from(bytes),
          name: `${baseName}_pagina_${p}.pdf`,
        });
      }
    } else {
      const selected = (options.selectedPages || [])
        .map((p) => Math.floor(p))
        .filter((p) => p >= 1 && p <= totalPages);

      const uniqueSorted = Array.from(new Set(selected)).sort((a, b) => a - b);
      if (uniqueSorted.length === 0) {
        throw new Error('Debes seleccionar al menos una página válida para extraer.');
      }

      if (options.mergeSelected) {
        const mergedDoc = await PDFDocument.create();
        const pageIndices = uniqueSorted.map((p) => p - 1);
        const copied = await mergedDoc.copyPages(srcDoc, pageIndices);
        copied.forEach((cp) => mergedDoc.addPage(cp));
        const bytes = await mergedDoc.save();

        generatedPdfs.push({
          buffer: Buffer.from(bytes),
          name: `${baseName}.pdf`,
        });
      } else {
        for (const p of uniqueSorted) {
          const partDoc = await PDFDocument.create();
          const copied = await partDoc.copyPages(srcDoc, [p - 1]);
          partDoc.addPage(copied[0]);
          const bytes = await partDoc.save();

          generatedPdfs.push({
            buffer: Buffer.from(bytes),
            name: `${baseName}_pagina_${p}.pdf`,
          });
        }
      }
    }
  } else if (options.mode === 'size') {
    const minTarget = 50 * 1024;
    const targetBytes = Math.max(minTarget, options.maxSizeBytes || 500 * 1024);

    let currentPartDoc = await PDFDocument.create();
    let currentPartPages: number[] = [];
    let currentPartBytes: Uint8Array | null = null;
    let partNumber = 1;

    for (let p = 1; p <= totalPages; p++) {
      const testDoc = await PDFDocument.create();
      const testPages = [...currentPartPages, p - 1];
      const copied = await testDoc.copyPages(srcDoc, testPages);
      copied.forEach((cp) => testDoc.addPage(cp));
      const testBytes = await testDoc.save();

      if (testBytes.length > targetBytes && currentPartPages.length > 0) {
        const finalBytes = currentPartBytes || (await currentPartDoc.save());
        const startPage = currentPartPages[0] + 1;
        const endPage = currentPartPages[currentPartPages.length - 1] + 1;
        generatedPdfs.push({
          buffer: Buffer.from(finalBytes),
          name: `${baseName}_parte_${partNumber}_pag_${startPage}-${endPage}.pdf`,
        });

        partNumber++;
        currentPartDoc = await PDFDocument.create();
        const singleCopied = await currentPartDoc.copyPages(srcDoc, [p - 1]);
        currentPartDoc.addPage(singleCopied[0]);
        currentPartPages = [p - 1];
        currentPartBytes = await currentPartDoc.save();
      } else {
        currentPartDoc = testDoc;
        currentPartPages = testPages;
        currentPartBytes = testBytes;
      }
    }

    if (currentPartPages.length > 0) {
      const finalBytes = currentPartBytes || (await currentPartDoc.save());
      const startPage = currentPartPages[0] + 1;
      const endPage = currentPartPages[currentPartPages.length - 1] + 1;
      generatedPdfs.push({
        buffer: Buffer.from(finalBytes),
        name: `${baseName}_parte_${partNumber}_pag_${startPage}-${endPage}.pdf`,
      });
    }
  }

  if (generatedPdfs.length === 0) {
    throw new Error('No se generó ningún archivo con la configuración indicada.');
  }

  const isZip = generatedPdfs.length > 1;
  let finalBuffer: Buffer;
  let finalFilename: string;
  let finalContentType: string;

  if (isZip) {
    finalBuffer = await createZipBuffer(generatedPdfs);
    finalFilename = `${baseName}.zip`;
    finalContentType = 'application/zip';
  } else {
    finalBuffer = generatedPdfs[0].buffer;
    finalFilename = `${baseName}.pdf`;
    finalContentType = 'application/pdf';
  }

  const fileId = crypto.randomUUID();
  const storedItem: StoredSplitResult = {
    buffer: finalBuffer,
    contentType: finalContentType,
    createdAt: Date.now(),
    filename: finalFilename,
    id: fileId,
    isZip,
    partsCount: generatedPdfs.length,
    size: finalBuffer.length,
    totalPages,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/split-pdf/download/${fileId}`,
    fileId,
    filename: finalFilename,
    fileSize: finalBuffer.length,
    isZip,
    partsCount: generatedPdfs.length,
    totalPages,
  };
}

export async function getSplitResult(fileId: string): Promise<StoredSplitResult | null> {
  return getTempFile<StoredSplitResult>(fileId);
}
