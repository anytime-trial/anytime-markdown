import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, DOCS_BUCKET, DOCS_PREFIX } from '../../../../lib/s3Client';

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

  if (!DOCS_BUCKET) {
    return NextResponse.json(
      { error: 'S3_DOCS_BUCKET is not configured' },
      { status: 500 },
    );
  }

  try {
    const command = new GetObjectCommand({
      Bucket: DOCS_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString('utf-8');

    if (!body) {
      return NextResponse.json({ error: 'Empty document' }, { status: 404 });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
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
