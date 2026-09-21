import {
  createEmptyDiagramDocument,
  type DiagramDocument,
  elementAnchor,
  serializeDiagramDocument,
} from "@anytime-markdown/diagram-core";
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

// 画面から届く図は端を種別付き（`{ kind: "element" }`）で持つ。ファイルの形の検査へ直に渡すと
// 「線を 1 本でも引いた図は保存できない」になる（利用者の指摘）。
it("線を引いた図の保存も本文へ適用する", () => {
  const { onFsTextChange, onApply } = open();
  const edited: DiagramDocument = {
    ...doc,
    nodes: ["要素 1", "要素 2"],
    connectors: [{
      id: "c1",
      from: elementAnchor("要素 1"),
      to: elementAnchor("要素 2"),
      line: "solid",
      color: "default",
      route: "straight",
      start: "none",
      end: "arrow",
    }],
  };
  expect(() => viewerOptions().onSave?.(edited)).not.toThrow();
  expect(onFsTextChange).toHaveBeenCalledWith(serializeDiagramDocument(edited).trimEnd());
  expect(onApply).toHaveBeenCalledTimes(1);
});

it("不正な図の保存は例外にし本文へ適用しない", () => {
  const { onFsTextChange, onApply } = open();
  // 書き出したあとも残る壊れ方で測る。`version` は書き出しが 1 で固定なので、画面の形を
  // 書き換えても「保存できない図」にはならない（検証するのは実際に書く形）。
  const line = { line: "solid", color: "default", route: "straight", start: "none", end: "arrow" } as const;
  const broken: DiagramDocument = {
    ...doc,
    nodes: ["要素 1", "要素 2"],
    connectors: [
      { id: "c1", from: elementAnchor("要素 1"), to: elementAnchor("要素 2"), ...line },
      { id: "c1", from: elementAnchor("要素 2"), to: elementAnchor("要素 1"), ...line },
    ],
  };
  expect(() => viewerOptions().onSave?.(broken)).toThrow(/id が重複/);
  expect(onFsTextChange).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
});

// 編集そのものを目的に開くダイアログなので、閲覧状態から始めて切替を押させない。保存の口も
// 図の中には出さず、ヘッダーの「適用」1 つに寄せる（ユーザー指示）。
it("図を編集状態で開き、切替と保存の口は図に出さない", () => {
  open();
  expect(viewerOptions()).toMatchObject({ alwaysEditing: true });
});

it("適用ボタンが保存経路（検証つき）を通して本文へ適用する", async () => {
  const { onFsTextChange, onApply, dialog } = open();
  const draft = { ...doc, title: "編集後" };
  viewerOptions().onDraftChange?.(draft);
  onFsTextChange.mockClear();
  dialog.el.querySelector<HTMLButtonElement>(".am-dh-apply-btn")?.click();
  await Promise.resolve();
  await Promise.resolve();
  // 検証を通った図を書き出し直した本文が入る（画面の下書きの文字列をそのまま流さない）。
  expect(onFsTextChange).toHaveBeenCalledWith(serializeDiagramDocument(doc).trimEnd());
  expect(onApply).toHaveBeenCalledTimes(1);
});

// 本文が壊れていて図を出せないときは保存する下書きも無い。従来どおり本文の適用だけを行う
// （押しても何も起きないボタンにしない）。
it("図を出せない本文では適用が従来どおり本文を適用する", () => {
  const { onApply, dialog } = open("{broken");
  dialog.el.querySelector<HTMLButtonElement>(".am-dh-apply-btn")?.click();
  expect(onApply).toHaveBeenCalledTimes(1);
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
