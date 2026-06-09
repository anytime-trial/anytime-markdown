/**
 * CodeDialogHost.tsx — code ダイアログ host（React）のテスト。
 * vanilla chrome の onSelect / intent で編集ダイアログ・削除を駆動することを検証する。
 * 図描画フック・全画面ダイアログ・barrel・ui は mock。
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

const createCodeBlockChrome = jest.fn(() => jest.fn());
const deleteBlockAt = jest.fn();

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  deleteBlockAt,
  setBlockAttrs: jest.fn(),
  buildEmbedInfoString: jest.fn(() => "embed"),
  parseEmbedInfoString: jest.fn(() => ({ variant: "card", width: null })),
  useEditorFeaturesContext: () => ({ hideGraph: false }),
  useEditorSettingsContext: () => ({ fontSize: 14, lineHeight: 1.6 }),
  useIsDark: () => false,
  useMarkdownT: () => (k: string) => k,
  DeleteBlockDialog: ({ open, onDelete }: any) =>
    open ? <button data-testid="confirm-delete" onClick={onDelete}>confirm</button> : null,
  DiscardDialog: ({ open }: any) => (open ? <div data-testid="discard" /> : null),
  EmbedEditDialog: ({ open }: any) => (open ? <div data-testid="embed-dialog" /> : null),
}));
jest.mock("@anytime-markdown/markdown-viewer/src/ui/Button", () => ({ Button: (p: any) => <button {...p} /> }));
jest.mock("@anytime-markdown/markdown-viewer/src/ui/Dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogActions: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogContentText: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("../components/codeblock/codeBlockChrome", () => ({ createCodeBlockChrome }));
jest.mock("../components/codeblock/CodeBlockBlockContent", () => ({
  classifyCodeBlock: (lang: unknown) => (lang === "mermaid" ? "diagram" : "regular"),
}));
jest.mock("../components/codeblock/codeBlockOverlayHelpers", () => ({
  codeBlockToolbarLabel: () => "Code",
  firstNonEmptyLine: () => "",
}));
jest.mock("../components/codeblock/embedPreviewMount", () => ({ parseBaseline: () => null }));
jest.mock("../components/codeblock/useCodeBlockEdit", () => ({
  applyCodeBlockText: jest.fn(),
  useCodeBlockEdit: () => ({
    code: "",
    fsCode: "",
    onFsCodeChange: jest.fn(),
    onFsTextChange: jest.fn(),
    fsTextareaRef: { current: null },
    fsSearch: { reset: jest.fn() },
    onApply: jest.fn(),
    fsDirty: false,
    tryCloseEdit: jest.fn(),
    discardOpen: false,
    setDiscardOpen: jest.fn(),
    handleDiscardConfirm: jest.fn(),
  }),
}));
jest.mock("../components/codeblock/types", () => ({ HTML_SANITIZE_CONFIG: {} }));
jest.mock("../components/CodeBlockEditDialog", () => ({
  CodeBlockEditDialog: ({ open }: any) => (open ? <div data-testid="code-edit-dialog" /> : null),
}));
jest.mock("../components/MathEditDialog", () => ({ MathEditDialog: () => null }));
jest.mock("../components/MermaidEditDialog", () => ({ MermaidEditDialog: () => null }));
jest.mock("../components/PlantUmlEditDialog", () => ({ PlantUmlEditDialog: () => null }));
jest.mock("../constants/htmlSamples.json", () => [], { virtual: true });
jest.mock("../hooks/useDiagramCapture", () => ({ useDiagramCapture: () => ({ handleCapture: jest.fn(), handleExportSource: jest.fn() }) }));
jest.mock("../hooks/useMermaidRender", () => ({ useMermaidRender: () => ({ svg: "" }) }));
jest.mock("../hooks/usePlantUmlRender", () => ({ usePlantUmlRender: () => ({ plantUmlUrl: "" }) }));
jest.mock("../hooks/useZoomPan", () => ({ useZoomPan: () => ({}) }));

import { CodeDialogHost } from "../components/CodeDialogHost";

const mockEditor = { isEditable: true } as any;
const codeNode = { attrs: { language: "js" }, content: { size: 0 } } as any;

function cb() {
  const calls = createCodeBlockChrome.mock.calls as any[];
  return calls[calls.length - 1][1] as {
    onSelect: (pos: number, node: any) => void;
    onEdit: (pos: number) => void;
    onDelete: (pos: number) => void;
  };
}

describe("CodeDialogHost", () => {
  beforeEach(() => {
    createCodeBlockChrome.mockClear();
    deleteBlockAt.mockClear();
  });

  it("editor が null なら chrome を生成しない", () => {
    render(<CodeDialogHost editor={null} />);
    expect(createCodeBlockChrome).not.toHaveBeenCalled();
  });

  it("onSelect + onEdit intent で regular 編集ダイアログを開く", () => {
    render(<CodeDialogHost editor={mockEditor} />);
    const c = cb();
    act(() => { c.onSelect(5, codeNode); c.onEdit(5); });
    expect(screen.getByTestId("code-edit-dialog")).toBeTruthy();
  });

  it("onDelete intent → 確認で deleteBlockAt を対象 pos で発火する", () => {
    render(<CodeDialogHost editor={mockEditor} />);
    const c = cb();
    act(() => { c.onSelect(7, codeNode); c.onDelete(7); });
    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(deleteBlockAt).toHaveBeenCalledWith(mockEditor, 7);
  });
});
