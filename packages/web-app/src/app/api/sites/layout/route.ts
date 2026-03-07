import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { revalidatePath } from 'next/cache';
import { s3Client, DOCS_BUCKET, DOCS_PREFIX, fetchLayoutData } from '../../../../lib/s3Client';
import { checkBasicAuth } from '../../../../lib/basicAuth';
import { layoutDataSchema } from '../../../../types/layout';

const LAYOUT_KEY = DOCS_PREFIX + '_layout.json';

export async function GET() {
  try {
    const data = await fetchLayoutData();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    console.error('Failed to get layout:', e);
    return NextResponse.json(
      { error: 'Failed to load layout' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const authError = checkBasicAuth(request);
  if (authError) return authError;

  if (!DOCS_BUCKET) {
    return NextResponse.json(
      { error: 'S3_DOCS_BUCKET is not configured' },
      { status: 500 },
    );
  }

  try {
    const raw = await request.json();
    const result = layoutDataSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid layout data', details: result.error.issues },
        { status: 400 },
      );
    }
    const layout = result.data;

    const command = new PutObjectCommand({
      Bucket: DOCS_BUCKET,
      Key: LAYOUT_KEY,
      Body: JSON.stringify(layout, null, 2),
      ContentType: 'application/json; charset=utf-8',
    });
    await s3Client.send(command);

    revalidatePath('/docs');
    return NextResponse.json({ saved: true });
  } catch (e) {
    console.error('Failed to save layout:', e);
    return NextResponse.json(
      { error: 'Failed to save layout' },
      { status: 500 },
    );
  }
}
