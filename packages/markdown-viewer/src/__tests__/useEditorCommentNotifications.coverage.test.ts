/**
 * useEditorCommentNotifications.ts - カバレッジテスト (lines 27-38)
 * findCommentTarget: commentPoint node, commentHighlight mark
 */
import { renderHook, act } from "@testing-library/react";
import { useEditorCommentNotifications } from "../hooks/useEditorCommentNotifications";

// commentDataPluginKey mock
const mockComments = new Map<string, any>();
jest.mock("../extensions/commentExtension", () => ({
  commentDataPluginKey: {
    getState: jest.fn().mockImplementation(() => ({ comments: mockComments })),
  },
}));

jest.mock("../constants/timing", () => ({
  DEBOUNCE_MEDIUM: 50,
}));

function createMockEditor(descendantsImpl: (cb: Function) => void) {
  const handlers = new Map<string, Function[]>();
  return {
    state: {
      doc: {
        descendants: jest.fn().mockImplementation(descendantsImpl),
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
  };
}

describe("useEditorCommentNotifications coverage", () => {
  beforeEach(() => {
    mockComments.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("finds commentPoint node and sets isPoint=true", () => {
    mockComments.set("cp1", {
      id: "cp1",
      text: "point comment",
      resolved: false,
      createdAt: "2026-01-01",
    });

    const editor = createMockEditor((cb: Function) => {
      const node = {
        type: { name: "commentPoint" },
        attrs: { commentId: "cp1" },
        isText: false,
        marks: [],
      };
      cb(node, 42);
    });

    const onChange = jest.fn();
    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    act(() => { jest.advanceTimersByTime(100); });

    expect(onChange).toHaveBeenCalled();
    const comments = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe("cp1");
    expect(comments[0].isPoint).toBe(true);
    expect(comments[0].pos).toBe(42);
    expect(comments[0].targetText).toBe("");
  });

  it("finds commentHighlight mark on text node", () => {
    mockComments.set("ch1", {
      id: "ch1",
      text: "highlight comment",
      resolved: true,
      createdAt: "2026-02-01",
    });

    const editor = createMockEditor((cb: Function) => {
      const node = {
        type: { name: "text" },
        isText: true,
        text: "highlighted text",
        marks: [
          { type: { name: "commentHighlight" }, attrs: { commentId: "ch1" } },
        ],
      };
      cb(node, 10);
    });

    const onChange = jest.fn();
    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    act(() => { jest.advanceTimersByTime(100); });

    expect(onChange).toHaveBeenCalled();
    const comments = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe("ch1");
    expect(comments[0].targetText).toBe("highlighted text");
    expect(comments[0].pos).toBe(10);
    expect(comments[0].isPoint).toBe(false);
    expect(comments[0].resolved).toBe(true);
  });

  it("handles text node without matching commentHighlight mark", () => {
    mockComments.set("c2", {
      id: "c2",
      text: "no match",
      resolved: false,
      createdAt: "2026-03-01",
    });

    const editor = createMockEditor((cb: Function) => {
      const node = {
        type: { name: "text" },
        isText: true,
        text: "some text",
        marks: [
          { type: { name: "commentHighlight" }, attrs: { commentId: "other-id" } },
        ],
      };
      cb(node, 5);
    });

    const onChange = jest.fn();
    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    act(() => { jest.advanceTimersByTime(100); });

    expect(onChange).toHaveBeenCalled();
    const comments = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].targetText).toBe("");
    expect(comments[0].pos).toBe(0);
  });

  it("handles node that is neither commentPoint nor text with mark", () => {
    mockComments.set("c3", {
      id: "c3",
      text: "test",
      resolved: false,
      createdAt: "2026-01-01",
    });

    const editor = createMockEditor((cb: Function) => {
      const node = {
        type: { name: "paragraph" },
        isText: false,
        marks: [],
      };
      // Return undefined (not false) to continue traversal
      cb(node, 0);
    });

    const onChange = jest.fn();
    renderHook(() => useEditorCommentNotifications(editor as any, onChange));

    act(() => { jest.advanceTimersByTime(100); });

    expect(onChange).toHaveBeenCalled();
    const comments = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(comments).toHaveLength(1);
    expect(comments[0].targetText).toBe("");
  });
});
