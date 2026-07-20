/**
 * VanillaMarkdownView の GitHub .md リンク横取りのテスト。
 *
 * 本文中の GitHub `.md` blob リンクだけを新規タブの `/markdown`（レビューモード）へ
 * 振り向け、対象外リンクは通常遷移のまま（preventDefault しない）ことを検証する。
 * エディタ本体（Web Component mount）はモックし、リンク DOM を差し込んで
 * ラッパのクリック委譲配線そのものを確認する。
 */

import { fireEvent, render, screen } from "@testing-library/react";

// Web Component 登録の副作用 import を無効化（jsdom で custom element 実体は不要）
jest.mock("@anytime-markdown/markdown-rich/src/view-element", () => ({}));
jest.mock("@anytime-markdown/markdown-react-islands", () => ({
  VanillaMarkdownEditorMount: () => (
    <div>
      <a href="https://github.com/foo/bar/blob/develop/docs/spec/design.md">
        <span>設計書リンク（ネスト要素クリック）</span>
      </a>
      <a href="https://github.com/foo/bar/blob/main/src/index.ts">ソースコードリンク</a>
      <a href="https://example.com/notes.md">GitHub 以外の .md リンク</a>
    </div>
  ),
}));

import VanillaMarkdownView from "../app/components/VanillaMarkdownView";

const mockT = (key: string) => key;

function renderView() {
  return render(
    <VanillaMarkdownView t={mockT} locale="ja" initialContent="# body" readOnly />,
  );
}

describe("VanillaMarkdownView GitHub .md リンク横取り", () => {
  let windowOpen: jest.SpyInstance;

  beforeEach(() => {
    windowOpen = jest.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    windowOpen.mockRestore();
  });

  it("GitHub .md blob リンクは preventDefault し新規タブで /markdown（レビューモード）を開く", () => {
    renderView();
    // アンカー内のネスト要素をクリックしても closest で拾えること
    const notPrevented = fireEvent.click(screen.getByText("設計書リンク（ネスト要素クリック）"));

    expect(notPrevented).toBe(false); // preventDefault された
    expect(windowOpen).toHaveBeenCalledTimes(1);
    const [url, target, features] = windowOpen.mock.calls[0];
    const parsed = new URL(url as string, "https://app.example");
    expect(parsed.pathname).toBe("/markdown");
    expect(parsed.searchParams.get("gh")).toBe("foo/bar");
    expect(parsed.searchParams.get("branch")).toBe("develop");
    expect(parsed.searchParams.get("path")).toBe("docs/spec/design.md");
    expect(parsed.searchParams.get("mode")).toBe("review");
    expect(target).toBe("_blank");
    expect(features).toContain("noopener");
  });

  it(".md 以外の GitHub リンクは横取りしない（通常遷移のまま）", () => {
    renderView();
    const notPrevented = fireEvent.click(screen.getByText("ソースコードリンク"));

    expect(notPrevented).toBe(true); // preventDefault されていない
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("GitHub 以外のドメインの .md リンクは横取りしない", () => {
    renderView();
    const notPrevented = fireEvent.click(screen.getByText("GitHub 以外の .md リンク"));

    expect(notPrevented).toBe(true);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("リンク以外のクリックは何もしない", () => {
    const { container } = renderView();
    const notPrevented = fireEvent.click(container.firstElementChild as Element);

    expect(notPrevented).toBe(true);
    expect(windowOpen).not.toHaveBeenCalled();
  });
});
