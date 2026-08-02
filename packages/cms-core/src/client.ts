import { S3Client } from '@aws-sdk/client-s3';

/**
 * 接続確立の待機上限（ms）。AWS SDK の既定は無制限のため、ネットワークの一過性障害が
 * そのままリクエストのハングへ増幅される（実測: 単一リクエストが 75 秒ブロック）。
 * 到達不能なアドレスを早期に諦め、リトライまたはエラーへ倒すために明示する。
 */
export const DEFAULT_S3_CONNECTION_TIMEOUT_MS = 3_000;

/**
 * ソケットが無通信のまま許容される時間（ms）。転送中のオブジェクト全体ではなく
 * チャンク間の間隔に効くため、大きなオブジェクトの取得を打ち切らない。
 */
export const DEFAULT_S3_REQUEST_TIMEOUT_MS = 10_000;

/** 最大試行回数（初回 + リトライ）。AWS SDK の既定と同値だが、上限時間の見積もりのため明示する。 */
export const DEFAULT_S3_MAX_ATTEMPTS = 3;

export interface CmsConfig {
  region: string;
  bucket: string;
  docsPrefix: string;
  reportsPrefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
  maxAttempts?: number;
}

/**
 * 正の整数として解釈できる場合のみ採用し、それ以外は既定値を返す。
 * タイムアウトに 0 や負値を通すと「無制限」や即時失敗として解釈され、
 * 設定ミスが障害の増幅に直結するため弾く。
 */
function positiveIntOrDefault(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : fallback;
}

export function createCmsConfig(env: Record<string, string | undefined> = process.env): CmsConfig {
  return {
    region: env.ANYTIME_AWS_REGION ?? 'ap-northeast-1',
    bucket: env.S3_DOCS_BUCKET ?? '',
    docsPrefix: env.S3_DOCS_PREFIX ?? 'docs/',
    reportsPrefix: env.S3_REPORTS_PREFIX ?? 'reports/',
    accessKeyId: env.ANYTIME_AWS_ACCESS_KEY_ID,
    secretAccessKey: env.ANYTIME_AWS_SECRET_ACCESS_KEY,
    connectionTimeoutMs: positiveIntOrDefault(
      env.S3_CONNECTION_TIMEOUT_MS,
      DEFAULT_S3_CONNECTION_TIMEOUT_MS,
    ),
    requestTimeoutMs: positiveIntOrDefault(
      env.S3_REQUEST_TIMEOUT_MS,
      DEFAULT_S3_REQUEST_TIMEOUT_MS,
    ),
    maxAttempts: positiveIntOrDefault(env.S3_MAX_ATTEMPTS, DEFAULT_S3_MAX_ATTEMPTS),
  };
}

export function createS3Client(config: CmsConfig): S3Client {
  return new S3Client({
    region: config.region,
    // ハンドラのインスタンスではなくオプションを渡す（HttpHandlerUserInput）。
    // ランタイム既定のハンドラ（Node は NodeHttpHandler、Workers は FetchHttpHandler）へ
    // そのまま委譲されるため、Workers 向けのランタイム分岐を持たずに済む。
    requestHandler: {
      connectionTimeout: config.connectionTimeoutMs ?? DEFAULT_S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: config.requestTimeoutMs ?? DEFAULT_S3_REQUEST_TIMEOUT_MS,
    },
    maxAttempts: config.maxAttempts ?? DEFAULT_S3_MAX_ATTEMPTS,
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });
}
