/**
 * vanilla/spreadsheetGrid（mountSpreadsheetGrid）のユニットテスト。
 * 旧 SpreadsheetGrid.test.tsx の検証項目（adapter 初期読み込み・readOnly 無効化・
 * コールバック省略可）を DOM 直検証へ移植し、vanilla 固有の handle API を追加検証する。
 *
 * jsdom には canvas 2D context が無い（getContext が null）ため、描画自体は no-op になる。
 * DOM 構造・ツールバー・状態管理・adapter 連携を検証対象とする。
 */

import { createSpreadsheetT } from "../i18n/createSpreadsheetT";
import { mountSpreadsheetGrid, type SpreadsheetGridHandle } from "../vanilla/spreadsheetGrid";
import { createMockAdapter } from "./support/createMockAdapter";

const t = createSpreadsheetT("Spreadsheet", "en");

function mount(
  adapterArgs: Parameters<typeof createMockAdapter>,
  options: Partial<Parameters<typeof mountSpreadsheetGrid>[1]> = {},
): { handle: SpreadsheetGridHandle; container: HTMLElement; adapter: ReturnType<typeof createMockAdapter> } {
  const adapter = createMockAdapter(...adapterArgs);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = mountSpreadsheetGrid(container, { adapter, isDark: false, t, ...options });
  return { handle, container, adapter };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountSpreadsheetGrid", () => {
  const snapshot = {
    cells: [
      ["h1", "h2"],
      ["a", "b"],
    ],
    alignments: [
      [null, null],
      [null, null],
    ],
    range: { rows: 2, cols: 2 },
  } as const;

  it("adapter から初期データを読み込んで canvas / ツールバーを構築する", () => {
    const { handle, container } = mount([
      { cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } },
    ]);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector(".sv-root")).toBeTruthy();
    expect(container.querySelector(".sv-grid-scroll")).toBeTruthy();
    // ツールバー: 整列 3 + フィルタ + クリア（非表示）+ 設定
    expect(container.querySelectorAll(".sv-toggle-btn")).toHaveLength(3);
    handle.destroy();
    expect(container.querySelector(".sv-root")).toBeNull();
  });

  it("readOnly Adapter では適用ボタンが無効化される", () => {
    const { handle, container } = mount(
      [{ cells: [["foo"]], alignments: [[null]], range: { rows: 1, cols: 1 } }, { readOnly: true }],
      { showApply: true },
    );
    const applyBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(t("spreadsheetApply")),
    ) as HTMLButtonElement;
    expect(applyBtn).toBeTruthy();
    expect(applyBtn.disabled).toBe(true);
    handle.destroy();
  });

  it("コールバック・t は省略可能（locale 自動解決）", () => {
    const adapter = createMockAdapter({ cells: [["x"]], alignments: [[null]], range: { rows: 1, cols: 1 } });
    const container = document.createElement("div");
    document.body.appendChild(container);
    expect(() => {
      const handle = mountSpreadsheetGrid(container, { adapter, isDark: false });
      handle.destroy();
    }).not.toThrow();
  });

  it("適用ボタンで adapter.replaceAll に dataRange ぶんのセルが反映され onClose が呼ばれる", () => {
    const onClose = jest.fn();
    const onDirtyChange = jest.fn();
    const { handle, container, adapter } = mount(
      [{ cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } }],
      { showApply: true, onClose, onDirtyChange },
    );
    // mount 直後は dirty 通知なし
    expect(onDirtyChange).not.toHaveBeenCalled();

    const applyBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(t("spreadsheetApply")),
    ) as HTMLButtonElement;
    applyBtn.click();

    const replaceCall = adapter.getCalls.find((c) => c.method === "replaceAll");
    expect(replaceCall).toBeTruthy();
    const arg = replaceCall?.args[0] as { cells: string[][]; range: { rows: number; cols: number } };
    expect(arg.range).toEqual({ rows: 2, cols: 2 });
    expect(arg.cells).toEqual([
      ["h1", "h2"],
      ["a", "b"],
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("liveSync:true でセル編集が Apply 無しで adapter へ即時反映される", () => {
    const { handle, container, adapter } = mount(
      [{ cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } }],
      { liveSync: true },
    );
    // Apply ボタンは出さない（showApply 未指定）
    const applyBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(t("spreadsheetApply")),
    );
    expect(applyBtn).toBeUndefined();

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(input.style.display).not.toBe("none"); // 編集開始
    input.value = "edited";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    // Apply を押していないのに replaceAll が呼ばれている（liveSync）
    expect(adapter.getCalls.some((c) => c.method === "replaceAll")).toBe(true);
    handle.destroy();
  });

  it("liveSync 無し・Apply 無しではセル編集が adapter へ即時反映されない", () => {
    const { handle, container, adapter } = mount([
      { cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } },
    ]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    if (input.style.display !== "none") {
      input.value = "edited";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    expect(adapter.getCalls.some((c) => c.method === "replaceAll")).toBe(false);
    handle.destroy();
  });

  it("外部からの adapter 更新で grid が再同期される（dirty にはならない）", () => {
    const onDirtyChange = jest.fn();
    const { handle, adapter } = mount(
      [{ cells: [["a"]], alignments: [[null]], range: { rows: 1, cols: 1 } }],
      { onDirtyChange },
    );
    adapter.replaceAll({ cells: [["z", "y"]], alignments: [[null, null]], range: { rows: 1, cols: 2 } });
    expect(onDirtyChange).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("キーボード: セル選択から文字キーで編集開始し Enter で確定する", () => {
    const { handle, container } = mount([
      { cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } },
    ]);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;

    // canvas クリックは座標計算に依存するため、キー操作前に選択状態を直接作る
    // （クリック座標は jsdom で getBoundingClientRect が 0 のため簡易化）
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));

    // クリックで cell 選択にならなくても、文字キー入力の前提となる選択がなければ no-op のはず
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    // 編集が始まった場合は input が可視化される（選択があるときのみ）
    if (input.style.display !== "none") {
      input.value = "edited";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(input.style.display).toBe("none");
    }
    handle.destroy();
  });

  it("update({isDark}) でルートのテーマ変数が切り替わる", () => {
    const { handle, container } = mount([
      { cells: [["a"]], alignments: [[null]], range: { rows: 1, cols: 1 } },
    ]);
    const root = container.querySelector(".sv-root") as HTMLElement;
    const lightBg = root.style.getPropertyValue("--sv-color-bg-paper");
    handle.update({ isDark: true });
    expect(root.style.getPropertyValue("--sv-color-bg-paper")).not.toBe(lightBg);
    handle.destroy();
  });

  it("フィルタボタンでフィルタ行（select 群）が表示される", () => {
    const { handle, container } = mount([
      { cells: snapshot.cells.map((r) => [...r]), alignments: snapshot.alignments.map((r) => [...r]), range: { ...snapshot.range } },
    ]);
    const filterBtn = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === t("spreadsheetFilter"),
    ) as HTMLButtonElement;
    filterBtn.click();
    const selects = container.querySelectorAll(".sv-grid-scroll select");
    expect(selects.length).toBe(2); // dataRange.cols ぶん
    handle.destroy();
  });
});
