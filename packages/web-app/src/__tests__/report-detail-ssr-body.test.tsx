/**
 * /report/[slug] がサーバ側で本文を描画していることの回帰テスト。
 *
 * 対話ビューアは `next/dynamic` の `ssr: false` で読み込まれるため、サーバの返す HTML には
 * 1 要素も出ない。以前はその状態で本文の描画を全面的にクライアントへ預けており、
 * 記事ページのサーバ HTML はスピナーだけ（可視テキスト 183 文字）だった。
 * jsdom でのユニットテストは effect が走って本文が現れるため、この破れを検知しない。
 *
 * そのため、ここでは effect を走らせない `renderToStaticMarkup`（＝サーバと同じ経路）で
 * 描画し、本文の要素が HTML に存在することを検査する。
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('../app/[locale]/LocaleProvider', () => ({
  useLocaleSwitch: () => ({ locale: 'ja', setLocale: jest.fn() }),
}));

jest.mock('../app/[locale]/providers', () => ({
  useThemeMode: () => ({ themeMode: 'light', setThemeMode: jest.fn() }),
  usePreset: () => ({ presetName: 'professional', setPresetName: jest.fn() }),
}));

jest.mock('../app/[locale]/components/LandingHeader', () => ({
  __esModule: true,
  default: () => <header data-testid="landing-header" />,
}));

// 対話ビューアの実体はサーバでは読み込まれない。テストでも同じ扱いにする。
jest.mock('next/dynamic', () => () => {
  const MockComponent = () => <div data-testid="interactive-viewer" />;
  MockComponent.displayName = 'MockDynamic';
  return MockComponent;
});

import ReportDetailBody from '../app/[locale]/report/[slug]/ReportDetailBody';
import { renderMarkdownToSafeHtml } from '../lib/renderMarkdownHtml';

const META = {
  slug: 'my-post',
  key: 'reports/my-post.md',
  title: '記事の題',
  date: '2026-09-13',
  author: 'Kiyotaka Ueda',
  category: 'engineering',
  excerpt: '概要',
};

const MARKDOWN = [
  '本文の最初の段落。',
  '',
  '## 節の見出し',
  '',
  '節の本文には[リンク](https://example.com/ref)がある。',
  '',
  '### 小節の見出し',
  '',
  '- 箇条書きの項目',
].join('\n');

function renderServerHtml(bodyHtml: string): string {
  return renderToStaticMarkup(
    <ReportDetailBody meta={META} bodyHtml={bodyHtml} prev={null} next={null} />,
  );
}

describe('/report/[slug] のサーバ描画', () => {
  it('本文の見出し・段落・リンクをサーバ HTML に含める', () => {
    const html = renderServerHtml(renderMarkdownToSafeHtml(MARKDOWN));

    expect(html).toContain('<h2');
    expect(html).toContain('節の見出し');
    expect(html).toContain('<h3');
    expect(html).toContain('小節の見出し');
    expect(html).toContain('本文の最初の段落。');
    expect(html).toContain('href="https://example.com/ref"');
    expect(html).toContain('箇条書きの項目');
  });

  it('本文の代わりにスピナーを返さない', () => {
    const html = renderServerHtml(renderMarkdownToSafeHtml(MARKDOWN));

    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('MuiCircularProgress');
  });

  // 本文自身が `# 見出し` を持つ記事もあるため h1 の個数は固定しない（対話ビューアも
  // 本文の見出しレベルをそのまま描画するので、静的表示だけ降格させると両者がずれる）。
  it('記事タイトルを h1 として出す', () => {
    const html = renderServerHtml(renderMarkdownToSafeHtml(MARKDOWN));

    expect(html).toMatch(/<h1[^>]*>[^<]*記事の題/);
  });

  it('本文を取得できなかった記事ではスピナーへ縮退する', () => {
    const html = renderServerHtml('');

    expect(html).toContain('role="status"');
  });
});
