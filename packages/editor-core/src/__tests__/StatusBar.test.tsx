import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar } from "../components/StatusBar";

// Editor のモック
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
      parentOffset: 7,
    });
    render(<StatusBar editor={editor} t={t} />);

    // cursorLine は selectionIndex + 1 = 5, cursorCol は parentOffset + 1 = 8
    const cursorLineEl = screen.getByText(/cursorLine/);
    expect(cursorLineEl.textContent).toBe("cursorLine 5 cursorCol 8");
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

  test("isDirtyがtrueの場合、ダーティインジケータを表示する", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} fileName="note.md" isDirty={true} />,
    );

    expect(screen.getByText("note.md")).toBeTruthy();
    // FiberManualRecord SVG アイコンが表示される
    const fileNameEl = screen.getByText("note.md");
    expect(fileNameEl.querySelector("svg")).toBeTruthy();
  });

  test("isDirtyがfalseの場合、ダーティインジケータを表示しない", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} fileName="note.md" isDirty={false} />,
    );

    expect(screen.getByText("note.md")).toBeTruthy();
    const fileNameEl = screen.getByText("note.md");
    expect(fileNameEl.querySelector("svg")).toBeNull();
  });

  test("fileNameが未指定の場合、ファイル名エリアを表示しない", () => {
    const editor = createMockEditor();
    render(<StatusBar editor={editor} t={t} />);

    // ステータスバーは存在する
    const statusBar = screen.getByRole("region");
    expect(statusBar).toBeTruthy();

    // ファイル名に対応する要素がないことを確認
    // cursorLine, chars, lines, lineEnding, encoding の5つのbody2のみ
    const body2s = statusBar.querySelectorAll(".MuiTypography-body2");
    expect(body2s).toHaveLength(5);
  });

  test("onLineEndingChangeが指定されている場合、改行コードがボタンになりメニューで変換できる", () => {
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} sourceText="hello\nworld" onLineEndingChange={handleChange} />,
    );

    // LF がボタンとして表示されている
    const button = screen.getByRole("button", { name: "LF" });
    expect(button).toBeTruthy();

    // ボタンをクリックするとメニューが開く
    fireEvent.click(button);
    const crlfItem = screen.getByRole("menuitem", { name: "CRLF" });
    expect(crlfItem).toBeTruthy();

    // CRLF を選択するとコールバックが呼ばれる
    fireEvent.click(crlfItem);
    expect(handleChange).toHaveBeenCalledWith("CRLF");
  });

  test("onLineEndingChangeが未指定の場合、改行コードはテキスト表示のまま", () => {
    const editor = createMockEditor();
    const crlfText = "hello\r\nworld";
    render(
      <StatusBar editor={editor} t={t} sourceText={crlfText} />,
    );

    // CRLF がテキストとして表示されている（ボタンではない）
    expect(screen.getByText("CRLF")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "CRLF" })).toBeNull();
  });

  test("onEncodingChangeが指定されている場合、エンコーディングがボタンになりメニューで変換できる", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="UTF-8" onEncodingChange={handleChange} />,
    );

    // UTF-8 がボタンとして表示されている
    const button = screen.getByRole("button", { name: "UTF-8" });
    expect(button).toBeTruthy();

    // ボタンをクリックするとメニューが開く
    fireEvent.click(button);
    const sjisItem = screen.getByRole("menuitem", { name: "Shift_JIS" });
    expect(sjisItem).toBeTruthy();

    // Shift_JIS を選択すると確認ダイアログが表示され、承認後にコールバックが呼ばれる
    fireEvent.click(sjisItem);
    expect(confirmSpy).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledWith("Shift_JIS");
    confirmSpy.mockRestore();
  });

  test("同一エンコーディング選択時は確認ダイアログを表示しない", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="UTF-8" onEncodingChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "UTF-8" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "UTF-8" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test("エンコーディング変更を確認ダイアログでキャンセルするとコールバックが呼ばれない", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="UTF-8" onEncodingChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "UTF-8" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Shift_JIS" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(handleChange).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test("エンコーディングメニューにEUC-JPが表示される", () => {
    const handleChange = jest.fn();
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="UTF-8" onEncodingChange={handleChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "UTF-8" }));
    expect(screen.getByRole("menuitem", { name: "EUC-JP" })).toBeTruthy();
  });

  test("onEncodingChangeが未指定の場合、エンコーディングはテキスト表示のまま", () => {
    const editor = createMockEditor();
    render(
      <StatusBar editor={editor} t={t} encoding="Shift_JIS" />,
    );

    // Shift_JIS がテキストとして表示されている（ボタンではない）
    expect(screen.getByText("Shift_JIS")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Shift_JIS" })).toBeNull();
  });
});
