import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT_DIR = process.cwd();
const GDRIVE_SERVICE_PATH = path.resolve(ROOT_DIR, 'client/services/google-drive.service.ts');
const DROPBOX_SERVICE_PATH = path.resolve(ROOT_DIR, 'client/services/dropbox.service.ts');
const CLOUD_CONTROLLER_PATH = path.resolve(ROOT_DIR, 'src/tools/cloud/cloud.controller.ts');
const CLOUD_ROUTES_PATH = path.resolve(ROOT_DIR, 'src/tools/cloud/cloud.routes.ts');
const MERGE_VIEW_PATH = path.resolve(ROOT_DIR, 'client/views/tools/merge-pdf/merge-pdf.view.ts');

describe('Cloud Storage Integration Tests (Google Drive & Dropbox)', () => {
  it('google-drive.service.ts exports authentication and file picker with zero console.* and zero IDs', () => {
    const code = fs.readFileSync(GDRIVE_SERVICE_PATH, 'utf8');
    assert.ok(code.includes('export const GOOGLE_DRIVE_API_KEY'), 'Must export GOOGLE_DRIVE_API_KEY');
    assert.ok(code.includes('export const GOOGLE_DRIVE_CLIENT_ID'), 'Must export GOOGLE_DRIVE_CLIENT_ID');
    assert.ok(code.includes('export async function connectGoogleDrive') || code.includes('export function connectGoogleDrive'), 'Must export connectGoogleDrive');
    assert.ok(code.includes('export async function pickGoogleDriveFiles'), 'Must export pickGoogleDriveFiles');
    assert.ok(code.includes('export function getGoogleDriveToken'), 'Must export getGoogleDriveToken');
    assert.ok(code.includes('export function disconnectGoogleDrive'), 'Must export disconnectGoogleDrive');

    // Rule 2: Zero console.*
    assert.strictEqual(/\bconsole\.(log|warn|error|info|debug)\b/.test(code), false, 'google-drive.service.ts must have zero console.* statements');

    // Rule 3: Zero id attributes in DOM
    assert.strictEqual(/\bsetAttribute\(['"]id['"]|\.id\s*=/i.test(code), false, 'google-drive.service.ts must not set id attributes on DOM elements');
  });

  it('dropbox.service.ts exports Chooser loader and file picker with zero console.* and zero IDs', () => {
    const code = fs.readFileSync(DROPBOX_SERVICE_PATH, 'utf8');
    assert.ok(code.includes('export const DROPBOX_APP_KEY'), 'Must export DROPBOX_APP_KEY');
    assert.ok(code.includes('export function loadDropboxScript'), 'Must export loadDropboxScript');
    assert.ok(code.includes('export async function pickDropboxFiles'), 'Must export pickDropboxFiles');
    assert.ok(code.includes('btnm84g2xk1h2qr'), 'Must use provided Dropbox app key');

    // Rule 2: Zero console.*
    assert.strictEqual(/\bconsole\.(log|warn|error|info|debug)\b/.test(code), false, 'dropbox.service.ts must have zero console.* statements');

    // Rule 3: Zero id attributes in DOM
    assert.strictEqual(/\bsetAttribute\(['"]id['"]|\.id\s*=/i.test(code), false, 'dropbox.service.ts must not set id attributes on DOM elements');
  });

  it('src/tools/cloud/cloud.controller.ts enforces SSRF protection and zero console.*', () => {
    const code = fs.readFileSync(CLOUD_CONTROLLER_PATH, 'utf8');
    assert.ok(code.includes('isAllowedHost'), 'Must validate host against whitelist');
    assert.ok(code.includes('dl.dropboxusercontent.com'), 'Must allow Dropbox content domain');
    assert.ok(code.includes('googleapis.com'), 'Must allow Google APIs domain');
    assert.ok(code.includes('logger.app.error') || code.includes('logger.security.warn'), 'Must use centralized Logger');

    // Rule 1: No stack trace or technical leakage in client response
    assert.strictEqual(code.includes('err.message') || code.includes('err.stack'), false, 'cloud.controller.ts must not leak err.message or err.stack to client');

    // Rule 2: Zero console.*
    assert.strictEqual(/\bconsole\.(log|warn|error|info|debug)\b/.test(code), false, 'cloud.controller.ts must have zero console.* statements');
  });

  it('src/tools/cloud/cloud.routes.ts defines /tools/cloud/fetch-file route', () => {
    const code = fs.readFileSync(CLOUD_ROUTES_PATH, 'utf8');
    assert.ok(code.includes('/tools/cloud/fetch-file'), 'Must mount /tools/cloud/fetch-file');
    assert.ok(code.includes('handleFetchCloudFile'), 'Must map to handleFetchCloudFile');
  });

  it('merge-pdf.view.ts wires up both hero and FAB buttons for Google Drive and Dropbox', () => {
    const code = fs.readFileSync(MERGE_VIEW_PATH, 'utf8');
    assert.ok(code.includes('pickGoogleDriveFiles'), 'Must import and call pickGoogleDriveFiles');
    assert.ok(code.includes('pickDropboxFiles'), 'Must import and call pickDropboxFiles');
    assert.ok(code.includes('handleDriveImport'), 'Must implement handleDriveImport');
    assert.ok(code.includes('handleDropboxImport'), 'Must implement handleDropboxImport');

    assert.ok(code.includes('btn-hero-drive'), 'Must listen to btn-hero-drive');
    assert.ok(code.includes('btn-hero-dropbox'), 'Must listen to btn-hero-dropbox');
    assert.ok(code.includes('btn-fab-drive'), 'Must listen to btn-fab-drive');
    assert.ok(code.includes('btn-fab-dropbox'), 'Must listen to btn-fab-dropbox');
  });
});
