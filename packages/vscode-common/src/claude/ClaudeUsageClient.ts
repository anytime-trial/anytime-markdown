import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseClaudeUsage, type UsageLimitRow } from './parseClaudeUsage';

export type ClaudeUsageFetch = (
  input: string,
  init?: { readonly headers?: Readonly<Record<string, string>> },
) => Promise<Response>;

export type ClaudeUsageResult =
  | { readonly kind: 'ok'; readonly rows: readonly UsageLimitRow[] }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'rateLimited' }
  | { readonly kind: 'error'; readonly message: string };

export interface ClaudeUsageClientOptions {
  readonly credentialsPath?: string;
  readonly fetch?: ClaudeUsageFetch;
  readonly now?: () => number;
}

interface Credentials {
  readonly accessToken: string;
  readonly expiresAt: number | null;
}

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const DEFAULT_ERROR_MESSAGE = 'Claude usage request failed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFileNotFound(err: unknown): boolean {
  return isRecord(err) && err.code === 'ENOENT';
}

/** 認証情報の読み取り失敗を、トークンを載せずに種別だけで表す。 */
function sanitizeCredentialsError(err: unknown): string {
  const kind = err instanceof Error && err.name ? err.name : 'Error';
  return `Claude credentials could not be read (${kind})`;
}

function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name ? `${err.name}: ${DEFAULT_ERROR_MESSAGE}` : DEFAULT_ERROR_MESSAGE;
  }
  return DEFAULT_ERROR_MESSAGE;
}

function parseCredentials(input: unknown): Credentials | null {
  if (!isRecord(input)) {
    return null;
  }
  const oauth = input.claudeAiOauth;
  if (!isRecord(oauth) || typeof oauth.accessToken !== 'string' || oauth.accessToken.length === 0) {
    return null;
  }
  return {
    accessToken: oauth.accessToken,
    expiresAt: typeof oauth.expiresAt === 'number' && Number.isFinite(oauth.expiresAt)
      ? oauth.expiresAt
      : null,
  };
}

export class ClaudeUsageClient {
  private readonly credentialsPath: string;
  private readonly fetchImpl: ClaudeUsageFetch;
  private readonly now: () => number;

  constructor(options: ClaudeUsageClientOptions = {}) {
    this.credentialsPath = options.credentialsPath
      ?? path.join(os.homedir(), '.claude', '.credentials.json');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  async fetchUsage(): Promise<ClaudeUsageResult> {
    let credentials: Credentials | null;
    try {
      credentials = await this.readCredentials();
    } catch (err) {
      // 認証情報ファイルが無いのは異常ではない（API キー / Bedrock 運用では OAuth を使わない）。
      // 一方 JSON 破損・権限エラーは黙って握り潰すと Usage が無言で消えるため error として返す。
      if (isFileNotFound(err)) {
        return { kind: 'unauthenticated' };
      }
      return { kind: 'error', message: sanitizeCredentialsError(err) };
    }
    if (credentials === null) {
      return { kind: 'unauthenticated' };
    }
    if (credentials.expiresAt !== null && credentials.expiresAt <= this.now()) {
      return { kind: 'expired' };
    }

    try {
      const res = await this.fetchImpl(USAGE_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
        },
      });
      return await this.handleResponse(res);
    } catch (err) {
      return { kind: 'error', message: sanitizeErrorMessage(err) };
    }
  }

  /** 読み取り専用。`~/.claude/**` への書き込み（トークンリフレッシュ含む）は永続データ保護のため行わない。 */
  private async readCredentials(): Promise<Credentials | null> {
    const text = await fs.readFile(this.credentialsPath, 'utf-8');
    return parseCredentials(JSON.parse(text));
  }

  private async handleResponse(res: Response): Promise<ClaudeUsageResult> {
    if (res.status === 401 || res.status === 403) {
      return { kind: 'expired' };
    }
    if (res.status === 429) {
      return { kind: 'rateLimited' };
    }
    if (res.status !== 200) {
      return { kind: 'error', message: `Claude usage request failed with HTTP ${res.status}` };
    }

    try {
      const rows = parseClaudeUsage(await res.json());
      if (rows === null) {
        return { kind: 'error', message: 'Claude usage response was not recognized' };
      }
      return { kind: 'ok', rows };
    } catch (err) {
      return { kind: 'error', message: sanitizeErrorMessage(err) };
    }
  }
}
