/**
 * useEditorCommentNotifications のユニットテスト
 *
 * コメント変更のデバウンス通知を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useEditorCommentNotifications } from "../hooks/useEditorCommentNotifications";

// commentDataPluginKey のモック
const mockComments = new Map<string, any>();
jest.mock("../extensions/commentExtension", () => ({
  commentDataPluginKey: {
    getState: jest.fn().mockImplementation(() => ({ comments: mockComments })),
  },
}));

jest.mock("../constants/timing", () => ({
  DEBOUNCE_MEDIUM: 300,
}));

function createMockEditor() {
  const handlers = new Map<string, Function[]>();
  return {
    state: {
      doc: {
        descendants: jest.fn().mockImplementation((callback: Function) => {
          // デフォルト: 何も見つからない
        }),
      },
    },
    on: jest.fn().mockImplementation((event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: jest.fn().mockImplementation((event: string, handler: Function) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    _emit: (event: string) => {
      handlers.get(event)?.forEach((h) => h());
    },
    _handlers: handlers,
  };
}

describe("useEditorCommentNotifications", () => {
  beforeEach(() => {
    mockComments.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("editor が null のときはコールバックを呼ばない", () => {
    const onChange = jest.fn();

    renderHook(() => useEditorCommentNotifications(null, onChange));

    jest.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("onCommentsChange が undefined のときは何もしない", () => {
    const editor = createMockEditor();

    // エラーなく実行されること
    renderHook(() => useEditorCommentNotifications(editor as any, undefined));

    jest.advanceTimersByTime(1000);
  });

  it("初回マウント時にコメントを通知する", () => {
    const editor = createMockEditor();
    const onChange = jest.fn();

    mockComments.set("c1", {
      id: "c1",
      text: "test comment",
      resolved: false,
      createdAt: "2026-01-01",
    });

    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    // デバウンス待ち
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const comments = onChange.mock.calls[0][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe("c1");
    expect(comments[0].text).toBe("test comment");
  });

  it("editor の update イベントで再通知される", () => {
    const editor = createMockEditor();
    const onChange = jest.fn();

    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    // 初回
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(1);

    // update イベント発火
    act(() => {
      editor._emit("update");
    });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("アンマウント時に update リスナーを解除する", () => {
    const editor = createMockEditor();
    const onChange = jest.fn();

    const { unmount } = renderHook(() =>
      useEditorCommentNotifications(editor as any, onChange),
    );

    expect(editor.on).toHaveBeenCalledWith("update", expect.any(Function));

    unmount();

    expect(editor.off).toHaveBeenCalledWith("update", expect.any(Function));
  });

  it("コメントが空の場合は空配列を通知する", () => {
    const editor = createMockEditor();
    const onChange = jest.fn();

    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
