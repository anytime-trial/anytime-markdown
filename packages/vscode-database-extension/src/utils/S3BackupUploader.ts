import * as fs from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface S3Config {
  readonly bucket: string;
  readonly region: string;
  readonly prefix: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface S3UploadResult {
  readonly bucket: string;
  readonly key: string;
  readonly size: number;
  readonly elapsedMs: number;
}

export interface UploaderLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export class S3ConfigError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(`S3 not configured: missing ${missing.join(', ')}`);
    this.name = 'S3ConfigError';
  }
}

export class BackupNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Latest backup not found: ${path}`);
    this.name = 'BackupNotFoundError';
  }
}

export class S3UploadError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'S3UploadError';
  }
}

const RETRY_DELAY_MS = 5000;

function assertS3Config(config: S3Config): void {
  const missing: string[] = [];
  if (!config.bucket) missing.push('bucket');
  if (!config.region) missing.push('region');
  if (!config.accessKeyId) missing.push('accessKeyId');
  if (!config.secretAccessKey) missing.push('secretAccessKey');
  if (missing.length > 0) throw new S3ConfigError(missing);
}

function buildKey(prefix: string, dbDisplayName: string): string {
  const isoSafe = new Date().toISOString().replace(/:/g, '-');
  const trimmedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const trimmedName = dbDisplayName.replace(/^\/+|\/+$/g, '');
  return `${trimmedPrefix}/${trimmedName}/${isoSafe}.bak.gz`;
}

export class S3BackupUploader {
  private client: S3Client | null = null;

  constructor(
    private readonly config: S3Config,
    private readonly logger: UploaderLogger,
  ) {
    assertS3Config(config);
  }

  private getClient(): S3Client {
    if (this.client === null) {
      this.client = new S3Client({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  async uploadLatest(dbAbsPath: string, dbDisplayName: string): Promise<S3UploadResult> {
    const backupPath = `${dbAbsPath}.bak.1.gz`;
    if (!fs.existsSync(backupPath)) {
      throw new BackupNotFoundError(backupPath);
    }
    return this.uploadFile(backupPath, dbDisplayName);
  }

  async uploadFile(absPath: string, dbDisplayName: string): Promise<S3UploadResult> {
    const body = fs.readFileSync(absPath);
    const key = buildKey(this.config.prefix, dbDisplayName);
    const started = Date.now();

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
    });

    try {
      await this.getClient().send(command);
    } catch (firstErr) {
      this.logger.warn(
        `S3 upload first attempt failed (will retry in ${RETRY_DELAY_MS} ms): s3://${this.config.bucket}/${key}`,
      );
      this.logger.error('S3 upload first attempt error', firstErr);
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        await this.getClient().send(command);
      } catch (secondErr) {
        this.logger.error(
          `S3 upload failed after retry: s3://${this.config.bucket}/${key}`,
          secondErr,
        );
        const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new S3UploadError(`S3 upload failed: ${msg}`, secondErr);
      }
    }

    const result: S3UploadResult = {
      bucket: this.config.bucket,
      key,
      size: body.byteLength,
      elapsedMs: Date.now() - started,
    };
    this.logger.info(
      `S3 upload succeeded: s3://${result.bucket}/${result.key} (${result.size} bytes, ${result.elapsedMs} ms)`,
    );
    return result;
  }
}
