import { getReport, listReportKeys, uploadReport } from '../reportService';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => input),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
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

  it('Size と LastModified が undefined の場合デフォルト値を使う', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'reports/2026-04-01-daily.md', Size: undefined, LastModified: undefined },
      ],
    });
    const result = await listReportKeys({ send: mockSend } as never, baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0].size).toBe(0);
    expect(result[0].lastModified).toBe('');
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

describe('getReport', () => {
  it('reportsプレフィックスのmdファイル本文を取得する', async () => {
    mockSend.mockResolvedValue({
      Body: { transformToString: async () => '# Daily Report\n本文' },
    });
    const result = await getReport(
      { fileName: '2026-06-20-daily-research.md' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result.key).toBe('reports/2026-06-20-daily-research.md');
    expect(result.name).toBe('2026-06-20-daily-research.md');
    expect(result.content).toBe('# Daily Report\n本文');
  });

  it('Body が undefined の場合は空文字を返す', async () => {
    mockSend.mockResolvedValue({ Body: undefined });
    const result = await getReport(
      { fileName: '2026-06-20-daily-research.md' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result.content).toBe('');
  });

  it('md以外の拡張子を拒否する', async () => {
    await expect(
      getReport({ fileName: 'test.exe' }, { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Only .md files are allowed');
  });

  it('不正なファイル名を拒否する', async () => {
    await expect(
      getReport({ fileName: '../etc/passwd.md' }, { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Invalid file name');
  });

  it('サブパス（スラッシュ）を含むファイル名を拒否する', async () => {
    await expect(
      getReport({ fileName: 'sub/dir/x.md' }, { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Invalid file name');
  });
});
