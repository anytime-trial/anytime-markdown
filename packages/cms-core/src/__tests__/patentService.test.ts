import { uploadPatentFile, listPatentFiles, getPatentFile } from '../patentService';

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

const baseConfig = { bucket: 'test-bucket', patentsPrefix: 'patents/' };

describe('uploadPatentFile', () => {
  it('.tsv ファイルをアップロードする', async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadPatentFile(
      { fileName: '2026-04-01.tsv', content: 'col1\tcol2\nval1\tval2' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result).toEqual({
      key: 'patents/2026-04-01.tsv',
      name: '2026-04-01.tsv',
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'patents/2026-04-01.tsv',
        ContentType: 'text/tab-separated-values; charset=utf-8',
      }),
    );
  });

  it('.jsonl ファイルをアップロードする', async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadPatentFile(
      { fileName: '2026-04-01.jsonl', content: '{"id":1}\n{"id":2}' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result).toEqual({
      key: 'patents/2026-04-01.jsonl',
      name: '2026-04-01.jsonl',
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        ContentType: 'application/jsonl; charset=utf-8',
      }),
    );
  });

  it('不正な拡張子を拒否する', async () => {
    await expect(
      uploadPatentFile(
        { fileName: 'data.csv', content: 'a,b' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Only .tsv and .jsonl files are allowed');
  });

  it('パストラバーサルを拒否する', async () => {
    await expect(
      uploadPatentFile(
        { fileName: '../etc/passwd.tsv', content: '' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Invalid file name');

    await expect(
      uploadPatentFile(
        { fileName: 'sub/data.tsv', content: '' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Invalid file name');

    await expect(
      uploadPatentFile(
        { fileName: 'sub\\data.tsv', content: '' },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Invalid file name');
  });
});

describe('listPatentFiles', () => {
  it('日付でグルーピングし降順で返す', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'patents/2026-03-30.tsv', Size: 500 },
        { Key: 'patents/2026-03-30.jsonl', Size: 1200 },
        { Key: 'patents/2026-04-01.tsv', Size: 800 },
        { Key: 'patents/2026-04-01.jsonl', Size: 2000 },
        { Key: 'patents/2026-03-31.tsv', Size: 600 },
      ],
    });
    const result = await listPatentFiles({ send: mockSend } as never, baseConfig);
    expect(result).toEqual([
      { date: '2026-04-01', tsvSize: 800, jsonlSize: 2000 },
      { date: '2026-03-31', tsvSize: 600, jsonlSize: 0 },
      { date: '2026-03-30', tsvSize: 500, jsonlSize: 1200 },
    ]);
  });

  it('空のバケットで空配列を返す', async () => {
    mockSend.mockResolvedValue({ Contents: undefined });
    const result = await listPatentFiles({ send: mockSend } as never, baseConfig);
    expect(result).toEqual([]);
  });
});

describe('getPatentFile', () => {
  it('ファイル内容を文字列で取得する', async () => {
    mockSend.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve('col1\tcol2\nval1\tval2') },
    });
    const result = await getPatentFile(
      'patents/2026-04-01.tsv',
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result).toBe('col1\tcol2\nval1\tval2');
  });

  it('prefix 外のキーを拒否する', async () => {
    await expect(
      getPatentFile('docs/secret.md', { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Invalid key');
  });

  it('パストラバーサルを含むキーを拒否する', async () => {
    await expect(
      getPatentFile('patents/../etc/passwd', { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Invalid key');
  });
});
