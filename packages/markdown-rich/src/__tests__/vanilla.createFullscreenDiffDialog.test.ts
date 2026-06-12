/**
 * createFullscreenDiffDialog のユニットテスト（2026-06-10 レビュー指摘 3）。
 *
 * compare（merge）モード時のコードブロック編集 — 旧 React FullscreenDiffView 相当の
 * 左=比較側 / 右=編集側 diff ビューと、編集・ブロックマージのライブ通知
 * （onMergeApply(newThisCode, newCompareCode)）を jsdom で検証する。
 */

// dialogHelpers（createDialogHeader）が読む barrel 定数のみ差し替え（既存 vanilla dialog テストと同形）。
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer"),
  getDivider: () => "#ccc",
  getHljsCssVars: () => ({}),
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
}));

import {
  createFullscreenDiffDialog,
  type FullscreenDiffDialogHandle,
} from "../vanilla/createFullscreenDiffDialog";

const t = (key: string): string => key;

function mkDialog(over: Partial<Parameters<typeof createFullscreenDiffDialog>[0]> = {}) {
  return createFullscreenDiffDialog({
    label: "Code",
    isDark: false,
    editorBg: "#fff",
    fontSize: 14,
    lineHeight: 1.6,
    thisCode: "a\nb",
    compareCode: "a\nc",
    onMergeApply: jest.fn(),
    t,
    onClose: jest.fn(),
    ...over,
  });
}

function textareas(): HTMLTextAreaElement[] {
  return Array.from(document.querySelectorAll("textarea"));
}

describe("createFullscreenDiffDialog", () => {
  let handle: FullscreenDiffDialogHandle | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;
    document.body.replaceChildren();
  });

  it("左右 2 パネルの diff ビューを描画する（左=比較・readOnly / 右=編集側）", () => {
    handle = mkDialog();
    const tas = textareas();
    expect(tas.length).toBe(2);
    expect(tas[0].readOnly).toBe(true); // 左 = 比較側
    expect(tas[0].value).toBe("a\nc");
    expect(tas[1].readOnly).toBe(false); // 右 = 編集側
    expect(tas[1].value).toBe("a\nb");
  });

  it("右ペインの編集が onMergeApply(編集側, 比較側) でライブ通知される", () => {
    const onMergeApply = jest.fn();
    handle = mkDialog({ onMergeApply });
    const right = textareas()[1];
    right.value = "a\nz";
    right.dispatchEvent(new Event("input"));
    expect(onMergeApply).toHaveBeenCalledWith("a\nz", "a\nc");
  });

  it("マージボタン（比較側→編集側）で両側の最終コードが通知される", () => {
    const onMergeApply = jest.fn();
    handle = mkDialog({ onMergeApply });
    // 左パネル（side=left）のマージボタン。クリックで比較側ブロックを編集側へ取り込む。
    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="mergeLeftToRight"]');
    expect(btn).toBeTruthy();
    btn?.click();
    expect(onMergeApply).toHaveBeenCalledWith("a\nc", "a\nc");
  });

  it("ヘッダーの close ボタンで onClose が呼ばれる", () => {
    const onClose = jest.fn();
    handle = mkDialog({ onClose });
    document.querySelector<HTMLButtonElement>('button[aria-label="close"]')?.click();
    expect(onClose).toHaveBeenCalled();
  });

  it("destroy でダイアログ DOM が除去される", () => {
    handle = mkDialog();
    expect(textareas().length).toBe(2);
    handle.destroy();
    handle = null;
    expect(textareas().length).toBe(0);
  });
});
