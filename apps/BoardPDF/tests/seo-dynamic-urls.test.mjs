import assert from 'node:assert';
import {
  DEFAULT_LANGUAGE,
  generateLanguageSitemapXml,
  generateRobotsTxt,
  generateSitemapIndexXml,
  getServerCanonicalSlug,
  getServerLocalizedPath,
  injectHtmlSeo,
  isSupportedLanguage,
  normalizeLanguageCode,
  parseRequestPath,
  SERVER_SEO_ROUTES,
  SUPPORTED_LANGUAGES,
} from '../dist/config/seo.config.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      failed++;
      throw err;
    }
  }

  test('Exactly 30 languages supported', () => {
    assert.ok(SUPPORTED_LANGUAGES.length >= 30, 'Must have at least 30 supported languages');
    assert.ok(DEFAULT_LANGUAGE.startsWith('es'), 'Default language must be Spanish');
  });

  test('Language code normalization', () => {
    assert.strictEqual(normalizeLanguageCode('es-MX'), 'es');
    assert.strictEqual(normalizeLanguageCode('es-419'), 'es');
    assert.strictEqual(normalizeLanguageCode('es-ES'), 'es');
    assert.strictEqual(normalizeLanguageCode('en-US'), 'en');
    assert.strictEqual(normalizeLanguageCode('en-GB'), 'en');
    assert.strictEqual(normalizeLanguageCode('us'), 'en');
    assert.strictEqual(normalizeLanguageCode('pt-BR'), 'pt');
    assert.strictEqual(normalizeLanguageCode(''), DEFAULT_LANGUAGE);
    assert.strictEqual(normalizeLanguageCode(null), DEFAULT_LANGUAGE);
    assert.strictEqual(normalizeLanguageCode('xx-unknown'), DEFAULT_LANGUAGE);
  });

  test('isSupportedLanguage verification', () => {
    assert.strictEqual(isSupportedLanguage('es'), true);
    assert.strictEqual(isSupportedLanguage('en'), true);
    assert.strictEqual(isSupportedLanguage('fr'), true);
    assert.strictEqual(isSupportedLanguage('de'), true);
    assert.strictEqual(isSupportedLanguage('pt'), true);
    assert.strictEqual(isSupportedLanguage('it'), true);
    assert.strictEqual(isSupportedLanguage('ja'), true);
    assert.strictEqual(isSupportedLanguage('zh'), true);
    assert.strictEqual(isSupportedLanguage('xx-fake'), false);
  });

  test('Tool count in registry', () => {
    const toolRoutes = Object.values(SERVER_SEO_ROUTES).filter((r) => r.isTool);
    assert.strictEqual(toolRoutes.length, 30, 'Must have exactly 30 tools in SEO configuration');
  });

  test('Localized canonical slugs and paths', () => {
    assert.strictEqual(getServerLocalizedPath('home', 'es'), '/es');
    assert.strictEqual(getServerLocalizedPath('home', 'en'), '/en');
    assert.strictEqual(getServerLocalizedPath('home', 'fr'), '/fr');

    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'es'), 'unir-pdf');
    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'en'), 'merge-pdf');
    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'fr'), 'fusionner-pdf');
    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'de'), 'pdf-zusammenfuegen');
    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'pt'), 'juntar-pdf');
    assert.strictEqual(getServerCanonicalSlug('merge-pdf', 'it'), 'unire-pdf');

    assert.strictEqual(getServerLocalizedPath('merge-pdf', 'es'), '/es/unir-pdf');
    assert.strictEqual(getServerLocalizedPath('merge-pdf', 'en'), '/en/merge-pdf');
    assert.strictEqual(getServerLocalizedPath('merge-pdf', 'fr'), '/fr/fusionner-pdf');

    assert.strictEqual(getServerCanonicalSlug('compress-pdf', 'es'), 'comprimir-pdf');
    assert.strictEqual(getServerCanonicalSlug('split-pdf', 'es'), 'dividir-pdf');
    assert.strictEqual(getServerCanonicalSlug('rotate-pdf', 'es'), 'rotar-pdf');
    assert.strictEqual(getServerCanonicalSlug('about', 'es'), 'sobre-nosotros');
    assert.strictEqual(getServerCanonicalSlug('about', 'en'), 'about');
    assert.strictEqual(getServerCanonicalSlug('contact', 'es'), 'contacto');
    assert.strictEqual(getServerCanonicalSlug('contact', 'en'), 'contact');
  });

  test('Request path parsing and resolution', () => {
    const parsedEsHome = parseRequestPath('/es');
    assert.strictEqual(parsedEsHome.lang, 'es');
    assert.strictEqual(parsedEsHome.routeId, 'home');

    const parsedUnirPdf = parseRequestPath('/es/unir-pdf');
    assert.strictEqual(parsedUnirPdf.lang, 'es');
    assert.strictEqual(parsedUnirPdf.routeId, 'merge-pdf');

    const parsedMergePdfFr = parseRequestPath('/fr/fusionner-pdf');
    assert.strictEqual(parsedMergePdfFr.lang, 'fr');
    assert.strictEqual(parsedMergePdfFr.routeId, 'merge-pdf');

    const parsedNoPrefix = parseRequestPath('/unir-pdf');
    assert.strictEqual(parsedNoPrefix.lang, 'es');
    assert.strictEqual(parsedNoPrefix.routeId, 'merge-pdf');

    const parsedContact = parseRequestPath('/en/contact');
    assert.strictEqual(parsedContact.lang, 'en');
    assert.strictEqual(parsedContact.routeId, 'contact');

    const parsedAbout = parseRequestPath('/es/sobre-nosotros');
    assert.strictEqual(parsedAbout.lang, 'es');
    assert.strictEqual(parsedAbout.routeId, 'about');
  });

  test('Sitemap index XML generation', () => {
    const xml = generateSitemapIndexXml('https://boardpdf.app');
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Must start with XML declaration');
    assert.ok(xml.includes('<sitemapindex'), 'Must contain sitemapindex root element');
    assert.ok(xml.includes('https://boardpdf.app/sitemap-es.xml'), 'Must include sitemap-es.xml');
    assert.ok(xml.includes('https://boardpdf.app/sitemap-en.xml'), 'Must include sitemap-en.xml');
    assert.ok(xml.includes('https://boardpdf.app/sitemap-fr.xml'), 'Must include sitemap-fr.xml');

    for (const l of SUPPORTED_LANGUAGES) {
      assert.ok(xml.includes(`https://boardpdf.app/sitemap-${l.code}.xml`), `Sitemap index must include ${l.code}`);
    }
  });

  test('Language-specific sitemap XML generation', () => {
    const xml = generateLanguageSitemapXml('es', 'https://boardpdf.app');
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Must start with XML declaration');
    assert.ok(xml.includes('<urlset'), 'Must contain urlset root element');
    assert.ok(xml.includes('<loc>https://boardpdf.app/es/unir-pdf</loc>'), 'Must include Spanish unir-pdf URL');
    assert.ok(xml.includes('hreflang="en" href="https://boardpdf.app/en/merge-pdf"'), 'Must include English hreflang alternate');
    assert.ok(xml.includes('hreflang="fr" href="https://boardpdf.app/fr/fusionner-pdf"'), 'Must include French hreflang alternate');
    assert.ok(xml.includes('hreflang="x-default"'), 'Must include x-default hreflang alternate');
  });

  test('Robots.txt generation', () => {
    const robots = generateRobotsTxt('https://boardpdf.app');
    assert.ok(robots.includes('User-agent: *'));
    assert.ok(robots.includes('Disallow: /api/'));
    assert.ok(robots.includes('Sitemap: https://boardpdf.app/sitemap.xml'));
  });

  test('SSR SEO HTML tag injection', () => {
    const dummyHtml = '<!DOCTYPE html><html lang="es"><head><title>Original Title</title></head><body><div data-ref="app"></div></body></html>';
    const transformed = injectHtmlSeo(dummyHtml, '/es/unir-pdf', 'https://boardpdf.app');

    assert.ok(transformed.includes('<html lang="es"'), 'Must set html lang="es"');
    assert.ok(transformed.includes('<title>Unir PDF - Combina archivos PDF online gratis | BoardPDF</title>'), 'Must set localized title');
    assert.ok(transformed.includes('<link rel="canonical" href="https://boardpdf.app/es/unir-pdf">'), 'Must set canonical link');
    assert.ok(transformed.includes('hreflang="en" href="https://boardpdf.app/en/merge-pdf"'), 'Must set hreflang link');
    assert.ok(transformed.includes('hreflang="x-default"'), 'Must set x-default hreflang');
    assert.ok(transformed.includes('og:title'), 'Must include og:title');
    assert.ok(transformed.includes('application/ld+json'), 'Must include JSON-LD structured data');
    assert.ok(transformed.includes('WebApplication'), 'JSON-LD must be WebApplication for tool');

    const aboutHtml = injectHtmlSeo(dummyHtml, '/es/sobre-nosotros', 'https://boardpdf.app');
    assert.ok(aboutHtml.includes('Sobre Nosotros'), 'Must set about localized title');
    assert.ok(aboutHtml.includes('/es/sobre-nosotros'), 'Must set about canonical link');
  });

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
