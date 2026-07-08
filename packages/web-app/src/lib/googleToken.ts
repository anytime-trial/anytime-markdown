const REFRESH_MARGIN_MS = 60_000;

export function isGoogleTokenExpired(
  expiresAt: number | undefined,
  nowMs: number,
): boolean {
  if (expiresAt === undefined) return true;
  return nowMs >= expiresAt - REFRESH_MARGIN_MS;
}

export interface RefreshedToken {
  accessToken: string;
  expiresAt: number;
}

export function parseRefreshedToken(
  payload: Record<string, unknown>,
  nowMs: number,
): RefreshedToken | null {
  const accessToken = payload["access_token"];
  const expiresIn = payload["expires_in"];
  if (typeof accessToken !== "string" || accessToken.length === 0) return null;
  const seconds = typeof expiresIn === "number" ? expiresIn : 0;
  return { accessToken, expiresAt: nowMs + seconds * 1000 };
}
