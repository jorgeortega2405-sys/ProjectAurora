import { Request, Response } from 'express';
import { logger } from '../services/logger.service.js';
import { SupportAiService, SupportChatMessage } from '../services/support-ai.service.js';

export async function handleSupportChat(req: Request, res: Response): Promise<void> {
  try {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!rawMessage) {
      res.status(400).json({
        error: 'Por favor, escribe una pregunta para el asistente de soporte.',
        success: false,
      });
      return;
    }

    if (rawMessage.length > 2000) {
      res.status(400).json({
        error: 'El mensaje no debe superar los 2000 caracteres.',
        success: false,
      });
      return;
    }

    let history: SupportChatMessage[] = [];
    if (Array.isArray(req.body?.history)) {
      history = req.body.history
        .filter((item: any) => item && typeof item.text === 'string' && (item.role === 'user' || item.role === 'assistant'))
        .slice(-10)
        .map((item: any) => ({
          role: item.role as 'assistant' | 'user',
          text: String(item.text).slice(0, 2000),
        }));
    }

    const result = await SupportAiService.askSupport(rawMessage, history);
    res.json(result);
  } catch (error) {
    logger.app.error('Error al procesar consulta de soporte técnico con IA', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
