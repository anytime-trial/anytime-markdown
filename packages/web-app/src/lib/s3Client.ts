import { GetObjectCommand,S3Client } from '@aws-sdk/client-s3';

import type { LayoutData } from '../types/layout';

export const s3Client = new S3Client({
  region: process.env.ANYTIME_AWS_REGION ?? 'ap-northeast-1',
  ...(process.env.ANYTIME_AWS_ACCESS_KEY_ID && process.env.ANYTIME_AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.ANYTIME_AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.ANYTIME_AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

export const DOCS_BUCKET = process.env.S3_DOCS_BUCKET ?? '';
export const DOCS_PREFIX = process.env.S3_DOCS_PREFIX ?? 'docs/';
export const CLOUDFRONT_URL = process.env.CLOUDFRONT_DOCS_URL ?? '';

const LAYOUT_KEY = DOCS_PREFIX + '_layout.json';

/**
 * CloudFront 経由でオブジェクトを取得する。
 * CLOUDFRONT_DOCS_URL が未設定の場合は null を返し、呼び出し元で S3 SDK にフォールバックする。
 */
export async function fetchFromCdn(key: string): Promise<string | null> {
  if (!CLOUDFRONT_URL) return null;

  // SSRF 対策: パストラバーサル・プロトコル注入を防止
  if (key.includes('..') || key.includes('://') || key.includes('\0')) return null;

  const base = new URL(CLOUDFRONT_URL);
  const target = new URL(`${CLOUDFRONT_URL}/${key}`);
  if (target.origin !== base.origin) return null;
  // パス正規化後もプレフィックス内に収まることを検証
  if (!target.pathname.startsWith(base.pathname)) return null;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 10_000);
  // バリデーション済みのオリジンとパスから URL を再構築（SSRF 対策）
  const safeUrl = `${base.origin}${target.pathname}`;
  const res = await fetch(safeUrl, { cache: 'no-store', signal: controller.signal });
  clearTimeout(timerId);
  if (!res.ok) return null;
  return res.text();
}

export async function fetchLayoutData(): Promise<LayoutData> {
  if (!DOCS_BUCKET && !CLOUDFRONT_URL) {
    return { categories: [] };
  }

  try {
    // _layout.json は頻繁に更新されるため CDN キャッシュをスキップし S3 から直接取得
    if (!DOCS_BUCKET) return { categories: [] };
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: DOCS_BUCKET, Key: LAYOUT_KEY }),
    );
    const body = await response.Body?.transformToString('utf-8');
    if (!body) return { categories: [] };

    const data = JSON.parse(body) as LayoutData;
    return {
      categories: (data.categories ?? []).sort((a, b) => a.order - b.order),
      siteDescription: data.siteDescription,
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'NoSuchKey') {
      return { categories: [] };
    }
    throw e;
  }
}
