import { createRemoteMcpServer } from '../server';

// cms-core のモック
const mockUploadReport = jest.fn().mockResolvedValue({ key: 'reports/test.md', name: 'test.md' });
const mockGetReport = jest.fn().mockResolvedValue({ key: 'reports/test.md', name: 'test.md', content: '# Daily Report body' });
const mockListReportKeys = jest.fn().mockResolvedValue([{ key: 'reports/test.md', name: 'test.md', size: 100 }]);
const mockUploadDoc = jest.fn().mockResolvedValue({ key: 'docs/test.md', name: 'test.md' });
const mockListDocs = jest.fn().mockResolvedValue([{ key: 'docs/test.md', name: 'test.md', size: 200 }]);
const mockDeleteDoc = jest.fn().mockResolvedValue(undefined);
const mockGetPatentFile = jest.fn();
const mockUploadPatentFile = jest.fn().mockResolvedValue({ key: 'patents/test.tsv', name: 'test.tsv' });
const mockListPatentFiles = jest.fn().mockResolvedValue([{ key: 'patents/monthly-2026-04.tsv', name: 'monthly-2026-04.tsv' }]);

jest.mock('@anytime-markdown/cms-core', () => ({
  uploadReport: (...args: unknown[]) => mockUploadReport(...args),
  getReport: (...args: unknown[]) => mockGetReport(...args),
  listReportKeys: (...args: unknown[]) => mockListReportKeys(...args),
  uploadDoc: (...args: unknown[]) => mockUploadDoc(...args),
  listDocs: (...args: unknown[]) => mockListDocs(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getPatentFile: (...args: unknown[]) => mockGetPatentFile(...args),
  uploadPatentFile: (...args: unknown[]) => mockUploadPatentFile(...args),
  listPatentFiles: (...args: unknown[]) => mockListPatentFiles(...args),
}));

jest.mock('../paperRankingCollector.js', () => ({
  fetchRankingFromOpenAlex: jest.fn().mockResolvedValue([]),
  formatRankingToTsv: jest.fn().mockReturnValue('rank\ttitle'),
  parseWrittenList: jest.fn().mockReturnValue(new Set()),
  addToWrittenList: jest.fn().mockReturnValue('arxiv_id\twritten_date\n1234\t2026-04-01'),
}));

const mockS3Client = {} as never;
const mockConfig = {
  region: 'ap-northeast-1',
  bucket: 'test-bucket',
  docsPrefix: 'docs/',
  reportsPrefix: 'reports/',
};
const mockRankingsConfig = {
  bucket: 'test-bucket',
  patentsPrefix: 'patents/',
  mailto: 'test@example.com',
};

/** McpServer の tool ハンドラを呼び出すヘルパー */
async function callTool(server: ReturnType<typeof createRemoteMcpServer>, name: string, args: Record<string, unknown>) {
  // MCP SDK は internal な _registeredTools オブジェクトを持つ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<string, { handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown> }>;
  const tool = tools?.[name];
  if (!tool) throw new Error(`Tool not found: ${name}. Available: ${Object.keys(tools ?? {}).join(', ')}`);
  return tool.handler(args, {});
}

describe('createRemoteMcpServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an MCP server without rankingsConfig', () => {
    const server = createRemoteMcpServer(mockS3Client, mockConfig);
    expect(server).toBeDefined();
  });

  it('should create an MCP server with rankingsConfig', () => {
    const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
    expect(server).toBeDefined();
  });

  describe('upload_report tool', () => {
    it('should call uploadReport and return result as JSON', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'upload_report', {
        fileName: '2026-04-01-daily.md',
        content: '# Daily Report\nContent here',
      }) as { content: Array<{ type: string; text: string }> };

      expect(mockUploadReport).toHaveBeenCalledWith(
        { fileName: '2026-04-01-daily.md', content: '# Daily Report\nContent here' },
        mockS3Client,
        mockConfig,
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual({ key: 'reports/test.md', name: 'test.md' });
    });
  });

  describe('list_reports tool', () => {
    it('should call listReportKeys and return formatted result', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'list_reports', {}) as { content: Array<{ type: string; text: string }> };

      expect(mockListReportKeys).toHaveBeenCalledWith(mockS3Client, mockConfig);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual([{ key: 'reports/test.md', name: 'test.md', size: 100 }]);
    });
  });

  describe('get_report tool', () => {
    it('should call getReport and return content as text', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'get_report', {
        fileName: '2026-04-01-daily.md',
      }) as { content: Array<{ type: string; text: string }> };

      expect(mockGetReport).toHaveBeenCalledWith(
        { fileName: '2026-04-01-daily.md' },
        mockS3Client,
        mockConfig,
      );
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('# Daily Report body');
    });
  });

  describe('upload_doc tool', () => {
    it('should upload a text doc (not base64)', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'upload_doc', {
        fileName: 'guide.md',
        content: '# Guide\nHello',
        folder: 'manuals',
        isBase64: false,
      }) as { content: Array<{ type: string; text: string }> };

      expect(mockUploadDoc).toHaveBeenCalledWith(
        { fileName: 'guide.md', content: '# Guide\nHello', folder: 'manuals' },
        mockS3Client,
        mockConfig,
      );
      expect(result.content[0].type).toBe('text');
    });

    it('should upload a base64-encoded image', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const base64Content = Buffer.from('fake-image-data').toString('base64');
      await callTool(server, 'upload_doc', {
        fileName: 'image.png',
        content: base64Content,
        isBase64: true,
      });

      expect(mockUploadDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'image.png',
          content: expect.any(Buffer),
        }),
        mockS3Client,
        mockConfig,
      );
    });

    it('should upload a doc without optional folder', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      await callTool(server, 'upload_doc', {
        fileName: 'readme.md',
        content: '# Readme',
      });

      expect(mockUploadDoc).toHaveBeenCalledWith(
        { fileName: 'readme.md', content: '# Readme', folder: undefined },
        mockS3Client,
        mockConfig,
      );
    });
  });

  describe('list_docs tool', () => {
    it('should call listDocs and return result', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'list_docs', {}) as { content: Array<{ type: string; text: string }> };

      expect(mockListDocs).toHaveBeenCalledWith(mockS3Client, mockConfig);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].key).toBe('docs/test.md');
    });
  });

  describe('delete_doc tool', () => {
    it('should call deleteDoc and return confirmation', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      const result = await callTool(server, 'delete_doc', {
        key: 'docs/old.md',
      }) as { content: Array<{ type: string; text: string }> };

      expect(mockDeleteDoc).toHaveBeenCalledWith({ key: 'docs/old.md' }, mockS3Client, mockConfig);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ deleted: true, key: 'docs/old.md' });
    });
  });

  describe('ranking tools (with rankingsConfig)', () => {
    it('should NOT register ranking tools when rankingsConfig is not provided', () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = (server as any)._registeredTools as Record<string, unknown>;
      expect('get_unwritten_papers' in (tools ?? {})).toBe(false);
      expect('mark_paper_written' in (tools ?? {})).toBe(false);
      expect('list_paper_rankings' in (tools ?? {})).toBe(false);
    });

    it('should register ranking tools when rankingsConfig is provided', () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = (server as any)._registeredTools as Record<string, unknown>;
      expect('get_unwritten_papers' in (tools ?? {})).toBe(true);
      expect('mark_paper_written' in (tools ?? {})).toBe(true);
      expect('list_paper_rankings' in (tools ?? {})).toBe(true);
    });

    it('list_paper_rankings: should call listPatentFiles', async () => {
      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      const result = await callTool(server, 'list_paper_rankings', {}) as { content: Array<{ type: string; text: string }> };

      expect(mockListPatentFiles).toHaveBeenCalledWith(mockS3Client, mockRankingsConfig);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].key).toContain('monthly-');
    });

    it('get_unwritten_papers: uses cached ranking TSV from S3', async () => {
      const cachedTsv = 'rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url\n1\t100\t2603.12345v1\t2026-03-01\tCS\tAuthor\tTitle\turl';
      mockGetPatentFile.mockResolvedValueOnce(cachedTsv); // ranking file found
      mockGetPatentFile.mockRejectedValueOnce(new Error('Not found')); // written file not found

      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      const result = await callTool(server, 'get_unwritten_papers', { count: 5 }) as { content: Array<{ type: string; text: string }> };

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('2603.12345v1');
    });

    it('get_unwritten_papers: fetches from OpenAlex when ranking not in S3', async () => {
      const { fetchRankingFromOpenAlex, formatRankingToTsv } = await import('../paperRankingCollector.js');
      (fetchRankingFromOpenAlex as jest.Mock).mockResolvedValueOnce([]);
      (formatRankingToTsv as jest.Mock).mockReturnValueOnce('rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url');
      mockGetPatentFile.mockRejectedValue(new Error('Not found')); // no ranking, no written list

      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      const result = await callTool(server, 'get_unwritten_papers', { count: 3 }) as { content: Array<{ type: string; text: string }> };

      expect(mockUploadPatentFile).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
    });

    it('get_unwritten_papers: filters out already-written papers', async () => {
      const { parseWrittenList } = await import('../paperRankingCollector.js');
      const writtenSet = new Set(['2603.12345v1']);
      (parseWrittenList as jest.Mock).mockReturnValueOnce(writtenSet);

      const rankingTsv = 'rank\tcited_by_count\tarxiv_id\tpublication_date\tsubfield\tauthors\ttitle\tpdf_url\n1\t100\t2603.12345v1\t2026-03-01\tCS\tAuthor\tTitle\turl\n2\t50\t2603.99999v1\t2026-03-02\tML\tAuthor2\tTitle2\turl2';
      mockGetPatentFile.mockResolvedValueOnce(rankingTsv); // ranking found
      mockGetPatentFile.mockResolvedValueOnce('arxiv_id\twritten_date\n2603.12345v1\t2026-04-01'); // written found

      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      const result = await callTool(server, 'get_unwritten_papers', { count: 5 }) as { content: Array<{ type: string; text: string }> };

      // written paper should be filtered
      expect(result.content[0].text).not.toContain('2603.12345v1');
      expect(result.content[0].text).toContain('2603.99999v1');
    });

    it('mark_paper_written: creates new written list when S3 file missing', async () => {
      const { addToWrittenList } = await import('../paperRankingCollector.js');
      mockGetPatentFile.mockRejectedValueOnce(new Error('Not found'));

      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      const result = await callTool(server, 'mark_paper_written', { arxivId: '2603.12345v1' }) as { content: Array<{ type: string; text: string }> };

      expect(addToWrittenList).toHaveBeenCalledWith('', '2603.12345v1', expect.any(String));
      expect(mockUploadPatentFile).toHaveBeenCalled();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.marked).toBe(true);
      expect(parsed.arxivId).toBe('2603.12345v1');
    });

    it('mark_paper_written: appends to existing written list', async () => {
      const existingTsv = 'arxiv_id\twritten_date\n2603.00001v1\t2026-04-01';
      const { addToWrittenList } = await import('../paperRankingCollector.js');
      mockGetPatentFile.mockResolvedValueOnce(existingTsv);

      const server = createRemoteMcpServer(mockS3Client, mockConfig, mockRankingsConfig);
      await callTool(server, 'mark_paper_written', { arxivId: '2603.12345v1' });

      expect(addToWrittenList).toHaveBeenCalledWith(existingTsv, '2603.12345v1', expect.any(String));
    });
  });
});
