const AUTH_URL_NAMES = ['AUTH_URL', 'NEXTAUTH_URL'] as const;
const PROVIDERS = [
  {
    key: 'github',
    clientId: 'GITHUB_CLIENT_ID',
    clientSecret: 'GITHUB_CLIENT_SECRET',
  },
  {
    key: 'google',
    clientId: 'GOOGLE_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
  },
  {
    key: 'spotify',
    clientId: 'SPOTIFY_CLIENT_ID',
    clientSecret: 'SPOTIFY_CLIENT_SECRET',
  },
] as const;

export type AuthEnvInvalidReason =
  | 'notAbsoluteUrl'
  | 'hasPath'
  | 'deploySpecificUrl';

export type AuthEnvStatus = Readonly<{
  isHealthy: boolean;
  missingRequired: readonly string[];
  invalid: readonly Readonly<{
    name: (typeof AUTH_URL_NAMES)[number];
    reason: AuthEnvInvalidReason;
  }>[];
  missingProviderVars: readonly string[];
  providers: Readonly<{
    github: boolean;
    google: boolean;
    spotify: boolean;
  }>;
}>;

type ProviderKey = (typeof PROVIDERS)[number]['key'];

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateAuthUrl(
  name: (typeof AUTH_URL_NAMES)[number],
  value: string,
): AuthEnvStatus['invalid'][number] | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { name, reason: 'notAbsoluteUrl' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { name, reason: 'notAbsoluteUrl' };
  }

  if (parsed.pathname !== '/') {
    return { name, reason: 'hasPath' };
  }

  if (parsed.hostname.endsWith('.netlify.app') && parsed.hostname.split('.')[0]?.includes('--')) {
    return { name, reason: 'deploySpecificUrl' };
  }

  return null;
}

export function validateAuthEnv(env: Record<string, string | undefined>): AuthEnvStatus {
  const missingRequired: string[] = [];
  const invalid: AuthEnvStatus['invalid'][number][] = [];
  const missingProviderVars: string[] = [];
  const providers: Record<ProviderKey, boolean> = {
    github: false,
    google: false,
    spotify: false,
  };

  if (!hasValue(env.AUTH_SECRET) && !hasValue(env.NEXTAUTH_SECRET)) {
    missingRequired.push('AUTH_SECRET');
  }

  // next-auth の reqWithEnvURL（`AUTH_URL ?? NEXTAUTH_URL` → `if (!url) return req`）と同じ解決順・
  // 同じ falsy 判定にそろえる。空文字は override が起きないため「未設定」であり、不正値ではない。
  const authUrlName = env.AUTH_URL !== undefined ? 'AUTH_URL' : 'NEXTAUTH_URL';
  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL;
  if (authUrl) {
    const invalidUrl = validateAuthUrl(authUrlName, authUrl);
    if (invalidUrl) {
      invalid.push(invalidUrl);
    }
  }

  for (const provider of PROVIDERS) {
    const hasClientId = hasValue(env[provider.clientId]);
    const hasClientSecret = hasValue(env[provider.clientSecret]);
    providers[provider.key] = hasClientId && hasClientSecret;

    if (hasClientId && !hasClientSecret) {
      missingProviderVars.push(provider.clientSecret);
    } else if (!hasClientId && hasClientSecret) {
      missingProviderVars.push(provider.clientId);
    }
  }

  return {
    isHealthy: missingRequired.length === 0 && invalid.length === 0,
    missingRequired,
    invalid,
    missingProviderVars,
    providers,
  };
}
