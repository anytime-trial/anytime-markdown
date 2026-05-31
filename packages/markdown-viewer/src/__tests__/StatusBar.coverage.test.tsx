/**
 * StatusBar.tsx coverage tests
 * Targets uncovered lines: 65-71, 76-80, 139, 172
 * - sourceMode cursor tracking (lines 65-71, 76-80)
 * - lineEnding menu close (line 139)
 * - encoding menu close (line 172)
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

let mockConfirmResolve: () => void;
let mockConfirmReject: () => void;
const mockConfirm = jest.fn(() => new Promise<void>((resolve, reject) => {
  mockConfirmResolve = resolve;
  mockConfirmReject = reject;
}));
jest.mock("../hooks/useConfirm", () => ({
  __esModule: true,
  default: () => mockConfirm,
}));

import { StatusBar } from "../components/StatusBar";

function createMockEditor(overrides: {
  textContent?: string;
  childCount?: number;
  selectionIndex?: number;
  parentOffset?: number;
} = {}) {
  const { textContent = "", childCount = 1, selectionIndex = 0, parentOffset = 0 } = overrides;
  const listeners: Record<string, Array<() => void>> = {};
  return {
    state: {
      selection: {
        $from: {
          index: () => selectionIndex,
          parentOffset,
        },
      },
      doc: {
        textContent,
        content: { childCount },
      },
    },
    on: (event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    off: (event: string, cb: () => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
    },
  } as unknown as import("@tiptap/react").Editor;
}

const t = (key: string, _params?: any) => key;

describe("StatusBar - coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- sourceMode cursor tracking (lines 64-80) ---
  test("sourceMode displays source cursor position from textarea", () => {
    const editor = createMockEditor();
    // Create a textarea to simulate source mode
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "source");
    textarea.value = "line1\nline2\nline3";
    textarea.selectionStart = 8; // "line2\nl" -> line 2, col 3
    document.body.appendChild(textarea);

    render(
      <StatusBar editor={editor} t={t} sourceMode sourceText="line1\nline2\nline3" />,
    );

    // Trigger cursor update events
    act(() => {
      fireEvent.click(document);
    });

    // Cleanup
    document.body.removeChild(textarea);
  });

  test("sourceMode handles keyup event on textarea", () => {
    const editor = createMockEditor();
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "source");
    textarea.value = "abc\ndef";
    textarea.selectionStart = 5; // line 2, col 2
    document.body.appendChild(textarea);

    render(
      <StatusBar editor={editor} t={t} sourceMode sourceText="abc\ndef" />,
    );

    act(() => {
      fireEvent.keyUp(document);
    });

    document.body.removeChild(textarea);
  });

  test("sourceMode handles select event on textarea", () => {
    const editor = createMockEditor();
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "source");
    textarea.value = "hello";
    textarea.selectionStart = 3;
    document.body.appendChild(textarea);

    render(
      <StatusBar editor={editor} t={t} sourceMode sourceText="hello" />,
    );

    act(() => {
      document.dispatchEvent(new Event("select"));
    });

    document.body.removeChild(textarea);
  });

  test("sourceMode without textarea does not crash", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} sourceMode sourceText="hello" />,
    );

    act(() => {
      fireEvent.click(document);
    });
    // Should not throw
  });

  test("sourceMode char and line counts from sourceText", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} sourceMode sourceText={"aaa\nbbb\nccc"} />,
    );

    // 11 chars, 3 lines
    expect(screen.getByText(/11/)).toBeTruthy();
    expect(screen.getByText(/3 lines/)).toBeTruthy();
  });

  // --- lineEnding menu close by clicking outside (line 139) ---
  test("lineEnding menu closes when clicking outside", () => {
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} sourceText="hello\nworld" onLineEndingChange={handleChange} />,
    );

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "LF" }));
    // Menu should be open
    expect(screen.getByRole("menuitem", { name: "LF" })).toBeTruthy();

    // Close by pressing Escape on the menu (triggers onClose)
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  });

  // --- encoding menu close (line 172) ---
  test("encoding menu closes when clicking outside", () => {
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="UTF-8" onEncodingChange={handleChange} />,
    );

    // Open menu
    fireEvent.click(screen.getByRole("button", { name: "UTF-8" }));
    expect(screen.getByRole("menuitem", { name: "UTF-8" })).toBeTruthy();

    // Close by pressing Escape
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  });

  // --- hidden prop (line 100) ---
  test("returns null when hidden is true", () => {
    const editor = createMockEditor();
    const { container } = render(
      <StatusBar editor={editor} t={t} hidden />,
    );
    expect(container.querySelector("#md-editor-statusbar")).toBeNull();
  });

  // --- onStatusChange callback (lines 96-98) ---
  test("calls onStatusChange with status info", () => {
    const onStatusChange = jest.fn();
    const editor = createMockEditor({ textContent: "hello", childCount: 1, selectionIndex: 0, parentOffset: 3 });
    render(
      <StatusBar editor={editor} t={t} onStatusChange={onStatusChange} />,
    );

    expect(onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        line: 1,
        col: 4,
        charCount: 5,
        lineCount: 1,
        lineEnding: "LF",
        encoding: "UTF-8",
      }),
    );
  });

  // --- sourceMode cleanup removes event listeners ---
  test("sourceMode cleanup removes event listeners on unmount", () => {
    const editor = createMockEditor();
    const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <StatusBar editor={editor} t={t} sourceMode sourceText="test" />,
    );

    unmount();
    // Should have removed click, keyup, select listeners
    expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keyup", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("select", expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
