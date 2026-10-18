import { config } from '../../config/env.config.js';
import { logger } from '../../services/logger.service.js';
import { SummarizePdfParams, SummarizePdfResponse, SummaryMode } from './summarize-pdf.types.js';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MODE_PROMPTS: Record<SummaryMode, string> = {
  detailed: `Genera un análisis y resumen detallado del documento.
Estructura la respuesta de la siguiente forma con formato Markdown limpio:
# Resumen Detallado del Documento
## 1. Contexto y Objetivos
(Explicación clara del propósito y contexto del documento)
## 2. Desglose Temático y Secciones Principales
(Análisis exhaustivo de cada tema o sección importante con subtítulos)
## 3. Datos, Cifras y Evidencia Relevante
(Puntos de datos, estadísticas o argumentos centrales)
## 4. Conclusiones y Hallazgos Finales
(Síntesis y reflexiones finales)`,

  executive: `Genera un Resumen Ejecutivo claro, profesional y de alto impacto del siguiente documento.
Estructura la respuesta de la siguiente forma con formato Markdown limpio:
# Resumen Ejecutivo
## 📌 Visión General
(2 a 3 párrafos concisos resumiendo de qué trata el documento y su mensaje principal)
## 💡 Puntos Clave
(Lista de 5 a 8 viñetas con los aspectos más importantes y conclusiones fundamentales)
## 🎯 Conclusiones y Próximos Pasos
(Conclusiones principales y recomendaciones)`,

  key_points: `Extrae únicamente los Puntos Clave y Aprendizajes Esenciales del documento.
Estructura la respuesta con formato Markdown limpio:
# Puntos Clave y Conclusiones
## 🔑 Aspectos Fundamentales
(Lista clara y concisa de los hallazgos más destacados)
## ⚡ Decisiones y Acciones Clave
(Puntos de acción o implicaciones directas)
## 📌 Resumen en una frase
(Una sola frase memorable que resuma todo el contenido)`,

  qa: `Genera una guía de Preguntas y Respuestas (FAQ) fundamentales basadas en el documento.
Estructura la respuesta con formato Markdown limpio:
# Preguntas y Respuestas Esenciales
(Genera entre 5 y 10 preguntas clave que un lector se haría sobre el documento, con respuestas concisas y directas basadas en el texto)`,
};

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const tempId = randomUUID();
  const tempPath = path.join(os.tmpdir(), `aurora_sum_${tempId}.pdf`);

  await fs.writeFile(tempPath, buffer);

  try {
    const { stdout } = await execFileAsync('pdftotext', [tempPath, '-'], {
      maxBuffer: 30 * 1024 * 1024,
    });
    return stdout ? stdout.trim() : '';
  } catch (error) {
    logger.app.warn('Fallo al extraer texto con pdftotext', { error });
    return '';
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {}
  }
}

async function callGeminiApi(prompt: string, text: string, modelName: string, apiKey: string): Promise<string> {
  const systemInstruction = `Eres un asistente experto de inteligencia artificial especializado en lectura rápida, comprensión y resumen estructurado de documentos.
Tu misión es analizar el texto extraído del documento PDF y generar un resumen fiel, claro y altamente profesional en el mismo idioma que el documento.
No inventes datos que no estén presentes en el texto. Usa Markdown enriquecido para títulos, negritas y viñetas.`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${prompt}\n\n--- INICIO DEL TEXTO DEL DOCUMENTO ---\n${text}\n--- FIN DEL TEXTO DEL DOCUMENTO ---`,
          },
        ],
        role: 'user',
      },
    ],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.3,
    },
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    body: JSON.stringify(requestBody),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.app.error('Error de respuesta en Gemini API', {
      errorBody,
      model: modelName,
      status: response.status,
    });
    throw new Error(`GEMINI_API_ERROR_${response.status}`);
  }

  const data = (await response.json()) as any;
  const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!generatedText) {
    throw new Error('NO_CONTENT_GENERATED');
  }

  return generatedText.trim();
}

export async function summarizePdf(params: SummarizePdfParams): Promise<SummarizePdfResponse> {
  const { buffer, customPrompt, mode = 'executive', originalname } = params;

  const apiKey = config.gemini.apiKey;
  if (!apiKey) {
    throw new Error('CONFIG_GEMINI_KEY_MISSING');
  }

  const rawText = await extractTextFromPdf(buffer);
  if (!rawText || rawText.length < 20) {
    throw new Error('EMPTY_PDF_TEXT');
  }

  const maxChars = 400000;
  const truncatedText = rawText.length > maxChars ? rawText.slice(0, maxChars) : rawText;

  const basePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.executive;
  const finalPrompt = customPrompt ? `${basePrompt}\n\nInstrucción adicional del usuario: ${customPrompt}` : basePrompt;

  const primaryModel = config.gemini.model || 'gemini-3.5-flash';
  const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];

  let summary = '';
  let usedModel = primaryModel;

  try {
    summary = await callGeminiApi(finalPrompt, truncatedText, primaryModel, apiKey);
  } catch (primaryErr) {
    logger.app.warn('Error con modelo primario de Gemini, intentando con modelo alternativo', {
      error: primaryErr,
      model: primaryModel,
    });

    let succeeded = false;
    for (const fallbackModel of fallbackModels) {
      try {
        summary = await callGeminiApi(finalPrompt, truncatedText, fallbackModel, apiKey);
        usedModel = fallbackModel;
        succeeded = true;
        break;
      } catch (fallbackErr) {
        logger.app.warn('Fallo en modelo alternativo de Gemini', { error: fallbackErr, model: fallbackModel });
      }
    }

    if (!succeeded) {
      throw new Error('GEMINI_UNAVAILABLE');
    }
  }

  const wordCount = summary.split(/\s+/).filter(Boolean).length;

  return {
    characterCount: summary.length,
    extractedChars: rawText.length,
    filename: originalname,
    mode,
    model: usedModel,
    summary,
    wordCount,
  };
}
