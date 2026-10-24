import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { adminConfig } from './config/env.config.js';
import adminRoutes from './routes/admin.routes.js';
import { generateAvatarSvg } from './services/avatar.service.js';
import { logger } from './services/logger.service.js';

const adminDir = process.cwd();
const adminPublicDir = path.resolve(adminDir, 'public');

async function setupClient(app: express.Express, server: http.Server): Promise<void> {
  if (adminConfig.nodeEnv !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      appType: 'spa',
      configFile: path.resolve(adminDir, 'vite.config.ts'),
      root: adminDir,
      server: {
        middlewareMode: true,
        watch: {
          binaryInterval: 2000,
          ignored: [
            '**/node_modules/**',
            '**/dist/**',
            '**/logs/**',
            '**/.git/**',
          ],
          interval: 1500,
          usePolling: true,
        },
        ws: { server },
      },
    });

    app.use(vite.middlewares);

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
        const templatePath = path.resolve(adminDir, 'index.html');
        const template = fs.readFileSync(templatePath, 'utf-8');
        const html = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
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

      const indexPath = path.join(clientDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Error interno: Archivos compilados no encontrados.');
      }
    });
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    logger.app.error('Error no controlado en servidor de administración', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  });
}

async function startAdminServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  const server = http.createServer(app);

  app.use(compression({
    level: 6,
    threshold: 512,
  }));

  if (fs.existsSync(adminPublicDir)) {
    app.use(
      express.static(adminPublicDir, {
        etag: true,
        lastModified: true,
        maxAge: '1d',
      })
    );
  }


  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/admin', adminRoutes);

  app.get('/api/avatar', (req: Request, res: Response) => {
    try {
      const name = String(req.query.name || 'Admin');
      const size = parseInt(String(req.query.size || '128'), 10);
      const svg = generateAvatarSvg(name, size);

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.status(200).send(svg);
    } catch (err) {
      logger.app.error('Error al generar avatar SVG', err);
      res.status(500).end();
    }
  });

  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Endpoint de API no encontrado.',
      success: false,
    });
  });

  await setupClient(app, server);

  const port = adminConfig.port;
  server.listen(port, () => {
    logger.app.info(`Servidor ProjectAurora Admin iniciado en http://localhost:${port}`);
  });
}

void startAdminServer();
