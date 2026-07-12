import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ClaudeUsageClient, type ClaudeUsageFetch } from '../ClaudeUsageClient';

function makeCredentialsPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usage-client-')), 'credentials.json');
}

function writeCredentials(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf-8');
}

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe('ClaudeUsageClient', () => {
  it('returns unauthenticated when the credentials file is missing', async () => {
    const missingPath = makeCredentialsPath();
    fs.rmSync(missingPath, { force: true });
    const fetchMock: ClaudeUsageFetch = jest.fn();

    await expect(new ClaudeUsageClient({ credentialsPath: missingPath, fetch: fetchMock }).fetchUsage())
      .resolves.toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 破損した認証情報を「未認証」と同一視すると Usage が無言で消え、原因が追えなくなる（silent catch）。
  // ファイル不在（OAuth 非利用環境の正常系）とは別物として error に分類する。
  it('reports a corrupt credentials file as an error rather than unauthenticated', async () => {
    const invalidPath = makeCredentialsPath();
    fs.writeFileSync(invalidPath, '{', 'utf-8');
    const fetchMock: ClaudeUsageFetch = jest.fn();

    const result = await new ClaudeUsageClient({ credentialsPath: invalidPath, fetch: fetchMock }).fetchUsage();

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') {
      throw new Error(`Expected error result, got ${result.kind}`);
    }
    expect(result.message).toContain('credentials');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns unauthenticated when the access token is absent', async () => {
    const credentialsPath = makeCredentialsPath();
    writeCredentials(credentialsPath, { claudeAiOauth: { expiresAt: Date.now() + 60_000 } });

    const fetchMock: ClaudeUsageFetch = jest.fn();
    await expect(new ClaudeUsageClient({ credentialsPath, fetch: fetchMock }).fetchUsage())
      .resolves.toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns expired without network access when the token is past expiresAt', async () => {
    const credentialsPath = makeCredentialsPath();
    writeCredentials(credentialsPath, {
      claudeAiOauth: { accessToken: 'secret-token', expiresAt: Date.now() - 1 },
    });
    const fetchMock: ClaudeUsageFetch = jest.fn();

    await expect(new ClaudeUsageClient({ credentialsPath, fetch: fetchMock }).fetchUsage())
      .resolves.toEqual({ kind: 'expired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches usage with the expected headers and parses ok responses', async () => {
    const credentialsPath = makeCredentialsPath();
    writeCredentials(credentialsPath, {
      claudeAiOauth: { accessToken: 'secret-token', expiresAt: Date.now() + 60_000 },
    });
    const fetchMock: ClaudeUsageFetch = jest.fn(async () => response(200, {
      limits: [
        { kind: 'session', percent: 29, severity: 'normal', resets_at: '2026-07-12T14:19:59Z' },
      ],
    }));

    const result = await new ClaudeUsageClient({ credentialsPath, fetch: fetchMock }).fetchUsage();

    expect(result).toEqual({
      kind: 'ok',
      rows: [
        {
          key: 'session',
          label: 'Session (5h)',
          percent: 29,
          severity: 'normal',
          resetsAt: '2026-07-12T14:19:59.000Z',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/api/oauth/usage',
      {
        headers: {
          Authorization: 'Bearer secret-token',
          'anthropic-beta': 'oauth-2025-04-20',
        },
      },
    );
  });

  it('classifies HTTP and network failures without exposing the token', async () => {
    const credentialsPath = makeCredentialsPath();
    writeCredentials(credentialsPath, {
      claudeAiOauth: { accessToken: 'secret-token', expiresAt: Date.now() + 60_000 },
    });

    await expect(new ClaudeUsageClient({
      credentialsPath,
      fetch: jest.fn(async () => response(403, {})),
    }).fetchUsage()).resolves.toEqual({ kind: 'expired' });
    await expect(new ClaudeUsageClient({
      credentialsPath,
      fetch: jest.fn(async () => response(429, {})),
    }).fetchUsage()).resolves.toEqual({ kind: 'rateLimited' });

    const errorResult = await new ClaudeUsageClient({
      credentialsPath,
      fetch: jest.fn(async () => { throw new Error('socket failed with secret-token'); }),
    }).fetchUsage();
    expect(errorResult.kind).toBe('error');
    if (errorResult.kind !== 'error') {
      throw new Error(`Expected error result, got ${errorResult.kind}`);
    }
    expect(errorResult.message).not.toContain('secret-token');
  });
});
