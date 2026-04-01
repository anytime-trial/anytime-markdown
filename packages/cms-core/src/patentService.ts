import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

interface PatentsConfig {
  bucket: string;
  patentsPrefix: string;
}

interface PatentFileEntry {
  date: string;
  tsvSize: number;
  jsonlSize: number;
}

const ALLOWED_EXTENSIONS = ['.tsv', '.jsonl'] as const;

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.jsonl': 'application/jsonl; charset=utf-8',
};

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex);
}

function validateFileName(fileName: string): void {
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Invalid file name');
  }
}

export async function uploadPatentFile(
  input: { fileName: string; content: string },
  client: S3Client,
  config: PatentsConfig,
): Promise<{ key: string; name: string }> {
  const { fileName, content } = input;
  const ext = getExtension(fileName);

  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error('Only .tsv and .jsonl files are allowed');
  }

  validateFileName(fileName);

  const key = `${config.patentsPrefix}${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: content,
      ContentType: CONTENT_TYPE_MAP[ext],
    }),
  );

  return { key, name: fileName };
}

export async function listPatentFiles(
  client: S3Client,
  config: PatentsConfig,
): Promise<PatentFileEntry[]> {
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.patentsPrefix }),
  );

  const contents = response.Contents ?? [];
  const dateMap = new Map<string, { tsvSize: number; jsonlSize: number }>();

  for (const obj of contents) {
    const name = obj.Key?.slice(config.patentsPrefix.length);
    if (!name) continue;

    const ext = getExtension(name);
    if (ext !== '.tsv' && ext !== '.jsonl') continue;

    const date = name.slice(0, name.lastIndexOf('.'));
    const entry = dateMap.get(date) ?? { tsvSize: 0, jsonlSize: 0 };

    if (ext === '.tsv') {
      entry.tsvSize = obj.Size ?? 0;
    } else {
      entry.jsonlSize = obj.Size ?? 0;
    }

    dateMap.set(date, entry);
  }

  return [...dateMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, sizes]) => ({ date, ...sizes }));
}

export async function getPatentFile(
  key: string,
  client: S3Client,
  config: PatentsConfig,
): Promise<string> {
  if (!key.startsWith(config.patentsPrefix) || key.includes('..')) {
    throw new Error('Invalid key');
  }

  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );

  return (await response.Body?.transformToString()) ?? '';
}
