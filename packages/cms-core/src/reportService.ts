import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

interface ReportsConfig {
  bucket: string;
  reportsPrefix: string;
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

  if (!fileName.endsWith('.md')) {
    throw new Error('Only .md files are allowed');
  }
  if (fileName.includes('..') || /[\x00-\x1f\x7f<>:"|?*;`${}[\]#!~&()']/.test(fileName)) {
    throw new Error('Invalid file name');
  }

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
