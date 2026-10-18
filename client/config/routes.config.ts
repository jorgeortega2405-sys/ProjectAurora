import { currentUser } from '../services/api.service.js';
import { loadStylesheet } from '../utils/dom.util.js';

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
      await loadStylesheet('/css/components/component-pricing.css');
      const { createUpgradeView } = await import('../views/upgrade.view.js');
      return await createUpgradeView();
    },
    id: 'upgrade',
    match: (path) => path === '/upgrade' || path.startsWith('/upgrade'),
  },

  {
    handler: async () => {
      await loadStylesheet('/css/tools/summarize-pdf.css');
      const { createSummarizePdfView } = await import('../views/tools/summarize-pdf/summarize-pdf.view.js');
      return await createSummarizePdfView();
    },
    id: 'summarize-pdf',
    match: (path) => path === '/summarize-pdf' || path.startsWith('/summarize-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/translate-pdf.css');
      const { createTranslatePdfView } = await import('../views/tools/translate-pdf/translate-pdf.view.js');
      return await createTranslatePdfView();
    },
    id: 'translate-pdf',
    match: (path) => path === '/translate-pdf' || path.startsWith('/translate-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/merge-pdf.css');
      const { createMergePdfView } = await import('../views/tools/merge-pdf/merge-pdf.view.js');
      return await createMergePdfView();
    },
    id: 'merge-pdf',
    match: (path) => path === '/merge-pdf' || path.startsWith('/merge-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/split-pdf.css');
      const { createSplitPdfView } = await import('../views/tools/split-pdf/split-pdf.view.js');
      return await createSplitPdfView();
    },
    id: 'split-pdf',
    match: (path) => path === '/split-pdf' || path.startsWith('/split-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/split-pdf.css');
      const { createSplitPdfView } = await import('../views/tools/split-pdf/split-pdf.view.js');
      return await createSplitPdfView('pages');
    },
    id: 'extract-pdf-pages',
    match: (path) => path === '/extract-pdf-pages' || path.startsWith('/extract-pdf-pages'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/remove-pdf-pages.css');
      const { createRemovePdfPagesView } = await import('../views/tools/remove-pdf-pages/remove-pdf-pages.view.js');
      return await createRemovePdfPagesView();
    },
    id: 'remove-pdf-pages',
    match: (path) => path === '/remove-pdf-pages' || path.startsWith('/remove-pdf-pages'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/organize-pdf.css');
      const { createOrganizePdfView } = await import('../views/tools/organize-pdf/organize-pdf.view.js');
      return await createOrganizePdfView();
    },
    id: 'organize-pdf',
    match: (path) => path === '/organize-pdf' || path.startsWith('/organize-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/rotate-pdf.css');
      const { createRotatePdfView } = await import('../views/tools/rotate-pdf/rotate-pdf.view.js');
      return await createRotatePdfView();
    },
    id: 'rotate-pdf',
    match: (path) => path === '/rotate-pdf' || path.startsWith('/rotate-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/page-numbers.css');
      const { createPageNumbersView } = await import('../views/tools/page-numbers/page-numbers.view.js');
      return await createPageNumbersView();
    },
    id: 'page-numbers',
    match: (path) => path === '/page-numbers' || path.startsWith('/page-numbers') || path === '/add-page-numbers' || path.startsWith('/add-page-numbers'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/crop-pdf.css');
      const { createCropPdfView } = await import('../views/tools/crop-pdf/crop-pdf.view.js');
      return await createCropPdfView();
    },
    id: 'crop-pdf',
    match: (path) => path === '/crop-pdf' || path.startsWith('/crop-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/watermark-pdf.css');
      const { createWatermarkPdfView } = await import('../views/tools/watermark-pdf/watermark-pdf.view.js');
      return await createWatermarkPdfView();
    },
    id: 'watermark-pdf',
    match: (path) => path === '/watermark-pdf' || path.startsWith('/watermark-pdf') || path === '/add-watermark' || path.startsWith('/add-watermark'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/edit-pdf.css');
      const { createEditPdfView } = await import('../views/tools/edit-pdf/edit-pdf.view.js');
      return await createEditPdfView();
    },
    id: 'edit-pdf',
    match: (path) => path === '/edit-pdf' || path.startsWith('/edit-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/protect-pdf.css');
      const { createProtectPdfView } = await import('../views/tools/protect-pdf/protect-pdf.view.js');
      return await createProtectPdfView();
    },
    id: 'protect-pdf',
    match: (path) => path === '/protect-pdf' || path.startsWith('/protect-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/unlock-pdf.css');
      const { createUnlockPdfView } = await import('../views/tools/unlock-pdf/unlock-pdf.view.js');
      return await createUnlockPdfView();
    },
    id: 'unlock-pdf',
    match: (path) => path === '/unlock-pdf' || path.startsWith('/unlock-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-jpg');
    },
    id: 'pdf-to-jpg',
    match: (path) => path === '/pdf-to-jpg' || path.startsWith('/pdf-to-jpg'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-word');
    },
    id: 'pdf-to-word',
    match: (path) => path === '/pdf-to-word' || path.startsWith('/pdf-to-word'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-powerpoint');
    },
    id: 'pdf-to-powerpoint',
    match: (path) => path === '/pdf-to-powerpoint' || path.startsWith('/pdf-to-powerpoint'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-excel');
    },
    id: 'pdf-to-excel',
    match: (path) => path === '/pdf-to-excel' || path.startsWith('/pdf-to-excel'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createPdfConverterView } = await import('../views/tools/pdf-converter/pdf-converter.view.js');
      return await createPdfConverterView('pdf-to-pdfa');
    },
    id: 'pdf-to-pdfa',
    match: (path) => path === '/pdf-to-pdfa' || path.startsWith('/pdf-to-pdfa'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/to-pdf-converter.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('jpg-to-pdf');
    },
    id: 'jpg-to-pdf',
    match: (path) => path === '/jpg-to-pdf' || path.startsWith('/jpg-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/to-pdf-converter.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('word-to-pdf');
    },
    id: 'word-to-pdf',
    match: (path) => path === '/word-to-pdf' || path.startsWith('/word-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/to-pdf-converter.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('powerpoint-to-pdf');
    },
    id: 'powerpoint-to-pdf',
    match: (path) => path === '/powerpoint-to-pdf' || path.startsWith('/powerpoint-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/to-pdf-converter.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('excel-to-pdf');
    },
    id: 'excel-to-pdf',
    match: (path) => path === '/excel-to-pdf' || path.startsWith('/excel-to-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/to-pdf-converter.css');
      const { createToPdfConverterView } = await import('../views/tools/to-pdf-converter/to-pdf-converter.view.js');
      return await createToPdfConverterView('html-to-pdf');
    },
    id: 'html-to-pdf',
    match: (path) => path === '/html-to-pdf' || path.startsWith('/html-to-pdf'),
  },

  {
    handler: async () => {
      await loadStylesheet('/css/tools/compress-pdf.css');
      const { createCompressPdfView } = await import('../views/tools/compress-pdf/compress-pdf.view.js');
      return await createCompressPdfView();
    },
    id: 'compress-pdf',
    match: (path) => path === '/compress-pdf' || path.startsWith('/compress-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/repair-pdf.css');
      const { createRepairPdfView } = await import('../views/tools/repair-pdf/repair-pdf.view.js');
      return await createRepairPdfView();
    },
    id: 'repair-pdf',
    match: (path) => path === '/repair-pdf' || path.startsWith('/repair-pdf'),
  },
  {
    handler: async () => {
      await loadStylesheet('/css/tools/ocr-pdf.css');
      const { createOcrPdfView } = await import('../views/tools/ocr-pdf/ocr-pdf.view.js');
      return await createOcrPdfView();
    },
    id: 'ocr-pdf',
    match: (path) => path === '/ocr-pdf' || path.startsWith('/ocr-pdf'),
  },

  {
    handler: async () => {
      const { createLogin2FAView } = await import('../views/auth.view.js');
      return await createLogin2FAView();
    },
    id: 'login-2fa',
    match: (path) => path === '/login/verification-aditional',
  },
  {
    handler: async () => {
      const { createLoginView } = await import('../views/auth.view.js');
      return await createLoginView();
    },
    id: 'login',
    match: (path) => path === '/login' || path.startsWith('/login/'),
  },
  {
    handler: async () => {
      const { createRegisterView } = await import('../views/auth.view.js');
      return await createRegisterView(1);
    },
    id: 'register',
    match: (path) => path === '/register',
  },
  {
    handler: async () => {
      const { createRegisterView } = await import('../views/auth.view.js');
      return await createRegisterView(2);
    },
    id: 'register-stage2',
    match: (path) => path === '/register/aditional-data',
  },
  {
    handler: async () => {
      const { createRegisterView } = await import('../views/auth.view.js');
      return await createRegisterView(3);
    },
    id: 'register-stage3',
    match: (path) => path === '/register/verification-account',
  },
  {
    handler: async () => {
      const { createForgotPasswordView } = await import('../views/auth.view.js');
      return await createForgotPasswordView();
    },
    id: 'auth-forgot-password',
    match: (path) => path === '/forgot-password',
  },
  {
    handler: async () => {
      const { createResetPasswordView } = await import('../views/auth.view.js');
      return await createResetPasswordView();
    },
    id: 'auth-reset-password',
    match: (path) => path === '/reset-password',
  },
  {
    handler: async ({ params }) => {
      if (!currentUser) {
        window.history.replaceState({}, '', '/login');
        const { createLoginView } = await import('../views/auth.view.js');
        return await createLoginView();
      }
      await loadStylesheet('/css/tools/organize-pdf.css');
      await loadStylesheet('/css/tools/split-pdf.css');
      await loadStylesheet('/css/tools/compress-pdf.css');
      await loadStylesheet('/css/tools/pdf-converter.css');
      const { createWorkflowRunnerView } = await import('../views/workflow/workflow-runner.view.js');
      return await createWorkflowRunnerView(params.id || '');
    },
    id: 'workflow-runner',
    match: (path) => {
      const match = path.match(/^\/workflow\/([a-zA-Z0-9_-]+)$/);
      return match ? { id: match[1] } : false;
    },
  },
  {
    handler: async ({ params }) => {
      await loadStylesheet('/css/tools/download-ready.css');
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
      await loadStylesheet('/css/components/component-views.css');
      const { createWorkflowsPageView } = await import('../views/workflows.view.js');
      return await createWorkflowsPageView();
    },
    id: 'workflows',
    match: (path) => path === '/workflows' || path.startsWith('/workflows'),
  },
  {
    handler: async ({ path }) => {
      await loadStylesheet('/css/components/component-settings.css');
      const { createAccessibilityView, createBillingView, createGuestSettingsView, createPurchasesView, createSecurityView, createYourAccountView } = await import('../views/settings.view.js');

      if (!currentUser) {
        if (path.startsWith('/settings/workflows')) {
          window.history.replaceState({}, '', '/login');
          const { createLoginView } = await import('../views/auth.view.js');
          return await createLoginView();
        }
        if (path !== '/settings/guest' && path !== '/settings/accessibility') {
          window.history.replaceState({}, '', '/settings/guest');
          return await createGuestSettingsView();
        }
        if (path === '/settings/accessibility') {
          return await createAccessibilityView();
        }
        return await createGuestSettingsView();
      }

      if (path === '/settings' || path === '/settings/guest') {
        window.history.replaceState({}, '', '/settings/your-account');
      }

      const subPath = path === '/settings' || path === '/settings/guest' ? '/settings/your-account' : path;
      switch (subPath) {
        case '/settings/accessibility':
          return await createAccessibilityView();
        case '/settings/billing':
          return await createBillingView();
        case '/settings/purchases':
        case '/settings/purchases-history':
          return await createPurchasesView();
        case '/settings/security':
        case '/settings/login-and-security':
          return await createSecurityView();
        case '/settings/workflows': {
          window.history.replaceState({}, '', '/workflows');
          await loadStylesheet('/css/components/component-views.css');
          const { createWorkflowsPageView: createWfPage } = await import('../views/workflows.view.js');
          return await createWfPage();
        }
        case '/settings/your-account':
        case '/settings/profile':
        default:
          return await createYourAccountView();
      }

    },
    id: 'settings',
    match: (path) => path.startsWith('/settings'),
  },
  {
    handler: async ({ path }) => {
      await loadStylesheet('/css/components/component-settings.css');
      const { createHelpCookiesView, createHelpPrivacyView, createHelpSecurityView, createHelpTermsView } = await import('../views/help.view.js');

      switch (path) {
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

export function findRoute(path: string): { params: Record<string, string>; route: RouteDefinition } | null {
  for (const route of APP_ROUTES) {
    const matchResult = route.match(path);
    if (matchResult) {
      const params = typeof matchResult === 'object' ? matchResult : {};
      return { params, route };
    }
  }
  return null;
}
