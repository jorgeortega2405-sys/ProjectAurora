import { GetObjectCommand } from '@aws-sdk/client-s3';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { Readable } from 'stream';
import { checkDbConnection, closeDbPools } from './config/database.config.js';
import { config } from './config/env.config.js';
import { checkRedisConnection, redis } from './config/redis.config.js';
import { ensureBucketExists, isS3Configured, S3_BUCKET_NAME, s3Client } from './config/s3.config.js';
import { injectHtmlSeo, isSupportedLanguage, normalizeLanguageCode } from './config/seo.config.js';
import { csrfProtection } from './middlewares/csrf.middleware.js';
import { requestLogger } from './middlewares/request-logger.middleware.js';
import aiRoutes from './routes/ai.routes.js';
import authRoutes from './routes/auth.routes.js';
import downloadRoutes from './routes/download.routes.js';
import educationRoutes from './routes/education.routes.js';
import enterpriseRoutes from './routes/enterprise.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import seoRoutes from './routes/seo.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import ssoRoutes from './routes/sso.routes.js';
import { subscriptionRouter } from './routes/subscription.routes.js';
import toolsRoutes from './routes/tools.routes.js';
import workflowRoutes from './routes/workflow.routes.js';
import { logger } from './services/logger.service.js';



process.on('SIGINT', async () => {
  await closeDbPools();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDbPools();
  process.exit(0);
});

process.on('uncaughtException', (err: Error) => {
  logger.app.error('Excepción no controlada capturada en proceso Node.js', err);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.app.error('Promesa rechazada no controlada en proceso Node.js', reason);
});

async function setupClient(app: express.Express, server: http.Server): Promise<void> {
  if (config.nodeEnv !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      appType: 'spa',
      server: {
        middlewareMode: true,
        watch: {
          binaryInterval: 2000,
          ignored: [
            '**/node_modules/**',
            '**/dist/**',
            '**/logs/**',
            '**/data/**',
            '**/.git/**',
            '**/public/uploads/**',
            '**/database/**',
            '**/docker/**',
            '**/tests/**',
            '**/scripts/**',
          ],
          interval: 1500,
          usePolling: true,
        },
        ws: { server },
      },
    });
    app.use(vite.middlewares);

    app.get('/', (req: Request, res: Response) => {
      const acceptLang = req.headers['accept-language'];
      let targetLang = 'es';
      if (acceptLang) {
        const langs = acceptLang.split(',').map((l) => l.split(';')[0].trim().toLowerCase());
        for (const al of langs) {
          const norm = normalizeLanguageCode(al);
          if (norm && isSupportedLanguage(norm)) {
            targetLang = norm;
            break;
          }
        }
      }
      res.redirect(302, `/${targetLang}`);
    });

    app.use('*', async (req: Request, res: Response, next: NextFunction) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'Endpoint de API no encontrado.',
          success: false,
        });
        return;
      }
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
        const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;
        const transformed = await vite.transformIndexHtml(url, template);
        const html = injectHtmlSeo(transformed, req.path, baseUrl);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const clientDist = path.join(process.cwd(), 'dist/client');
    app.use(
      express.static(clientDist, {
        immutable: true,
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );

    app.get('/', (req: Request, res: Response) => {
      const acceptLang = req.headers['accept-language'];
      let targetLang = 'es';
      if (acceptLang) {
        const langs = acceptLang.split(',').map((l) => l.split(';')[0].trim().toLowerCase());
        for (const al of langs) {
          const norm = normalizeLanguageCode(al);
          if (norm && isSupportedLanguage(norm)) {
            targetLang = norm;
            break;
          }
        }
      }
      res.redirect(302, `/${targetLang}`);
    });

    app.get('*', (req: Request, res: Response) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || req.path.startsWith('/api')) {
        res.status(404).json({
          error: 'Endpoint de API no encontrado.',
          success: false,
        });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      try {
        const template = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf-8');
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
        const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;
        const html = injectHtmlSeo(template, req.path, baseUrl);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch {
        res.sendFile(path.join(clientDist, 'index.html'));
      }
    });
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    logger.app.error('Error no controlado en middleware o ruta', err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = typeof err.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  });
}

async function startServer(): Promise<void> {
  void checkRedisConnection();
  void checkDbConnection();
  void ensureBucketExists();
  const app = express();
  const server = http.createServer(app);

  app.use(compression({
    level: 6,
    threshold: 512,
  }));
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        etag: true,
        lastModified: true,
        maxAge: '1d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else if (filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
            if (config.nodeEnv !== 'production') {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            } else {
              res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            }
          } else if (filePath.endsWith('.json')) {
            res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
          } else if (filePath.endsWith('.svg') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.webp') || filePath.endsWith('.woff2')) {
            res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
          }
        },
      })
    );
  }

  app.get('/uploads/avatars/:filename', async (req: Request, res: Response, next: NextFunction) => {
    const filename = path.basename(req.params.filename);
    const localPath = path.join(process.cwd(), 'public/uploads/avatars', filename);

    if (fs.existsSync(localPath)) {
      next();
      return;
    }

    if (isS3Configured()) {
      try {
        const s3Res = await s3Client.send(
          new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `avatars/${filename}`,
          })
        );
        if (s3Res.Body) {
          res.setHeader('Content-Type', s3Res.ContentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
          (s3Res.Body as Readable).pipe(res);
          return;
        }
      } catch {}
    }

    try {
      if (redis.status === 'ready') {
        const [buffer, mimeType] = await Promise.all([
          redis.getBuffer(`avatar:file:${filename}`),
          redis.get(`avatar:mime:${filename}`),
        ]);

        if (buffer && buffer.length > 0) {
          try {
            const avatarsDir = path.dirname(localPath);
            if (!fs.existsSync(avatarsDir)) {
              fs.mkdirSync(avatarsDir, { recursive: true });
            }
            fs.writeFileSync(localPath, buffer);
          } catch {}

          res.setHeader('Content-Type', mimeType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
          res.send(buffer);
          return;
        }
      }
    } catch (err) {
      logger.app.warn('Error al recuperar avatar distribuido desde Redis', err);
    }

    next();
  });

  app.get('/uploads/student_verifications/:filename', async (req: Request, res: Response, next: NextFunction) => {
    const filename = path.basename(req.params.filename);
    const localPath = path.join(process.cwd(), 'public/uploads/student_verifications', filename);

    if (fs.existsSync(localPath)) {
      next();
      return;
    }

    if (isS3Configured()) {
      try {
        const s3Res = await s3Client.send(
          new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `student_verifications/${filename}`,
          })
        );
        if (s3Res.Body) {
          res.setHeader('Content-Type', s3Res.ContentType || 'application/octet-stream');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          (s3Res.Body as Readable).pipe(res);
          return;
        }
      } catch {}
    }

    next();
  });

  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(csrfProtection);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      name: 'ProjectAurora',
      status: 'ok',
      uptime: process.uptime(),
    });
  });


  app.use('/api', aiRoutes);
  app.use('/api', authRoutes);
  app.use('/api', downloadRoutes);
  app.use('/api', educationRoutes);
  app.use('/api', enterpriseRoutes);
  app.use('/api', organizationRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', ssoRoutes);
  app.use('/api', toolsRoutes);
  app.use('/api', workflowRoutes);
  app.use('/api/subscriptions', subscriptionRouter);
  app.use(seoRoutes);


  await setupClient(app, server);

  const port = config.port;
  server.listen(port, () => {
    logger.app.info(`Servidor ProjectAurora iniciado en http://localhost:${port}`);
  });
}

void startServer();
