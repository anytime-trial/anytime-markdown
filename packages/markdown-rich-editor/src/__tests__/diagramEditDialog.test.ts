import { createEmptyDiagramDocument, serializeDiagramDocument } from "@anytime-markdown/diagram-core";
import { mountDiagramViewer } from "@anytime-markdown/diagram-viewer";
import { Schema } from "@anytime-markdown/markdown-pm/model";
import { createCodeEditState } from "../vanilla/codeEditState";
import { createDiagramEditDialog, type DiagramEditDialogHandle } from "../vanilla/createDiagramEditDialog";

// 実ビューアを描画しつつ、宿主へ渡す保存・下書きコールバックを検査する。
jest.mock("@anytime-markdown/diagram-viewer", () => {
  const actual = jest.requireActual<typeof import("@anytime-markdown/diagram-viewer")>("@anytime-markdown/diagram-viewer");
  return { ...actual, mountDiagramViewer: jest.fn(actual.mountDiagramViewer) };
});

const doc = createEmptyDiagramDocument("検査用の系図");
const source = serializeDiagramDocument(doc).trimEnd();
const mountViewer = jest.mocked(mountDiagramViewer);
const schema = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });
let handle: DiagramEditDialogHandle | undefined;

function open(code = source, options: { readOnly?: boolean; locale?: string } = {}) {
  const node = schema.node("doc", null, code ? schema.text(code) : undefined);
  const state = createCodeEditState({ editor: null, pos: 0, node, onClose: jest.fn() });
  state.onOpen();
  const onFsTextChange = jest.spyOn(state, "onFsTextChange");
  const onApply = jest.spyOn(state, "onApply");
  handle = createDiagramEditDialog({
    label: "系図", isDark: false, editorBg: "#fff", state,
    t: (key) => key, onClose: () => state.tryCloseEdit(), ...options,
  });
  return { state, onFsTextChange, onApply, dialog: handle };
}

function viewerOptions() {
  const call = mountViewer.mock.calls[0];
  if (!call) throw new Error("ビューアがマウントされていない");
  return call[1];
}

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

it("JSON テキストのペインを出さず実系図を残り領域に描く", () => {
  const { dialog } = open();
  expect(dialog.el.querySelectorAll("textarea")).toHaveLength(0);
  const root = dialog.el.querySelector(".anytime-diagram");
  expect(root).not.toBeNull();
  const container = mountViewer.mock.calls[0]?.[0];
  expect(container?.contains(root)).toBe(true);
  expect(container?.style.flex).toBe("1 1 auto");
  expect(container?.style.minHeight).toBe("0");
  // 入れ物が block だと、残りの高さを受け取っても中身が伸びず下半分が空く。
  expect(container?.style.display).toBe("flex");
  expect(container?.style.flexDirection).toBe("column");
  expect(viewerOptions()).toMatchObject({ editable: true, compact: true });
  expect(viewerOptions()).not.toHaveProperty("locale");
  expect(dialog.el.querySelector("#diagram-edit-title")?.textContent).toContain("⋔");
});

it("保存時に標準シリアライズの末尾改行だけを落として本文へ適用する", () => {
  const { onFsTextChange, onApply } = open();
  const edited = { ...doc, title: "編集後" };
  viewerOptions().onSave?.(edited);
  expect(onFsTextChange).toHaveBeenCalledWith(serializeDiagramDocument(edited).trimEnd());
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onFsTextChange.mock.invocationCallOrder[0]).toBeLessThan(onApply.mock.invocationCallOrder[0] ?? 0);
});

it("不正な図の保存は例外にし本文へ適用しない", () => {
  const { onFsTextChange, onApply } = open();
  expect(() => viewerOptions().onSave?.({ ...doc, version: 2 } as unknown as typeof doc)).toThrow();
  expect(onFsTextChange).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
});

it("下書きを dirty 表示・閉じるときの破棄確認へ接続し null は無視する", () => {
  const { state, onFsTextChange, onApply, dialog } = open();
  expect(dialog.el.querySelector(".am-dh-apply-btn.clean")).not.toBeNull();
  const draft = { ...doc, title: "未保存" };
  viewerOptions().onDraftChange?.(draft);
  expect(onFsTextChange).toHaveBeenCalledWith(serializeDiagramDocument(draft).trimEnd());
  expect(dialog.el.querySelector(".am-dh-apply-btn.dirty")).not.toBeNull();
  expect(onApply).not.toHaveBeenCalled();
  viewerOptions().onDraftChange?.(null);
  expect(onFsTextChange).toHaveBeenCalledTimes(1);
  dialog.el.querySelector<HTMLButtonElement>(".am-dh-close")?.click();
  expect(state.isDiscardOpen()).toBe(true);
});

it.each(["{broken", "{}"])("不正な本文 %p は原因を表示しビューアも textarea も出さない", (code) => {
  const { dialog } = open(code);
  expect(dialog.el.querySelector(".anytime-diagram-fence-error")?.textContent).toMatch(/^anytime-diagram: .+/);
  expect(dialog.el.querySelectorAll("textarea, .anytime-diagram")).toHaveLength(0);
  expect(mountViewer).not.toHaveBeenCalled();
});

// 空のフェンス（本文なし）は「読めない JSON」ではない。パースエラーを見せても利用者に
// できることが無いので、空の系図から編集を始めさせる。
it("本文が空のときは空の系図を開く", () => {
  const { dialog } = open("");
  expect(dialog.el.querySelector(".anytime-diagram-fence-error")).toBeNull();
  expect(dialog.el.querySelector(".anytime-diagram")).not.toBeNull();
  expect(viewerOptions().document).toMatchObject({ version: 1, families: [], connectors: [] });
});

it("閲覧専用では編集と適用を無効にし locale を渡す", () => {
  const { dialog } = open(source, { readOnly: true, locale: "en" });
  expect(viewerOptions()).toMatchObject({ editable: false, compact: true, locale: "en" });
  expect(dialog.el.querySelector(".am-dh-apply-btn")).toBeNull();
});

it("破棄時にビューアと購読とダイアログを片付ける", () => {
  const { state, dialog } = open();
  const viewer = mountViewer.mock.results[0]?.value;
  const destroy = jest.spyOn(viewer, "destroy");
  const button = dialog.el.querySelector(".am-dh-apply-btn");
  dialog.destroy();
  handle = undefined;
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(document.body.contains(dialog.el)).toBe(false);
  state.onFsTextChange("");
  expect(state.isFsDirty()).toBe(true);
  expect(button?.classList.contains("clean")).toBe(true);
});
