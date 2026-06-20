import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

interface ReportsConfig {
  bucket: string;
  reportsPrefix: string;
}

function validateReportFileName(fileName: string): void {
  if (!fileName.endsWith('.md')) {
    throw new Error('Only .md files are allowed');
  }
  if (fileName.includes('..') || /[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()']/.test(fileName)) {
    throw new Error('Invalid file name');
  }
}

interface ReportKeyEntry {
  key: string;
  name: string;
  size: number;
  lastModified: string;
}

export async function listReportKeys(
  client: S3Client,
  config: ReportsConfig,
): Promise<ReportKeyEntry[]> {
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.reportsPrefix }),
  );
  return (response.Contents ?? [])
    .filter((obj) => obj.Key?.endsWith('.md'))
    .map((obj) => ({
      key: obj.Key!,
      name: obj.Key!.slice(config.reportsPrefix.length),
      size: obj.Size ?? 0,
      lastModified: obj.LastModified?.toISOString() ?? '',
    }));
}

export async function uploadReport(
  input: { fileName: string; content: string },
  client: S3Client,
  config: ReportsConfig,
): Promise<{ key: string; name: string }> {
  const { fileName, content } = input;

  validateReportFileName(fileName);

  const key = `${config.reportsPrefix}${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    }),
  );

  return { key, name: fileName };
}

export async function getReport(
  input: { fileName: string },
  client: S3Client,
  config: ReportsConfig,
): Promise<{ key: string; name: string; content: string }> {
  const { fileName } = input;

  validateReportFileName(fileName);

  const key = `${config.reportsPrefix}${fileName}`;

  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );

  const content = (await response.Body?.transformToString()) ?? '';

  return { key, name: fileName, content };
}
