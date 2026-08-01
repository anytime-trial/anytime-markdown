/**
 * @jest-environment node
 */
/**
 * markdown-engine sanitizeMarkdown の Node（非ブラウザ）環境挙動テスト。
 * レビュー指摘 29 対応。resolvePurifier() は `typeof window !== "undefined"` で
 * ブラウザ/Node を判定するため、この分岐は testEnvironment: "node" でのみ再現できる。
 * デフォルトの jsdom 環境テストは markdownEngine.sanitizeMarkdown.test.ts を参照。
 */
import { JSDOM } from "jsdom";

import { configureSanitizerWindow, sanitizeMarkdown } from "@anytime-markdown/markdown-engine";

describe("sanitizeMarkdown - Purifier 未設定時のフォールバック挙動（素通し設計）", () => {
  test("window 未定義の Node 環境では素通し（危険タグも除去されない）", () => {
    expect(typeof window).toBe("undefined");
    const md = "before <script>alert(1)</script> after";
    const result = sanitizeMarkdown(md);
    // resolvePurifier() が null を返すため DOMPurify が適用されず、
    // エンティティ正規化のみでタグはそのまま残る（コメントに明記された「素通し」設計）。
    expect(result).toContain("<script>alert(1)</script>");
    expect(result).toBe(md);
  });

  test("HTML を含まない入力は Node 環境でも変化しない", () => {
    expect(sanitizeMarkdown("plain text")).toBe("plain text");
  });
});

describe("sanitizeMarkdown - configureSanitizerWindow で明示的に window を注入するとサニタイズが有効化される", () => {
  test("JSDOM の window を注入すると危険タグが除去される", () => {
    const dom = new JSDOM("");
    configureSanitizerWindow(dom.window);
    try {
      const result = sanitizeMarkdown("before <script>alert(1)</script> after");
      expect(result).not.toContain("<script");
    } finally {
      // モジュールスコープの purifier キャッシュを他テストへ波及させないため、
      // このテストファイル内で完結させる（他ファイルはプロセス分離される前提）。
    }
  });
});
