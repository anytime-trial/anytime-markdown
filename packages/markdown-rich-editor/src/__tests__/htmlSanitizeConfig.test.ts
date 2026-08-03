import DOMPurify from "dompurify";

import { HTML_SANITIZE_CONFIG } from "../components/codeblock/types";

/**
 * `html` フェンスのプレビューは HTML5 の埋め込みコンテンツを描画できなければならない
 * （issue #155: `<video>` が丸ごと消えて「何も表示されない」状態になっていた）。
 *
 * DOMPurify の allowlist は「未列挙＝除去」なので、タグを足し忘れると失敗ではなく
 * 静かな消失として現れる。ここでは要素と属性の両方が残ることを実測する。
 */
describe("HTML_SANITIZE_CONFIG", () => {
  const sanitize = (html: string): string => DOMPurify.sanitize(html, HTML_SANITIZE_CONFIG);

  it("video 要素と再生制御属性を保持する", () => {
    const out = sanitize(
      '<video controls muted loop autoplay playsinline preload="auto" poster="https://example.test/p.jpg" src="https://example.test/v.mp4"></video>',
    );
    expect(out).toContain("<video");
    expect(out).toContain("controls");
    expect(out).toContain("muted");
    expect(out).toContain("loop");
    expect(out).toContain("autoplay");
    expect(out).toContain("playsinline");
    expect(out).toContain('preload="auto"');
    expect(out).toContain('poster="https://example.test/p.jpg"');
    expect(out).toContain('src="https://example.test/v.mp4"');
  });

  it("audio / source / track / picture を保持する", () => {
    const out = sanitize(
      '<audio controls><source src="https://example.test/a.ogg" type="audio/ogg" media="all">' +
        '<track kind="captions" src="https://example.test/c.vtt" srclang="ja" label="日本語" default></audio>' +
        '<picture><source srcset="https://example.test/i.webp" sizes="100vw"><img src="https://example.test/i.png" alt="i"></picture>',
    );
    expect(out).toContain("<audio");
    expect(out).toContain("<source");
    expect(out).toContain("<track");
    expect(out).toContain("<picture");
    expect(out).toContain('type="audio/ogg"');
    expect(out).toContain('kind="captions"');
    expect(out).toContain('srclang="ja"');
    expect(out).toContain("srcset=");
  });

  it("スクリプト実行経路は許可しない", () => {
    const out = sanitize(
      '<video src="x" onerror="alert(1)" onloadstart="alert(2)"></video>' +
        '<script>alert(3)</script><iframe src="https://example.test/"></iframe>' +
        '<object data="x"></object><embed src="x">',
    );
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onloadstart");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<embed");
  });
});
