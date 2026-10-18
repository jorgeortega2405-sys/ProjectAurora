import { spawn } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 4050;
const downloadsDir = path.resolve('/app/downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));

const jobs = new Map();

function cleanJobDir(jobId) {
  try {
    const jobDir = path.join(downloadsDir, jobId);
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { force: true, recursive: true });
    }
    jobs.delete(jobId);
  } catch (_) {}
}

setInterval(() => {
  const now = Date.now();
  const maxAge = 20 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (now - job.createdAt > maxAge) {
      cleanJobDir(jobId);
    }
  }
}, 60 * 1000);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
  });
});

app.post('/inspect', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL requerida', success: false });
    return;
  }

  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--skip-download',
    url,
  ];

  const proc = spawn('yt-dlp', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';

  proc.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
  });

  proc.stderr.on('data', (chunk) => {
    stderrData += chunk.toString();
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      res.status(500).json({
        error: 'No fue posible obtener los datos del video.',
        success: false,
      });
      return;
    }

    try {
      const parsed = JSON.parse(stdoutData);
      res.json({
        data: parsed,
        success: true,
      });
    } catch (_) {
      res.status(500).json({
        error: 'Error al interpretar la respuesta de extracción.',
        success: false,
      });
    }
  });

  proc.on('error', () => {
    res.status(500).json({
      error: 'Fallo al ejecutar el proceso extractor.',
      success: false,
    });
  });
});

app.post('/jobs', (req, res) => {
  const { extension = 'mp4', formatSelector, title = 'video', type = 'video', url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL requerida', success: false });
    return;
  }

  const jobId = crypto.randomUUID();
  const jobDir = path.join(downloadsDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const outputTemplate = path.join(jobDir, `output.%(ext)s`);

  const job = {
    createdAt: Date.now(),
    error: null,
    eta: '--:--',
    extension,
    fileName: null,
    filePath: null,
    id: jobId,
    percent: 0,
    speed: '--/s',
    status: 'pending',
    title,
  };

  jobs.set(jobId, job);

  const args = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--progress-template',
    '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '-o',
    outputTemplate,
  ];

  if (type === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    if (formatSelector) {
      args.push('-f', formatSelector);
    }
    args.push('--merge-output-format', extension);
  }

  args.push(url);

  const proc = spawn('yt-dlp', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  job.status = 'downloading';

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.includes('|')) {
        const [percentStr, speedStr, etaStr] = trimmed.split('|');
        const numPercent = parseFloat(percentStr.replace('%', '').trim());
        if (!isNaN(numPercent)) {
          job.percent = Math.min(100, Math.max(0, numPercent));
        }
        if (speedStr && speedStr.trim() !== 'NA') {
          job.speed = speedStr.trim();
        }
        if (etaStr && etaStr.trim() !== 'NA') {
          job.eta = etaStr.trim();
        }
        if (job.percent >= 99) {
          job.status = 'processing';
        }
      }
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      job.status = 'failed';
      job.error = 'La descarga no pudo completarse.';
      return;
    }

    try {
      const files = fs.readdirSync(jobDir);
      const targetFile = files.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
      if (targetFile) {
        job.filePath = path.join(jobDir, targetFile);
        const cleanTitle = (job.title || 'video')
          .replace(/[^\w\s\u00C0-\u00FF.-]/gi, '')
          .trim()
          .slice(0, 80) || 'video';
        const fileExt = path.extname(targetFile).replace('.', '') || extension;
        job.fileName = `${cleanTitle}.${fileExt}`;
        job.percent = 100;
        job.status = 'ready';
      } else {
        job.status = 'failed';
        job.error = 'No se encontró el archivo resultante.';
      }
    } catch (_) {
      job.status = 'failed';
      job.error = 'Error al localizar el archivo generado.';
    }
  });

  proc.on('error', () => {
    job.status = 'failed';
    job.error = 'Fallo en la ejecución del descargador.';
  });

  res.json({
    jobId,
    success: true,
  });
});

app.get('/jobs/:id/progress', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Trabajo no encontrado', success: false });
    return;
  }

  res.json({
    error: job.error,
    eta: job.eta,
    fileName: job.fileName,
    jobId: job.id,
    percent: job.percent,
    speed: job.speed,
    status: job.status,
    success: true,
  });
});

app.get('/jobs/:id/file', (req, res) => {
  const jobId = req.params.id;
  const job = jobs.get(jobId);

  if (!job || job.status !== 'ready' || !job.filePath || !fs.existsSync(job.filePath)) {
    res.status(404).json({ error: 'Archivo no disponible', success: false });
    return;
  }

  res.download(job.filePath, job.fileName, (err) => {
    if (!err) {
      setTimeout(() => cleanJobDir(jobId), 10000);
    }
  });
});

app.listen(port, () => {
  process.stdout.write(`Servicio aurora-downloader escuchando en puerto ${port}\n`);
});
