/**
 * components-vanilla/SlashCommandMenu.ts — 脱React の vanilla DOM スラッシュコマンドメニューのテスト。
 *
 * 検証観点:
 *   1. setCallback で callback が host へ公開される
 *   2. active=true で floating メニュー（role=menu）が portalTarget へ生成される / 項目数 / svg
 *   3. query フィルタ（label / keyword）でメニューが再描画される
 *   4. NoResults 時の status 表示（slashCommandNoResults）
 *   5. ArrowDown/ArrowUp で selectedIndex（aria-current）が移動・wraparound
 *   6. クリックで該当 index を確定（deleteRange + action）
 *   7. Enter で setTimeout(0) 後に確定（deleteRange + action）
 *   8. Escape / active=false で閉じる
 *   9. update（items 差し替え）で再描画
 *  10. destroy のクリーンアップ（callback no-op 化・メニュー除去）
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 *  - getComputedStyle で継承 CSS カスタムプロパティを検証しない（el.style.cssText が var を含む）。
 *  - editor は mock。chain proxy で deleteRange / action 実行を検証する。
 *  - @floating-ui/dom はモックする（createFloating が computePosition / autoUpdate を呼ぶ）。
 */

// --- @floating-ui/dom モック（createFloating が呼ぶ） --------------------------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import {
  createSlashCommandMenu,
  filterVanillaSlashItems,
  type CreateSlashCommandMenuOptions,
  type SlashCommandMenuHandle,
  type VanillaSlashCommandItem,
} from "../components-vanilla/SlashCommandMenu";
import type { SlashCommandState } from "../extensions/slashCommandExtension";

/** t は key をそのまま返す。 */
const t = (key: string) => key;

/** chain() の呼び出し・引数を記録する fluent proxy。 */
function createChainRecorder(calls: Array<{ method: string; args: unknown[] }>) {
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ["focus", "deleteRange", "run"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  return chain;
}

interface MockEditor {
  editor: any;
  chainCalls: Array<{ method: string; args: unknown[] }>;
  coordsCalls: number[];
  setCursor: (pos: number) => void;
}

function createMockEditor(opts: { coordsThrows?: boolean } = {}): MockEditor {
  const chainCalls: Array<{ method: string; args: unknown[] }> = [];
  const coordsCalls: number[] = [];
  let cursor = 10;
  const editor: any = {
    state: {
      get selection() {
        return { from: cursor };
      },
    },
    view: {
      coordsAtPos: (pos: number) => {
        coordsCalls.push(pos);
        if (opts.coordsThrows) throw new Error("detached");
        return { left: 100, right: 100, top: 50, bottom: 70 };
      },
    },
    chain: () => createChainRecorder(chainCalls),
  };
  return {
    editor,
    chainCalls,
    coordsCalls,
    setCursor: (pos: number) => {
      cursor = pos;
    },
  };
}

/** vanilla 項目を生成する（action は呼び出し記録）。 */
function makeItems(actionLog: string[]): VanillaSlashCommandItem[] {
  return [
    {
      id: "h1",
      labelKey: "slashH1",
      iconPath: "M1 1h2",
      keywords: ["heading", "title"],
      action: () => actionLog.push("h1"),
    },
    {
      id: "bullet",
      labelKey: "slashBulletList",
      iconPath: "M2 2h2",
      keywords: ["bullet", "list"],
      action: () => actionLog.push("bullet"),
    },
    {
      id: "code",
      labelKey: "slashCodeBlock",
      iconPath: "M3 3h2",
      keywords: ["code"],
      action: () => actionLog.push("code"),
    },
  ];
}

/** suggestion state を簡潔に作る helper。 */
function makeState(
  partial: Partial<SlashCommandState> & { active: boolean },
): SlashCommandState {
  return {
    active: partial.active,
    query: partial.query ?? "",
    from: partial.from ?? 5,
    navigationKey: partial.navigationKey ?? null,
  };
}

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  computePositionMock.mockResolvedValue({ x: 0, y: 0, placement: "bottom-start" });
  autoUpdateMock.mockReturnValue(() => {});
  document.body.innerHTML = "";
  const root = document.documentElement;
  root.style.setProperty("--am-color-bg-paper", "rgb(255,255,255)");
  root.style.setProperty("--am-color-text-secondary", "rgb(100,100,100)");
  root.style.setProperty("--am-color-action-selected", "rgb(200,200,200)");
  root.style.setProperty("--am-elevation-3", "0 3px 5px rgba(0,0,0,0.2)");
  root.style.setProperty("--am-radius-md", "8px");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createSlashCommandMenu", () => {
  let handle: SlashCommandMenuHandle | undefined;
  let capturedCallback: ((state: SlashCommandState) => void) | undefined;

  function build(
    overrides: Partial<CreateSlashCommandMenuOptions> = {},
    m = createMockEditor(),
    actionLog: string[] = [],
  ): { m: MockEditor; actionLog: string[] } {
    capturedCallback = undefined;
    handle = createSlashCommandMenu({
      editor: m.editor,
      t,
      items: makeItems(actionLog),
      setCallback: (cb) => {
        capturedCallback = cb;
      },
      ...overrides,
    });
    return { m, actionLog };
  }

  afterEach(() => {
    handle?.destroy();
    handle = undefined;
    capturedCallback = undefined;
  });

  it("setCallback で callback を host へ公開する", () => {
    build();
    expect(typeof capturedCallback).toBe("function");
    // 生成直後はメニュー未オープン。
    expect(handle!.getMenuEl()).toBeNull();
  });

  it("active=true で role=menu の floating メニューが portalTarget へ生成される", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));

    const menuEl = handle!.getMenuEl();
    expect(menuEl).toBeTruthy();
    expect(menuEl!.getAttribute("role")).toBe("menu");
    expect(menuEl!.getAttribute("aria-label")).toBe("slashCommandPlaceholder");
    expect(document.body.contains(menuEl!)).toBe(true);
    // z-index は Z_FULLSCREEN。
    expect(menuEl!.style.zIndex).toBe("1300");
    // 3 項目すべて表示・各 svg を持つ。
    const items = menuEl!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(3);
    for (const it of Array.from(items)) {
      expect(it.querySelector("svg")).toBeTruthy();
    }
    // Paper の背景は CSS 変数。
    const paper = menuEl!.querySelector('[role="menu"] > div') as HTMLElement | null;
    expect((menuEl!.firstElementChild as HTMLElement).style.cssText).toContain(
      "var(--am-color-bg-paper)",
    );
    void paper;
  });

  it("coordsAtPos が throw する場合はメニューを生成しない", () => {
    const m = createMockEditor({ coordsThrows: true });
    build({}, m);
    capturedCallback!(makeState({ active: true }));
    expect(handle!.getMenuEl()).toBeNull();
    expect(m.coordsCalls.length).toBeGreaterThan(0);
  });

  it("query フィルタ（keyword）で項目を絞り込み再描画する", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "bullet", from: 5 }));
    const items = handle!.getMenuEl()!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("slashBulletList");
  });

  it("項目ありのとき status（非表示 live region）に件数キーを反映する（指摘39）", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    const menuEl = handle!.getMenuEl()!;
    const status = menuEl.querySelector('[role="status"]') as HTMLElement;
    expect(status).toBeTruthy();
    // t は identity のため vars 込みキー名がそのまま入る（i18n 配線の確認が目的）。
    expect(status.textContent).toBe("slashCommandItemCount");
  });

  it("ArrowDown で選択変更すると status が選択ラベルで更新される（指摘42）", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    const menuEl = handle!.getMenuEl()!;
    const status = menuEl.querySelector('[role="status"]') as HTMLElement;
    // 初期描画直後は件数アナウンスのまま。
    expect(status.textContent).toBe("slashCommandItemCount");

    capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowDown" }));
    // 選択が動くと選択ラベルキーへ切り替わる。
    expect(status.textContent).toBe("slashCommandSelected");
  });

  it("マッチ無しのとき status に slashCommandNoResults を表示し項目は出さない", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "zzzz", from: 5 }));
    const menuEl = handle!.getMenuEl()!;
    expect(menuEl.querySelectorAll('[role="menuitem"]').length).toBe(0);
    const status = menuEl.querySelector('[role="status"]') as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.textContent).toBe("slashCommandNoResults");
    // 可視 NoResults の色は CSS 変数。
    expect(status.style.cssText).toContain("var(--am-color-text-secondary)");
  });

  it("ArrowDown / ArrowUp で aria-current が移動し wraparound する", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    const menuEl = handle!.getMenuEl()!;
    const cur = () =>
      Array.from(menuEl.querySelectorAll('[role="menuitem"]')).findIndex(
        (el) => el.getAttribute("aria-current") === "true",
      );

    // 初期は index 0。
    expect(cur()).toBe(0);

    capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowDown" }));
    expect(cur()).toBe(1);
    capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowDown" }));
    expect(cur()).toBe(2);
    // 末尾で下 → 先頭へラップ。
    capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowDown" }));
    expect(cur()).toBe(0);
    // 先頭で上 → 末尾へラップ。
    capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowUp" }));
    expect(cur()).toBe(2);
  });

  it("項目クリックで deleteRange + action を実行して閉じる", () => {
    const m = createMockEditor();
    const actionLog: string[] = [];
    build({}, m, actionLog);
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    m.setCursor(8);

    const items = handle!.getMenuEl()!.querySelectorAll('[role="menuitem"]');
    (items[1] as HTMLElement).click();

    const del = m.chainCalls.find((c) => c.method === "deleteRange");
    expect(del).toBeTruthy();
    expect(del!.args[0]).toEqual({ from: 5, to: 8 });
    expect(actionLog).toEqual(["bullet"]);
    // 閉じる。
    expect(handle!.getMenuEl()).toBeNull();
  });

  it("Enter は setTimeout(0) 後に deleteRange + action を実行して閉じる", () => {
    jest.useFakeTimers();
    try {
      const m = createMockEditor();
      const actionLog: string[] = [];
      build({}, m, actionLog);
      capturedCallback!(makeState({ active: true, query: "", from: 5 }));
      // index 1 を選択。
      capturedCallback!(makeState({ active: true, query: "", navigationKey: "ArrowDown" }));
      m.setCursor(9);

      capturedCallback!(
        makeState({ active: true, query: "", from: 5, navigationKey: "Enter" }),
      );
      // 遅延前は未実行。
      expect(actionLog).toEqual([]);
      jest.runAllTimers();

      const del = m.chainCalls.find((c) => c.method === "deleteRange");
      expect(del!.args[0]).toEqual({ from: 5, to: 9 });
      expect(actionLog).toEqual(["bullet"]);
      expect(handle!.getMenuEl()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("Escape でメニューを閉じる", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    expect(handle!.getMenuEl()).toBeTruthy();
    capturedCallback!(makeState({ active: true, navigationKey: "Escape" }));
    expect(handle!.getMenuEl()).toBeNull();
  });

  it("active=false でメニューを閉じる", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    expect(handle!.getMenuEl()).toBeTruthy();
    capturedCallback!(makeState({ active: false }));
    expect(handle!.getMenuEl()).toBeNull();
  });

  it("update(items) で開いているメニューを再描画する", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    expect(handle!.getMenuEl()!.querySelectorAll('[role="menuitem"]').length).toBe(3);

    const log2: string[] = [];
    handle!.update({
      items: [
        {
          id: "only",
          labelKey: "slashTable",
          iconPath: "M4 4h2",
          keywords: ["table"],
          action: () => log2.push("only"),
        },
      ],
    });
    const items = handle!.getMenuEl()!.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("slashTable");
  });

  it("destroy で callback を no-op 化しメニューを除去する", () => {
    build();
    capturedCallback!(makeState({ active: true, query: "", from: 5 }));
    expect(handle!.getMenuEl()).toBeTruthy();

    // destroy は setCallback を再度呼んで no-op を渡す（capturedCallback が差し替わる）。
    const beforeCb = capturedCallback;
    handle!.destroy();
    expect(handle!.getMenuEl()).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    // no-op に差し替わっている。
    expect(capturedCallback).not.toBe(beforeCb);
    // 古い callback を呼んでも destroyed ガードで何も起きない。
    beforeCb!(makeState({ active: true, query: "", from: 5 }));
    expect(handle!.getMenuEl()).toBeNull();

    handle = undefined;
  });
});

describe("filterVanillaSlashItems", () => {
  const items: VanillaSlashCommandItem[] = [
    {
      id: "h1",
      labelKey: "slashH1",
      iconPath: "M1 1h2",
      keywords: ["heading", "title"],
      action: () => {},
    },
    {
      id: "code",
      labelKey: "slashCodeBlock",
      iconPath: "M2 2h2",
      keywords: ["code"],
      action: () => {},
    },
  ];

  it("空クエリは全件返す（コピーを返す）", () => {
    const out = filterVanillaSlashItems(items, "", t);
    expect(out.length).toBe(2);
    expect(out).not.toBe(items);
  });

  it("label に部分一致でフィルタする", () => {
    const out = filterVanillaSlashItems(items, "h1", t);
    expect(out.map((i) => i.id)).toEqual(["h1"]);
  });

  it("keyword に部分一致でフィルタする", () => {
    const out = filterVanillaSlashItems(items, "title", t);
    expect(out.map((i) => i.id)).toEqual(["h1"]);
  });

  it("大文字小文字を無視する", () => {
    const out = filterVanillaSlashItems(items, "CODE", t);
    expect(out.map((i) => i.id)).toEqual(["code"]);
  });
});
