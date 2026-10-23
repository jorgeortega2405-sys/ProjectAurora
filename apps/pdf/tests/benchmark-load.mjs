import http from 'http';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3000';

function fetchUrl(urlPath, headers = {}) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const req = http.get(
      `${BASE_URL}${urlPath}`,
      {
        headers: {
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          ...headers,
        },
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
        });
        res.on('end', () => {
          const duration = performance.now() - startTime;
          resolve({
            bytes,
            duration,
            path: urlPath,
            status: res.statusCode,
          });
        });
      }
    );
    req.on('error', (err) => {
      resolve({
        bytes: 0,
        duration: performance.now() - startTime,
        error: err.message,
        path: urlPath,
        status: 0,
      });
    });
  });
}

async function simulatePageLoad(scenarioName, assetList, concurrency = 6) {
  const startTime = performance.now();
  let completed = 0;
  let totalBytes = 0;
  const results = [];
  const queue = [...assetList];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const res = await fetchUrl(item);
      results.push(res);
      totalBytes += res.bytes;
      completed++;
    }
  });

  await Promise.all(workers);
  const totalDuration = performance.now() - startTime;

  return {
    completed,
    concurrency,
    results,
    scenarioName,
    totalBytes,
    totalDuration,
  };
}

async function runStressTest(paths, totalRequests = 60, concurrency = 10) {
  const startTime = performance.now();
  let completed = 0;
  let failed = 0;
  const latencies = [];
  let reqIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (reqIndex < totalRequests) {
      const cur = reqIndex++;
      const targetPath = paths[cur % paths.length];
      const res = await fetchUrl(targetPath);
      latencies.push(res.duration);
      if (res.status === 200) {
        completed++;
      } else {
        failed++;
      }
    }
  });

  await Promise.all(workers);
  const totalTime = performance.now() - startTime;
  latencies.sort((a, b) => a - b);

  const avg = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95 = latencies[p95Index] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const rps = (completed / (totalTime / 1000));

  return {
    avgMs: Math.round(avg),
    completed,
    failed,
    maxMs: Math.round(max),
    p95Ms: Math.round(p95),
    rps: parseFloat(rps.toFixed(2)),
    totalRequests,
    totalTimeMs: Math.round(totalTime),
  };
}

async function runBenchmark(label = 'baseline') {
  const isOptimized = label === 'optimized';

  const homeAssets = isOptimized
    ? [
        '/',
        '/css/root.css',
        '/css/components/component-layout.css',
        '/css/components/component-buttons.css',
        '/css/components/component-forms.css',
        '/css/components/component-feedback.css',
        '/css/components/component-overlays.css',
        '/css/components/component-views.css',
        '/css/tools/tool-layout.css',
        '/icons.svg',
        '/client/app-main.ts',
        '/views/components/sidebar.html',
        '/views/home/home.html',
        '/translations/es.json',
        '/api/auth/me',
      ]
    : [
        '/',
        '/css/root.css?v=1.0.2',
        '/css/components/component-layout.css?v=1.0.2',
        '/css/components/component-buttons.css?v=1.0.2',
        '/css/components/component-forms.css?v=1.0.2',
        '/css/components/component-feedback.css?v=1.0.2',
        '/css/components/component-overlays.css?v=1.0.2',
        '/css/components/component-views.css?v=1.0.2',
        '/css/tools/tool-layout.css?v=1.0.2',
        '/icons.svg',
        '/client/app-main.ts',
        '/views/components/sidebar.html',
        '/views/home/home.html',
        '/translations/es.json',
        '/api/auth/me',
        '/views/tools/compress-pdf/compress-pdf.html',
        '/views/tools/crop-pdf/crop-pdf.html',
        '/views/tools/merge-pdf/merge-pdf.html',
        '/views/tools/ocr-pdf/ocr-pdf.html',
        '/views/tools/organize-pdf/organize-pdf.html',
        '/views/tools/page-numbers/page-numbers.html',
        '/views/tools/pdf-converter/pdf-converter.html',
        '/views/tools/protect-pdf/protect-pdf.html',
        '/views/tools/remove-pdf-pages/remove-pdf-pages.html',
        '/views/tools/repair-pdf/repair-pdf.html',
        '/views/tools/rotate-pdf/rotate-pdf.html',
        '/views/tools/split-pdf/split-pdf.html',
        '/views/tools/summarize-pdf/summarize-pdf.html',
        '/views/tools/to-pdf-converter/to-pdf-converter.html',
        '/views/tools/translate-pdf/translate-pdf.html',
        '/views/tools/unlock-pdf/unlock-pdf.html',
        '/views/tools/watermark-pdf/watermark-pdf.html',
        '/views/download-ready/download-ready.html',
        '/icons.svg',
      ];

  const mergePdfAssets = isOptimized
    ? [
        '/merge-pdf',
        '/css/root.css',
        '/css/components/component-layout.css',
        '/css/components/component-buttons.css',
        '/css/components/component-forms.css',
        '/css/components/component-feedback.css',
        '/css/components/component-overlays.css',
        '/css/components/component-views.css',
        '/css/tools/tool-layout.css',
        '/icons.svg',
        '/client/app-main.ts',
        '/views/components/sidebar.html',
        '/translations/es.json',
        '/api/auth/me',
        '/css/tools/merge-pdf.css',
        '/client/views/tools/merge-pdf/merge-pdf.view.ts',
        '/views/tools/merge-pdf/merge-pdf.html',
      ]
    : [
        '/merge-pdf',
        '/css/root.css?v=1.0.2',
        '/css/components/component-layout.css?v=1.0.2',
        '/css/components/component-buttons.css?v=1.0.2',
        '/css/components/component-forms.css?v=1.0.2',
        '/css/components/component-feedback.css?v=1.0.2',
        '/css/components/component-overlays.css?v=1.0.2',
        '/css/components/component-views.css?v=1.0.2',
        '/css/tools/tool-layout.css?v=1.0.2',
        '/icons.svg',
        '/client/app-main.ts',
        '/views/components/sidebar.html',
        '/translations/es.json',
        '/api/auth/me',
        '/css/tools/merge-pdf.css',
        '/client/views/tools/merge-pdf/merge-pdf.view.ts',
        '/views/tools/merge-pdf/merge-pdf.html',
        '/views/tools/compress-pdf/compress-pdf.html',
        '/views/tools/crop-pdf/crop-pdf.html',
        '/views/tools/ocr-pdf/ocr-pdf.html',
        '/views/tools/organize-pdf/organize-pdf.html',
        '/views/tools/page-numbers/page-numbers.html',
        '/views/tools/pdf-converter/pdf-converter.html',
        '/views/tools/protect-pdf/protect-pdf.html',
        '/views/tools/remove-pdf-pages/remove-pdf-pages.html',
        '/views/tools/repair-pdf/repair-pdf.html',
        '/views/tools/rotate-pdf/rotate-pdf.html',
        '/views/tools/split-pdf/split-pdf.html',
        '/views/tools/summarize-pdf/summarize-pdf.html',
        '/views/tools/to-pdf-converter/to-pdf-converter.html',
        '/views/tools/translate-pdf/translate-pdf.html',
        '/views/tools/unlock-pdf/unlock-pdf.html',
        '/views/tools/watermark-pdf/watermark-pdf.html',
        '/views/download-ready/download-ready.html',
        '/icons.svg',
      ];

  process.stdout.write(`Iniciando prueba de carga: ${label}...\n`);

  const homeLoad = await simulatePageLoad('Carga Inicial Home', homeAssets, 6);
  process.stdout.write(`Home Load: ${Math.round(homeLoad.totalDuration)}ms (${homeLoad.completed} reqs, ${Math.round(homeLoad.totalBytes / 1024)} KB)\n`);

  const mergePdfLoad = await simulatePageLoad('Carga Inicial Unir PDF (/merge-pdf)', mergePdfAssets, 6);
  process.stdout.write(`Merge PDF Load: ${Math.round(mergePdfLoad.totalDuration)}ms (${mergePdfLoad.completed} reqs, ${Math.round(mergePdfLoad.totalBytes / 1024)} KB)\n`);

  const stressPaths = isOptimized
    ? ['/', '/merge-pdf', '/icons.svg', '/css/root.css', '/translations/es.json', '/api/auth/me']
    : ['/', '/merge-pdf', '/icons.svg', '/css/root.css?v=1.0.2', '/translations/es.json', '/api/auth/me'];

  const stressResults = await runStressTest(stressPaths, 50, 10);
  process.stdout.write(`Stress Test: ${stressResults.rps} req/s, avg ${stressResults.avgMs}ms, p95 ${stressResults.p95Ms}ms, max ${stressResults.maxMs}ms\n`);

  const summary = {
    homeDurationMs: Math.round(homeLoad.totalDuration),
    homeKb: Math.round(homeLoad.totalBytes / 1024),
    homeRequests: homeLoad.completed,
    label,
    mergeDurationMs: Math.round(mergePdfLoad.totalDuration),
    mergeKb: Math.round(mergePdfLoad.totalBytes / 1024),
    mergeRequests: mergePdfLoad.completed,
    stressAvgMs: stressResults.avgMs,
    stressMaxMs: stressResults.maxMs,
    stressP95Ms: stressResults.p95Ms,
    stressRps: stressResults.rps,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`tests/benchmark-${label}.json`, JSON.stringify(summary, null, 2));
  process.stdout.write(`Benchmark guardado en tests/benchmark-${label}.json\n`);

  if (isOptimized && fs.existsSync('tests/benchmark-baseline.json')) {
    const base = JSON.parse(fs.readFileSync('tests/benchmark-baseline.json', 'utf8'));
    process.stdout.write('\n================ TABLA COMPARATIVA DE RENDIMIENTO ================\n');
    process.stdout.write(`Métrica                       | Antes (Baseline) | Después (Optimizado) | Mejora\n`);
    process.stdout.write(`------------------------------|------------------|----------------------|--------\n`);
    const homeSpeedup = ((base.homeDurationMs - summary.homeDurationMs) / base.homeDurationMs * 100).toFixed(1);
    const mergeSpeedup = ((base.mergeDurationMs - summary.mergeDurationMs) / base.mergeDurationMs * 100).toFixed(1);
    const reqReduction = ((base.mergeRequests - summary.mergeRequests) / base.mergeRequests * 100).toFixed(1);
    const bytesReduction = ((base.mergeKb - summary.mergeKb) / base.mergeKb * 100).toFixed(1);
    const rpsImprovement = ((summary.stressRps - base.stressRps) / base.stressRps * 100).toFixed(1);
    const latencyImprovement = ((base.stressAvgMs - summary.stressAvgMs) / base.stressAvgMs * 100).toFixed(1);

    process.stdout.write(`Tiempo Carga Home             | ${base.homeDurationMs} ms          | ${summary.homeDurationMs} ms             | -${homeSpeedup}%\n`);
    process.stdout.write(`Tiempo Carga /merge-pdf       | ${base.mergeDurationMs} ms          | ${summary.mergeDurationMs} ms             | -${mergeSpeedup}%\n`);
    process.stdout.write(`Peticiones HTTP (/merge-pdf)  | ${base.mergeRequests} reqs           | ${summary.mergeRequests} reqs            | -${reqReduction}%\n`);
    process.stdout.write(`Peso Transferido (/merge-pdf) | ${base.mergeKb} KB           | ${summary.mergeKb} KB             | -${bytesReduction}%\n`);
    process.stdout.write(`Capacidad (RPS bajo estrés)   | ${base.stressRps} req/s        | ${summary.stressRps} req/s         | +${rpsImprovement}%\n`);
    process.stdout.write(`Latencia Promedio Estrés      | ${base.stressAvgMs} ms          | ${summary.stressAvgMs} ms              | -${latencyImprovement}%\n`);
    process.stdout.write(`Latencia P95 Estrés           | ${base.stressP95Ms} ms          | ${summary.stressP95Ms} ms              | -${((base.stressP95Ms - summary.stressP95Ms) / base.stressP95Ms * 100).toFixed(1)}%\n`);
    process.stdout.write('===================================================================\n');
  }
}

const runLabel = process.argv[2] || 'baseline';
await runBenchmark(runLabel);
