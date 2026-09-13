/**
 * /report/[slug] の SSR 本文で、画像の相対パスがクライアント取得経路と同じ絶対 URL へ
 * 解決されることの回帰テスト。
 *
 * クライアント経路（/api/reports/content）は返す前に transformMarkdownImageUrls を通している。
 * SSR 経路でこれを抜くと、サーバ HTML の <img src> だけが記事 URL 基準で解決されて 404 になる。
 * hydration 後は正しい URL へ差し替わるため、ブラウザで見ている限り気づけない破れ方をする。
 */

import { render } from '@testing-library/react';
import React from 'react';

const CDN = 'https://cdn.example.test';

jest.mock('../lib/s3Client', () => ({
  CLOUDFRONT_URL: 'https://cdn.example.test',
  DOCS_BUCKET: 'test-bucket',
  s3Client: {},
  fetchFromCdn: jest.fn(),
}));

jest.mock('../lib/reportClient', () => ({
  getReportBySlug: jest.fn(),
  listReports: jest.fn(),
  REPORTS_PREFIX: 'reports/',
}));

/** ReportDetailBody へ渡された props を捕まえる */
const capturedProps: { bodyHtml?: string } = {};
jest.mock('../app/[locale]/report/[slug]/ReportDetailBody', () => ({
  __esModule: true,
  default: (props: { bodyHtml: string }) => {
    capturedProps.bodyHtml = props.bodyHtml;
    return <div data-testid="report-body" />;
  },
}));

import { getReportBySlug, listReports } from '../lib/reportClient';
import ReportDetailPage from '../app/[locale]/report/[slug]/page';

const mockGetReportBySlug = getReportBySlug as jest.MockedFunction<typeof getReportBySlug>;
const mockListReports = listReports as jest.MockedFunction<typeof listReports>;

const META = {
  slug: 'my-post',
  key: 'reports/my-post.md',
  title: 'My Post',
  date: '2026-09-13',
  author: 'Kiyotaka Ueda',
  category: 'engineering',
  excerpt: 'An article.',
};

async function renderBodyHtml(content: string): Promise<string> {
  mockGetReportBySlug.mockResolvedValue({ meta: META, content });
  mockListReports.mockResolvedValue([META]);
  const element = await ReportDetailPage({ params: Promise.resolve({ locale: 'ja', slug: 'my-post' }) });
  render(element);
  return capturedProps.bodyHtml ?? '';
}

describe('/report/[slug] の SSR 本文の画像 URL', () => {
  beforeEach(() => {
    mockGetReportBySlug.mockReset();
    mockListReports.mockReset();
    capturedProps.bodyHtml = undefined;
  });

  it('相対パスの画像を CDN の絶対 URL へ解決する', async () => {
    const html = await renderBodyHtml('![図](images/foo.png)\n');
    expect(html).toContain(`src="${CDN}/reports/images/foo.png"`);
  });

  it('"./" 始まりの画像も解決する', async () => {
    const html = await renderBodyHtml('![図](./foo.png)\n');
    expect(html).toContain(`src="${CDN}/reports/foo.png"`);
  });

  it('既に絶対 URL の画像はそのまま残す', async () => {
    const html = await renderBodyHtml('![図](https://other.example.test/a.png)\n');
    expect(html).toContain('src="https://other.example.test/a.png"');
  });
});
