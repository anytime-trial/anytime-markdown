import { validateAuthEnv } from '../lib/authEnv';

describe('validateAuthEnv', () => {
  it('accepts AUTH_SECRET as the required secret', () => {
    const status = validateAuthEnv({ AUTH_SECRET: 'auth-secret' });

    expect(status.isHealthy).toBe(true);
    expect(status.missingRequired).toEqual([]);
  });

  it('accepts NEXTAUTH_SECRET for backward compatibility', () => {
    const status = validateAuthEnv({ NEXTAUTH_SECRET: 'nextauth-secret' });

    expect(status.isHealthy).toBe(true);
    expect(status.missingRequired).toEqual([]);
  });

  it('reports AUTH_SECRET missing when both secret env vars are unset or empty', () => {
    expect(validateAuthEnv({}).missingRequired).toEqual(['AUTH_SECRET']);

    const status = validateAuthEnv({ AUTH_SECRET: '', NEXTAUTH_SECRET: '' });

    expect(status.isHealthy).toBe(false);
    expect(status.missingRequired).toEqual(['AUTH_SECRET']);
  });

  it('rejects Netlify deploy-specific NEXTAUTH_URL values', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      NEXTAUTH_URL: 'https://6a55d20929f6f10bb6d41ae7--poetic-syrniki-373949.netlify.app',
    });

    expect(status.isHealthy).toBe(false);
    expect(status.invalid).toEqual([
      { name: 'NEXTAUTH_URL', reason: 'deploySpecificUrl' },
    ]);
  });

  // next-auth はパスを basePath として採用するが、本アプリのルートハンドラは
  // src/app/api/auth/[...nextauth]/route.ts に固定されており basePath は /api/auth 前提。
  // パス付き URL は Auth.js の生成 URL と実在ルートをずらして認証を壊すため不正とする。
  it('rejects AUTH_URL values with a path (basePath would no longer match /api/auth)', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      AUTH_URL: 'https://example.com/app',
    });

    expect(status.invalid).toEqual([{ name: 'AUTH_URL', reason: 'hasPath' }]);
  });

  it('accepts a trailing-slash-only URL as valid', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      AUTH_URL: 'https://www.anytime-trial.com/',
    });

    expect(status.isHealthy).toBe(true);
    expect(status.invalid).toEqual([]);
  });

  it('reports the missing provider var when only GITHUB_CLIENT_SECRET is set', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      GITHUB_CLIENT_SECRET: 'github-client-secret',
    });

    expect(status.providers.github).toBe(false);
    expect(status.missingProviderVars).toEqual(['GITHUB_CLIENT_ID']);
  });

  it('prefers AUTH_URL over NEXTAUTH_URL when both are present', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      AUTH_URL: 'https://example.com',
      NEXTAUTH_URL: 'https://bad--deploy.netlify.app',
    });

    expect(status.isHealthy).toBe(true);
    expect(status.invalid).toEqual([]);
  });

  // next-auth の reqWithEnvURL は `if (!url) return req` で空文字の AUTH_URL/NEXTAUTH_URL を
  // 無視し、リクエストの Host から origin を解決する。空文字は「未設定」と同義であり、
  // 不正値として扱うと正常な本番を「設定エラー」と誤判定する。
  it('treats an empty AUTH_URL/NEXTAUTH_URL as unset, not invalid', () => {
    expect(validateAuthEnv({ AUTH_SECRET: 'auth-secret', AUTH_URL: '' }).isHealthy).toBe(true);
    expect(validateAuthEnv({ AUTH_SECRET: 'auth-secret', NEXTAUTH_URL: '' }).invalid).toEqual([]);
  });

  // AUTH_URL が空文字なら next-auth は NEXTAUTH_URL を見ない（`??` は空文字を通す）。
  // 実際に override が起きない以上、NEXTAUTH_URL の値が不正でも影響しない。
  it('ignores NEXTAUTH_URL when AUTH_URL is defined but empty', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      AUTH_URL: '',
      NEXTAUTH_URL: 'https://bad--deploy.netlify.app',
    });

    expect(status.isHealthy).toBe(true);
    expect(status.invalid).toEqual([]);
  });

  it('reports the missing provider var when only GOOGLE_CLIENT_ID is set', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      GOOGLE_CLIENT_ID: 'google-client-id',
    });

    expect(status.providers.google).toBe(false);
    expect(status.missingProviderVars).toEqual(['GOOGLE_CLIENT_SECRET']);
  });

  it('marks all providers available when every provider credential pair is set', () => {
    const status = validateAuthEnv({
      AUTH_SECRET: 'auth-secret',
      GITHUB_CLIENT_ID: 'github-client-id',
      GITHUB_CLIENT_SECRET: 'github-client-secret',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      SPOTIFY_CLIENT_ID: 'spotify-client-id',
      SPOTIFY_CLIENT_SECRET: 'spotify-client-secret',
    });

    expect(status.providers).toEqual({
      github: true,
      google: true,
      spotify: true,
    });
  });

  it('does not include secret values in the returned status', () => {
    const secret = 'super-secret-value';
    const status = validateAuthEnv({
      AUTH_SECRET: secret,
      GITHUB_CLIENT_ID: 'github-client-id',
      GITHUB_CLIENT_SECRET: 'github-client-secret',
    });

    expect(JSON.stringify(status)).not.toContain(secret);
    expect(JSON.stringify(status)).not.toContain('github-client-secret');
  });
});
