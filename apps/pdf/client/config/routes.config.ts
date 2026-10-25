import { getCurrentLanguage } from '../services/i18n.service.js';
import { loadStylesheet } from '../utils/dom.util.js';
import { isSupportedLanguage, normalizeLanguageCode } from '../utils/languages.util.js';
import { getLocalizedPath, resolveRouteFromSlug, SEO_ROUTES } from './seo.config.js';

export interface RouteContext {
  params: Record<string, string>;
  path: string;
  previousPath: string;
  query: URLSearchParams;
}

export type RouteHandler = (ctx: RouteContext) => Promise<HTMLElement | null>;

export interface RouteDefinition {
  handler: RouteHandler;
  id: string;
  match: (path: string) => boolean | Record<string, string>;
}

export const APP_ROUTES: RouteDefinition[] = [
  {
    handler: async () => {
      const { createHomeView } = await import('../views/home.view.js');
      return await createHomeView();
    },
    id: 'home',
    match: (path) => path === '/' || path === '',
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfToMarkdownView } = await import('../views/tools/pdf-to-markdown/pdf-to-markdown.view.js');
      return await createPdfToMarkdownView();
    },
    id: 'pdf-to-markdown',
    match: (path) => path === '/pdf-to-markdown' || path.startsWith('/pdf-to-markdown'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-viewer.css');
      const { createSummarizePdfView } = await import('../views/tools/summarize-pdf/summarize-pdf.view.js');
      return await createSummarizePdfView();
    },
    id: 'summarize-pdf',
    match: (path) => path === '/summarize-pdf' || path.startsWith('/summarize-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createTranslatePdfView } = await import('../views/tools/translate-pdf/translate-pdf.view.js');
      return await createTranslatePdfView();
    },
    id: 'translate-pdf',
    match: (path) => path === '/translate-pdf' || path.startsWith('/translate-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createMergePdfView } = await import('../views/tools/merge-pdf/merge-pdf.view.js');
      return await createMergePdfView();
    },
    id: 'merge-pdf',
    match: (path) => path === '/merge-pdf' || path.startsWith('/merge-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createSplitPdfView } = await import('../views/tools/split-pdf/split-pdf.view.js');
      return await createSplitPdfView();
    },
    id: 'split-pdf',
    match: (path) => path === '/split-pdf' || path.startsWith('/split-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createSplitPdfView } = await import('../views/tools/split-pdf/split-pdf.view.js');
      return await createSplitPdfView('pages');
    },
    id: 'extract-pdf-pages',
    match: (path) => path === '/extract-pdf-pages' || path.startsWith('/extract-pdf-pages'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createRemovePdfPagesView } = await import('../views/tools/remove-pdf-pages/remove-pdf-pages.view.js');
      return await createRemovePdfPagesView();
    },
    id: 'remove-pdf-pages',
    match: (path) => path === '/remove-pdf-pages' || path.startsWith('/remove-pdf-pages'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createOrganizePdfView } = await import('../views/tools/organize-pdf/organize-pdf.view.js');
      return await createOrganizePdfView();
    },
    id: 'organize-pdf',
    match: (path) => path === '/organize-pdf' || path.startsWith('/organize-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createRotatePdfView } = await import('../views/tools/rotate-pdf/rotate-pdf.view.js');
      return await createRotatePdfView();
    },
    id: 'rotate-pdf',
    match: (path) => path === '/rotate-pdf' || path.startsWith('/rotate-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPageNumbersView } = await import('../views/tools/page-numbers/page-numbers.view.js');
      return await createPageNumbersView();
    },
    id: 'page-numbers',
    match: (path) => path === '/page-numbers' || path.startsWith('/page-numbers') || path === '/add-page-numbers' || path.startsWith('/add-page-numbers'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-viewer.css');
      const { createCropPdfView } = await import('../views/tools/crop-pdf/crop-pdf.view.js');
      return await createCropPdfView();
    },
    id: 'crop-pdf',
    match: (path) => path === '/crop-pdf' || path.startsWith('/crop-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createWatermarkPdfView } = await import('../views/tools/watermark-pdf/watermark-pdf.view.js');
      return await createWatermarkPdfView();
    },
    id: 'watermark-pdf',
    match: (path) => path === '/watermark-pdf' || path.startsWith('/watermark-pdf') || path === '/add-watermark' || path.startsWith('/add-watermark'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-viewer.css');
      const { createEditPdfView } = await import('../views/tools/edit-pdf/edit-pdf.view.js');
      return await createEditPdfView();
    },
    id: 'edit-pdf',
    match: (path) => path === '/edit-pdf' || path.startsWith('/edit-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createProtectPdfView } = await import('../views/tools/protect-pdf/protect-pdf.view.js');
      return await createProtectPdfView();
    },
    id: 'protect-pdf',
    match: (path) => path === '/protect-pdf' || path.startsWith('/protect-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-viewer.css');
      const { createRedactPdfView } = await import('../views/tools/redact-pdf/redact-pdf.view.js');
      return await createRedactPdfView();
    },
    id: 'redact-pdf',
    match: (path) => path === '/redact-pdf' || path.startsWith('/redact-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createUnlockPdfView } = await import('../views/tools/unlock-pdf/unlock-pdf.view.js');
      return await createUnlockPdfView();
    },
    id: 'unlock-pdf',
    match: (path) => path === '/unlock-pdf' || path.startsWith('/unlock-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-jpg');
    },
    id: 'pdf-to-jpg',
    match: (path) => path === '/pdf-to-jpg' || path.startsWith('/pdf-to-jpg'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-word');
    },
    id: 'pdf-to-word',
    match: (path) => path === '/pdf-to-word' || path.startsWith('/pdf-to-word'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-powerpoint');
    },
    id: 'pdf-to-powerpoint',
    match: (path) => path === '/pdf-to-powerpoint' || path.startsWith('/pdf-to-powerpoint'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-excel');
    },
    id: 'pdf-to-excel',
    match: (path) => path === '/pdf-to-excel' || path.startsWith('/pdf-to-excel'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-pdfa');
    },
    id: 'pdf-to-pdfa',
    match: (path) => path === '/pdf-to-pdfa' || path.startsWith('/pdf-to-pdfa'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('jpg-to-pdf');
    },
    id: 'jpg-to-pdf',
    match: (path) => path === '/jpg-to-pdf' || path.startsWith('/jpg-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('word-to-pdf');
    },
    id: 'word-to-pdf',
    match: (path) => path === '/word-to-pdf' || path.startsWith('/word-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('powerpoint-to-pdf');
    },
    id: 'powerpoint-to-pdf',
    match: (path) => path === '/powerpoint-to-pdf' || path.startsWith('/powerpoint-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('excel-to-pdf');
    },
    id: 'excel-to-pdf',
    match: (path) => path === '/excel-to-pdf' || path.startsWith('/excel-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('html-to-pdf');
    },
    id: 'html-to-pdf',
    match: (path) => path === '/html-to-pdf' || path.startsWith('/html-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-viewer.css');
      const { createComparePdfView } = await import('../views/tools/compare-pdf/compare-pdf.view.js');
      return await createComparePdfView();
    },
    id: 'compare-pdf',
    match: (path) => path === '/compare-pdf' || path.startsWith('/compare-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createCompressPdfView } = await import('../views/tools/compress-pdf/compress-pdf.view.js');
      return await createCompressPdfView();
    },
    id: 'compress-pdf',
    match: (path) => path === '/compress-pdf' || path.startsWith('/compress-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createRepairPdfView } = await import('../views/tools/repair-pdf/repair-pdf.view.js');
      return await createRepairPdfView();
    },
    id: 'repair-pdf',
    match: (path) => path === '/repair-pdf' || path.startsWith('/repair-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/tool-grid.css');
      const { createOcrPdfView } = await import('../views/tools/ocr-pdf/ocr-pdf.view.js');
      return await createOcrPdfView();
    },
    id: 'ocr-pdf',
    match: (path) => path === '/ocr-pdf' || path.startsWith('/ocr-pdf'),
  },
  {
    handler: async ({ params }) => {
      await Promise.all([
        loadStylesheet('/css/components/component-views.css'),
        loadStylesheet('/css/tools/tool-base.css'),
        loadStylesheet('/css/tools/download-ready.css'),
      ]);
      const { createDownloadReadyView } = await import('../views/download-ready/download-ready.view.js');
      return await createDownloadReadyView(params.token);
    },
    id: 'download-ready',
    match: (path) => {
      const downloadMatch = path.match(/^\/download\/([a-zA-Z0-9_-]+)$/);
      if (downloadMatch) return { token: downloadMatch[1] };
      const readyMatch = path.match(/^\/download-ready\/([a-zA-Z0-9_-]+)$/);
      if (readyMatch) return { token: readyMatch[1] };
      if (path === '/download-ready' || path === '/download') return { token: '' };
      return false;
    },
  },
  {
    handler: async () => {
      await loadStylesheet('/css/components/component-ai.css');
      const { createAiView } = await import('../views/ai.view.js');
      return await createAiView();
    },
    id: 'ai',
    match: (path) => path === '/ai' || path.startsWith('/ai'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/components/component-views.css');
      const { createHelpDocumentationView } = await import('../views/help.view.js');
      return await createHelpDocumentationView();
    },
    id: 'help-documentation',
    match: (path) => path === '/help/documentation' || path === '/documentation' || path === '/herramientas',
  },
  {
    handler: async () => {
      await loadStylesheet('/css/components/component-views.css');
      const { createHelpFaqView } = await import('../views/help.view.js');
      return await createHelpFaqView();
    },
    id: 'help-faq',
    match: (path) => path === '/help/faq' || path === '/faq' || path === '/preguntas-frecuentes',
  },
  {
    handler: async () => {
      await loadStylesheet('/css/components/component-views.css');
      const { createAboutView } = await import('../views/about.view.js');
      return await createAboutView();
    },
    id: 'about',
    match: (path) => path === '/about' || path === '/sobre-nosotros' || path === '/help/about' || path.startsWith('/about'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/components/component-views.css');
      const { createContactView } = await import('../views/contact.view.js');
      return await createContactView();
    },
    id: 'contact',
    match: (path) => path === '/contact' || path === '/contacto' || path === '/help/contact' || path.startsWith('/contact'),
  },
  {
    handler: async ({ path }) => {
      await loadStylesheet('/css/components/component-views.css');
      const { createHelpCookiesView, createHelpDocumentationView, createHelpFaqView, createHelpPrivacyView, createHelpSecurityView, createHelpTermsView } = await import('../views/help.view.js');

      switch (path) {
        case '/help/documentation':
        case '/documentation':
        case '/herramientas':
          return await createHelpDocumentationView();
        case '/help/faq':
        case '/faq':
        case '/preguntas-frecuentes':
          return await createHelpFaqView();
        case '/help/about':
        case '/about':
        case '/sobre-nosotros': {
          const { createAboutView } = await import('../views/about.view.js');
          return await createAboutView();
        }
        case '/help/contact':
        case '/contact':
        case '/contacto': {
          const { createContactView } = await import('../views/contact.view.js');
          return await createContactView();
        }
        case '/help/privacy':
        case '/privacy':
        case '/privacy-policy':
          return await createHelpPrivacyView();
        case '/help/terms':
        case '/terms':
        case '/terms-and-conditions':
          return await createHelpTermsView();
        case '/help/cookies':
        case '/cookies':
        case '/cookie-policy':
          return await createHelpCookiesView();
        case '/help/security':
        case '/security-policy':
        default:
          if (path === '/help' || path === '/help/') {
            window.history.replaceState({}, '', '/help/security');
          }
          return await createHelpSecurityView();
      }
    },
    id: 'help',
    match: (path) => path.startsWith('/help') || path === '/privacy' || path === '/privacy-policy' || path === '/terms' || path === '/terms-and-conditions' || path === '/cookies' || path === '/cookie-policy' || path === '/security-policy',
  },
  {
    handler: async () => {
      const { createNotFoundView } = await import('../views/not-found.view.js');
      return await createNotFoundView();
    },
    id: 'not-found',
    match: (path) => path === '/404',
  },
];

export interface MatchedRoute {
  canonicalPath: string;
  hasLangPrefix: boolean;
  internalPath: string;
  isCanonical: boolean;
  lang: string;
  params: Record<string, string>;
  rawPath: string;
  route: RouteDefinition;
  routeId: string;
}

export function parseRoutePath(rawPath: string): {
  hasLangPrefix: boolean;
  internalPath: string;
  lang: string;
  resolvedRouteId: string | null;
  slug: string;
} {
  const clean = (rawPath || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const activeLang = getCurrentLanguage();

  if (!clean) {
    return {
      hasLangPrefix: false,
      internalPath: '/',
      lang: activeLang,
      resolvedRouteId: 'home',
      slug: '',
    };
  }

  const parts = clean.split('/');
  const first = parts[0].toLowerCase();

  if (isSupportedLanguage(first)) {
    const lang = normalizeLanguageCode(first);
    const subPath = parts.slice(1).join('/');

    if (!subPath) {
      return {
        hasLangPrefix: true,
        internalPath: '/',
        lang,
        resolvedRouteId: 'home',
        slug: '',
      };
    }

    const resolved = resolveRouteFromSlug(subPath, lang);
    if (resolved) {
      return {
        hasLangPrefix: true,
        internalPath: `/${resolved.routeId}`,
        lang,
        resolvedRouteId: resolved.routeId,
        slug: subPath,
      };
    }

    return {
      hasLangPrefix: true,
      internalPath: `/${subPath}`,
      lang,
      resolvedRouteId: null,
      slug: subPath,
    };
  }

  const resolved = resolveRouteFromSlug(clean, activeLang);
  if (resolved) {
    return {
      hasLangPrefix: false,
      internalPath: `/${resolved.routeId}`,
      lang: activeLang,
      resolvedRouteId: resolved.routeId,
      slug: clean,
    };
  }

  return {
    hasLangPrefix: false,
    internalPath: `/${clean}`,
    lang: activeLang,
    resolvedRouteId: null,
    slug: clean,
  };
}

export function findRoute(path: string): MatchedRoute | null {
  const parsed = parseRoutePath(path);

  if (parsed.resolvedRouteId) {
    const routeDef = APP_ROUTES.find((r) => r.id === parsed.resolvedRouteId);
    if (routeDef) {
      const matchResult = routeDef.match(parsed.internalPath);
      const params = typeof matchResult === 'object' && matchResult !== null ? matchResult : {};
      const isSeo = parsed.resolvedRouteId in SEO_ROUTES;
      const canonicalPath = isSeo ? getLocalizedPath(parsed.resolvedRouteId, parsed.lang) : path;
      const isCanonical = isSeo ? (parsed.hasLangPrefix && path.replace(/\/+$/, '') === canonicalPath.replace(/\/+$/, '')) : true;

      return {
        canonicalPath,
        hasLangPrefix: parsed.hasLangPrefix,
        internalPath: parsed.internalPath,
        isCanonical,
        lang: parsed.lang,
        params,
        rawPath: path,
        route: routeDef,
        routeId: parsed.resolvedRouteId,
      };
    }
  }

  for (const route of APP_ROUTES) {
    const matchResult = route.match(parsed.internalPath);
    if (matchResult) {
      const params = typeof matchResult === 'object' && matchResult !== null ? matchResult : {};
      const isSeo = route.id in SEO_ROUTES;
      const canonicalPath = isSeo ? getLocalizedPath(route.id, parsed.lang) : path;
      const isCanonical = isSeo ? (parsed.hasLangPrefix && path.replace(/\/+$/, '') === canonicalPath.replace(/\/+$/, '')) : true;

      return {
        canonicalPath,
        hasLangPrefix: parsed.hasLangPrefix,
        internalPath: parsed.internalPath,
        isCanonical,
        lang: parsed.lang,
        params,
        rawPath: path,
        route,
        routeId: route.id,
      };
    }
  }

  return null;
}
