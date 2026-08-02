import { S3Client } from '@aws-sdk/client-s3';

import {
  createCmsConfig,
  createS3Client,
  DEFAULT_S3_CONNECTION_TIMEOUT_MS,
  DEFAULT_S3_MAX_ATTEMPTS,
  DEFAULT_S3_REQUEST_TIMEOUT_MS,
} from '../client';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
}));

const S3ClientMock = S3Client as unknown as jest.Mock;

/** S3Client コンストラクタへ実際に渡された設定を取り出す */
function capturedConfig(): Record<string, unknown> {
  expect(S3ClientMock).toHaveBeenCalledTimes(1);
  return S3ClientMock.mock.calls[0][0] as Record<string, unknown>;
}

const baseConfig = {
  region: 'ap-northeast-1',
  bucket: 'b',
  docsPrefix: 'docs/',
  reportsPrefix: 'reports/',
};

beforeEach(() => {
  S3ClientMock.mockReset();
});

describe('createCmsConfig', () => {
  it('タイムアウトと試行回数に既定値を設定する', () => {
    const config = createCmsConfig({});

    expect(config.connectionTimeoutMs).toBe(DEFAULT_S3_CONNECTION_TIMEOUT_MS);
    expect(config.requestTimeoutMs).toBe(DEFAULT_S3_REQUEST_TIMEOUT_MS);
    expect(config.maxAttempts).toBe(DEFAULT_S3_MAX_ATTEMPTS);
  });

  it('環境変数で上書きできる', () => {
    const config = createCmsConfig({
      S3_CONNECTION_TIMEOUT_MS: '1500',
      S3_REQUEST_TIMEOUT_MS: '4000',
      S3_MAX_ATTEMPTS: '5',
    });

    expect(config.connectionTimeoutMs).toBe(1500);
    expect(config.requestTimeoutMs).toBe(4000);
    expect(config.maxAttempts).toBe(5);
  });

  it.each([
    ['空文字', ''],
    ['非数値', 'abc'],
    ['0', '0'],
    ['負値', '-1'],
    ['小数', '1.5'],
  ])('不正な値(%s)は既定値へフォールバックする', (_label, raw) => {
    const config = createCmsConfig({ S3_CONNECTION_TIMEOUT_MS: raw });

    expect(config.connectionTimeoutMs).toBe(DEFAULT_S3_CONNECTION_TIMEOUT_MS);
  });
});

describe('createS3Client', () => {
  it('接続・リクエストのタイムアウトを requestHandler へ渡す', () => {
    createS3Client({
      ...baseConfig,
      connectionTimeoutMs: 1500,
      requestTimeoutMs: 4000,
      maxAttempts: 2,
    });

    expect(capturedConfig().requestHandler).toEqual({
      connectionTimeout: 1500,
      requestTimeout: 4000,
    });
  });

  it('最大試行回数を渡す', () => {
    createS3Client({
      ...baseConfig,
      connectionTimeoutMs: 1500,
      requestTimeoutMs: 4000,
      maxAttempts: 2,
    });

    expect(capturedConfig().maxAttempts).toBe(2);
  });

  it('タイムアウト未指定の呼び出しでも既定値を適用する', () => {
    createS3Client(baseConfig);

    expect(capturedConfig().requestHandler).toEqual({
      connectionTimeout: DEFAULT_S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: DEFAULT_S3_REQUEST_TIMEOUT_MS,
    });
    expect(capturedConfig().maxAttempts).toBe(DEFAULT_S3_MAX_ATTEMPTS);
  });

  it('認証情報が揃っている場合のみ credentials を渡す', () => {
    createS3Client({ ...baseConfig, accessKeyId: 'id', secretAccessKey: 'secret' });

    expect(capturedConfig().credentials).toEqual({
      accessKeyId: 'id',
      secretAccessKey: 'secret',
    });
  });

  it('認証情報が片方だけなら credentials を渡さない', () => {
    createS3Client({ ...baseConfig, accessKeyId: 'id' });

    expect(capturedConfig()).not.toHaveProperty('credentials');
  });
});
