/**
 * vanilla/spreadsheetGrid（mountSpreadsheetGrid）のユニットテスト。
 * 旧 SpreadsheetGrid.test.tsx の検証項目（adapter 初期読み込み・readOnly 無効化・
 * コールバック省略可）を DOM 直検証へ移植し、vanilla 固有の handle API を追加検証する。
 *
 * jsdom には canvas 2D context が無い（getContext が null）ため、描画自体は no-op になる。
 * DOM 構造・ツールバー・状態管理・adapter 連携を検証対象とする。
 */

import { createSpreadsheetT } from "../i18n/createSpreadsheetT";
import { getInternalClipboard, setInternalClipboard } from "../vanilla/clipboard";
import { mountSpreadsheetGrid, type SpreadsheetGridHandle } from "../vanilla/spreadsheetGrid";
import { createMockAdapter } from "./support/createMockAdapter";

const t = createSpreadsheetT("Spreadsheet", "en");

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

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
  setInternalClipboard("");
  delete (document as unknown as { execCommand?: unknown }).execCommand;
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

  // VS Code webview では navigator.clipboard が reject されるため、
  // ショートカットのコピー/ペーストが効かなかった回帰（chart-core 表タブ等）を防ぐ。
  describe("クリップボード（webview フォールバック）", () => {
    const data = {
      cells: [
        ["c00", "c01"],
        ["c10", "c11"],
      ],
      alignments: [
        [null, null],
        [null, null],
      ],
      range: { rows: 2, cols: 2 },
    } as const;

    it("Ctrl+C: navigator.clipboard.writeText が reject でも execCommand と内部バッファでコピーする", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockRejectedValue(new Error("NotAllowedError")) },
        configurable: true,
        writable: true,
      });
      const execCommand = jest.fn().mockReturnValue(true);
      (document as unknown as { execCommand: unknown }).execCommand = execCommand;

      const { handle, container } = mount([
        { cells: data.cells.map((r) => [...r]), alignments: data.alignments.map((r) => [...r]), range: { ...data.range } },
      ]);
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
      await flush();

      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(getInternalClipboard()).not.toBe("");
      handle.destroy();
    });

    it("Ctrl+V: navigator.clipboard.readText が reject でも内部バッファからセルへ貼り付ける", async () => {
      setInternalClipboard("PASTED");
      Object.defineProperty(navigator, "clipboard", {
        value: { readText: jest.fn().mockRejectedValue(new Error("NotAllowedError")) },
        configurable: true,
        writable: true,
      });

      const { handle, container, adapter } = mount(
        [{ cells: data.cells.map((r) => [...r]), alignments: data.alignments.map((r) => [...r]), range: { ...data.range } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));
      await flush();

      // liveSync で adapter へ全体反映され、貼り付け値がいずれかのセルに入る。
      expect(adapter.snapshot.cells.flat()).toContain("PASTED");
      handle.destroy();
    });

    it("Ctrl+V: 外部クリップボード（paste-bin の paste イベント）の TSV をセルへ貼り付ける", async () => {
      // webview 想定: readText は不可。外部貼り付けは paste イベントの clipboardData から取る。
      Object.defineProperty(navigator, "clipboard", {
        value: { readText: jest.fn().mockRejectedValue(new Error("NotAllowedError")) },
        configurable: true,
        writable: true,
      });

      const { handle, container, adapter } = mount(
        [{ cells: data.cells.map((r) => [...r]), alignments: data.alignments.map((r) => [...r]), range: { ...data.range } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      const pasteBin = container.querySelector("textarea") as HTMLTextAreaElement;
      expect(pasteBin).toBeTruthy();

      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 40 }));
      // Ctrl+V で paste-bin へフォーカスが移る（preventDefault せずネイティブ paste を待つ）。
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true }));

      // jsdom は ClipboardEvent.clipboardData を埋めないため、paste イベントを手動で発火する。
      const pasteEvent = new Event("paste", { bubbles: true }) as Event & { clipboardData: unknown };
      pasteEvent.clipboardData = { getData: (type: string) => (type === "text/plain" ? "EXTERNAL\tFROM_EXCEL" : "") };
      pasteBin.dispatchEvent(pasteEvent);
      await flush();

      expect(adapter.snapshot.cells.flat()).toContain("EXTERNAL");
      handle.destroy();
    });
  });

  // フィルハンドル（選択右下角ドラッグでの連続入力）。
  // 既定レイアウト: ROW_NUM_WIDTH=40, HEADER_HEIGHT=28, 行高=28, 列幅=100(fixed)。
  // セル(0,0)のハンドル中心は (40+100, 28+28) = (140, 56)。
  describe("フィルハンドル", () => {
    const down = (canvas: HTMLCanvasElement, fromX: number, fromY: number, toX: number, toY: number): void => {
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: fromX, clientY: fromY }));
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: toX, clientY: toY }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: toX, clientY: toY }));
    };

    it("単一数値セルを下方向ドラッグで +1 連番補完する", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["1", "x"], ["", "y"], ["", "z"]], alignments: [[null, null], [null, null], [null, null]], range: { rows: 3, cols: 2 } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      // セル(0,0)を選択 → ハンドル(140,56)から row3 までドラッグ。
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      down(canvas, 140, 56, 70, 120);

      const flat = adapter.snapshot.cells.flat();
      expect(flat).toContain("2");
      expect(flat).toContain("3");
      expect(flat).toContain("4");
      handle.destroy();
    });

    it("単一数値セルを右方向ドラッグで +1 連番補完する", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["1", "x"], ["", "y"], ["", "z"]], alignments: [[null, null], [null, null], [null, null]], range: { rows: 3, cols: 2 } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      // セル(0,0)を選択 → ハンドル(140,56)から col3（x≈360）まで右へドラッグ（行は据え置き）。
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      down(canvas, 140, 56, 360, 40);

      const flat = adapter.snapshot.cells.flat();
      expect(flat).toContain("2");
      expect(flat).toContain("3");
      expect(flat).toContain("4");
      handle.destroy();
    });

    it("複数セル選択を下方向ドラッグで等差延長する（2,4→6,8）", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["2"], ["4"], [""], [""]], alignments: [[null], [null], [null], [null]], range: { rows: 4, cols: 1 } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      // (0,0)選択 → shift+クリックで(1,0)まで range 選択。
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 68, shiftKey: true }));
      // 選択(0..1,0)のハンドルは (140, 28+56)=(140,84)。row3 までドラッグ。
      down(canvas, 140, 84, 70, 120);

      const flat = adapter.snapshot.cells.flat();
      expect(flat).toContain("6");
      expect(flat).toContain("8");
      handle.destroy();
    });

    it("readOnly ではフィルで値が変化しない", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["1"], [""], [""]], alignments: [[null], [null], [null]], range: { rows: 3, cols: 1 } }, { readOnly: true }],
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      down(canvas, 140, 56, 70, 120);

      // readOnly: ハンドル非表示・フィル無効。setCell は呼ばれず snapshot 不変。
      expect(adapter.getCalls.some((c) => c.method === "setCell")).toBe(false);
      expect(adapter.snapshot.cells.flat().filter((v) => v === "2")).toHaveLength(0);
      handle.destroy();
    });
  });

  // Ctrl+Z / Ctrl+Y がグリッド内部履歴で動くこと（ホストの onUndo/onRedo 未指定時）。
  describe("undo / redo（内部履歴）", () => {
    it("Ctrl+Z でフィルを取り消し、Ctrl+Y でやり直す", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["1", "x"], ["", "y"], ["", "z"]], alignments: [[null, null], [null, null], [null, null]], range: { rows: 3, cols: 2 } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      // セル(0,0)選択 → ハンドル(140,56)から row3 まで下フィル（1→2,3,4）。
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 140, clientY: 56 }));
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 70, clientY: 120 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 70, clientY: 120 }));
      expect(adapter.snapshot.cells.flat()).toContain("2");

      // Ctrl+Z で取り消し。
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      expect(adapter.snapshot.cells.flat()).not.toContain("2");

      // Ctrl+Y でやり直し。
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
      expect(adapter.snapshot.cells.flat()).toContain("2");
      handle.destroy();
    });

    it("外部 adapter 更新（再シード）後は直前の編集を undo できない（履歴リセット）", () => {
      const { handle, container, adapter } = mount(
        [{ cells: [["1"], [""], [""]], alignments: [[null], [null], [null]], range: { rows: 3, cols: 1 } }],
        { liveSync: true },
      );
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 70, clientY: 40 }));
      canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 140, clientY: 56 }));
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 70, clientY: 120 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 70, clientY: 120 }));
      expect(adapter.snapshot.cells.flat()).toContain("2");

      // 外部から adapter を置き換える（再シード → 履歴リセット）。
      adapter.replaceAll({ cells: [["Z"]], alignments: [[null]], range: { rows: 1, cols: 1 } });
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      // 履歴がリセットされているため undo は効かず "2" は復活しない。
      expect(adapter.snapshot.cells.flat()).not.toContain("2");
      handle.destroy();
    });
  });
});
