/**
 * NextAuth の session からプロバイダ単位の接続状態を導出する純粋関数。
 *
 * このアプリの NextAuth は GitHub / Google / Spotify を 1 セッションに同居させるため、
 * `!!session` は「いずれかにサインイン済み」でしかなく GitHub 接続の判定に使えない。
 * GitHub のトークンは `session.accessToken`、Google は `session.googleAccessToken` に入る
 * （lib/githubAuth.ts の session コールバック）。
 */
export interface ConnectedProviders {
  github: boolean;
  google: boolean;
}

function hasToken(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function resolveConnectedProviders(session: unknown): ConnectedProviders {
  const record = typeof session === 'object' && session !== null
    ? (session as Record<string, unknown>)
    : null;
  return {
    github: hasToken(record?.accessToken),
    google: hasToken(record?.googleAccessToken),
  };
}
