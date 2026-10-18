import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { IConverterEngine } from './engine/converter-engine.interface.js';
import { LocalConverterEngine } from './engine/local-converter.engine.js';
import { ConversionType, ConvertJobResult, StoredConversionFile } from './pdf-converter.types.js';
import fs from 'fs';
import path from 'path';

const CONVERTER_DIR = path.resolve(process.cwd(), 'data/converter');
const UPLOADS_DIR = path.join(CONVERTER_DIR, 'uploads');
const OUTPUT_DIR = path.join(CONVERTER_DIR, 'output');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export { UPLOADS_DIR };

const activeEngine: IConverterEngine = new LocalConverterEngine();

export async function convertPdfFile(
  file: Express.Multer.File,
  targetType: ConversionType
): Promise<ConvertJobResult> {
  const inputPath = file.path;
  const originalFilename = file.originalname;

  try {
    const result = await activeEngine.convert({
      inputPath,
      originalFilename,
      outputDir: OUTPUT_DIR,
      targetType,
    });

    const buffer = await fs.promises.readFile(result.outputPath);
    const fileSize = buffer.length;
    const token = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      await fs.promises.unlink(result.outputPath);
    } catch {}

    await storeTempFile(token, {
      buffer,
      contentType: result.mimeType,
      createdAt: Date.now(),
      filename: result.filename,
      isZip: result.isZip,
      mimeType: result.mimeType,
      token,
    });

    return {
      downloadToken: token,
      downloadUrl: `/api/tools/pdf-converter/download/${token}`,
      fileSize,
      filename: result.filename,
      isZip: result.isZip,
      mimeType: result.mimeType,
      success: true,
    };
  } finally {
    if (fs.existsSync(inputPath)) {
      try {
        fs.unlinkSync(inputPath);
      } catch {}
    }
  }
}

export async function getStoredConversionFile(token: string): Promise<StoredConversionFile | null> {
  return getTempFile<StoredConversionFile>(token);
}
