import { NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client, DOCS_BUCKET, DOCS_PREFIX } from '../../../lib/s3Client';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!DOCS_BUCKET) {
    return NextResponse.json(
      { error: 'S3_DOCS_BUCKET is not configured' },
      { status: 500 },
    );
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: DOCS_BUCKET,
      Prefix: DOCS_PREFIX,
    });
    const response = await s3Client.send(command);

    const files = (response.Contents ?? [])
      .filter((obj) => obj.Key && obj.Key.endsWith('.md') && obj.Key !== DOCS_PREFIX)
      .map((obj) => ({
        key: obj.Key!,
        name: obj.Key!.slice(DOCS_PREFIX.length),
        lastModified: obj.LastModified?.toISOString() ?? '',
        size: obj.Size ?? 0,
      }));

    return NextResponse.json({ files }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('Failed to list S3 objects:', e);
    return NextResponse.json(
      { error: 'Failed to list documents' },
      { status: 500 },
    );
  }
}
