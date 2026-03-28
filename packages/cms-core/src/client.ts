import { S3Client } from '@aws-sdk/client-s3';

export interface CmsConfig {
  region: string;
  bucket: string;
  docsPrefix: string;
  reportsPrefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function createCmsConfig(env: Record<string, string | undefined> = process.env): CmsConfig {
  return {
    region: env.ANYTIME_AWS_REGION ?? 'ap-northeast-1',
    bucket: env.S3_DOCS_BUCKET ?? '',
    docsPrefix: env.S3_DOCS_PREFIX ?? 'docs/',
    reportsPrefix: env.S3_REPORTS_PREFIX ?? 'reports/',
    accessKeyId: env.ANYTIME_AWS_ACCESS_KEY_ID,
    secretAccessKey: env.ANYTIME_AWS_SECRET_ACCESS_KEY,
  };
}

export function createS3Client(config: CmsConfig): S3Client {
  return new S3Client({
    region: config.region,
    ...(config.accessKeyId && config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });
}
