import { listDocs, uploadDoc, deleteDoc } from '../docsService';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => input),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

beforeEach(() => {
  mockSend.mockReset();
});

const baseConfig = { bucket: 'test-bucket', docsPrefix: 'docs/' };

describe('listDocs', () => {
  it('docsプレフィックス内のファイル一覧を返す', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        { Key: 'docs/readme.md', Size: 100 },
        { Key: 'docs/_layout.json', Size: 50 },
        { Key: 'docs/folder/', Size: 0 },
      ],
    });
    const result = await listDocs({ send: mockSend } as never, baseConfig);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('docs/readme.md');
  });
});

describe('uploadDoc', () => {
  it('mdファイルをdocsプレフィックスにアップロードする', async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadDoc(
      { fileName: 'test.md', content: '# Test', folder: undefined },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result.key).toBe('docs/test.md');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-bucket', Key: 'docs/test.md' }),
    );
  });

  it('フォルダ指定でサブディレクトリにアップロードする', async () => {
    mockSend.mockResolvedValue({});
    const result = await uploadDoc(
      { fileName: 'test.md', content: '# Test', folder: 'sub' },
      { send: mockSend } as never,
      baseConfig,
    );
    expect(result.key).toBe('docs/sub/test.md');
  });

  it('不正なファイル名を拒否する', async () => {
    await expect(
      uploadDoc(
        { fileName: 'te;st.md', content: '#', folder: undefined },
        { send: mockSend } as never,
        baseConfig,
      ),
    ).rejects.toThrow('Invalid file name');
  });
});

describe('deleteDoc', () => {
  it('docsプレフィックス内のファイルを削除する', async () => {
    mockSend.mockResolvedValue({});
    await deleteDoc({ key: 'docs/test.md' }, { send: mockSend } as never, baseConfig);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-bucket', Key: 'docs/test.md' }),
    );
  });

  it('docsプレフィックス外のキーを拒否する', async () => {
    await expect(
      deleteDoc({ key: 'reports/test.md' }, { send: mockSend } as never, baseConfig),
    ).rejects.toThrow('Invalid key');
  });
});
