/**
 * src/lib/githubBlobUrl.ts のユニットテスト
 *
 * チケット本文中のリンクから「GitHub の Markdown blob URL」だけを抽出し、
 * /markdown エディタ（レビューモード）への遷移 URL を組み立てる純粋関数を検証する。
 */

import { buildMarkdownEditorUrl, parseGitHubMarkdownBlobUrl } from "../lib/githubBlobUrl";

describe("parseGitHubMarkdownBlobUrl", () => {
  it("標準的な blob URL から owner/repo/branch/path を抽出する", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/main/README.md"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "README.md" });
  });

  it("ネストしたパスを保持する", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/develop/docs/spec/design.md"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "develop", path: "docs/spec/design.md" });
  });

  it(".markdown 拡張子も対象にする", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/main/notes.markdown"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "notes.markdown" });
  });

  it("拡張子の大文字小文字は無視する（README.MD）", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/main/README.MD"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "README.MD" });
  });

  it("www.github.com も受け付ける", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://www.github.com/foo/bar/blob/main/README.md"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "README.md" });
  });

  it("クエリ・フラグメントを無視して判定する", () => {
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/main/README.md?plain=1#L10"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "README.md" });
  });

  it("URL エンコードされたパスをデコードする", () => {
    expect(
      parseGitHubMarkdownBlobUrl(
        "https://github.com/foo/bar/blob/main/docs/%E8%A8%AD%E8%A8%88.md",
      ),
    ).toEqual({ owner: "foo", repo: "bar", branch: "main", path: "docs/設計.md" });
  });

  it("refs/heads/ 形式の blob URL からブランチを抽出する", () => {
    expect(
      parseGitHubMarkdownBlobUrl(
        "https://github.com/foo/bar/blob/refs/heads/develop/docs/design.md",
      ),
    ).toEqual({ owner: "foo", repo: "bar", branch: "develop", path: "docs/design.md" });
  });

  it("スラッシュ入りブランチは先頭セグメントをブランチとして扱う（既知の制約）", () => {
    // blob URL からはブランチとパスの境界を静的に判別できないため、先頭 1 セグメント固定。
    expect(
      parseGitHubMarkdownBlobUrl("https://github.com/foo/bar/blob/feature/x/docs/design.md"),
    ).toEqual({ owner: "foo", repo: "bar", branch: "feature", path: "x/docs/design.md" });
  });

  it.each([
    ["md 以外の拡張子", "https://github.com/foo/bar/blob/main/src/index.ts"],
    ["拡張子なし", "https://github.com/foo/bar/blob/main/LICENSE"],
    ["blob 以外（tree）", "https://github.com/foo/bar/tree/main/docs"],
    ["blob 以外（raw ドメイン）", "https://raw.githubusercontent.com/foo/bar/main/README.md"],
    ["GitHub 以外のドメイン", "https://example.com/foo/bar/blob/main/README.md"],
    ["パス不足（ファイル名なし）", "https://github.com/foo/bar/blob/main"],
    ["リポジトリルートのみ", "https://github.com/foo/bar"],
    ["相対パス", "docs/design.md"],
    ["gist", "https://gist.github.com/foo/abc123"],
    ["空文字列", ""],
  ])("対象外: %s は null を返す", (_label, href) => {
    expect(parseGitHubMarkdownBlobUrl(href)).toBeNull();
  });
});

describe("buildMarkdownEditorUrl", () => {
  it("gh/branch/path/mode=review クエリ付きの /markdown URL を組み立てる", () => {
    const url = buildMarkdownEditorUrl({
      owner: "foo",
      repo: "bar",
      branch: "develop",
      path: "docs/spec/design.md",
    });
    const parsed = new URL(url, "https://app.example");
    expect(parsed.pathname).toBe("/markdown");
    expect(parsed.searchParams.get("gh")).toBe("foo/bar");
    expect(parsed.searchParams.get("branch")).toBe("develop");
    expect(parsed.searchParams.get("path")).toBe("docs/spec/design.md");
    expect(parsed.searchParams.get("mode")).toBe("review");
  });

  it("日本語パス・記号入りブランチをエンコードして往復できる", () => {
    const url = buildMarkdownEditorUrl({
      owner: "foo",
      repo: "bar",
      branch: "release&test",
      path: "docs/設計 書.md",
    });
    const parsed = new URL(url, "https://app.example");
    expect(parsed.searchParams.get("branch")).toBe("release&test");
    expect(parsed.searchParams.get("path")).toBe("docs/設計 書.md");
  });
});
