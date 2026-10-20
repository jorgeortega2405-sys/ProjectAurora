import { spawn, SpawnOptions } from 'child_process';
import { logger } from '../services/logger.service.js';

export interface ProcessExecutionOptions extends SpawnOptions {
  timeoutMs?: number;
}

export interface ProcessExecutionResult {
  code: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

export function executeProcessWithTimeout(
  command: string,
  args: string[],
  options: ProcessExecutionOptions = {}
): Promise<ProcessExecutionResult> {
  const { timeoutMs = 60000, ...spawnOptions } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    let proc;
    try {
      proc = spawn(command, args, spawnOptions);
    } catch (spawnErr) {
      logger.app.error(`Fallo inmediato al invocar comando: ${command}`, spawnErr);
      resolve({ code: -1, stderr: String(spawnErr), stdout: '', timedOut: false });
      return;
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        logger.app.warn(`Subproceso excedió tiempo límite de ${timeoutMs}ms: ${command}`, { args });
        try {
          proc.kill('SIGKILL');
        } catch {}
      }, timeoutMs);
    }

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      logger.app.warn(`Error en subproceso: ${command}`, err);
      resolve({ code: -1, stderr: stderr || err.message, stdout, timedOut });
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stderr, stdout, timedOut });
    });
  });
}
