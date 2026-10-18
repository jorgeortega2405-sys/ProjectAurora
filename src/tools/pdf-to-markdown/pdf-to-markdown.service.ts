import { config } from '../../config/env.config.js';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { MarkdownConversionMode, PdfToMarkdownParams, PdfToMarkdownResponse, StoredMarkdownFile } from './pdf-to-markdown.types.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const MODE_INSTRUCTIONS: Record<MarkdownConversionMode, string> = {
  academic: `Enfócate en la conversión de documentos técnicos, científicos o académicos.
- Detecta y representa todas las fórmulas y ecuaciones matemáticas utilizando sintaxis LaTeX estándar ($...$ para fórmulas inline y $$...$$ para bloques de ecuaciones en líneas independientes).
- Identifica fragmentos de código fuente, pseudo-código o comandos y enciérralos en bloques delimitados con tres acentos graves e indica el lenguaje respectivo.
- Preserva la estructura de citas académicas, referencias bibliográficas, notas al pie y secciones numeradas.`,

  clean: `Convierte el documento a un formato Markdown limpio, fluido y altamente legible.
- Elimina encabezados recurrentes de página, números de página repetitivos (como "Pág. 1 de 20") y notas al margen superfluas.
- Unifica párrafos fragmentados causados por saltos de página y conserva solo las divisiones estructurales principales.
- Transforma el contenido en una lectura continua, limpia y agradable.`,

  structured: `Convierte la totalidad del documento PDF a formato Markdown de alta fidelidad estructural.
- Respeta estrictamente la jerarquía visual de títulos (usa # para el título principal, ## para secciones, ### para subsecciones).
- Convierte cualquier tabla a sintaxis de tablas Markdown GitHub Flavored Markdown (| Encabezado 1 | Encabezado 2 |), alineando columnas y preservando el contenido íntegro de cada celda.
- Preserva listas ordenadas y listas con viñetas, respetando sus niveles de anidamiento.
- Emplea **negrita** para términos destacados y *cursiva* para énfasis o anotaciones contextuales.`,

  tables: `Prioriza la detección, extracción y formateo riguroso de tablas y datos tabulares del documento.
- Todas las tablas, cuadros comparativos o listas de datos tabulares deben convertirse a tablas Markdown GFM completas con cabeceras explícitas y separadores (| --- | --- |).
- Si hay cifras, unidades o porcentajes, mantenlos ordenados y alineados correctamente.
- Acompaña cada tabla con su título o pie explicativo correspondiente si está presente en el documento.`,
};

function sanitizeFilename(originalName?: string): string {
  if (!originalName) return 'documento.md';
  const parsed = path.parse(originalName);
  const base = parsed.name.replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim() || 'documento';
  return `${base}.md`;
}

function stripMarkdownCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```markdown') && cleaned.endsWith('```')) {
    cleaned = cleaned.slice(11, -3).trim();
  } else if (cleaned.startsWith('```md') && cleaned.endsWith('```')) {
    cleaned = cleaned.slice(5, -3).trim();
  } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.slice(3, -3).trim();
  }
  return cleaned;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
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
      if (pageStrings.length > 0) {
        pagesText.push(pageStrings.join(' '));
      }
    }

    return pagesText.join('\n\n');
  } catch (err) {
    logger.app.warn('No se pudo extraer texto con pdfjs en backend', { error: err });
    return '';
  }
}

async function callGeminiApi(
  systemInstruction: string,
  userPrompt: string,
  pdfBuffer: Buffer | null,
  rawText: string,
  modelName: string,
  apiKey: string
): Promise<string> {
  const parts: any[] = [];

  const canUseMultimodal = pdfBuffer && pdfBuffer.length > 0 && pdfBuffer.length <= 18 * 1024 * 1024;

  if (canUseMultimodal) {
    parts.push({
      inlineData: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
      },
    });
    parts.push({
      text: userPrompt,
    });
  } else {
    parts.push({
      text: `${userPrompt}\n\n--- INICIO DEL CONTENIDO DEL DOCUMENTO ---\n${rawText}\n--- FIN DEL CONTENIDO DEL DOCUMENTO ---`,
    });
  }

  const requestBody = {
    contents: [
      {
        parts,
        role: 'user',
      },
    ],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.2,
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
    logger.app.error('Error de respuesta en Gemini API al convertir PDF a Markdown', {
      errorBody,
      model: modelName,
      status: response.status,
    });
    throw new Error(`GEMINI_API_ERROR_${response.status}`);
  }

  const data = (await response.json()) as any;
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText) {
    throw new Error('NO_CONTENT_GENERATED');
  }

  return stripMarkdownCodeFences(candidateText);
}

export async function getStoredMarkdown(fileId: string): Promise<StoredMarkdownFile | null> {
  return getTempFile<StoredMarkdownFile>(fileId);
}

export async function convertPdfToMarkdown(params: PdfToMarkdownParams): Promise<PdfToMarkdownResponse> {
  const startTime = Date.now();
  const {
    buffer,
    customPrompt,
    includeMathLatex = false,
    mode = 'structured',
    originalname = 'documento.pdf',
    preserveTables = true,
    removeHeadersFooters = true,
  } = params;

  const apiKey = config.gemini.apiKey;
  if (!apiKey) {
    throw new Error('CONFIG_GEMINI_KEY_MISSING');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('EMPTY_PDF_BUFFER');
  }

  let rawExtractedText = '';
  const isMultimodalEligible = buffer.length <= 18 * 1024 * 1024;

  if (!isMultimodalEligible) {
    rawExtractedText = await extractTextFromPdf(buffer);
    if (!rawExtractedText || rawExtractedText.trim().length < 10) {
      throw new Error('EMPTY_PDF_TEXT');
    }
  }

  const systemInstruction = `Eres un motor experto de conversión de documentos PDF a Markdown de alta fidelidad, similar a las herramientas profesionales de conversión como iLovePDF, Marker y MinerU.
Tu objetivo primordial es transformar el documento PDF proporcionado en código Markdown (GitHub Flavored Markdown) impecable, semántico y completamente fiel al contenido original.

Reglas obligatorias:
1. Respeta la estructura y semántica del texto original. Usa encabezados Markdown (#, ##, ###) para jerarquía de títulos.
2. Devuelve únicamente el contenido Markdown puro. No agregues preámbulos, no agregues explicaciones, no saludes ni agregues despedidas (nada como "Aquí tienes tu markdown:").
3. Si el documento contiene tablas, transfórmalas a tablas Markdown GFM completas con separadores de columnas y cabeceras.
4. Preserva listas, negritas, cursivas y citas en bloque (>).
5. Mantén los enlaces URL legibles en formato [Texto](url) si existen.
6. Si hay código fuente, identifícalo con bloques de acentos graves triples.`;

  const modeInstruction = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.structured;

  const additionalDirectives: string[] = [];
  if (includeMathLatex) {
    additionalDirectives.push('- Transcribe todas las expresiones matemáticas y ecuaciones en formato LaTeX ($...$ para fórmulas dentro de texto y $$...$$ para bloques de ecuaciones).');
  }
  if (removeHeadersFooters) {
    additionalDirectives.push('- Omite números de página repetitivos, pies de página recurrentes y encabezados repetidos entre páginas.');
  }
  if (preserveTables) {
    additionalDirectives.push('- Formatea cualquier estructura de datos tabulares como tabla Markdown estándar con cabecera y separador (| --- |).');
  }
  if (customPrompt && customPrompt.trim().length > 0) {
    additionalDirectives.push(`- Instrucción personalizada del usuario: ${customPrompt.trim()}`);
  }

  const userPrompt = `Convierte este documento PDF completo a formato Markdown (.md) siguiendo estas instrucciones específicas:
${modeInstruction}

Directivas adicionales:
${additionalDirectives.join('\n')}

Recuerda: Devuelve únicamente el Markdown generado sin bloques que lo envuelvan ni comentarios meta.`;

  const primaryModel = config.gemini.model || 'gemini-3.5-flash';
  const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];

  let markdownResult = '';
  let usedModel = primaryModel;

  try {
    markdownResult = await callGeminiApi(
      systemInstruction,
      userPrompt,
      isMultimodalEligible ? buffer : null,
      rawExtractedText,
      primaryModel,
      apiKey
    );
  } catch (primaryErr) {
    logger.app.warn('Error con modelo primario de Gemini en conversión PDF a Markdown, usando modelo alternativo', {
      error: primaryErr,
      model: primaryModel,
    });

    if (isMultimodalEligible && !rawExtractedText) {
      rawExtractedText = await extractTextFromPdf(buffer);
    }

    let succeeded = false;
    for (const fallbackModel of fallbackModels) {
      try {
        markdownResult = await callGeminiApi(
          systemInstruction,
          userPrompt,
          isMultimodalEligible ? buffer : null,
          rawExtractedText,
          fallbackModel,
          apiKey
        );
        usedModel = fallbackModel;
        succeeded = true;
        break;
      } catch (fallbackErr) {
        logger.app.warn('Fallo en modelo alternativo de Gemini para conversión a Markdown', {
          error: fallbackErr,
          model: fallbackModel,
        });
      }
    }

    if (!succeeded) {
      throw new Error('GEMINI_UNAVAILABLE');
    }
  }

  const cleanedMarkdown = stripMarkdownCodeFences(markdownResult);
  const outFilename = sanitizeFilename(originalname);
  const fileId = `md_${Date.now()}_${randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  const mdBuffer = Buffer.from(cleanedMarkdown, 'utf-8');

  await storeTempFile(fileId, {
    buffer: mdBuffer,
    contentType: 'text/markdown; charset=utf-8',
    createdAt: Date.now(),
    fileId,
    filename: outFilename,
    fileSize: mdBuffer.length,
    markdown: cleanedMarkdown,
  });

  const wordCount = cleanedMarkdown.split(/\s+/).filter(Boolean).length;
  const lineCount = cleanedMarkdown.split('\n').length;
  const characterCount = cleanedMarkdown.length;
  const processingTimeMs = Date.now() - startTime;

  return {
    characterCount,
    downloadUrl: `/api/tools/pdf-to-markdown/download/${fileId}`,
    fileId,
    filename: outFilename,
    lineCount,
    markdown: cleanedMarkdown,
    mode,
    model: usedModel,
    processingTimeMs,
    wordCount,
  };
}
