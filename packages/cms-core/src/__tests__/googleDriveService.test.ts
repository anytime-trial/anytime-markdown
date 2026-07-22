import { base64UrlEncodeBytes, base64UrlEncodeString, parseServiceAccountKey } from '../googleDriveService';
import { parseGoogleDocId } from '../googleDriveService';
import { getServiceAccountAccessToken, DRIVE_READONLY_SCOPE } from '../googleDriveService';
import { readGoogleDocAsText, readGoogleDoc } from '../googleDriveService';

describe('base64UrlEncodeBytes', () => {
  it('パディングなし・URL安全文字でエンコードする', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    const result = base64UrlEncodeBytes(bytes);
    expect(result).not.toMatch(/[+/=]/);
    expect(result).toBe('-_-_');
  });
});

describe('base64UrlEncodeString', () => {
  it('UTF-8文字列をbase64urlエンコードする', () => {
    expect(base64UrlEncodeString('{"alg":"RS256"}')).toBe(
      Buffer.from('{"alg":"RS256"}', 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
    );
  });
});

describe('parseServiceAccountKey', () => {
  it('client_email と private_key を含む JSON を正しくパースする', () => {
    const json = JSON.stringify({ client_email: 'sa@project.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' });
    const result = parseServiceAccountKey(json);
    expect(result.client_email).toBe('sa@project.iam.gserviceaccount.com');
    expect(result.private_key).toContain('BEGIN PRIVATE KEY');
  });

  it('不正なJSONはエラーを投げる', () => {
    expect(() => parseServiceAccountKey('not json')).toThrow('Invalid service account key');
  });

  it('client_email が欠けている場合はエラーを投げる', () => {
    expect(() => parseServiceAccountKey(JSON.stringify({ private_key: 'x' }))).toThrow('Invalid service account key');
  });

  it('private_key が欠けている場合はエラーを投げる', () => {
    expect(() => parseServiceAccountKey(JSON.stringify({ client_email: 'a@b.com' }))).toThrow('Invalid service account key');
  });
});

describe('parseGoogleDocId', () => {
  it('生のIDをそのまま返す', () => {
    expect(parseGoogleDocId('1A2b3C4d5E')).toBe('1A2b3C4d5E');
  });

  it('/d/<id>/ 形式のURLからIDを抽出する', () => {
    expect(parseGoogleDocId('https://docs.google.com/document/d/1A2b3C4d5E/edit')).toBe('1A2b3C4d5E');
  });

  it('?id=<id> 形式のURLからIDを抽出する', () => {
    expect(parseGoogleDocId('https://drive.google.com/open?id=1A2b3C4d5E')).toBe('1A2b3C4d5E');
  });

  it('空文字はエラーを投げる', () => {
    expect(() => parseGoogleDocId('  ')).toThrow('Empty Google Doc reference');
  });

  it('IDを抽出できない文字列はエラーを投げる', () => {
    expect(() => parseGoogleDocId('https://example.com/foo')).toThrow('Cannot parse Google Doc ID');
  });
});

describe('getServiceAccountAccessToken', () => {
  const serviceAccount = { client_email: 'sa@project.iam.gserviceaccount.com', private_key: 'fake-key' };

  it('JWTを署名しトークンエンドポイントへPOSTし、アクセストークンを返す', async () => {
    const sign = jest.fn().mockResolvedValue('fake-signature');
    const mockResponse = {
      status: 200,
      json: jest.fn().mockResolvedValue({ access_token: 'ya29.abc', expires_in: 3600 }),
    };
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse);

    const result = await getServiceAccountAccessToken(
      serviceAccount, DRIVE_READONLY_SCOPE, sign, fetchImpl as unknown as typeof fetch, 1000,
    );

    expect(result).toEqual({ accessToken: 'ya29.abc', expiresAt: 4600 });
    expect(sign).toHaveBeenCalledTimes(1);
    const [privateKeyArg, signingInputArg] = sign.mock.calls[0];
    expect(privateKeyArg).toBe('fake-key');
    const [headerB64, payloadB64] = signingInputArg.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    expect(payload).toEqual({
      iss: 'sa@project.iam.gserviceaccount.com',
      scope: DRIVE_READONLY_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1000,
      exp: 4600,
    });
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = (fetchImpl.mock.calls[0][1] as { body: string }).body;
    expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(body).toContain(`assertion=${signingInputArg}.fake-signature`);
  });

  it('トークンエンドポイントがエラーを返したら詳細付きで例外を投げる', async () => {
    const sign = jest.fn().mockResolvedValue('sig');
    const mockResponse = {
      status: 401,
      json: jest.fn().mockResolvedValue({ error: 'invalid_grant', error_description: 'Invalid JWT signature' }),
    };
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse);

    await expect(
      getServiceAccountAccessToken(serviceAccount, DRIVE_READONLY_SCOPE, sign, fetchImpl as unknown as typeof fetch, 1000),
    ).rejects.toThrow('Invalid JWT signature');
  });

  it('トークンエンドポイントが非JSON応答を返したらstatus付きで例外を投げる', async () => {
    const sign = jest.fn().mockResolvedValue('sig');
    const mockResponse = {
      status: 502,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    };
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse);

    await expect(
      getServiceAccountAccessToken(serviceAccount, DRIVE_READONLY_SCOPE, sign, fetchImpl as unknown as typeof fetch, 1000),
    ).rejects.toThrow('status 502');
  });

  it('トークンエンドポイントがnullを返したら例外を投げる', async () => {
    const sign = jest.fn().mockResolvedValue('sig');
    const mockResponse = { status: 200, json: jest.fn().mockResolvedValue(null) };
    const fetchImpl = jest.fn().mockResolvedValue(mockResponse);

    await expect(
      getServiceAccountAccessToken(serviceAccount, DRIVE_READONLY_SCOPE, sign, fetchImpl as unknown as typeof fetch, 1000),
    ).rejects.toThrow('unexpected response body');
  });
});

describe('readGoogleDocAsText', () => {
  it('exportエンドポイントへGETしプレーンテキストを返す', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: jest.fn().mockResolvedValue('doc body') });
    const text = await readGoogleDocAsText('file-id-1', 'token-abc', fetchImpl as unknown as typeof fetch);
    expect(text).toBe('doc body');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/file-id-1/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer token-abc' } },
    );
  });

  it('403の場合は共有設定を促すエラーを投げる', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, text: jest.fn().mockResolvedValue('') });
    await expect(readGoogleDocAsText('file-id-1', 'token-abc', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow('shared with the service account email');
  });

  it('403の場合、Google側のエラー詳細本文をメッセージに含める', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false, status: 403,
      text: jest.fn().mockResolvedValue('{"error":{"reason":"insufficientPermissions"}}'),
    });
    await expect(readGoogleDocAsText('file-id-1', 'token-abc', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow('insufficientPermissions');
  });

  it('404の場合も共有設定を促すエラーを投げる', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404, text: jest.fn().mockResolvedValue('') });
    await expect(readGoogleDocAsText('file-id-1', 'token-abc', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow('shared with the service account email');
  });

  it('その他のエラーはstatusと本文を含む例外を投げる', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, text: jest.fn().mockResolvedValue('server error') });
    await expect(readGoogleDocAsText('file-id-1', 'token-abc', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow('status 500');
  });
});

describe('readGoogleDoc', () => {
  it('鍵パース→ID解析→トークン取得→本文取得を一気通貫で行う', async () => {
    const sign = jest.fn().mockResolvedValue('sig');
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ status: 200, json: jest.fn().mockResolvedValue({ access_token: 'tok', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: jest.fn().mockResolvedValue('hello world') });

    const serviceAccountKeyJson = JSON.stringify({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: 'k' });
    const text = await readGoogleDoc(
      { docRef: 'https://docs.google.com/document/d/abc123/edit', serviceAccountKeyJson },
      sign, fetchImpl as unknown as typeof fetch,
    );

    expect(text).toBe('hello world');
    expect(fetchImpl).toHaveBeenNthCalledWith(2,
      'https://www.googleapis.com/drive/v3/files/abc123/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer tok' } },
    );
  });
});
