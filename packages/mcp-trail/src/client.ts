import path from 'node:path';

export interface TrailClientOptions {
  serverUrl: string;
  repoName: string;
}

export function resolveOptions(opts: Partial<TrailClientOptions>): TrailClientOptions {
  return {
    serverUrl: opts.serverUrl ?? 'http://localhost:19841',
    repoName: opts.repoName ?? path.basename(process.cwd()),
  };
}

async function request<T>(
  serverUrl: string,
  pathname: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TrailDataServer ${method} ${pathname} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function getC4Model(serverUrl: string, repoName: string): Promise<unknown> {
  return request(serverUrl, `/api/c4/model?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addElement(
  serverUrl: string,
  repoName: string,
  body: {
    type: string;
    name: string;
    external: boolean;
    parentId: string | null;
    description?: string;
    serviceType?: string;
  },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-elements?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function updateElement(
  serverUrl: string,
  repoName: string,
  id: string,
  changes: { name?: string; description?: string; external?: boolean; serviceType?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'PATCH', changes);
}

export async function removeElement(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}

export async function listRelationships(
  serverUrl: string,
  repoName: string,
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-relationships?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addRelationship(
  serverUrl: string,
  repoName: string,
  body: { fromId: string; toId: string; label?: string; technology?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-relationships?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function removeRelationship(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-relationships/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}

export async function listGroups(
  serverUrl: string,
  repoName: string,
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-groups?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addGroup(
  serverUrl: string,
  repoName: string,
  body: { memberIds: string[]; label?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-groups?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function updateGroup(
  serverUrl: string,
  repoName: string,
  id: string,
  body: { memberIds?: string[]; label?: string | null },
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'PATCH', body);
}

export async function removeGroup(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}
