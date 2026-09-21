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

    // protocol-relative はスキームを持たないので前方一致の検査を素通りする。
    // 遷移先は外部オリジンだが、継承するスキームは http(s) に限られるため許可する。
    // 「スキームが無い＝同一オリジン」と読み替えないよう、挙動をここで固定する。
    it('protocol-relative URL は外部オリジンだが許可する', () => {
      const html = renderMarkdownToSafeHtml('[外部](//example.com/x)\n');
      expect(html).toContain('href="//example.com/x"');
    });
  });

  describe('URL の正規化', () => {
    // ブラウザが位置を問わず無視するのは tab / LF / CR だけ。空白まで落とすと
    // 正当なリンクがエラーもログもなく別の URL へ化ける。
    it('URL 中の空白を落とさずエンコードする', () => {
      const html = renderMarkdownToSafeHtml('[記事](</report/a b>)\n');
      expect(html).toContain('href="/report/a%20b"');
    });

    it('画像パス中の空白もエンコードする', () => {
      const html = renderMarkdownToSafeHtml('![図](<my image.png>)\n');
      expect(html).toContain('src="my%20image.png"');
    });

    it('スキーム名へ挟んだ tab は除去して javascript: と判定する', () => {
      const html = renderMarkdownToSafeHtml('[押す](<java\tscript:alert(1)>)\n');
      expect(html.toLowerCase()).not.toContain('javascript:');
      expect(html).not.toContain('href=');
    });
  });

  /**
   * この実装の安全性は「本文由来のタグ・属性を出力できる marked のトークンが
   * html / link / image の 3 つだけ」という前提に依存している。個別ベクタの列挙は
   * 未知の経路が増えても落ちないため、構文を並べた fixture に対して出力の性質を検査する。
   * marked を更新したときに最初に落ちるゲートがこれになる。
   */
  describe('出力の性質（marked 更新時のゲート）', () => {
    const ALL_SYNTAX = [
      '# 見出し1',
      '## 見出し2',
      '',
      '段落と<b onclick="alert(1)">インライン HTML</b>と`コード`。',
      '',
      '<div class="raw"><script>alert(1)</script></div>',
      '',
      '> 引用の中の<img src=x onerror=alert(1)>',
      '',
      '- [ ] チェックボックス',
      '- [x] 済み',
      '',
      '| 見出し | 右寄せ |',
      '| --- | ---: |',
      '| <i>セル</i> | 2 |',
      '',
      '```ts" onmouseover="alert(1)',
      'const a = 1;',
      '```',
      '',
      '[参照リンク][ref] と <https://example.com/auto> と https://example.com/gfm',
      '',
      '![画像](javascript:alert(1))',
      '',
      '[ref]: vbscript:alert(1)',
      '',
      '---',
    ].join('\n');

    const html = renderMarkdownToSafeHtml(ALL_SYNTAX);

    it('危険な要素を出力しない', () => {
      expect(html).not.toMatch(/<(script|iframe|style|object|embed|form)\b/i);
    });

    // 検査対象は「要素になった属性」だけ。エスケープ済みの本文テキストには
    // `onclick=` の文字列がそのまま残るため、生文字列への素当ては誤検知する。
    it('イベントハンドラ属性を出力しない', () => {
      const tags = html.match(/<[a-z][^>]*>/gi) ?? [];
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).not.toMatch(/\son[a-z]+\s*=/i);
      }
    });

    it('href / src のスキームは許可リストのものだけにする', () => {
      const urls = [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
        if (scheme) {
          expect(['http:', 'https:', 'mailto:']).toContain(`${scheme[1].toLowerCase()}:`);
        }
      }
    });
  });
});
