import crypto from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.config.js';
import { compressPdfFile, getCompressedPdf } from '../tools/compress-pdf/compress-pdf.service.js';
import { cropPdf, getCropPdfResult } from '../tools/crop-pdf/crop-pdf.service.js';
import { getOcrPdf, processOcrPdf } from '../tools/ocr-pdf/ocr-pdf.service.js';
import { getOrganizePdfResult, organizePdf } from '../tools/organize-pdf/organize-pdf.service.js';
import { addPageNumbers, getPageNumberResult } from '../tools/page-numbers/page-numbers.service.js';
import { convertPdfToMarkdown } from '../tools/pdf-to-markdown/pdf-to-markdown.service.js';
import { getProtectPdfResult, protectPdf } from '../tools/protect-pdf/protect-pdf.service.js';
import { getStoredRedactedPdf, redactPdfDocument } from '../tools/redact-pdf/redact-pdf.service.js';
import { getRemovePagesResult, removePdfPages } from '../tools/remove-pdf-pages/remove-pdf-pages.service.js';
import { getRepairedPdf, repairPdfFile } from '../tools/repair-pdf/repair-pdf.service.js';
import { getRotatePdfResult, rotatePdf } from '../tools/rotate-pdf/rotate-pdf.service.js';
import { getSplitResult, splitPdfFile } from '../tools/split-pdf/split-pdf.service.js';
import { summarizePdf } from '../tools/summarize-pdf/summarize-pdf.service.js';
import { getTranslatedPdf, translatePdf } from '../tools/translate-pdf/translate-pdf.service.js';
import { getUnlockPdfResult, unlockPdf } from '../tools/unlock-pdf/unlock-pdf.service.js';
import { addWatermarkToPdf, getWatermarkPdfResult } from '../tools/watermark-pdf/watermark-pdf.service.js';
import { CreateWorkflowDto, UpdateWorkflowDto, UserWorkflow, WorkflowCategory, WorkflowExecutionResponse, WorkflowExecutionStepResult, WorkflowStep } from '../types/workflow.types.js';
import { logger } from './logger.service.js';
import { getTempFile, storeTempFile } from './temp-storage.service.js';

interface WorkflowDbRow extends RowDataPacket {
  category: WorkflowCategory;
  created_at: Date | string;
  description: string | null;
  id: string;
  name: string;
  steps: string | WorkflowStep[];
  updated_at: Date | string;
  user_id: string;
}

interface StoredWorkflowResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
}

const TERMINAL_TOOLS = new Set(['pdf-to-excel', 'pdf-to-jpg', 'pdf-to-markdown', 'pdf-to-powerpoint', 'pdf-to-word', 'summarize-pdf']);

function validateWorkflowStepsStructure(steps: WorkflowStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object' || typeof step.tool !== 'string' || !step.tool.trim()) {
      throw new Error(`El paso en la posición ${i + 1} debe especificar una herramienta válida.`);
    }
    const tool = step.tool.trim();
    if (TERMINAL_TOOLS.has(tool) && i < steps.length - 1) {
      throw new Error(`La herramienta "${tool}" es terminal y debe ser el último paso del flujo.`);
    }
  }
}

function normalizePageNumber(item: any): number {
  if (typeof item === 'number') return item;
  if (item && typeof item === 'object') {
    if (typeof item.pageNumber === 'number') return item.pageNumber;
    if (typeof item.pageIndex === 'number') return item.pageIndex + 1;
  }
  return Number(item);
}

function normalizePageIndex(item: any): number {
  if (typeof item === 'number') return item;
  if (item && typeof item === 'object') {
    if (typeof item.pageIndex === 'number') return item.pageIndex;
    if (typeof item.pageNumber === 'number') return item.pageNumber - 1;
  }
  return Number(item);
}

function mapRowToWorkflow(row: WorkflowDbRow): UserWorkflow {
  let steps: WorkflowStep[] = [];
  if (Array.isArray(row.steps)) {
    steps = row.steps;
  } else if (typeof row.steps === 'string') {
    try {
      steps = JSON.parse(row.steps);
    } catch {
      steps = [];
    }
  }

  return {
    category: row.category || 'pdf',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    description: row.description || null,
    id: row.id,
    name: row.name,
    steps,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    user_id: row.user_id,
  };
}

export async function listWorkflows(userId: string): Promise<UserWorkflow[]> {
  try {
    const [rows] = await pool.query<WorkflowDbRow[]>(
      'SELECT id, user_id, name, description, category, steps, created_at, updated_at FROM user_workflows WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(mapRowToWorkflow);
  } catch (err) {
    logger.db.error('Error al consultar flujos de trabajo de usuario', err);
    throw new Error('Error al consultar flujos de trabajo');
  }
}

export async function getWorkflowById(workflowId: string, userId: string): Promise<UserWorkflow | null> {
  try {
    const [rows] = await pool.query<WorkflowDbRow[]>(
      'SELECT id, user_id, name, description, category, steps, created_at, updated_at FROM user_workflows WHERE id = ? AND user_id = ? LIMIT 1',
      [workflowId, userId]
    );
    if (!rows.length) return null;
    return mapRowToWorkflow(rows[0]);
  } catch (err) {
    logger.db.error('Error al obtener flujo de trabajo', err);
    throw new Error('Error al obtener flujo de trabajo');
  }
}

export async function createWorkflow(userId: string, dto: CreateWorkflowDto): Promise<UserWorkflow> {
  const id = crypto.randomUUID();
  const name = (dto.name || '').trim();
  if (!name) {
    throw new Error('El nombre del flujo de trabajo es obligatorio.');
  }

  const category: WorkflowCategory = dto.category === 'image' ? 'image' : 'pdf';
  const steps = Array.isArray(dto.steps) ? dto.steps : [];
  if (steps.length === 0) {
    throw new Error('El flujo de trabajo debe tener al menos una herramienta añadida.');
  }
  validateWorkflowStepsStructure(steps);

  const description = dto.description ? dto.description.trim() : null;
  const stepsJson = JSON.stringify(steps);

  try {
    await pool.query(
      'INSERT INTO user_workflows (id, user_id, name, description, category, steps) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, name, description, category, stepsJson]
    );

    const created = await getWorkflowById(id, userId);
    if (!created) {
      throw new Error('No se pudo verificar el flujo de trabajo creado');
    }
    return created;
  } catch (err) {
    logger.db.error('Error al crear flujo de trabajo', err);
    throw new Error('No se pudo guardar el flujo de trabajo');
  }
}

export async function updateWorkflow(workflowId: string, userId: string, dto: UpdateWorkflowDto): Promise<UserWorkflow | null> {
  const existing = await getWorkflowById(workflowId, userId);
  if (!existing) return null;

  const name = dto.name !== undefined ? dto.name.trim() : existing.name;
  if (!name) {
    throw new Error('El nombre del flujo de trabajo no puede estar vacío.');
  }

  const category = dto.category !== undefined ? dto.category : existing.category;
  const description = dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : existing.description;
  const steps = dto.steps !== undefined ? dto.steps : existing.steps;
  if (steps.length === 0) {
    throw new Error('El flujo de trabajo debe tener al menos un paso.');
  }
  validateWorkflowStepsStructure(steps);

  const stepsJson = JSON.stringify(steps);

  try {
    await pool.query(
      'UPDATE user_workflows SET name = ?, description = ?, category = ?, steps = ? WHERE id = ? AND user_id = ?',
      [name, description, category, stepsJson, workflowId, userId]
    );
    return await getWorkflowById(workflowId, userId);
  } catch (err) {
    logger.db.error('Error al actualizar flujo de trabajo', err);
    throw new Error('No se pudo actualizar el flujo de trabajo');
  }
}

export async function deleteWorkflow(workflowId: string, userId: string): Promise<boolean> {
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM user_workflows WHERE id = ? AND user_id = ?',
      [workflowId, userId]
    );
    return result.affectedRows > 0;
  } catch (err) {
    logger.db.error('Error al eliminar flujo de trabajo', err);
    throw new Error('No se pudo eliminar el flujo de trabajo');
  }
}

interface StepExecutionContext {
  buffer: Buffer;
  filename: string;
  options: Record<string, any>;
  stepIndex: number;
  totalSteps: number;
}

interface StepExecutionResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const STEP_EXECUTORS: Record<string, (ctx: StepExecutionContext) => Promise<StepExecutionResult>> = {
  'compress-pdf': async ({ buffer, filename, options }) => {
    const level = options.level === 'extreme' || options.level === 'low' ? options.level : 'recommended';
    const compressRes = await compressPdfFile({ buffer, level, originalname: filename });
    const stored = await getCompressedPdf(compressRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo comprimido procesado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: compressRes.filename || (filename.replace(/\.pdf$/i, '') + '_comprimido.pdf'),
    };
  },
  'repair-pdf': async ({ buffer, filename }) => {
    const repairRes = await repairPdfFile({ buffer, originalname: filename });
    const stored = await getRepairedPdf(repairRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo reparado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: repairRes.filename || filename,
    };
  },
  'organize-pdf': async ({ buffer, filename, options }) => {
    const pagesOrder = Array.isArray(options.pagesOrder)
      ? options.pagesOrder.map((item: any) => ({
          pageIndex: normalizePageIndex(item),
          rotation: typeof item?.rotation === 'number' ? item.rotation : 0,
        }))
      : undefined;
    const organizeRes = await organizePdf(buffer, filename, {
      order: options.order === 'reverse' ? 'reverse' : 'asc',
      pagesOrder,
    });
    const stored = await getOrganizePdfResult(organizeRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo organizado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: organizeRes.filename || (filename.replace(/\.pdf$/i, '') + '_ordenado.pdf'),
    };
  },
  'split-pdf': async ({ buffer, filename, options, stepIndex, totalSteps }) => {
    const rawSelected = Array.isArray(options.selectedPages)
      ? options.selectedPages
      : Array.isArray(options.pages)
        ? options.pages
        : undefined;
    const selectedPages = rawSelected
      ? rawSelected.map(normalizePageNumber).filter((n) => !isNaN(n))
      : undefined;
    const splitRes = await splitPdfFile(buffer, filename, {
      filename,
      fixedPageCount: options.fixedPageCount,
      maxSizeBytes: options.maxSizeBytes,
      mergeSelected: options.mergeSelected ?? true,
      mode: options.mode || 'range',
      ranges: options.ranges,
      selectedPages,
      submode: options.submode,
    });
    const stored = await getSplitResult(splitRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo dividido.');
    if (stored.isZip && stepIndex < totalSteps - 1) {
      throw new Error('La división del PDF generó múltiples archivos (archivo ZIP) y no permite pasos posteriores en el flujo.');
    }
    return {
      buffer: stored.buffer,
      contentType: stored.contentType || (stored.isZip ? 'application/zip' : 'application/pdf'),
      filename: splitRes.filename || filename,
    };
  },
  'remove-pdf-pages': async ({ buffer, filename, options }) => {
    const rawPages = Array.isArray(options.pagesToRemove)
      ? options.pagesToRemove
      : Array.isArray(options.pages)
        ? options.pages
        : [];
    const pagesToRemove = rawPages.map(normalizePageNumber).filter((n) => !isNaN(n));
    const removeRes = await removePdfPages(buffer, filename, { filename, pagesToRemove });
    const stored = await getRemovePagesResult(removeRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo procesado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: removeRes.filename || filename,
    };
  },
  'extract-pdf-pages': async ({ buffer, filename, options, stepIndex, totalSteps }) => {
    const rawSelected = Array.isArray(options.selectedPages)
      ? options.selectedPages
      : Array.isArray(options.pages)
        ? options.pages
        : [1];
    const selectedPages = rawSelected.map(normalizePageNumber).filter((n) => !isNaN(n));
    const splitRes = await splitPdfFile(buffer, filename, {
      filename,
      mergeSelected: options.mergeSelected ?? true,
      mode: 'pages',
      selectedPages,
      submode: 'custom',
    });
    const stored = await getSplitResult(splitRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo extraído.');
    if (stored.isZip && stepIndex < totalSteps - 1) {
      throw new Error('La extracción de páginas generó múltiples archivos y no permite pasos posteriores en el flujo.');
    }
    return {
      buffer: stored.buffer,
      contentType: stored.contentType || (stored.isZip ? 'application/zip' : 'application/pdf'),
      filename: splitRes.filename || filename,
    };
  },
  'rotate-pdf': async ({ buffer, filename, options }) => {
    const pages = Array.isArray(options.pages)
      ? options.pages.map((p: any) => ({
          pageIndex: normalizePageIndex(p),
          rotation: typeof p?.rotation === 'number' ? p.rotation : 0,
        }))
      : [];
    const defaultGlobalRot = pages.length > 0 ? 0 : 90;
    const globalRotation = typeof options.rotation === 'number'
      ? options.rotation
      : typeof options.globalRotation === 'number'
        ? options.globalRotation
        : defaultGlobalRot;
    const rotateRes = await rotatePdf(buffer, filename, { filename, globalRotation, pages });
    const stored = await getRotatePdfResult(rotateRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo rotado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: rotateRes.filename || filename,
    };
  },
  'crop-pdf': async ({ buffer, filename, options }) => {
    const cropRes = await cropPdf(buffer, filename, {
      applyToAll: options.applyToAll !== false,
      cropBox: options.cropBox,
      filename,
      targetPageIndex: options.targetPageIndex,
    });
    const stored = await getCropPdfResult(cropRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo recortado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: cropRes.filename || filename,
    };
  },
  'watermark-pdf': async ({ buffer, filename, options }) => {
    let imgBuffer: Buffer | undefined;
    if (options.imageBuffer && Buffer.isBuffer(options.imageBuffer)) {
      imgBuffer = options.imageBuffer;
    } else if (typeof options.imageBase64 === 'string' && options.imageBase64.trim().length > 0) {
      imgBuffer = Buffer.from(options.imageBase64.trim(), 'base64');
    } else if (typeof options.image === 'string' && options.image.trim().length > 0) {
      const raw = options.image.trim();
      const base64Part = raw.startsWith('data:') ? (raw.split(',')[1] || '') : raw;
      imgBuffer = Buffer.from(base64Part, 'base64');
    }

    if (options.type === 'image' && (!imgBuffer || imgBuffer.length === 0)) {
      throw new Error('Se requiere una imagen válida para la marca de agua de tipo imagen.');
    }

    const watermarkRes = await addWatermarkToPdf(
      buffer,
      filename,
      {
        color: options.textColor || options.color,
        filename,
        fontSize: options.fontSize,
        position: options.position || 'center',
        rotation: options.rotation,
        text: options.text || options.customText || 'CONFIDENCIAL',
        transparency: typeof options.opacity === 'number' ? options.opacity : options.transparency,
        type: options.type || 'text',
      },
      imgBuffer
    );
    const stored = await getWatermarkPdfResult(watermarkRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo con marca de agua.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: watermarkRes.filename || filename,
    };
  },
  'page-numbers': async ({ buffer, filename, options }) => {
    const numRes = await addPageNumbers(buffer, filename, {
      filename,
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      format: options.format,
      margin: options.margin,
      mode: options.mode || options.pageMode || 'single',
      position: options.position || 'bottom-center',
      startNumber: options.startNumber,
    });
    const stored = await getPageNumberResult(numRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo con numeración.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: numRes.filename || filename,
    };
  },
  'protect-pdf': async ({ buffer, filename, options }) => {
    const protectRes = await protectPdf(buffer, filename, {
      filename,
      password: options.password,
    });
    const stored = await getProtectPdfResult(protectRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo protegido.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: protectRes.filename || filename,
    };
  },
  'redact-pdf': async ({ buffer, filename, options }) => {
    const redactRes = await redactPdfDocument({
      buffer,
      originalFilename: filename,
      redactions: options.redactions || [],
      sanitizeMetadata: options.sanitizeMetadata !== false,
    });
    const stored = await getStoredRedactedPdf(redactRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo censurado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: redactRes.filename || filename,
    };
  },
  'unlock-pdf': async ({ buffer, filename, options }) => {
    const unlockRes = await unlockPdf(buffer, filename, {
      filename,
      password: options.password || '',
    });
    const stored = await getUnlockPdfResult(unlockRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo desbloqueado.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: unlockRes.filename || filename,
    };
  },
  'pdf-to-markdown': async ({ buffer, filename, options }) => {
    const mdRes = await convertPdfToMarkdown({
      buffer,
      mode: options.mode || 'structured',
      originalname: filename,
    });
    return {
      buffer: Buffer.from(mdRes.markdown, 'utf-8'),
      contentType: 'text/markdown; charset=utf-8',
      filename: filename.replace(/\.pdf$/i, '') + '.md',
    };
  },
  'summarize-pdf': async ({ buffer, filename, options }) => {
    const sumRes = await summarizePdf({
      buffer,
      mode: options.mode || 'executive',
      originalname: filename,
    });
    return {
      buffer: Buffer.from(sumRes.summary, 'utf-8'),
      contentType: 'text/markdown; charset=utf-8',
      filename: filename.replace(/\.pdf$/i, '') + '_resumen.md',
    };
  },
  'translate-pdf': async ({ buffer, filename, options }) => {
    const targetLang = (options.targetLang || 'EN').toUpperCase();
    const transRes = await translatePdf({
      buffer,
      filename,
      originalname: filename,
      targetLang,
    });
    const storedTrans = await getTranslatedPdf(transRes.fileId);
    if (!storedTrans?.buffer) throw new Error('Error al recuperar el archivo traducido.');
    return {
      buffer: storedTrans.buffer,
      contentType: 'application/pdf',
      filename: filename.replace(/\.pdf$/i, '') + `_${targetLang.toLowerCase()}.pdf`,
    };
  },
  'ocr-pdf': async ({ buffer, filename, options }) => {
    const ocrRes = await processOcrPdf({
      buffer,
      deskew: options.deskew !== false,
      language: options.language || 'spa',
      originalname: filename,
    });
    const stored = await getOcrPdf(ocrRes.fileId);
    if (!stored?.buffer) throw new Error('Error al recuperar el archivo procesado por OCR.');
    return {
      buffer: stored.buffer,
      contentType: 'application/pdf',
      filename: ocrRes.filename || filename,
    };
  },
  'pdf-to-word': async ({ buffer, filename }) => ({
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: filename.replace(/\.pdf$/i, '') + '.docx',
  }),
  'pdf-to-excel': async ({ buffer, filename }) => ({
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: filename.replace(/\.pdf$/i, '') + '.xlsx',
  }),
  'pdf-to-powerpoint': async ({ buffer, filename }) => ({
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    filename: filename.replace(/\.pdf$/i, '') + '.pptx',
  }),
  'pdf-to-jpg': async ({ buffer, filename }) => ({
    buffer,
    contentType: 'image/jpeg',
    filename: filename.replace(/\.pdf$/i, '') + '.jpg',
  }),
};

export async function executeWorkflowSteps(
  steps: WorkflowStep[],
  inputBuffer: Buffer,
  originalFilename: string,
  category: WorkflowCategory = 'pdf'
): Promise<WorkflowExecutionResponse> {
  if (!inputBuffer || !Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('El archivo de entrada está vacío o no es válido.');
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('El flujo de trabajo debe tener al menos una herramienta añadida.');
  }

  let currentBuffer = inputBuffer;
  let currentFilename = originalFilename && originalFilename.trim() ? originalFilename.trim() : 'documento.pdf';
  if (category === 'pdf' && !currentFilename.toLowerCase().endsWith('.pdf')) {
    currentFilename += '.pdf';
  }
  let currentContentType = category === 'image' ? 'image/png' : 'application/pdf';
  const stepsResults: WorkflowExecutionStepResult[] = [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    const stepId = step?.id || `step_${stepIndex + 1}`;
    const stepTool = typeof step?.tool === 'string' ? step.tool.trim() : '';

    if (!step || typeof step !== 'object' || !stepTool) {
      stepsResults.push({
        stepId,
        success: false,
        tool: stepTool || 'unknown',
      });
      break;
    }

    try {
      const opts = step.options || {};

      if (TERMINAL_TOOLS.has(stepTool) && stepIndex < steps.length - 1) {
        throw new Error(`La herramienta "${stepTool}" es una acción terminal y no permite pasos posteriores en el flujo.`);
      }

      const executor = STEP_EXECUTORS[stepTool];
      if (!executor) {
        throw new Error(`Herramienta no soportada o desconocida en el flujo: ${stepTool}`);
      }

      const res = await executor({
        buffer: currentBuffer,
        filename: currentFilename,
        options: opts,
        stepIndex,
        totalSteps: steps.length,
      });

      currentBuffer = res.buffer;
      currentContentType = res.contentType;
      currentFilename = res.filename;

      stepsResults.push({
        stepId,
        success: true,
        tool: stepTool,
      });
    } catch (stepErr) {
      logger.app.error(`Error al ejecutar paso de flujo: ${stepTool}`, stepErr);
      stepsResults.push({
        stepId,
        success: false,
        tool: stepTool,
      });
      break;
    }
  }

  const token = crypto.randomUUID();
  await storeTempFile(token, {
    buffer: currentBuffer,
    contentType: currentContentType,
    createdAt: Date.now(),
    filename: currentFilename,
  });

  return {
    downloadUrl: `/api/workflows/download/${token}`,
    filename: currentFilename,
    fileSize: currentBuffer.length,
    steps: stepsResults,
    success: stepsResults.length > 0 && stepsResults.every((s) => s.success),
    totalSteps: steps.length,
  };
}

export async function executeWorkflow(
  workflowId: string,
  userId: string,
  inputBuffer: Buffer,
  originalFilename: string
): Promise<WorkflowExecutionResponse> {
  const workflow = await getWorkflowById(workflowId, userId);
  if (!workflow) {
    throw new Error('Flujo de trabajo no encontrado.');
  }

  return executeWorkflowSteps(workflow.steps, inputBuffer, originalFilename, workflow.category);
}

export async function getWorkflowResult(downloadToken: string): Promise<StoredWorkflowResult | null> {
  return getTempFile<StoredWorkflowResult>(downloadToken);
}
