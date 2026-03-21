import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import { getBaseDir, transformMarkdownImageUrls } from '../../../../lib/docsImageUrl';
import { CLOUDFRONT_URL, DOCS_BUCKET, DOCS_PREFIX, fetchFromCdn, s3Client } from '../../../../lib/s3Client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'key parameter is required' }, { status: 400 });
  }

  if (!key.startsWith(DOCS_PREFIX) || !key.endsWith('.md')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

  // パストラバーサル防止
  if (key.includes('..')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

  const cacheHeaders = {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store',
  };

  try {
    let body: string | null = null;

    // CloudFront 経由で取得を試みる
    body = await fetchFromCdn(key);

    // S3 SDK フォールバック
    if (body === null) {
      if (!DOCS_BUCKET) {
        return NextResponse.json(
          { error: 'S3_DOCS_BUCKET is not configured' },
          { status: 500 },
        );
      }

      const command = new GetObjectCommand({
        Bucket: DOCS_BUCKET,
        Key: key,
      });
      const response = await s3Client.send(command);
      body = (await response.Body?.transformToString('utf-8')) ?? null;
    }

    if (!body) {
      return NextResponse.json({ error: 'Empty document' }, { status: 404 });
    }

    // 画像の相対パスを絶対URLに変換
    const baseDir = getBaseDir(key);
    body = transformMarkdownImageUrls(body, baseDir, CLOUDFRONT_URL);

    return new NextResponse(body, { status: 200, headers: cacheHeaders });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'NoSuchKey') {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    console.error('Failed to get S3 object:', e);
    return NextResponse.json(
      { error: 'Failed to load document' },
      { status: 500 },
    );
  }
}
