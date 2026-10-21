import crypto from 'crypto';
import { Request, Response } from 'express';
import fs from 'fs';
import { processAiChat } from '../services/ai-agent.service.js';
import { logger } from '../services/logger.service.js';
import { getTempFile, storeTempFile } from '../services/temp-storage.service.js';
import { AiFileAttachment } from '../types/ai.types.js';

export async function handleAiChat(req: Request, res: Response): Promise<void> {
  const multerFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
  const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!rawMessage && multerFiles.length === 0) {
    res.status(400).json({
      error: 'Debes escribir un mensaje o adjuntar al menos un archivo para interactuar con el asistente.',
      success: false,
    });
    return;
  }

  const message = rawMessage || 'Procesa los archivos adjuntos';
  let history: Array<{ role: 'assistant' | 'user'; text: string }> = [];

  if (req.body?.history) {
    if (typeof req.body.history === 'string') {
      try {
        history = JSON.parse(req.body.history);
      } catch {
        history = [];
      }
    } else if (Array.isArray(req.body.history)) {
      history = req.body.history;
    }
  }

  const attachments: AiFileAttachment[] = [];
  const uploadedTokens: Array<{ filename: string; token: string }> = [];

  try {
    for (const file of multerFiles) {
      let buffer: Buffer;
      if (file.buffer && Buffer.isBuffer(file.buffer)) {
        buffer = file.buffer;
      } else if (file.path && fs.existsSync(file.path)) {
        buffer = await fs.promises.readFile(file.path);
      } else {
        buffer = Buffer.alloc(0);
      }

      const uploadToken = crypto.randomUUID();
      await storeTempFile(uploadToken, {
        buffer,
        contentType: file.mimetype || 'application/octet-stream',
        createdAt: Date.now(),
        filename: file.originalname || 'documento.pdf',
        size: buffer.length || file.size || 0,
      });
      uploadedTokens.push({ filename: file.originalname || 'documento.pdf', token: uploadToken });

      attachments.push({
        buffer,
        mimetype: file.mimetype || 'application/octet-stream',
        originalname: file.originalname || 'documento.pdf',
        path: file.path,
        size: buffer.length || file.size || 0,
      });
    }

    if (attachments.length === 0 && (req.body?.fileTokens || req.body?.sourceToken || req.body?.activeToken)) {
      let rawTokens: string[] = [];
      if (req.body.fileTokens) {
        if (typeof req.body.fileTokens === 'string') {
          try {
            const parsed = JSON.parse(req.body.fileTokens);
            rawTokens = Array.isArray(parsed) ? parsed : [req.body.fileTokens];
          } catch {
            rawTokens = [req.body.fileTokens];
          }
        } else if (Array.isArray(req.body.fileTokens)) {
          rawTokens = req.body.fileTokens;
        }
      }
      if (req.body.sourceToken && !rawTokens.includes(req.body.sourceToken)) {
        rawTokens.push(req.body.sourceToken);
      }
      if (req.body.activeToken && !rawTokens.includes(req.body.activeToken)) {
        rawTokens.push(req.body.activeToken);
      }

      for (const tok of rawTokens) {
        if (typeof tok !== 'string' || !tok.trim()) continue;
        const stored = await getTempFile<any>(tok.trim());
        if (stored && stored.buffer && stored.buffer.length > 0) {
          attachments.push({
            buffer: stored.buffer,
            mimetype: stored.contentType || stored.mimeType || 'application/pdf',
            originalname: stored.filename || req.body.activeFilename || 'documento.pdf',
            size: stored.buffer.length,
          });
        }
      }
    }

    const user = (req as any).user;
    const chatResult = await processAiChat({
      files: attachments,
      history,
      message,
      user,
    });

    const finalActiveToken = chatResult.result?.token || (uploadedTokens[0] ? uploadedTokens[0].token : req.body.activeToken);
    const finalActiveFilename = chatResult.result?.filename || (uploadedTokens[0] ? uploadedTokens[0].filename : req.body.activeFilename);

    res.status(200).json({
      data: {
        ...chatResult,
        activeFilename: finalActiveFilename,
        activeToken: finalActiveToken,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Fallo en endpoint handleAiChat', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar tu solicitud con el asistente. Por favor intenta más tarde.',
      success: false,
    });
  } finally {
    for (const file of multerFiles) {
      if (file.path && fs.existsSync(file.path)) {
        try {
          await fs.promises.unlink(file.path);
        } catch {}
      }
    }
  }
}

export async function handleAiDownload(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga no proporcionado.', success: false });
      return;
    }

    const file = await getTempFile<any>(token);
    if (!file || !file.buffer) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', file.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename || 'documento')}"`);
    res.setHeader('Content-Length', file.buffer.length);
    res.send(file.buffer);
  } catch (err) {
    logger.app.error('Error al descargar archivo temporal generado por IA', err);
    res.status(500).json({ error: 'Error al procesar la descarga del archivo.', success: false });
  }
}
