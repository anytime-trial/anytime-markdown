export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlEncodeString(input: string): string {
  return base64UrlEncodeBytes(Buffer.from(input, 'utf-8'));
}

export function parseServiceAccountKey(json: string): ServiceAccountKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid service account key: not valid JSON');
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof obj.client_email !== 'string' ||
    typeof obj.private_key !== 'string'
  ) {
    throw new Error('Invalid service account key: missing client_email or private_key');
  }
  return { client_email: obj.client_email, private_key: obj.private_key };
}

export function parseGoogleDocId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Empty Google Doc reference');
  }
  const pathMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  throw new Error(`Cannot parse Google Doc ID from: ${input}`);
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresAt: number;
}

export type SignRs256 = (privateKeyPem: string, signingInput: string) => Promise<string>;

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const JWT_LIFETIME_SECONDS = 3600;

function parseTokenResponse(json: unknown, status: number, now: number): GoogleAccessToken {
  const obj = json as Record<string, unknown>;
  if (typeof obj.access_token !== 'string' || typeof obj.expires_in !== 'number') {
    const detail = typeof obj.error_description === 'string' ? obj.error_description : JSON.stringify(json);
    throw new Error(`Google OAuth token request failed (status ${status}): ${detail}`);
  }
  return { accessToken: obj.access_token, expiresAt: now + obj.expires_in };
}

export async function getServiceAccountAccessToken(
  serviceAccount: ServiceAccountKey,
  scope: string,
  sign: SignRs256,
  fetchImpl: typeof fetch,
  now: number = Math.floor(Date.now() / 1000),
): Promise<GoogleAccessToken> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope,
    aud: TOKEN_URI,
    iat: now,
    exp: now + JWT_LIFETIME_SECONDS,
  };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = await sign(serviceAccount.private_key, signingInput);
  const jwt = `${signingInput}.${signature}`;

  const response = await fetchImpl(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  const json = await response.json();
  return parseTokenResponse(json, response.status, now);
}

const DRIVE_EXPORT_BASE = 'https://www.googleapis.com/drive/v3/files';

export async function readGoogleDocAsText(
  fileId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const url = `${DRIVE_EXPORT_BASE}/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new Error(
        `Google Doc not accessible (status ${response.status}). `
        + 'Ensure the document is shared with the service account email as a viewer.',
      );
    }
    const body = await response.text();
    throw new Error(`Google Drive export failed (status ${response.status}): ${body}`);
  }
  return response.text();
}

export async function readGoogleDoc(
  input: { docRef: string; serviceAccountKeyJson: string },
  sign: SignRs256,
  fetchImpl: typeof fetch,
): Promise<string> {
  const serviceAccount = parseServiceAccountKey(input.serviceAccountKeyJson);
  const fileId = parseGoogleDocId(input.docRef);
  const token = await getServiceAccountAccessToken(serviceAccount, DRIVE_READONLY_SCOPE, sign, fetchImpl);
  return readGoogleDocAsText(fileId, token.accessToken, fetchImpl);
}
