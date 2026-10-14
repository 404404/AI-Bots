import type { SavedHost } from './saved-host';

const KEY = 'deepseekbot.host.v1';

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export async function loadSavedHost(): Promise<SavedHost | undefined> {
  const raw = store()?.getItem(KEY);
  if (raw === null || raw === undefined) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<SavedHost>;
    return typeof value.route === 'string' && typeof value.token === 'string'
      ? { route: value.route, token: value.token }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function saveHost(host: SavedHost): Promise<void> {
  store()?.setItem(KEY, JSON.stringify(host));
}

export async function forgetHost(): Promise<void> {
  store()?.removeItem(KEY);
}
