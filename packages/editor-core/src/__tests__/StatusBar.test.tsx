import { render, screen } from "@testing-library/react";
import { StatusBar } from "../components/StatusBar";

// Editor のモック
function createMockEditor(overrides: {
  textContent?: string;
  childCount?: number;
  selectionIndex?: number;
} = {}) {
  const { textContent = "", childCount = 1, selectionIndex = 0 } = overrides;
  const listeners: Record<string, Array<() => void>> = {};
  return {
    state: {
      selection: {
        $from: {
          index: () => selectionIndex,
        },
      },
      doc: {
        textContent,
        content: {
          childCount,
        },
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

const t = (key: string) => key;

describe("StatusBar", () => {
  test("最小限のpropsでクラッシュせずレンダリングされる", () => {
    const editor = createMockEditor();
    const { container } = render(
      <StatusBar editor={editor} t={t} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  test("行番号と文字数を表示する", () => {
    const editor = createMockEditor({
      textContent: "Hello, World!",
      childCount: 3,
      selectionIndex: 4,
    });
    render(<StatusBar editor={editor} t={t} />);

    // cursorLine は selectionIndex + 1 = 5
    const cursorLineEl = screen.getByText(/cursorLine/);
    expect(cursorLineEl.textContent).toBe("cursorLine 5");
    // 文字数 13
    const charsEl = screen.getByText(/chars/);
    expect(charsEl.textContent).toBe("13 chars");
    // 行数 3
    const linesEl = screen.getByText(/lines/);
    expect(linesEl.textContent).toBe("3 lines");
  });

  test("fileNameが提供された場合に表示する", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} fileName="document.md" />,
    );

    expect(screen.getByText("document.md")).toBeTruthy();
  });

  test("isDirtyがtrueの場合、ダーティインジケータ(*)を表示する", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} fileName="note.md" isDirty={true} />,
    );

    expect(screen.getByText("note.md *")).toBeTruthy();
  });

  test("isDirtyがfalseの場合、ダーティインジケータを表示しない", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} fileName="note.md" isDirty={false} />,
    );

    expect(screen.getByText("note.md")).toBeTruthy();
    expect(screen.queryByText("note.md *")).toBeNull();
  });

  test("fileNameが未指定の場合、ファイル名エリアを表示しない", () => {
    const editor = createMockEditor();
    render(<StatusBar editor={editor} t={t} />);

    // ステータスバーは存在する
    const statusBar = screen.getByRole("contentinfo");
    expect(statusBar).toBeTruthy();

    // ファイル名に対応する要素がないことを確認
    // cursorLine, chars, lines の3つのcaptionのみ
    const captions = statusBar.querySelectorAll(".MuiTypography-caption");
    expect(captions).toHaveLength(3);
  });
});
