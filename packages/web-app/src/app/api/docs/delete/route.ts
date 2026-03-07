import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, DOCS_BUCKET, DOCS_PREFIX } from '../../../../lib/s3Client';
import { checkBasicAuth } from '../../../../lib/basicAuth';

export async function DELETE(request: NextRequest) {
  const authError = checkBasicAuth(request);
  if (authError) return authError;

  const key = request.nextUrl.searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'key parameter is required' }, { status: 400 });
  }

  if (!key.startsWith(DOCS_PREFIX) || !key.endsWith('.md')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }

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
    const command = new DeleteObjectCommand({
      Bucket: DOCS_BUCKET,
      Key: key,
    });
    await s3Client.send(command);

    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error('Failed to delete S3 object:', e);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 },
    );
  }
}
