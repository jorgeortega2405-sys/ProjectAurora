export interface TelemetryEvent {
  payload?: Record<string, unknown>;
  route?: string;
  session_id?: string;
  timestamp?: string;
  type: 'web_vital' | 'page_view' | 'route_transition' | 'click' | 'interaction' | 'api_latency' | 'error' | 'custom';
  url?: string;
  user_id?: string;
}

const BATCH_SIZE_THRESHOLD = 20;
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_CAP = 150;
const BEACON_URL = '/api/telemetry/v1/beacon';
const BATCH_URL = '/api/telemetry/v1/batch';

let eventQueue: TelemetryEvent[] = [];
let flushTimer: number | null = null;
let isInitialized = false;
let currentSessionId = '';
let currentVisitorId = '';
let lastClickedElement: HTMLElement | null = null;
let lastClickTimestamp = 0;

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function initIds(): void {
  try {
    let vid = localStorage.getItem('aurora_vid');
    if (!vid) {
      vid = generateUuid();
      localStorage.setItem('aurora_vid', vid);
    }
    currentVisitorId = vid;
  } catch {
    currentVisitorId = generateUuid();
  }

  try {
    let sid = sessionStorage.getItem('aurora_sid');
    if (!sid) {
      sid = generateUuid();
      sessionStorage.setItem('aurora_sid', sid);
    }
    currentSessionId = sid;
  } catch {
    currentSessionId = generateUuid();
  }
}

function getDeviceInfo(): { connection_type: string; device_type: string } {
  let deviceType = 'desktop';
  const width = window.innerWidth;
  if (width < 768) {
    deviceType = 'mobile';
  } else if (width <= 1024) {
    deviceType = 'tablet';
  }

  let connectionType = 'unknown';
  const nav = navigator as unknown as { connection?: { effectiveType?: string } };
  if (nav.connection?.effectiveType) {
    connectionType = nav.connection.effectiveType;
  }

  return { connection_type: connectionType, device_type: deviceType };
}

export function queueTelemetryEvent(
  type: TelemetryEvent['type'],
  payload: Record<string, unknown> = {},
  customRoute?: string
): void {
  const currentPath = customRoute || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const fullUrl = typeof window !== 'undefined' ? window.location.href : '';

  const event: TelemetryEvent = {
    payload: {
      ...payload,
      visitor_id: currentVisitorId,
    },
    route: currentPath,
    session_id: currentSessionId,
    timestamp: new Date().toISOString(),
    type,
    url: fullUrl,
  };

  if (eventQueue.length >= MAX_QUEUE_CAP) {
    eventQueue.shift();
  }

  eventQueue.push(event);

  if (eventQueue.length >= BATCH_SIZE_THRESHOLD) {
    void flushTelemetryQueue();
  } else if (!flushTimer) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flushTelemetryQueue();
    }, FLUSH_INTERVAL_MS);
  }
}

function getCsrfToken(): string {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const match = document.cookie.match(/(?:^|;\s*)aurora_csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function flushTelemetryQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const batchToSend = [...eventQueue];
  eventQueue = [];

  try {
    const payloadStr = JSON.stringify(batchToSend);
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    await fetch(BATCH_URL, {
      body: payloadStr,
      headers,
      keepalive: true,
      method: 'POST',
    });
  } catch {
    const spaceLeft = MAX_QUEUE_CAP - eventQueue.length;
    if (spaceLeft > 0) {
      const recovered = batchToSend.slice(-spaceLeft);
      eventQueue = [...recovered, ...eventQueue];
    }
  }
}

function flushViaBeacon(): void {
  if (eventQueue.length === 0) return;
  const batchToSend = [...eventQueue];
  eventQueue = [];

  try {
    const payloadStr = JSON.stringify(batchToSend);
    if (navigator.sendBeacon) {
      const blob = new Blob([payloadStr], { type: 'application/json' });
      navigator.sendBeacon(BEACON_URL, blob);
    } else {
      void fetch(BATCH_URL, {
        body: payloadStr,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        method: 'POST',
      });
    }
  } catch {}
}

export function trackPageView(route: string, durationMs?: number, meta?: Record<string, unknown>): void {
  const device = getDeviceInfo();
  queueTelemetryEvent('page_view', {
    ...device,
    ...meta,
    duration_ms: durationMs || 0,
    metric_name: 'PAGE_VIEW',
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  }, route);
}

export function trackRouteTransition(fromRoute: string, toRoute: string, durationMs: number): void {
  queueTelemetryEvent('route_transition', {
    duration_ms: durationMs,
    from_route: fromRoute,
    metric_name: 'ROUTE_TRANSITION',
    to_route: toRoute,
  }, toRoute);
}

export function trackApiLatency(endpoint: string, method: string, durationMs: number, status: number): void {
  if (endpoint.startsWith('/api/telemetry')) return;
  queueTelemetryEvent('api_latency', {
    duration_ms: durationMs,
    endpoint,
    method: method.toUpperCase(),
    status_code: status,
  });
}

function setupWebVitalsObserver(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  const device = getDeviceInfo();

  try {
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      if (!lastEntry) return;

      const val = Math.round(lastEntry.startTime);
      let rating = 'good';
      if (val > 4000) rating = 'poor';
      else if (val > 2500) rating = 'needs-improvement';

      queueTelemetryEvent('web_vital', {
        ...device,
        metric_name: 'LCP',
        rating,
        value: val,
      });
    });
    lcpObserver.observe({ buffered: true, type: 'largest-contentful-paint' });
  } catch {}

  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
        }
      }
    });
    clsObserver.observe({ buffered: true, type: 'layout-shift' });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && clsValue > 0) {
        let rating = 'good';
        if (clsValue > 0.25) rating = 'poor';
        else if (clsValue > 0.1) rating = 'needs-improvement';

        queueTelemetryEvent('web_vital', {
          ...device,
          metric_name: 'CLS',
          rating,
          value: parseFloat(clsValue.toFixed(4)),
        });
      }
    }, { passive: true });
  } catch {}

  try {
    const fidObserver = new PerformanceObserver((entryList) => {
      const firstInput = entryList.getEntries()[0] as PerformanceEntry & { processingStart: number; startTime: number };
      if (!firstInput) return;

      const val = Math.round(firstInput.processingStart - firstInput.startTime);
      let rating = 'good';
      if (val > 300) rating = 'poor';
      else if (val > 100) rating = 'needs-improvement';

      queueTelemetryEvent('web_vital', {
        ...device,
        metric_name: 'FID',
        rating,
        value: val,
      });
    });
    fidObserver.observe({ buffered: true, type: 'first-input' });
  } catch {}

  try {
    const navObserver = new PerformanceObserver((entryList) => {
      const navEntry = entryList.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!navEntry) return;

      const ttfb = Math.round(navEntry.responseStart - navEntry.requestStart);
      const domLoad = Math.round(navEntry.domContentLoadedEventEnd - navEntry.startTime);
      const fullLoad = Math.round(navEntry.loadEventEnd - navEntry.startTime);

      queueTelemetryEvent('web_vital', {
        ...device,
        dom_content_loaded_ms: domLoad,
        full_load_ms: fullLoad,
        metric_name: 'NAVIGATION_TIMING',
        ttfb_ms: ttfb,
        value: fullLoad,
      });
    });
    navObserver.observe({ buffered: true, type: 'navigation' });
  } catch {}
}

function setupClickTracking(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-no-track], input[type="password"]')) {
      return;
    }

    const interactiveEl = target.closest<HTMLElement>(
      '[data-ref], button, a, [data-action], input[type="submit"], input[type="checkbox"], input[type="radio"], select'
    );
    if (!interactiveEl) return;

    const now = Date.now();
    if (lastClickedElement === interactiveEl && now - lastClickTimestamp < 300) {
      return;
    }
    lastClickedElement = interactiveEl;
    lastClickTimestamp = now;

    const dataRef = interactiveEl.getAttribute('data-ref') || interactiveEl.getAttribute('data-action') || '';
    const tagName = interactiveEl.tagName.toLowerCase();
    const rawText = interactiveEl.innerText || interactiveEl.getAttribute('aria-label') || interactiveEl.getAttribute('title') || '';
    const label = rawText.trim().replace(/\s+/g, ' ').substring(0, 50);

    queueTelemetryEvent('click', {
      action: 'click',
      element_ref: dataRef || `${tagName}.${interactiveEl.className.split(' ')[0] || 'elem'}`,
      label,
      tag: tagName,
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  }, { capture: true, passive: true });
}

function setupErrorTracking(): void {
  window.addEventListener('error', (event: ErrorEvent) => {
    queueTelemetryEvent('error', {
      column: event.colno || 0,
      error_type: event.error?.name || 'Error',
      line: event.lineno || 0,
      message: (event.message || 'Unknown error').substring(0, 300),
      source: (event.filename || '').substring(0, 200),
      stack: event.error?.stack ? String(event.error.stack).substring(0, 600) : '',
      user_agent: navigator.userAgent.substring(0, 200),
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
    const stack = reason instanceof Error && reason.stack ? String(reason.stack).substring(0, 600) : '';

    queueTelemetryEvent('error', {
      error_type: 'UnhandledRejection',
      message: msg.substring(0, 300),
      stack,
      user_agent: navigator.userAgent.substring(0, 200),
    });
  });
}

function setupUnloadListeners(): void {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushViaBeacon();
    }
  });

  window.addEventListener('pagehide', () => {
    flushViaBeacon();
  });
}

export function initTelemetry(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  initIds();
  setupWebVitalsObserver();
  setupClickTracking();
  setupErrorTracking();
  setupUnloadListeners();
}
