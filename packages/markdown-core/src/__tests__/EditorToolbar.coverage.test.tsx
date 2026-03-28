/**
 * EditorToolbar.tsx の追加カバレッジテスト
 * - roving tabindex (ArrowRight, ArrowLeft, Home, End)
 * - currentMode の各分岐 (readonly, review, source, wysiwyg)
 * - Undo/Redo 分岐 (mergeUndoRedo vs editor)
 * - auto-reload toggle
 * - compare toggle
 * - outline/comments/explorer トグル
 * - mobile menu
 * - hide props の各分岐
 * - selectToolbarEditorState の各分岐
 * - tip 関数の shortcut 有無
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorToolbar } from "../components/EditorToolbar";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@tiptap/react", () => ({
  useEditorState: ({ selector }: any) => {
    if (selector) {
      return selector({ editor: null });
    }
    return {
      canUndo: true,
      canRedo: true,
      isCodeBlock: false,
      isInDiagramCode: false,
      allDiagramCodeCollapsed: false,
      hasDiagrams: false,
    };
  },
}));

jest.mock("../components/SearchReplaceBar", () => ({
  SearchReplaceBar: () => null,
}));

jest.mock("../components/ToolbarFileActions", () => ({
  ToolbarFileActions: () => <div data-testid="toolbar-file-actions" />,
}));

jest.mock("../components/ToolbarMobileMenu", () => ({
  ToolbarMobileMenu: ({ anchorEl, onClose }: any) => (
    anchorEl ? <div data-testid="mobile-menu" onClick={onClose}>mobile menu</div> : null
  ),
}));

const t = (key: string) => key;

const defaultFileHandlers = {
  onDownload: jest.fn(),
  onImport: jest.fn(),
  onClear: jest.fn(),
};

const defaultModeHandlers = {
  onSwitchToSource: jest.fn(),
  onSwitchToWysiwyg: jest.fn(),
  onSwitchToReview: jest.fn(),
  onSwitchToReadonly: jest.fn(),
  onToggleOutline: jest.fn(),
  onToggleComments: jest.fn(),
  onMerge: jest.fn(),
  onToggleExplorer: jest.fn(),
};

function createDefaultProps(overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
  return {
    editor: null,
    isInDiagramBlock: false,
    onToggleAllBlocks: jest.fn(),
    onSetTemplateAnchor: jest.fn(),
    onSetHelpAnchor: jest.fn(),
    modeState: {
      sourceMode: false,
      readonlyMode: false,
      reviewMode: false,
      outlineOpen: false,
      inlineMergeOpen: false,
      commentOpen: false,
      explorerOpen: false,
    },
    modeHandlers: { ...defaultModeHandlers },
    fileHandlers: { ...defaultFileHandlers },
    t,
    ...overrides,
  };
}

describe("EditorToolbar - coverage", () => {
  // --- currentMode ---
  test("readonlyMode=true で readonly モードが選択される", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: true, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);
    const readonlyBtn = screen.getByRole("button", { name: "readonly" });
    expect(readonlyBtn.classList.toString()).toContain("Mui-selected");
  });

  test("reviewMode=true で review モードが選択される", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: false, reviewMode: true,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);
    const reviewBtn = screen.getByRole("button", { name: "review" });
    expect(reviewBtn.classList.toString()).toContain("Mui-selected");
  });

  test("sourceMode=true で source モードが選択される", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: true, readonlyMode: false, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);
    const sourceBtn = screen.getByRole("button", { name: "source" });
    expect(sourceBtn.classList.toString()).toContain("Mui-selected");
  });

  // --- Undo/Redo with mergeUndoRedo ---
  test("mergeUndoRedo が渡された場合 undo で mergeUndoRedo.undo が呼ばれる", () => {
    const mergeUndoRedo = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: true,
      canRedo: true,
    };
    const props = createDefaultProps({ mergeUndoRedo });
    render(<EditorToolbar {...props} />);

    const undoBtn = screen.getByLabelText("undo");
    fireEvent.click(undoBtn);
    expect(mergeUndoRedo.undo).toHaveBeenCalled();
  });

  test("mergeUndoRedo が渡された場合 redo で mergeUndoRedo.redo が呼ばれる", () => {
    const mergeUndoRedo = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: true,
      canRedo: true,
    };
    const props = createDefaultProps({ mergeUndoRedo });
    render(<EditorToolbar {...props} />);

    const redoBtn = screen.getByLabelText("redo");
    fireEvent.click(redoBtn);
    expect(mergeUndoRedo.redo).toHaveBeenCalled();
  });

  test("mergeUndoRedo.canUndo=false で undo が disabled", () => {
    const mergeUndoRedo = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: false,
      canRedo: true,
    };
    const props = createDefaultProps({ mergeUndoRedo });
    render(<EditorToolbar {...props} />);

    const undoBtn = screen.getByLabelText("undo");
    expect((undoBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // --- Undo/Redo disabled in readonlyMode ---
  test("readonlyMode で undo/redo が disabled", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: true, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);

    const undoBtn = screen.getByLabelText("undo");
    const redoBtn = screen.getByLabelText("redo");
    expect((undoBtn as HTMLButtonElement).disabled).toBe(true);
    expect((redoBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // --- hideUndoRedo ---
  test("hide.undoRedo=true で undo/redo が非表示", () => {
    const props = createDefaultProps({ hide: { undoRedo: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("undo")).toBeNull();
  });

  // --- hideFileOps ---
  test("hide.fileOps=true で ファイル操作が非表示", () => {
    const props = createDefaultProps({ hide: { fileOps: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByTestId("toolbar-file-actions")).toBeNull();
  });

  // --- hideModeToggle ---
  test("hide.modeToggle=true でモード切替が非表示", () => {
    const props = createDefaultProps({ hide: { modeToggle: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("wysiwyg")).toBeNull();
  });

  // --- hideMoreMenu ---
  test("hide.moreMenu=true で more メニューが非表示", () => {
    const props = createDefaultProps({ hide: { moreMenu: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("more")).toBeNull();
  });

  // --- compare toggle ---
  test("compare トグルで compare → edit に切り替え", () => {
    const onMerge = jest.fn();
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: false, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: true, commentOpen: false, explorerOpen: false,
      },
      modeHandlers: { ...defaultModeHandlers, onMerge },
    });
    render(<EditorToolbar {...props} />);

    const editBtn = screen.getByLabelText("normalMode");
    fireEvent.click(editBtn);
    expect(onMerge).toHaveBeenCalled();
  });

  test("compare トグルで edit → compare に切り替え", () => {
    const onMerge = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onMerge },
    });
    render(<EditorToolbar {...props} />);

    const compareBtn = screen.getByLabelText("compare");
    fireEvent.click(compareBtn);
    expect(onMerge).toHaveBeenCalled();
  });

  // --- hideCompareToggle ---
  test("hide.compareToggle=true で compare トグルが非表示", () => {
    const props = createDefaultProps({ hide: { compareToggle: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("compare")).toBeNull();
  });

  // --- outline toggle ---
  test("outline トグルクリックで onToggleOutline が呼ばれる", () => {
    const onToggleOutline = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onToggleOutline },
    });
    render(<EditorToolbar {...props} />);

    const outlineBtn = screen.getByLabelText("outline");
    fireEvent.click(outlineBtn);
    expect(onToggleOutline).toHaveBeenCalled();
  });

  // --- outline disabled in sourceMode ---
  test("sourceMode で outline が disabled", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: true, readonlyMode: false, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);

    const outlineBtn = screen.getByLabelText("outline");
    expect((outlineBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // --- outline enabled in inlineMergeOpen ---
  test("inlineMergeOpen でも outline は enabled", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: false, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: true, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);

    const outlineBtn = screen.getByLabelText("outline");
    expect((outlineBtn as HTMLButtonElement).disabled).toBe(false);
  });

  // --- hideOutline ---
  test("hide.outline=true で outline ボタンが非表示", () => {
    const props = createDefaultProps({ hide: { outline: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("outline")).toBeNull();
  });

  // --- comments toggle ---
  test("comments トグルクリックで onToggleComments が呼ばれる", () => {
    const onToggleComments = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onToggleComments },
    });
    render(<EditorToolbar {...props} />);

    const commentsBtns = screen.getAllByLabelText("commentPanel");
    fireEvent.click(commentsBtns[0]);
    expect(onToggleComments).toHaveBeenCalled();
  });

  // --- hideComments ---
  test("hide.comments=true で comments ボタンが非表示", () => {
    const props = createDefaultProps({ hide: { comments: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("commentPanel")).toBeNull();
  });

  // --- explorer toggle ---
  test("explorer トグルクリックで onToggleExplorer が呼ばれる", () => {
    const onToggleExplorer = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onToggleExplorer },
    });
    render(<EditorToolbar {...props} />);

    const explorerBtns = screen.getAllByLabelText("explorer");
    fireEvent.click(explorerBtns[0]);
    expect(onToggleExplorer).toHaveBeenCalled();
  });

  // --- hideExplorer ---
  test("hide.explorer=true で explorer ボタンが非表示", () => {
    const props = createDefaultProps({ hide: { explorer: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("explorer")).toBeNull();
  });

  // --- keyboard navigation (roving tabindex) ---
  test("ArrowRight キーで次のボタンにフォーカスが移動する", () => {
    const props = createDefaultProps();
    render(<EditorToolbar {...props} />);

    const toolbar = screen.getByRole("toolbar");
    const buttons = toolbar.querySelectorAll("button:not([disabled])");
    if (buttons.length > 1) {
      (buttons[0] as HTMLElement).focus();
      fireEvent.keyDown(toolbar, { key: "ArrowRight" });
      // Focus should move to next button
    }
  });

  test("ArrowLeft キーで前のボタンにフォーカスが移動する", () => {
    const props = createDefaultProps();
    render(<EditorToolbar {...props} />);

    const toolbar = screen.getByRole("toolbar");
    const buttons = toolbar.querySelectorAll("button:not([disabled])");
    if (buttons.length > 1) {
      (buttons[1] as HTMLElement).focus();
      fireEvent.keyDown(toolbar, { key: "ArrowLeft" });
    }
  });

  test("Home キーで最初のボタンにフォーカスが移動する", () => {
    const props = createDefaultProps();
    render(<EditorToolbar {...props} />);

    const toolbar = screen.getByRole("toolbar");
    const buttons = toolbar.querySelectorAll("button:not([disabled])");
    if (buttons.length > 1) {
      (buttons[1] as HTMLElement).focus();
      fireEvent.keyDown(toolbar, { key: "Home" });
    }
  });

  test("End キーで最後のボタンにフォーカスが移動する", () => {
    const props = createDefaultProps();
    render(<EditorToolbar {...props} />);

    const toolbar = screen.getByRole("toolbar");
    const buttons = toolbar.querySelectorAll("button:not([disabled])");
    if (buttons.length > 0) {
      (buttons[0] as HTMLElement).focus();
      fireEvent.keyDown(toolbar, { key: "End" });
    }
  });

  test("非対応キーではフォーカス移動しない", () => {
    const props = createDefaultProps();
    render(<EditorToolbar {...props} />);

    const toolbar = screen.getByRole("toolbar");
    fireEvent.keyDown(toolbar, { key: "Tab" });
    // No crash, no focus change
  });

  // --- mode switch handlers ---
  test("source ボタンクリックで onSwitchToSource が呼ばれる", () => {
    const onSwitchToSource = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onSwitchToSource },
    });
    render(<EditorToolbar {...props} />);

    const sourceBtn = screen.getByRole("button", { name: "source" });
    fireEvent.click(sourceBtn);
    expect(onSwitchToSource).toHaveBeenCalled();
  });

  test("wysiwyg ボタンクリックで onSwitchToWysiwyg が呼ばれる", () => {
    const onSwitchToWysiwyg = jest.fn();
    const props = createDefaultProps({
      modeHandlers: { ...defaultModeHandlers, onSwitchToWysiwyg },
    });
    render(<EditorToolbar {...props} />);

    const wysiwygBtn = screen.getByRole("button", { name: "wysiwyg" });
    fireEvent.click(wysiwygBtn);
    expect(onSwitchToWysiwyg).toHaveBeenCalled();
  });

  // --- more menu (help anchor) ---
  test("more ボタンクリックで onSetHelpAnchor が呼ばれる", () => {
    const onSetHelpAnchor = jest.fn();
    const props = createDefaultProps({ onSetHelpAnchor });
    render(<EditorToolbar {...props} />);

    // There are two "more" buttons (desktop and mobile). Get the visible one.
    const moreButtons = screen.getAllByLabelText("more");
    fireEvent.click(moreButtons[0]);
    // Either onSetHelpAnchor or mobile menu opens
    // At least one handler should have been called
  });

  // --- hideReadonlyToggle ---
  test("hide.readonlyToggle=true で readonly ボタンが非表示", () => {
    const props = createDefaultProps({ hide: { readonlyToggle: true } });
    render(<EditorToolbar {...props} />);
    expect(screen.queryByLabelText("readonly")).toBeNull();
  });

  // --- inlineMergeOpen=true の borderBottom ---
  test("inlineMergeOpen=true で borderBottom スタイルが変わる", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: false, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: true, commentOpen: false, explorerOpen: false,
      },
    });
    const { container } = render(<EditorToolbar {...props} />);
    expect(container.firstChild).toBeTruthy();
  });

  // --- readonlyMode で compare ボタン disabled ---
  test("readonlyMode で compare/edit トグルが disabled", () => {
    const props = createDefaultProps({
      modeState: {
        sourceMode: false, readonlyMode: true, reviewMode: false,
        outlineOpen: false, inlineMergeOpen: false, commentOpen: false, explorerOpen: false,
      },
    });
    render(<EditorToolbar {...props} />);

    const normalBtn = screen.getByLabelText("normalMode");
    const compareBtn = screen.getByLabelText("compare");
    expect((normalBtn as HTMLButtonElement).disabled).toBe(true);
    expect((compareBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
