import { render, screen, fireEvent } from "@testing-library/react";
import { EditorToolbar } from "../components/EditorToolbar";

// next-intl モック
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// @tiptap/react モック - useEditorState をスタブ化
jest.mock("@tiptap/react", () => ({
  useEditorState: () => ({
    canUndo: false,
    canRedo: false,
    isCodeBlock: false,
    isInDiagramCode: false,
    allBlocksCollapsed: false,
    hasBlocks: false,
    allDiagramCodeCollapsed: false,
    hasDiagrams: false,
  }),
}));

// SearchReplaceBar モック
jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => null,
}));

const t = (key: string) => key;

/** テスト用の最小限 props を生成 */
function createDefaultProps(overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
  return {
    editor: null,
    isInDiagramBlock: false,
    onImage: jest.fn(),
    onToggleAllBlocks: jest.fn(),
    onToggleDiagramCode: jest.fn(),
    onCopy: jest.fn(),
    onDownload: jest.fn(),
    onImport: jest.fn(),
    onClear: jest.fn(),
    copied: false,
    onSetDiagramAnchor: jest.fn(),
    onSetTemplateAnchor: jest.fn(),
    onSetHelpAnchor: jest.fn(),
    sourceMode: false,
    outlineOpen: false,
    onToggleOutline: jest.fn(),
    onMerge: jest.fn(),
    inlineMergeOpen: false,
    onSwitchToSource: jest.fn(),
    onSwitchToWysiwyg: jest.fn(),
    t,
    ...overrides,
  };
}

describe("EditorToolbar", () => {
  test("最小限のpropsでクラッシュせずレンダリングされる", () => {
    const props = createDefaultProps();
    const { container } = render(<EditorToolbar {...props} />);
    expect(container.firstChild).toBeTruthy();
  });

  test("新規ドキュメントボタンをクリックするとonClearが呼ばれる", () => {
    const onClear = jest.fn();
    const props = createDefaultProps({ onClear });
    render(<EditorToolbar {...props} />);

    const btn = screen.getByLabelText("createNew");
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("コピーボタンをクリックするとonCopyが呼ばれる", () => {
    const onCopy = jest.fn();
    const props = createDefaultProps({ onCopy });
    render(<EditorToolbar {...props} />);

    const btn = screen.getByLabelText("copy");
    fireEvent.click(btn);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  test("supportsDirectAccess=true のとき、ファイルシステムボタン（open/save/saveAs）を表示する", () => {
    const props = createDefaultProps({
      supportsDirectAccess: true,
      onOpenFile: jest.fn(),
      onSaveFile: jest.fn(),
      onSaveAsFile: jest.fn(),
    });
    render(<EditorToolbar {...props} />);

    expect(screen.getByLabelText("openFile")).toBeTruthy();
    expect(screen.getByLabelText("saveFile")).toBeTruthy();
    expect(screen.getByLabelText("saveAsFile")).toBeTruthy();

    // レガシーボタンは表示されない
    expect(screen.queryByLabelText("upload")).toBeNull();
    expect(screen.queryByLabelText("download")).toBeNull();
  });

  test("supportsDirectAccess=false のとき、レガシーボタン（upload/download）を表示する", () => {
    const props = createDefaultProps({ supportsDirectAccess: false });
    render(<EditorToolbar {...props} />);

    expect(screen.getByLabelText("upload")).toBeTruthy();
    expect(screen.getByLabelText("download")).toBeTruthy();

    // ファイルシステムボタンは表示されない
    expect(screen.queryByLabelText("openFile")).toBeNull();
    expect(screen.queryByLabelText("saveFile")).toBeNull();
    expect(screen.queryByLabelText("saveAsFile")).toBeNull();
  });

  test("hasFileHandle=false のとき、保存ボタンが無効化される", () => {
    const props = createDefaultProps({
      supportsDirectAccess: true,
      onOpenFile: jest.fn(),
      onSaveFile: jest.fn(),
      onSaveAsFile: jest.fn(),
      hasFileHandle: false,
    });
    render(<EditorToolbar {...props} />);

    const saveBtn = screen.getByLabelText("saveFile");
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  test("supportsDirectAccess=true のとき、openボタンをクリックするとonOpenFileが呼ばれる", () => {
    const onOpenFile = jest.fn();
    const props = createDefaultProps({
      supportsDirectAccess: true,
      onOpenFile,
      onSaveFile: jest.fn(),
      onSaveAsFile: jest.fn(),
    });
    render(<EditorToolbar {...props} />);

    const btn = screen.getByLabelText("openFile");
    fireEvent.click(btn);
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });
});
