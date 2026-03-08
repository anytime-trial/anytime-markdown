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

const LAYOUT_KEY = DOCS_PREFIX + '_layout.json';

export async function fetchLayoutData(): Promise<LayoutData> {
  if (!DOCS_BUCKET) {
    return { categories: [] };
  }

  try {
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
