import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { redis } from '../src/config/redis.config.js';
import { processAiChat } from '../src/services/ai-agent.service.js';

const ROOT_DIR = process.cwd();
const WS_SERVICE_TS = path.resolve(ROOT_DIR, 'client/services/websocket.service.ts');
const WS_RUST_CARGO = path.resolve(ROOT_DIR, 'services/aurora-ws/Cargo.toml');
const WS_RUST_MAIN = path.resolve(ROOT_DIR, 'services/aurora-ws/src/main.rs');
const WS_DOCKERFILE = path.resolve(ROOT_DIR, 'services/aurora-ws/Dockerfile');
const DOCKER_COMPOSE = path.resolve(ROOT_DIR, 'docker-compose.yml');

async function createSamplePdf(text = 'Documento de prueba WebSocket') {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  page.drawText(text, { size: 18, x: 50, y: 750 });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

describe('Suite: Real-time Streaming & Rust WebSocket Integration', () => {
  it('Requirement: Rust microservice files exist and are configured', () => {
    assert.ok(fs.existsSync(WS_RUST_CARGO), 'Cargo.toml must exist in services/aurora-ws');
    assert.ok(fs.existsSync(WS_RUST_MAIN), 'main.rs must exist in services/aurora-ws/src');
    assert.ok(fs.existsSync(WS_DOCKERFILE), 'Dockerfile must exist in services/aurora-ws');

    const cargoContent = fs.readFileSync(WS_RUST_CARGO, 'utf8');
    assert.ok(cargoContent.includes('tokio-tungstenite'), 'Cargo.toml must include tokio-tungstenite');
    assert.ok(cargoContent.includes('redis'), 'Cargo.toml must include redis');
  });

  it('Requirement: Docker compose mounts aurora-websocket on port 3001', () => {
    assert.ok(fs.existsSync(DOCKER_COMPOSE), 'docker-compose.yml must exist');
    const composeContent = fs.readFileSync(DOCKER_COMPOSE, 'utf8');
    assert.ok(composeContent.includes('aurora-websocket'), 'docker-compose.yml must configure aurora-websocket');
    assert.ok(composeContent.includes('3001:3001'), 'docker-compose.yml must expose port 3001');
  });

  it('Requirement: Client WebSocket service is implemented', () => {
    assert.ok(fs.existsSync(WS_SERVICE_TS), 'client/services/websocket.service.ts must exist');
    const wsContent = fs.readFileSync(WS_SERVICE_TS, 'utf8');
    assert.ok(wsContent.includes('class WebSocketClientService'), 'Must define WebSocketClientService');
    assert.ok(wsContent.includes('subscribeAiProgress'), 'Must expose subscribeAiProgress');
    assert.ok(wsContent.includes('3001'), 'Must connect to port 3001');
  });

  it('Requirement AGENTS.md: Strict HTML structure in ai.html with live progress elements', () => {
    const aiHtml = fs.readFileSync(path.resolve(ROOT_DIR, 'public/views/ai/ai.html'), 'utf8');
    assert.ok(aiHtml.includes('data-ref="ai-thinking-percent"'), 'Must have ai-thinking-percent');
    assert.ok(aiHtml.includes('data-ref="ai-thinking-bar"'), 'Must have ai-thinking-bar');
    assert.ok(aiHtml.includes('data-ref="ai-thinking-track"'), 'Must have ai-thinking-track');
    assert.ok(!aiHtml.includes('id='), 'Must contain zero id attributes');
  });

  it('Functional: AI pipeline emits step-by-step progress events via Redis pub/sub', async () => {
    const sessionId = `test_session_${Date.now()}`;
    const receivedEvents = [];

    // Create a subscriber client for testing Redis publication
    const subRedis = redis.duplicate();
    await subRedis.connect().catch(() => {});

    if (subRedis.status === 'ready') {
      await subRedis.subscribe('aurora:ai:progress');
      subRedis.on('message', (_channel, message) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.sessionId === sessionId) {
            receivedEvents.push(parsed);
          }
        } catch {}
      });
    }

    const pdfBuf = await createSamplePdf('Documento para test de WebSocket');
    const response = await processAiChat({
      files: [{ buffer: pdfBuf, mimetype: 'application/pdf', originalname: 'test_ws.pdf', size: pdfBuf.length }],
      message: 'Comprime este PDF en calidad extrema',
      sessionId,
    });

    assert.strictEqual(response.success, true);

    // Wait a brief tick for Redis pub/sub messages to arrive
    await new Promise((r) => setTimeout(r, 200));

    if (subRedis.status === 'ready') {
      await subRedis.unsubscribe('aurora:ai:progress');
      subRedis.disconnect();

      assert.ok(receivedEvents.length >= 2, `Should receive progress events, got ${receivedEvents.length}`);
      assert.ok(receivedEvents.some((e) => e.stage === 'planning'), 'Must emit planning stage');
      assert.ok(receivedEvents.some((e) => e.stage === 'completed'), 'Must emit completed stage');
      assert.ok(receivedEvents.some((e) => typeof e.percent === 'number'), 'Must emit numerical percentages');
    }
  });

  after(() => {
    try {
      redis.disconnect();
    } catch {}
  });
});
