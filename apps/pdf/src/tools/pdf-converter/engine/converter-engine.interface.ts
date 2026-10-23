import { ConversionType } from '../pdf-converter.types.js';

export interface EngineConversionParams {
  inputPath: string;
  options?: Record<string, unknown>;
  originalFilename: string;
  outputDir: string;
  targetType: ConversionType;
}

export interface EngineConversionResult {
  filename: string;
  isZip: boolean;
  mimeType: string;
  outputPath: string;
}

export interface IConverterEngine {
  convert(params: EngineConversionParams): Promise<EngineConversionResult>;
}
