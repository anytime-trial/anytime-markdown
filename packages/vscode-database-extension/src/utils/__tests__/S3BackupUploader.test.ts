import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as fs from 'node:fs';
import {
  S3BackupUploader,
  S3ConfigError,
  BackupNotFoundError,
  S3UploadError,
} from '../S3BackupUploader';

jest.mock('node:fs');

const VALID_CONFIG = {
  bucket: 'test-bucket',
  region: 'ap-northeast-1',
  prefix: 'anytime-database-backups',
  accessKeyId: 'AKIATESTACCESSKEY',
  secretAccessKey: 'testSecretAccessKey1234567890abcdefghij',
} as const;

const noopLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('S3BackupUploader', () => {
  const s3Mock = mockClient(S3Client);
  const readFileSyncMock = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
  const existsSyncMock = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

  beforeEach(() => {
    s3Mock.reset();
    readFileSyncMock.mockReset();
    existsSyncMock.mockReset();
    noopLogger.info.mockReset();
    noopLogger.warn.mockReset();
    noopLogger.error.mockReset();
  });

  describe('constructor', () => {
    it('throws S3ConfigError when bucket is empty', () => {
      expect(() => new S3BackupUploader({ ...VALID_CONFIG, bucket: '' }, noopLogger))
        .toThrow(S3ConfigError);
    });
    it('throws S3ConfigError when accessKeyId is empty', () => {
      expect(() => new S3BackupUploader({ ...VALID_CONFIG, accessKeyId: '' }, noopLogger))
        .toThrow(S3ConfigError);
    });
    it('throws S3ConfigError when secretAccessKey is empty', () => {
      expect(() => new S3BackupUploader({ ...VALID_CONFIG, secretAccessKey: '' }, noopLogger))
        .toThrow(S3ConfigError);
    });
  });

  describe('uploadLatest', () => {
    const dbPath = '/work/.anytime/trail/db/trail.db';
    const backupPath = `${dbPath}.bak.1.gz`;
    const bytes = Buffer.from('FAKE_GZIP_BYTES');

    beforeEach(() => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-05-16T12:34:56.789Z');
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('succeeds on first attempt and returns S3UploadResult', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(bytes);
      s3Mock.on(PutObjectCommand).resolves({});

      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      const result = await uploader.uploadLatest(dbPath, 'trail.db');

      expect(result.bucket).toBe('test-bucket');
      expect(result.key).toBe('anytime-database-backups/trail.db/2026-05-16T12-34-56.789Z.bak.gz');
      expect(result.size).toBe(bytes.byteLength);
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
    });

    it('throws BackupNotFoundError when .bak.1.gz missing', async () => {
      existsSyncMock.mockReturnValue(false);
      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      await expect(uploader.uploadLatest(dbPath, 'trail.db'))
        .rejects.toBeInstanceOf(BackupNotFoundError);
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
    });

    it('retries once after 5 seconds on failure and succeeds on second attempt', async () => {
      jest.useFakeTimers();
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(bytes);
      s3Mock.on(PutObjectCommand)
        .rejectsOnce(new Error('NetworkError'))
        .resolves({});

      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      const promise = uploader.uploadLatest(dbPath, 'trail.db');
      await jest.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result.key).toBe('anytime-database-backups/trail.db/2026-05-16T12-34-56.789Z.bak.gz');
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
      expect(noopLogger.warn).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('throws S3UploadError after two consecutive failures', async () => {
      jest.useFakeTimers();
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(bytes);
      s3Mock.on(PutObjectCommand).rejects(new Error('Forbidden'));

      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      const promise = uploader.uploadLatest(dbPath, 'trail.db');
      promise.catch(() => undefined); // 未処理 reject の警告抑止
      await jest.advanceTimersByTimeAsync(5000);
      await expect(promise).rejects.toBeInstanceOf(S3UploadError);
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
      jest.useRealTimers();
    });

    it('does not log accessKeyId or secretAccessKey', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(bytes);
      s3Mock.on(PutObjectCommand).resolves({});

      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      await uploader.uploadLatest(dbPath, 'trail.db');

      const allCalls = [
        ...noopLogger.info.mock.calls,
        ...noopLogger.warn.mock.calls,
        ...noopLogger.error.mock.calls,
      ].flat().join(' ');
      expect(allCalls).not.toContain(VALID_CONFIG.accessKeyId);
      expect(allCalls).not.toContain(VALID_CONFIG.secretAccessKey);
    });

    it('builds key with timestamp-safe ISO format <prefix>/<dbName>/<ISO::->.bak.gz', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(bytes);
      s3Mock.on(PutObjectCommand).resolves({});

      const uploader = new S3BackupUploader(VALID_CONFIG, noopLogger);
      const result = await uploader.uploadLatest(dbPath, 'trail.db');

      // コロンがハイフンに置換されていることを確認
      expect(result.key).toMatch(/^anytime-database-backups\/trail\.db\/2026-05-16T12-34-56\.789Z\.bak\.gz$/);
      expect(result.key).not.toContain(':');
    });
  });
});
