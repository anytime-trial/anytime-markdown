import type { HeadingItem } from "../types";
import { toGitHubSlug, generateTocMarkdown } from "../utils/tocHelpers";

/* ------------------------------------------------------------------ */
/*  toGitHubSlug                                                      */
/* ------------------------------------------------------------------ */
describe("toGitHubSlug", () => {
  test("英語テキストを小文字ハイフン区切りに変換する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("Getting Started", used)).toBe("getting-started");
  });

  test("特殊文字を除去する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("Hello, World! (v2.0)", used)).toBe("hello-world-v20");
  });

  test("日本語を保持する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("はじめに", used)).toBe("はじめに");
  });

  test("日本語と英語の混在を処理する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("Step 1: インストール", used)).toBe(
      "step-1-インストール",
    );
  });

  test("重複時に連番を付加する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("Usage", used)).toBe("usage");
    expect(toGitHubSlug("Usage", used)).toBe("usage-1");
    expect(toGitHubSlug("Usage", used)).toBe("usage-2");
  });

  test("空文字はそのまま返す", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("", used)).toBe("");
  });

  test("先頭・末尾のハイフンを除去する", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug(" Hello World ", used)).toBe("hello-world");
  });

  test("連続ハイフンを保持する（GitHub 準拠）", () => {
    const used = new Map<string, number>();
    expect(toGitHubSlug("A -- B", used)).toBe("a----b");
  });
});

/* ------------------------------------------------------------------ */
/*  generateTocMarkdown                                               */
/* ------------------------------------------------------------------ */
describe("generateTocMarkdown", () => {
  const heading = (
    level: number,
    text: string,
    pos = 0,
  ): HeadingItem => ({
    level,
    text,
    pos,
    kind: "heading",
  });

  test("インデント付き TOC を生成する", () => {
    const items: HeadingItem[] = [
      heading(1, "Introduction"),
      heading(2, "Getting Started"),
      heading(3, "Installation"),
      heading(3, "Configuration"),
      heading(2, "Usage"),
    ];
    expect(generateTocMarkdown(items)).toBe(
      [
        "- [Introduction](#introduction)",
        "  - [Getting Started](#getting-started)",
        "    - [Installation](#installation)",
        "    - [Configuration](#configuration)",
        "  - [Usage](#usage)",
        "",
      ].join("\n"),
    );
  });

  test("kind !== 'heading' を除外する", () => {
    const items: HeadingItem[] = [
      heading(1, "Title"),
      { level: 0, text: "code", pos: 10, kind: "codeBlock" },
      heading(2, "Section"),
    ];
    expect(generateTocMarkdown(items)).toBe(
      ["- [Title](#title)", "  - [Section](#section)", ""].join("\n"),
    );
  });

  test("空リストは空文字を返す", () => {
    expect(generateTocMarkdown([])).toBe("");
  });

  test("heading のない項目のみの場合も空文字を返す", () => {
    const items: HeadingItem[] = [
      { level: 0, text: "table", pos: 0, kind: "table" },
    ];
    expect(generateTocMarkdown(items)).toBe("");
  });

  test("重複見出しに連番スラグを付ける", () => {
    const items: HeadingItem[] = [
      heading(2, "API"),
      heading(2, "API"),
      heading(2, "API"),
    ];
    expect(generateTocMarkdown(items)).toBe(
      [
        "- [API](#api)",
        "- [API](#api-1)",
        "- [API](#api-2)",
        "",
      ].join("\n"),
    );
  });

  test("H2 始まりの場合、H2 をトップレベルにする（相対インデント）", () => {
    const items: HeadingItem[] = [
      heading(2, "Overview"),
      heading(3, "Details"),
      heading(4, "Sub-details"),
    ];
    expect(generateTocMarkdown(items)).toBe(
      [
        "- [Overview](#overview)",
        "  - [Details](#details)",
        "    - [Sub-details](#sub-details)",
        "",
      ].join("\n"),
    );
  });
});
