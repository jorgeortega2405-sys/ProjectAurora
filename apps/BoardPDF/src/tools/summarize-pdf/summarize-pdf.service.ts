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
  advanced: `Genera un Análisis y Resumen Avanzado, exhaustivo y profundo del siguiente documento mediante IA avanzada.
Estructura la respuesta de la siguiente forma con formato Markdown limpio:
# Análisis Avanzado del Documento
## 1. Contexto, Objetivos y Alcance
(Explicación detallada del propósito, contexto y destinatarios)
## 2. Desglose Temático y Secciones Principales
(Análisis exhaustivo de cada sección relevante con subtítulos explicativos)
## 3. Datos Clave, Métricas y Evidencia
(Puntos de datos, estadísticas, citas o argumentos centrales)
## 4. Hallazgos Críticos e Implicaciones
(Análisis de impacto, implicaciones estratégicas y riesgos)
## 5. Recomendaciones y Conclusiones Ejecutivas
(Plan de acción o recomendaciones detalladas)`,

  standard: `Genera un Resumen Estándar claro, conciso y profesional del siguiente documento.
Estructura la respuesta de la siguiente forma con formato Markdown limpio:
# Resumen General
## 📌 Visión General
(2 a 3 párrafos concisos resumiendo de qué trata el documento y su mensaje principal)
## 💡 Puntos Clave
(Lista de 5 a 8 viñetas con los aspectos más importantes y conclusiones fundamentales)
## 🎯 Conclusiones
(Conclusiones principales y aspectos a considerar)`,
};

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const tempId = randomUUID();
  const tempPath = path.join(os.tmpdir(), `boardpdf_sum_${tempId}.pdf`);

  await fs.writeFile(tempPath, buffer);

  try {
    const { stdout } = await execFileAsync('pdftotext', [tempPath, '-'], {
      maxBuffer: 30 * 1024 * 1024,
    });
    if (stdout && stdout.trim().length > 0) {
      return stdout.trim();
    }
  } catch (error) {
    logger.app.warn('Fallo al extraer texto con pdftotext, intentando con pdfjs-dist', { error });
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch {}
  }

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pagesText: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      pagesText.push(pageStrings.join(' '));
    }

    return pagesText.join('\n\n').trim();
  } catch (err) {
    logger.app.warn('Error al extraer texto con pdfjs-dist en summarize-pdf', err);
    return '';
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
  const { buffer, customPrompt, mode = 'standard', originalname } = params;

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

  const basePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.standard;
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
