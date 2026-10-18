import { config } from '../../config/env.config.js';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { StoredTranslatedPdf, TranslatePdfParams, TranslatePdfResponse } from './translate-pdf.types.js';
import { randomUUID } from 'node:crypto';

export async function getTranslatedPdf(fileId: string): Promise<StoredTranslatedPdf | null> {
  return getTempFile<StoredTranslatedPdf>(fileId);
}

export async function translatePdf(params: TranslatePdfParams): Promise<TranslatePdfResponse> {
  const { buffer, filename, originalname = 'document.pdf', sourceLang, targetLang } = params;

  const apiKey = config.deepl.apiKey;
  if (!apiKey) {
    throw new Error('CONFIG_DEEPL_KEY_MISSING');
  }

  const isFree = apiKey.endsWith(':fx');
  const baseUrl = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'application/pdf' }), originalname);
  formData.append('target_lang', targetLang.toUpperCase());
  if (sourceLang && sourceLang.trim().length > 0) {
    formData.append('source_lang', sourceLang.trim().toUpperCase());
  }

  const uploadEndpoint = `${baseUrl}/v2/document`;
  const uploadResponse = await fetch(uploadEndpoint, {
    body: formData,
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
    },
    method: 'POST',
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    logger.app.error('Error al subir documento a DeepL API', {
      errorBody,
      status: uploadResponse.status,
      statusText: uploadResponse.statusText,
    });

    if (uploadResponse.status === 456) {
      throw new Error('DEEPL_QUOTA_EXCEEDED');
    }
    if (uploadResponse.status === 403) {
      throw new Error('DEEPL_AUTH_ERROR');
    }
    throw new Error('DEEPL_UPLOAD_FAILED');
  }

  const uploadData = (await uploadResponse.json()) as { document_id: string; document_key: string };
  const documentId = uploadData.document_id;
  const documentKey = uploadData.document_key;

  if (!documentId || !documentKey) {
    throw new Error('DEEPL_INVALID_UPLOAD_RESPONSE');
  }

  const statusEndpoint = `${baseUrl}/v2/document/${documentId}`;
  let isDone = false;
  const maxAttempts = 45;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(statusEndpoint, {
      body: new URLSearchParams({ document_key: documentKey }),
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });

    if (!statusResponse.ok) {
      const errText = await statusResponse.text();
      logger.app.error('Error al consultar estado en DeepL API', {
        attempt,
        documentId,
        errText,
        status: statusResponse.status,
      });
      throw new Error('DEEPL_STATUS_CHECK_FAILED');
    }

    const statusData = (await statusResponse.json()) as {
      billed_characters?: number;
      document_id: string;
      message?: string;
      seconds_remaining?: number;
      status: 'done' | 'error' | 'queued' | 'translating';
    };

    if (statusData.status === 'done') {
      isDone = true;
      break;
    }

    if (statusData.status === 'error') {
      logger.app.error('DeepL reportó error en la traducción del documento', {
        documentId,
        message: statusData.message,
      });
      throw new Error('DEEPL_TRANSLATION_ERROR');
    }
  }

  if (!isDone) {
    logger.app.error('Tiempo de espera agotado al traducir documento con DeepL API', { documentId });
    throw new Error('DEEPL_TRANSLATION_TIMEOUT');
  }

  const resultEndpoint = `${baseUrl}/v2/document/${documentId}/result`;
  const resultResponse = await fetch(resultEndpoint, {
    body: new URLSearchParams({ document_key: documentKey }),
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!resultResponse.ok) {
    const errText = await resultResponse.text();
    logger.app.error('Error al descargar documento traducido desde DeepL API', {
      documentId,
      errText,
      status: resultResponse.status,
    });
    throw new Error('DEEPL_DOWNLOAD_FAILED');
  }

  const arrayBuf = await resultResponse.arrayBuffer();
  const resultBuffer = Buffer.from(arrayBuf);
  const fileId = randomUUID();

  const baseName = originalname.replace(/\.[^/.]+$/, '');
  const langSuffix = targetLang.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const finalFilename = `${baseName}_${langSuffix}.pdf`;

  await storeTempFile(fileId, {
    buffer: resultBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename: finalFilename,
    format: 'application/pdf',
    originalname,
    size: resultBuffer.length,
    sourceLang,
    targetLang,
  });

  return {
    downloadUrl: `/api/tools/translate-pdf/download/${fileId}`,
    fileId,
    filename: finalFilename,
    format: 'application/pdf',
    originalname,
    size: resultBuffer.length,
    sourceLang,
    targetLang,
  };
}
