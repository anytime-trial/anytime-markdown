import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';

import { checkBasicAuth } from '../../../../lib/basicAuth';
import { DOCS_BUCKET, DOCS_PREFIX,s3Client } from '../../../../lib/s3Client';

/** 許可するファイル拡張子と ContentType のマッピング */
const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function getAllowedContentType(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

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
    const folder = formData.get('folder') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // webkitdirectory 経由の場合 file.name にパスが含まれるためベースネームを取得
    const fileName = file.name.split('/').pop() ?? file.name;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 });
    }

    const contentType = getAllowedContentType(fileName);
    if (!contentType) {
      return NextResponse.json({ error: 'Only .md and image files (.png, .jpg, .jpeg, .gif, .svg, .webp) are allowed' }, { status: 400 });
    }

    // ファイル名に制御文字・パス区切り・シェル特殊文字を禁止
    if (/[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()']/.test(fileName)) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    if (folder) {
      if (/[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()'\\/]/.test(folder) || folder.includes('..')) {
        return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
      }
    }

    const key = folder ? DOCS_PREFIX + folder + '/' + fileName : DOCS_PREFIX + fileName;
    const isText = contentType.startsWith('text/');
    const body = isText ? await file.text() : Buffer.from(await file.arrayBuffer());

    const command = new PutObjectCommand({
      Bucket: DOCS_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await s3Client.send(command);

    const name = folder ? folder + '/' + fileName : fileName;
    return NextResponse.json({ key, name });
  } catch (e) {
    console.error('Failed to upload to S3:', e);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 },
    );
  }
}
