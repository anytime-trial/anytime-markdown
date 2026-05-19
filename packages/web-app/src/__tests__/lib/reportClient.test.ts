/**
 * reportClient.ts のユニットテスト
 *
 * s3Client と reportUtils をモックして listReports / getReportBySlug を検証。
 */

const mockSend = jest.fn();
const mockParseFrontmatter = jest.fn();
const mockSortByDateDesc = jest.fn((r: unknown[]) => r);

jest.mock('../../lib/s3Client', () => ({
  s3Client: { send: mockSend },
  DOCS_BUCKET: 'test-bucket',
}));

jest.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ _cmd: 'get', input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ _cmd: 'list', input })),
}));

jest.mock('@anytime-markdown/cms-core', () => ({
  createCmsConfig: jest.fn().mockReturnValue({ reportsPrefix: 'reports/' }),
}));

jest.mock('../../lib/reportUtils', () => ({
  parseFrontmatter: mockParseFrontmatter,
  sortByDateDesc: mockSortByDateDesc,
}));

// Zod schema mock — pass through parsed data
jest.mock('../../types/report', () => ({
  reportFrontmatterSchema: {
    safeParse: jest.fn((data: unknown) => ({ success: true, data })),
  },
}));

import { getReportBySlug, listReports } from '../../lib/reportClient';

function makeS3Body(content: string) {
  return { transformToString: jest.fn().mockResolvedValue(content) };
}

const VALID_FRONTMATTER_RESULT = {
  data: { title: 'Test', date: '2026-01-01' },
  content: 'body content',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSortByDateDesc.mockImplementation((r) => r);
});

// ────────────────────────────────────────────────────────────
// listReports
// ────────────────────────────────────────────────────────────
describe('listReports', () => {
  it('returns empty array when S3 Contents is empty', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [] });
    const result = await listReports();
    expect(result).toEqual([]);
  });

  it('returns empty array when Contents is undefined', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await listReports();
    expect(result).toEqual([]);
  });

  it('filters out non-.md keys', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'reports/file.md' },
        { Key: 'reports/_index.json' },
        { Key: 'reports/image.png' },
      ],
    });
    // second call for the .md file
    mockSend.mockResolvedValueOnce({ Body: makeS3Body('---\ntitle: Hi\ndate: 2026\n---\nbody') });
    mockParseFrontmatter.mockReturnValue(VALID_FRONTMATTER_RESULT);

    await listReports();
    // GetObjectCommand should be called only for the .md file
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns ReportMeta list with derived slug', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: 'reports/my-post.md' }],
    });
    mockSend.mockResolvedValueOnce({ Body: makeS3Body('md content') });
    mockParseFrontmatter.mockReturnValue(VALID_FRONTMATTER_RESULT);

    const result = await listReports();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('my-post');
    expect(result[0].key).toBe('reports/my-post.md');
  });

  it('skips files where body is empty', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [{ Key: 'reports/empty.md' }] });
    mockSend.mockResolvedValueOnce({ Body: { transformToString: jest.fn().mockResolvedValue('') } });

    const result = await listReports();
    expect(result).toEqual([]);
  });

  it('skips files where frontmatter parse fails', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [{ Key: 'reports/bad.md' }] });
    mockSend.mockResolvedValueOnce({ Body: makeS3Body('no frontmatter') });
    mockParseFrontmatter.mockReturnValue({ data: {}, content: 'text' });

    const { reportFrontmatterSchema } = require('../../types/report');
    reportFrontmatterSchema.safeParse.mockReturnValueOnce({ success: false, error: 'bad' });

    const result = await listReports();
    expect(result).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// getReportBySlug
// ────────────────────────────────────────────────────────────
describe('getReportBySlug', () => {
  it('returns null for path traversal slug with ..', async () => {
    const result = await getReportBySlug('../etc/passwd');
    expect(result).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns null for slug with forward slash', async () => {
    const result = await getReportBySlug('foo/bar');
    expect(result).toBeNull();
  });

  it('returns null for slug with null byte', async () => {
    const result = await getReportBySlug('foo\0bar');
    expect(result).toBeNull();
  });

  it('returns null when S3 throws NoSuchKey', async () => {
    const err = Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
    mockSend.mockRejectedValueOnce(err);

    const result = await getReportBySlug('missing-post');
    expect(result).toBeNull();
  });

  it('rethrows unexpected S3 errors', async () => {
    const err = new Error('network error');
    mockSend.mockRejectedValueOnce(err);

    await expect(getReportBySlug('some-post')).rejects.toThrow('network error');
  });

  it('returns null when body is empty', async () => {
    mockSend.mockResolvedValueOnce({ Body: { transformToString: jest.fn().mockResolvedValue('') } });
    const result = await getReportBySlug('empty-post');
    expect(result).toBeNull();
  });

  it('returns null when frontmatter parse fails', async () => {
    mockSend.mockResolvedValueOnce({ Body: makeS3Body('content') });
    mockParseFrontmatter.mockReturnValue({ data: {}, content: 'content' });

    const { reportFrontmatterSchema } = require('../../types/report');
    reportFrontmatterSchema.safeParse.mockReturnValueOnce({ success: false });

    const result = await getReportBySlug('bad-post');
    expect(result).toBeNull();
  });

  it('returns meta and content on success', async () => {
    mockSend.mockResolvedValueOnce({ Body: makeS3Body('md content') });
    mockParseFrontmatter.mockReturnValue(VALID_FRONTMATTER_RESULT);

    const result = await getReportBySlug('my-post');
    expect(result).not.toBeNull();
    expect(result?.meta.slug).toBe('my-post');
    expect(result?.content).toBe('body content');
  });
});
