/**
 * useSourceMode.ts の追加カバレッジテスト
 * handleSwitchToReview, handleSwitchToReadonly, executeInReviewMode,
 * reviewMode/readonlyMode の初期化ブランチをテスト。
 */
import { renderHook, act } from "@testing-library/react";
import { useSourceMode } from "../hooks/useSourceMode";
import { getMarkdownFromEditor } from "../types";
import type { Editor } from "@tiptap/react";
import { STORAGE_KEY_EDITOR_MODE, STORAGE_KEY_READONLY_MODE, STORAGE_KEY_REVIEW_MODE, STORAGE_KEY_SOURCE_MODE } from "../constants/storageKeys";

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  getMarkdownFromEditor: jest.fn(),
}));

jest.mock("../extensions/reviewModeExtension", () => ({
  reviewModeStorage: jest.fn().mockReturnValue({ enabled: false }),
}));

jest.mock("../utils/editorContentLoader", () => ({
  applyMarkdownToEditor: jest.fn().mockReturnValue({ frontmatter: null }),
}));

jest.mock("../utils/frontmatterHelpers", () => ({
  prependFrontmatter: jest.fn().mockImplementation((md: string, fm: string | null) =>
    fm ? `---\n${fm}\n---\n${md}` : md,
  ),
}));

jest.mock("../utils/storage", () => ({
  safeSetItem: jest.fn(),
}));

const mockedGetMarkdown = getMarkdownFromEditor as jest.MockedFunction<typeof getMarkdownFromEditor>;

function createMockEditor(): Editor {
  const dom = document.createElement("div");
  return {
    commands: {
      closeSearch: jest.fn(),
      setContent: jest.fn(),
      initComments: jest.fn(),
    },
    storage: {
      reviewMode: { enabled: false },
    },
    view: { dom },
  } as unknown as Editor;
}

function setup(editor: Editor | null = createMockEditor(), opts?: { defaultSourceMode?: boolean }) {
  const saveContent = jest.fn();
  const t = jest.fn((key: string) => key);
  return {
    hook: renderHook(() =>
      useSourceMode({
        editor,
        saveContent,
        t,
        frontmatterRef: { current: null },
        defaultSourceMode: opts?.defaultSourceMode,
      }),
    ),
    saveContent,
    t,
    editor,
  };
}

describe("useSourceMode - extra", () => {
  beforeEach(() => {
    mockedGetMarkdown.mockReset();
    mockedGetMarkdown.mockReturnValue("");
    localStorage.clear();
  });

  test("handleSwitchToReview: WYSIWYG → reviewMode", () => {
    const { hook, editor } = setup();
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(true);
    expect(hook.result.current.readonlyMode).toBe(false);
  });

  test("handleSwitchToReview: ソースモード → レビューモード", () => {
    mockedGetMarkdown.mockReturnValue("# Source");
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.sourceMode).toBe(true);
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(true);
    expect(hook.result.current.sourceMode).toBe(false);
  });

  test("handleSwitchToReadonly: WYSIWYG → readonlyMode", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(true);
    expect(hook.result.current.reviewMode).toBe(false);
  });

  test("handleSwitchToReadonly: ソースモード → readonlyMode", () => {
    mockedGetMarkdown.mockReturnValue("# Source");
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToSource());
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(true);
    expect(hook.result.current.sourceMode).toBe(false);
  });

  test("handleSwitchToReadonly: reviewMode → readonlyMode", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(true);
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(true);
    expect(hook.result.current.reviewMode).toBe(false);
  });

  test("handleSwitchToReview: readonlyMode → reviewMode", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(true);
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(true);
    expect(hook.result.current.readonlyMode).toBe(false);
  });

  test("handleSwitchToWysiwyg: reviewMode → WYSIWYG", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReview());
    act(() => hook.result.current.handleSwitchToWysiwyg());
    expect(hook.result.current.reviewMode).toBe(false);
    expect(hook.result.current.sourceMode).toBe(false);
  });

  test("handleSwitchToWysiwyg: readonlyMode → WYSIWYG", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReadonly());
    act(() => hook.result.current.handleSwitchToWysiwyg());
    expect(hook.result.current.readonlyMode).toBe(false);
  });

  test("handleSwitchToSource: readonlyMode 時にリセットされる", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(true);
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.readonlyMode).toBe(false);
    expect(hook.result.current.sourceMode).toBe(true);
  });

  test("handleSwitchToSource: reviewMode 時にリセットされる", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(true);
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.reviewMode).toBe(false);
    expect(hook.result.current.sourceMode).toBe(true);
  });

  test("executeInReviewMode: コールバック実行後にフィルタを復元", () => {
    const { hook } = setup();
    const fn = jest.fn();
    act(() => hook.result.current.executeInReviewMode(fn));
    expect(fn).toHaveBeenCalled();
  });

  test("executeInReviewMode: editor が null の場合は何もしない", () => {
    const { hook } = setup(null);
    const fn = jest.fn();
    act(() => hook.result.current.executeInReviewMode(fn));
    expect(fn).not.toHaveBeenCalled();
  });

  test("handleSwitchToReview: editor が null の場合は何もしない", () => {
    const { hook } = setup(null);
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.reviewMode).toBe(false);
  });

  test("handleSwitchToReadonly: editor が null の場合は何もしない", () => {
    const { hook } = setup(null);
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.readonlyMode).toBe(false);
  });

  test("defaultSourceMode=true → 初期値 sourceMode=true", () => {
    const { hook } = setup(createMockEditor(), { defaultSourceMode: true });
    expect(hook.result.current.sourceMode).toBe(true);
  });

  test("localStorage に mode=source → 初期値 sourceMode=true", () => {
    localStorage.setItem(STORAGE_KEY_EDITOR_MODE, "source");
    const { hook } = setup();
    expect(hook.result.current.sourceMode).toBe(true);
  });

  test("localStorage に mode=readonly → readonlyMode=true, reviewMode=false", () => {
    localStorage.setItem(STORAGE_KEY_EDITOR_MODE, "readonly");
    const { hook } = setup();
    expect(hook.result.current.readonlyMode).toBe(true);
    expect(hook.result.current.reviewMode).toBe(false);
  });

  test("旧キーからのマイグレーション: sourceMode=true → mode=source", () => {
    localStorage.setItem(STORAGE_KEY_SOURCE_MODE, "true");
    const { hook } = setup();
    expect(hook.result.current.sourceMode).toBe(true);
    // 旧キーが削除されていること
    expect(localStorage.getItem(STORAGE_KEY_SOURCE_MODE)).toBeNull();
  });

  test("旧キーからのマイグレーション: readonlyMode=true が優先", () => {
    localStorage.setItem(STORAGE_KEY_READONLY_MODE, "true");
    localStorage.setItem(STORAGE_KEY_REVIEW_MODE, "true");
    const { hook } = setup();
    expect(hook.result.current.readonlyMode).toBe(true);
    expect(hook.result.current.reviewMode).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_READONLY_MODE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_REVIEW_MODE)).toBeNull();
  });

  test("liveMessage が切り替え時に設定される", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.liveMessage).toBe("switchedToSource");
    act(() => hook.result.current.handleSwitchToWysiwyg());
    expect(hook.result.current.liveMessage).toBe("switchedToWysiwyg");
  });

  test("liveMessage: review/readonly 切り替え", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToReview());
    expect(hook.result.current.liveMessage).toBe("switchedToReview");
    act(() => hook.result.current.handleSwitchToReadonly());
    expect(hook.result.current.liveMessage).toBe("switchedToReadonly");
  });

  test("setLiveMessage で直接設定可能", () => {
    const { hook } = setup();
    act(() => hook.result.current.setLiveMessage("custom message"));
    expect(hook.result.current.liveMessage).toBe("custom message");
  });
});
