import { expect, test } from '@playwright/test';

/**
 * 存在しない URL が HTTP 404 を返すことを固定する（ソフト 404 の退行検知）。
 *
 * ユニットテストでは検知できない。`notFound()` を呼ぶこと自体は成立していても、
 * ページより上に Suspense 境界（`loading.tsx`）があるとサーバーは本文が決まる前に
 * シェルをステータス 200 で送り出し、あとから `notFound()` が起きてもステータスは
 * 変えられない。**404 ページの HTML は正しく出るのにステータスだけ 200 になる**ため、
 * 画面を見ても DOM を見ても気づけず、ステータスを実測したときにだけ現れる。
 *
 * 実測（2026-08-03・修正前）: `/markdown/unknown` `/en/markdown/unknown`
 * `/report/no-such-slug` がいずれも 200。`/en/no-such-page`（ルート未一致で Next の
 * 既定 404 へ落ちる経路）だけが 404 だった。
 */

/** 404 を返すべき URL。ルート一致の有無で経路が変わるため両方を含める */
const NOT_FOUND_PATHS = [
  // レジストリに無い記法トピック（ルートは一致し、ページが notFound() を呼ぶ）
  '/markdown/unknown',
  '/en/markdown/unknown',
  // ルート自体が存在しない（Next の既定 404）
  '/no-such-page',
  '/en/no-such-page',
  // 未対応ロケール（[locale]/layout.tsx が notFound() を呼ぶ）
  '/xx/markdown',
];

/** 200 を返すべき URL。404 化しすぎていないことを同時に固定する */
const OK_PATHS = [
  '/',
  '/en',
  '/markdown',
  '/en/markdown',
  '/markdown/mermaid',
  '/en/markdown/mermaid',
  '/markdown/table',
  '/report',
  '/privacy',
];

test.describe('HTTP status', () => {
  for (const path of NOT_FOUND_PATHS) {
    test(`${path} は 404 を返す`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }

  for (const path of OK_PATHS) {
    test(`${path} は 200 を返す`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  test('404 のときも 404 ページの本文が返る', async ({ request }) => {
    // ステータスだけ直して本文が空になっていないことを見る（逆方向の退行）
    const res = await request.get('/markdown/unknown', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(await res.text()).toContain('404');
  });
});
