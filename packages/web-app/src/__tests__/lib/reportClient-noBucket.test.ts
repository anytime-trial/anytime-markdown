/**
 * reportClient.ts — DOCS_BUCKET 未設定時の早期リターンをテスト
 */

jest.mock('../../lib/s3Client', () => ({
  s3Client: { send: jest.fn() },
  DOCS_BUCKET: '', // empty → falsy
}));

jest.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
}));

jest.mock('@anytime-markdown/cms-core', () => ({
  createCmsConfig: jest.fn().mockReturnValue({ reportsPrefix: 'reports/' }),
}));

jest.mock('../../lib/reportUtils', () => ({
  parseFrontmatter: jest.fn(),
  sortByDateDesc: jest.fn((r: unknown[]) => r),
}));

jest.mock('../../types/report', () => ({
  reportFrontmatterSchema: {
    safeParse: jest.fn(() => ({ success: false })),
  },
}));

import { getReportBySlug, listReports } from '../../lib/reportClient';

describe('reportClient with no DOCS_BUCKET', () => {
  it('listReports returns empty array', async () => {
    expect(await listReports()).toEqual([]);
  });

  it('getReportBySlug returns null', async () => {
    expect(await getReportBySlug('any-slug')).toBeNull();
  });
});
