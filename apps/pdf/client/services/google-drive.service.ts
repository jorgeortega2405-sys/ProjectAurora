import { showToast } from './toast.service.js';

export const GOOGLE_DRIVE_API_KEY = (import.meta as any).env?.VITE_GOOGLE_API_KEY || '';
export const GOOGLE_DRIVE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
export const GOOGLE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile';

const STORAGE_KEY_TOKEN = 'aurora_gdrive_token';
const STORAGE_KEY_EXPIRES = 'aurora_gdrive_expires_at';

declare const google: any;
declare const gapi: any;

let gisLoadingPromise: Promise<void> | null = null;
let gapiLoadingPromise: Promise<void> | null = null;
let tokenClientInstance: any = null;

export function loadGisScript(): Promise<void> {
  if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadingPromise) {
    return gisLoadingPromise;
  }
  gisLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services.'));
    document.head.appendChild(script);
  });
  return gisLoadingPromise;
}

export function loadGapiScript(): Promise<void> {
  if (typeof gapi !== 'undefined' && gapi?.load) {
    return Promise.resolve();
  }
  if (gapiLoadingPromise) {
    return gapiLoadingPromise;
  }
  gapiLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar la librería cliente de Google.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar la librería cliente de Google.'));
    document.head.appendChild(script);
  });
  return gapiLoadingPromise;
}

export function getGoogleDriveToken(): string | null {
  try {
    const expiresAt = sessionStorage.getItem(STORAGE_KEY_EXPIRES);
    if (!expiresAt || Date.now() > Number(expiresAt)) {
      disconnectGoogleDrive();
      return null;
    }
    return sessionStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
}

export function isGoogleDriveConnected(): boolean {
  return Boolean(getGoogleDriveToken());
}

export function disconnectGoogleDrive(): void {
  try {
    const token = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    if (token && typeof google !== 'undefined' && google?.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(token, () => {});
    }
  } catch {}
  sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
}

export async function connectGoogleDrive(): Promise<{ error?: string; success: boolean; token?: string }> {
  try {
    await loadGisScript();
  } catch {
    return { error: 'No se pudo cargar el cliente de autenticación de Google.', success: false };
  }

  return new Promise((resolve) => {
    try {
      tokenClientInstance = google.accounts.oauth2.initTokenClient({
        callback: (response: any) => {
          if (response.error) {
            resolve({ error: 'Autorización de Google Drive cancelada.', success: false });
            return;
          }
          if (!response.access_token) {
            resolve({ error: 'No se recibió el token de acceso de Google.', success: false });
            return;
          }

          const expiresInSec = Number(response.expires_in) || 3500;
          const expiresAt = Date.now() + (expiresInSec - 60) * 1000;

          sessionStorage.setItem(STORAGE_KEY_TOKEN, response.access_token);
          sessionStorage.setItem(STORAGE_KEY_EXPIRES, String(expiresAt));

          resolve({ success: true, token: response.access_token });
        },
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        error_callback: (err: any) => {
          resolve({ error: err?.message || 'Error en la autenticación con Google.', success: false });
        },
        prompt: 'consent',
        scope: GOOGLE_DRIVE_SCOPES,
      });

      tokenClientInstance.requestAccessToken();
    } catch {
      resolve({ error: 'Error al iniciar la conexión con Google Drive.', success: false });
    }
  });
}

export async function pickGoogleDriveFiles(options: {
  mimeTypes?: string[];
  multiselect?: boolean;
} = {}): Promise<File[]> {
  let token = getGoogleDriveToken();

  if (!token) {
    const authResult = await connectGoogleDrive();
    if (!authResult.success || !authResult.token) {
      if (authResult.error) {
        showToast(authResult.error, 'warning');
      }
      return [];
    }
    token = authResult.token;
  }

  try {
    await loadGapiScript();
  } catch {
    showToast('No se pudo inicializar el selector de archivos de Google.', 'danger');
    return [];
  }

  return new Promise<File[]>((resolve) => {
    gapi.load('picker', () => {
      try {
        const targetMimeTypes = (options.mimeTypes && options.mimeTypes.length > 0)
          ? options.mimeTypes.join(',')
          : 'application/pdf';

        const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
          .setMimeTypes(targetMimeTypes)
          .setIncludeFolders(true);

        const builder = new google.picker.PickerBuilder()
          .addView(docsView)
          .setOAuthToken(token)
          .setDeveloperKey(GOOGLE_DRIVE_API_KEY)
          .setCallback(async (data: any) => {
            if (data.action === google.picker.Action.PICKED) {
              const rawDocs = Array.isArray(data.docs) ? data.docs : [];
              if (rawDocs.length === 0) {
                resolve([]);
                return;
              }

              showToast(
                rawDocs.length === 1 ? 'Descargando archivo desde Google Drive...' : `Descargando ${rawDocs.length} archivos desde Google Drive...`,
                'info'
              );

              const downloadedFiles: File[] = [];

              for (const doc of rawDocs) {
                try {
                  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`;
                  const response = await fetch(downloadUrl, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });

                  if (!response.ok) {
                    throw new Error(`Error ${response.status}`);
                  }

                  const blob = await response.blob();
                  const filename = doc.name || 'documento.pdf';
                  const mimeType = doc.mimeType || 'application/pdf';
                  const file = new File([blob], filename, {
                    lastModified: Date.now(),
                    type: mimeType,
                  });
                  downloadedFiles.push(file);
                } catch {
                  showToast(`No se pudo descargar «${doc.name || 'documento'}» de Google Drive.`, 'danger');
                }
              }

              resolve(downloadedFiles);
            } else if (data.action === google.picker.Action.CANCEL) {
              resolve([]);
            }
          });

        if (options.multiselect !== false) {
          builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
        }

        const pickerInstance = builder.build();
        pickerInstance.setVisible(true);
      } catch {
        showToast('Error al desplegar el selector de Google Drive.', 'danger');
        resolve([]);
      }
    });
  });
}

export async function exportToGoogleDrive(downloadUrl: string, filename: string): Promise<void> {
  let token = getGoogleDriveToken();
  if (!token) {
    const auth = await connectGoogleDrive();
    if (!auth.success || !auth.token) {
      if (auth.error) showToast(auth.error, 'danger');
      return;
    }
    token = auth.token;
  }

  showToast('Subiendo archivo a Google Drive...', 'info');

  try {
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) throw new Error('No se pudo descargar el archivo para exportar.');
    const blob = await fileRes.blob();

    const metadata = {
      name: filename,
      mimeType: blob.type || 'application/pdf',
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', blob);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      body: formData,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method: 'POST',
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload error ${uploadRes.status}`);
    }

    showToast('Archivo guardado en Google Drive con éxito.', 'success');
  } catch {
    showToast('Error al subir el archivo a Google Drive.', 'danger');
  }
}

