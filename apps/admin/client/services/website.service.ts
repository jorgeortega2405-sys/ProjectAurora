export interface WebsiteItem {
  accent_color: string;
  domain: string;
  id: string;
  logo_url: string | null;
  name: string;
  role: string;
  slug: string;
  status: string;
}

let cachedWebsites: WebsiteItem[] = [];
let isGlobalScope = false;

export function getSelectedWebsiteId(): string {
  const stored = localStorage.getItem('aurora_admin_website_id');
  if (stored) return stored;
  return 'aurora-pdf';
}

export function setSelectedWebsiteId(websiteId: string): void {
  localStorage.setItem('aurora_admin_website_id', websiteId);
  window.dispatchEvent(new CustomEvent('admin:website-changed', { detail: { websiteId } }));
}

export async function fetchAccessibleWebsites(): Promise<{ isGlobal: boolean; websites: WebsiteItem[] }> {
  try {
    const res = await fetch('/api/admin/websites/accessible');
    if (!res.ok) {
      return { isGlobal: false, websites: [] };
    }
    const data = await res.json();
    if (data.success && Array.isArray(data.websites)) {
      cachedWebsites = data.websites;
      isGlobalScope = Boolean(data.isGlobalScope);
      const current = getSelectedWebsiteId();
      const exists = cachedWebsites.some((w) => w.id === current) || (isGlobalScope && current === '*');
      if (!exists && cachedWebsites.length > 0) {
        setSelectedWebsiteId(cachedWebsites[0].id);
      }
      return { isGlobal: isGlobalScope, websites: cachedWebsites };
    }
    return { isGlobal: false, websites: [] };
  } catch {
    return { isGlobal: false, websites: [] };
  }
}

export function getCachedWebsites(): WebsiteItem[] {
  return cachedWebsites;
}

export function getIsGlobalScope(): boolean {
  return isGlobalScope;
}
