import { renderHook, act } from "@testing-library/react";
import { useOutline } from "../hooks/useOutline";
import { extractHeadings } from "../types";
import { moveHeadingSection } from "../utils/sectionHelpers";
import type { Editor } from "@tiptap/react";
import type { HeadingItem } from "../types";

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  extractHeadings: jest.fn(),
}));

jest.mock("../utils/sectionHelpers", () => ({
  moveHeadingSection: jest.fn(),
}));

const mockedExtractHeadings = extractHeadings as jest.MockedFunction<typeof extractHeadings>;
const mockedMoveHeadingSection = moveHeadingSection as jest.MockedFunction<
  typeof moveHeadingSection
>;

function createMockEditor(overrides?: Partial<Editor>): Editor {
  return {
    isEditable: true,
    state: {
      doc: {
        nodeAt: jest.fn(),
        content: { size: 0 },
        descendants: jest.fn(),
      },
    },
    chain: jest.fn(() => ({
      focus: jest.fn().mockReturnThis(),
      setTextSelection: jest.fn().mockReturnThis(),
      command: jest.fn().mockReturnThis(),
      run: jest.fn(),
    })),
    view: {
      domAtPos: jest.fn(() => ({
        node: document.createElement("div"),
      })),
    },
    commands: {
      setFoldedHeadings: jest.fn(),
    },
    ...overrides,
  } as unknown as Editor;
}

function setup(editor: Editor | null = createMockEditor(), sourceMode = false) {
  return renderHook(
    ({ editor: e, sourceMode: s }) => useOutline({ editor: e, sourceMode: s }),
    { initialProps: { editor, sourceMode } },
  );
}

describe("useOutline", () => {
  beforeEach(() => {
    mockedExtractHeadings.mockReset();
    mockedMoveHeadingSection.mockReset();
    mockedExtractHeadings.mockReturnValue([]);
  });

  // --- 初期状態 ---
  describe("初期状態", () => {
    test("outlineOpen は false", () => {
      const { result } = setup();
      expect(result.current.outlineOpen).toBe(false);
    });

    test("headings は空配列", () => {
      const { result } = setup();
      expect(result.current.headings).toEqual([]);
    });

    test("foldedIndices は空Set", () => {
      const { result } = setup();
      expect(result.current.foldedIndices.size).toBe(0);
    });

    test("hiddenByFold は空Set", () => {
      const { result } = setup();
      expect(result.current.hiddenByFold.size).toBe(0);
    });

    test("outlineWidth のデフォルトは 220", () => {
      const { result } = setup();
      expect(result.current.outlineWidth).toBe(220);
    });
  });

  // --- アウトライン表示切替 ---
  describe("handleToggleOutline", () => {
    test("トグルで outlineOpen が true に変わる", () => {
      const { result } = setup();
      act(() => result.current.handleToggleOutline());
      expect(result.current.outlineOpen).toBe(true);
    });

    test("2回トグルで false に戻る", () => {
      const { result } = setup();
      act(() => result.current.handleToggleOutline());
      act(() => result.current.handleToggleOutline());
      expect(result.current.outlineOpen).toBe(false);
    });
  });

  // --- 見出し更新 ---
  describe("headings の更新", () => {
    test("setHeadings で見出しリストを更新できる", () => {
      const { result } = setup();
      const items: HeadingItem[] = [
        { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
        { level: 2, text: "Section", pos: 10, kind: "heading", headingIndex: 1 },
      ];
      act(() => result.current.setHeadings(items));
      expect(result.current.headings).toEqual(items);
    });

    test("sourceMode=false でマウント時に extractHeadings が呼ばれる", () => {
      const editor = createMockEditor();
      setup(editor, false);
      expect(mockedExtractHeadings).toHaveBeenCalledWith(editor);
    });

    test("sourceMode→false に切り替わると extractHeadings が再呼出される", () => {
      const editor = createMockEditor();
      const headingsData: HeadingItem[] = [
        { level: 1, text: "Title", pos: 0, kind: "heading", headingIndex: 0 },
      ];
      mockedExtractHeadings.mockReturnValue(headingsData);

      const { result, rerender } = setup(editor, true);
      // sourceMode=true の間は呼ばれない
      expect(mockedExtractHeadings).not.toHaveBeenCalled();

      rerender({ editor, sourceMode: false });
      expect(mockedExtractHeadings).toHaveBeenCalledWith(editor);
      expect(result.current.headings).toEqual(headingsData);
    });
  });

  // --- 折りたたみ ---
  describe("toggleFold / foldAll / unfoldAll", () => {
    test("toggleFold でインデックスを折りたたむ", () => {
      const { result } = setup();
      act(() => result.current.toggleFold(0));
      expect(result.current.foldedIndices.has(0)).toBe(true);
    });

    test("toggleFold 同じインデックスを再度呼ぶと展開される", () => {
      const { result } = setup();
      act(() => result.current.toggleFold(0));
      act(() => result.current.toggleFold(0));
      expect(result.current.foldedIndices.has(0)).toBe(false);
    });

    test("foldAll で全 heading の headingIndex を折りたたむ", () => {
      const { result } = setup();
      const items: HeadingItem[] = [
        { level: 1, text: "H1", pos: 0, kind: "heading", headingIndex: 0 },
        { level: 2, text: "H2", pos: 10, kind: "heading", headingIndex: 1 },
        { level: 6, text: "Code", pos: 20, kind: "codeBlock" },
      ];
      act(() => result.current.setHeadings(items));
      act(() => result.current.foldAll());
      expect(result.current.foldedIndices.has(0)).toBe(true);
      expect(result.current.foldedIndices.has(1)).toBe(true);
      // codeBlock は headingIndex を持たないので含まれない
      expect(result.current.foldedIndices.size).toBe(2);
    });

    test("unfoldAll で全展開", () => {
      const { result } = setup();
      act(() => result.current.toggleFold(0));
      act(() => result.current.toggleFold(1));
      act(() => result.current.unfoldAll());
      expect(result.current.foldedIndices.size).toBe(0);
    });
  });

  // --- hiddenByFold ---
  describe("hiddenByFold 計算", () => {
    test("折りたたまれた見出しの下位項目が hiddenByFold に含まれる", () => {
      const { result } = setup();
      const items: HeadingItem[] = [
        { level: 1, text: "H1", pos: 0, kind: "heading", headingIndex: 0 },
        { level: 2, text: "H2", pos: 10, kind: "heading", headingIndex: 1 },
        { level: 6, text: "Code", pos: 20, kind: "codeBlock" },
        { level: 1, text: "H1-2", pos: 30, kind: "heading", headingIndex: 2 },
      ];
      act(() => result.current.setHeadings(items));
      // H1(index=0) を折りたたむ → H2, Code が隠れるが H1-2 は同レベルなので隠れない
      act(() => result.current.toggleFold(0));
      expect(result.current.hiddenByFold.has(1)).toBe(true); // H2
      expect(result.current.hiddenByFold.has(2)).toBe(true); // Code
      expect(result.current.hiddenByFold.has(3)).toBe(false); // H1-2
    });

    test("折りたたみなしの場合 hiddenByFold は空", () => {
      const { result } = setup();
      const items: HeadingItem[] = [
        { level: 1, text: "H1", pos: 0, kind: "heading", headingIndex: 0 },
        { level: 2, text: "H2", pos: 10, kind: "heading", headingIndex: 1 },
      ];
      act(() => result.current.setHeadings(items));
      expect(result.current.hiddenByFold.size).toBe(0);
    });
  });

  // --- foldedIndices と editor.commands.setFoldedHeadings の連動 ---
  describe("setFoldedHeadings コマンド連動", () => {
    test("foldedIndices 変更時に editor.commands.setFoldedHeadings が呼ばれる", () => {
      const editor = createMockEditor();
      const { result } = setup(editor, false);
      act(() => result.current.toggleFold(0));
      expect(
        (editor as unknown as { commands: { setFoldedHeadings: jest.Mock } }).commands
          .setFoldedHeadings,
      ).toHaveBeenCalled();
    });

    test("sourceMode=true の時は空Setで setFoldedHeadings が呼ばれる", () => {
      const editor = createMockEditor();
      setup(editor, true);
      const mock = (editor as unknown as { commands: { setFoldedHeadings: jest.Mock } }).commands
        .setFoldedHeadings;
      // sourceMode=true のときは空Setが渡される
      const calls = mock.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].size).toBe(0);
    });
  });

  // --- handleHeadingDragEnd ---
  describe("handleHeadingDragEnd", () => {
    test("moveHeadingSection を呼び出す", () => {
      const editor = createMockEditor();
      const { result } = setup(editor, false);
      const items: HeadingItem[] = [
        { level: 1, text: "H1", pos: 0, kind: "heading", headingIndex: 0 },
        { level: 1, text: "H2", pos: 10, kind: "heading", headingIndex: 1 },
      ];
      act(() => result.current.setHeadings(items));
      act(() => result.current.handleHeadingDragEnd(0, 1));
      expect(mockedMoveHeadingSection).toHaveBeenCalledWith(editor, items, 0, 1);
    });

    test("editor が null の場合は何もしない", () => {
      const { result } = setup(null);
      act(() => result.current.handleHeadingDragEnd(0, 1));
      expect(mockedMoveHeadingSection).not.toHaveBeenCalled();
    });
  });

  // --- handleOutlineClick ---
  describe("handleOutlineClick", () => {
    test("editor.chain().focus().setTextSelection(pos).run() を呼ぶ", () => {
      const run = jest.fn();
      const setTextSelection = jest.fn().mockReturnValue({ run });
      const focus = jest.fn().mockReturnValue({ setTextSelection });
      const chain = jest.fn().mockReturnValue({ focus });
      const scrollIntoView = jest.fn();
      const el = document.createElement("div");
      el.scrollIntoView = scrollIntoView;

      const editor = createMockEditor({
        chain,
        view: {
          domAtPos: jest.fn(() => ({ node: el })),
        },
      } as unknown as Partial<Editor>);

      const { result } = setup(editor, false);
      act(() => result.current.handleOutlineClick(42));

      expect(chain).toHaveBeenCalled();
      expect(focus).toHaveBeenCalled();
      expect(setTextSelection).toHaveBeenCalledWith(42);
      expect(run).toHaveBeenCalled();
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    });

    test("editor が null の場合は何もしない", () => {
      const { result } = setup(null);
      // エラーが起きないことを確認
      act(() => result.current.handleOutlineClick(0));
    });
  });

  // --- handleOutlineDelete ---
  describe("handleOutlineDelete", () => {
    test("editor が null の場合は何もしない", () => {
      const { result } = setup(null);
      act(() => result.current.handleOutlineDelete(0, "heading"));
      // エラーが起きないことを確認
    });

    test("nodeAt が null を返す場合は何もしない", () => {
      const editor = createMockEditor();
      (editor.state.doc.nodeAt as jest.Mock).mockReturnValue(null);
      const { result } = setup(editor, false);
      act(() => result.current.handleOutlineDelete(0, "heading"));
      expect((editor.chain as jest.Mock)).not.toHaveBeenCalled();
    });

    test("heading 削除時は chain().focus().command().run() を呼ぶ", () => {
      const run = jest.fn();
      const command = jest.fn().mockReturnValue({ run });
      const focus = jest.fn().mockReturnValue({ command });
      const chain = jest.fn().mockReturnValue({ focus });
      const nodeAt = jest.fn();

      // heading ノード（level 1, nodeSize=10）の後にコンテンツなし
      nodeAt.mockImplementation((pos: number) => {
        if (pos === 0) return { type: { name: "heading" }, attrs: { level: 1 }, nodeSize: 10 };
        return null;
      });

      const editor = createMockEditor({
        chain,
        state: {
          doc: {
            nodeAt,
            content: { size: 10 },
          },
        },
      } as unknown as Partial<Editor>);

      const { result } = setup(editor, false);
      act(() => result.current.handleOutlineDelete(0, "heading"));

      expect(chain).toHaveBeenCalled();
      expect(focus).toHaveBeenCalled();
      expect(command).toHaveBeenCalled();
      expect(run).toHaveBeenCalled();
    });

    test("heading 以外の削除時も chain().focus().command().run() を呼ぶ", () => {
      const run = jest.fn();
      const command = jest.fn().mockReturnValue({ run });
      const focus = jest.fn().mockReturnValue({ command });
      const chain = jest.fn().mockReturnValue({ focus });
      const nodeAt = jest.fn().mockReturnValue({
        type: { name: "codeBlock" },
        attrs: {},
        nodeSize: 5,
      });

      const editor = createMockEditor({
        chain,
        state: {
          doc: {
            nodeAt,
            content: { size: 20 },
          },
        },
      } as unknown as Partial<Editor>);

      const { result } = setup(editor, false);
      act(() => result.current.handleOutlineDelete(0, "codeBlock"));

      expect(chain).toHaveBeenCalled();
      expect(run).toHaveBeenCalled();
    });
  });

  // --- outlineWidth ---
  describe("outlineWidth", () => {
    test("setOutlineWidth で幅を変更できる", () => {
      const { result } = setup();
      act(() => result.current.setOutlineWidth(300));
      expect(result.current.outlineWidth).toBe(300);
    });
  });
});
