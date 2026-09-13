/**
 * サーバ側 Markdown → HTML 変換の検証。
 *
 * この関数の出力は SSR の HTML へそのまま差し込まれる（クローラが読む唯一の本文）。
 * そのため「本文が HTML になること」と「本文由来のスクリプトが実行経路へ乗らないこと」を
 * 同じ強さで検査する。
 */

import { renderMarkdownToSafeHtml } from '../lib/renderMarkdownHtml';

describe('renderMarkdownToSafeHtml', () => {
  describe('本文の HTML 化', () => {
    it('見出しを heading 要素にする', () => {
      const html = renderMarkdownToSafeHtml('# 表題\n\n## 節\n\n### 小節\n');
      expect(html).toContain('<h1');
      expect(html).toContain('<h2');
      expect(html).toContain('<h3');
      expect(html).toContain('節');
    });

    it('段落・リスト・表を要素にする', () => {
      const html = renderMarkdownToSafeHtml(
        '本文です。\n\n- 一つ目\n- 二つ目\n\n| 列A | 列B |\n| --- | --- |\n| 1 | 2 |\n',
      );
      expect(html).toContain('<p>');
      expect(html).toContain('<li>');
      expect(html).toContain('<table>');
      expect(html).toContain('一つ目');
    });

    it('コードブロックの中身をテキストとして保持する', () => {
      const html = renderMarkdownToSafeHtml('```ts\nconst a = 1 < 2;\n```\n');
      expect(html).toContain('<pre>');
      expect(html).toContain('const a = 1 &lt; 2;');
    });

    it('空文字を空文字で返す', () => {
      expect(renderMarkdownToSafeHtml('')).toBe('');
    });
  });

  describe('スクリプト経路の遮断', () => {
    it('生の script タグをエスケープして要素にしない', () => {
      const html = renderMarkdownToSafeHtml('前\n\n<script>alert(1)</script>\n\n後\n');
      expect(html).not.toContain('<script');
      expect(html).toContain('&lt;script&gt;');
    });

    it('インライン HTML（イベントハンドラ付き）を要素にしない', () => {
      const html = renderMarkdownToSafeHtml('段落の<img src=x onerror=alert(1)>途中\n');
      expect(html).not.toMatch(/<img\s/);
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('javascript: リンクを href にしない', () => {
      const html = renderMarkdownToSafeHtml('[押す](javascript:alert(1))\n');
      expect(html).not.toContain('javascript:');
      expect(html).toContain('押す');
    });

    it('大文字・前置空白で偽装した javascript: も href にしない', () => {
      const html = renderMarkdownToSafeHtml('[押す](<  JaVaScRiPt:alert(1)>)\n');
      expect(html.toLowerCase()).not.toContain('javascript:');
    });

    it('data: の画像を src にしない', () => {
      const html = renderMarkdownToSafeHtml('![図](data:text/html;base64,PHNjcmlwdD4=)\n');
      expect(html).not.toContain('data:text/html');
    });

    it('通常の http/https リンクは保持する', () => {
      const html = renderMarkdownToSafeHtml('[例](https://example.com/a?b=1)\n');
      expect(html).toContain('href="https://example.com/a?b=1"');
    });

    it('サイト内の相対リンクは保持する', () => {
      const html = renderMarkdownToSafeHtml('[記事](/report/other)\n');
      expect(html).toContain('href="/report/other"');
    });
  });
});
