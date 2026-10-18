import { config } from '../config/env.config.js';
import { generateLanguageSitemapXml, generateRobotsTxt, generateSitemapIndexXml, isSupportedLanguage, normalizeLanguageCode } from '../config/seo.config.js';
import { Request, Response, Router } from 'express';

const router = Router();

function getBaseUrl(req: Request): string {
  if (config.baseUrl && !config.baseUrl.includes('localhost')) {
    return config.baseUrl;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

router.get('/sitemap.xml', (req: Request, res: Response) => {
  const baseUrl = getBaseUrl(req);
  const xml = generateSitemapIndexXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
});

router.get('/sitemap-:lang.xml', (req: Request, res: Response) => {
  const lang = req.params.lang;
  if (!isSupportedLanguage(lang)) {
    res.status(404).setHeader('Content-Type', 'text/plain').send('Sitemap not found');
    return;
  }
  const baseUrl = getBaseUrl(req);
  const xml = generateLanguageSitemapXml(normalizeLanguageCode(lang), baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
});

router.get('/robots.txt', (req: Request, res: Response) => {
  const baseUrl = getBaseUrl(req);
  const txt = generateRobotsTxt(baseUrl);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(txt);
});

export default router;
