import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

interface DocsConfig {
  bucket: string;
  docsPrefix: string;
}

interface DocEntry {
  key: string;
  name: string;
  size: number;
}

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

function validateFileName(fileName: string): void {
  if (/[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()']/.test(fileName)) {
    throw new Error('Invalid file name');
  }
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Invalid file name');
  }
}

function validateFolderName(folder: string): void {
  if (/[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()'\\/]/.test(folder) || folder.includes('..')) {
    throw new Error('Invalid folder name');
  }
}

export async function listDocs(
  client: S3Client,
  config: DocsConfig,
): Promise<DocEntry[]> {
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.docsPrefix }),
  );
  return (response.Contents ?? [])
    .filter((obj) => {
      const key = obj.Key ?? '';
      return key !== config.docsPrefix
        && !key.endsWith('/')
        && !key.endsWith('.json');
    })
    .map((obj) => ({
      key: obj.Key!,
      name: obj.Key!.slice(config.docsPrefix.length),
      size: obj.Size ?? 0,
    }));
}

export async function uploadDoc(
  input: { fileName: string; content: string | Buffer; folder?: string },
  client: S3Client,
  config: DocsConfig,
): Promise<{ key: string; name: string }> {
  const { fileName, content, folder } = input;

  const contentType = getAllowedContentType(fileName);
  if (!contentType) {
    throw new Error('Only .md and image files (.png, .jpg, .jpeg, .gif, .svg, .webp) are allowed');
  }

  validateFileName(fileName);
  if (folder) validateFolderName(folder);

  const key = folder
    ? `${config.docsPrefix}${folder}/${fileName}`
    : `${config.docsPrefix}${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
    }),
  );

  const name = folder ? `${folder}/${fileName}` : fileName;
  return { key, name };
}

export async function deleteDoc(
  input: { key: string },
  client: S3Client,
  config: DocsConfig,
): Promise<void> {
  const { key } = input;
  if (!key.startsWith(config.docsPrefix)) {
    throw new Error('Invalid key');
  }
  if (key.includes('..')) {
    throw new Error('Invalid key');
  }

  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
