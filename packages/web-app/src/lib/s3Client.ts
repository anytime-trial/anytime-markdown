import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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
const CLOUDFRONT_URL = process.env.CLOUDFRONT_DOCS_URL ?? '';

const LAYOUT_KEY = DOCS_PREFIX + '_layout.json';

/**
 * CloudFront 経由でオブジェクトを取得する。
 * CLOUDFRONT_DOCS_URL が未設定の場合は null を返し、呼び出し元で S3 SDK にフォールバックする。
 */
export async function fetchFromCdn(key: string): Promise<string | null> {
  if (!CLOUDFRONT_URL) return null;

  const url = `${CLOUDFRONT_URL}/${key}`;
  const res = await fetch(url, { cache: 'no-store' });
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
