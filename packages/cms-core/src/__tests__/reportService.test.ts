import { listReportKeys, uploadReport } from '../reportService';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => input),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

beforeEach(() => {
  mockSend.mockReset();
});

const baseConfig = { bucket: 'test-bucket', reportsPrefix: 'reports/' };

describe('listReportKeys', () => {
  it('reportsプレフィックス内のmdファイル一覧を返す', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'reports/2026-03-24-daily.md', Size: 1000, LastModified: new Date('2026-03-24') },
        { Key: 'reports/image.png', Size: 500, LastModified: new Date('2026-03-25') },
      ],
    });
    const result = await listReportKeys({ send: mockSend } as never, baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('reports/2026-03-24-daily.md');
  });

  it('空のバケットで空配列を返す', async () => {
    mockSend.mockResolvedValue({ Contents: undefined });
    const result = await listReportKeys({ send: mockSend } as never, baseConfig);
    expect(result).toEqual([]);
  });
});

describe('uploadReport', () => {
  it('mdファイルをreportsプレフィックスにアップロードする', async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadReport(
      { fileName: '2026-03-28-daily-research.md', content: '# Report' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result.key).toBe('reports/2026-03-28-daily-research.md');
  });

  it('md以外の拡張子を拒否する', async () => {
    await expect(
      uploadReport(
        { fileName: 'test.exe', content: '#' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Only .md files are allowed');
  });

  it('不正なファイル名を拒否する', async () => {
    await expect(
      uploadReport(
        { fileName: '../etc/passwd.md', content: '#' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Invalid file name');
  });
});
