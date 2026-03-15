import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import { checkBasicAuth } from '../../../../lib/basicAuth';
import { DOCS_BUCKET, DOCS_PREFIX,s3Client } from '../../../../lib/s3Client';

export async function POST(request: NextRequest) {
  const authError = checkBasicAuth(request);
  if (authError) return authError;

  if (!DOCS_BUCKET) {
    return NextResponse.json(
      { error: 'S3_DOCS_BUCKET is not configured' },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 });
    }

    if (!file.name.endsWith('.md')) {
      return NextResponse.json({ error: 'Only .md files are allowed' }, { status: 400 });
    }

    // ファイル名を英数字・ハイフン・アンダースコア・ドット・スペースに制限
    if (!/^[a-zA-Z0-9\u3000-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}\w\-. ]+$/u.test(file.name)) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    const key = DOCS_PREFIX + file.name;
    const body = await file.text();

    const command = new PutObjectCommand({
      Bucket: DOCS_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'text/markdown; charset=utf-8',
    });
    await s3Client.send(command);

    return NextResponse.json({ key, name: file.name });
  } catch (e) {
    console.error('Failed to upload to S3:', e);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 },
    );
  }
}
