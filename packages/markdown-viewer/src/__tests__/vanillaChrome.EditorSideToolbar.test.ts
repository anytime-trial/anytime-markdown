/**
 * components-vanilla/EditorSideToolbar.ts — 脱React の縦並びサイドツールバー（vanilla）のテスト。
 *
 * 検証観点:
 *  1. DOM 生成（root の縦並び・幅・border CSS 変数 / ボタン数 / aria-label / アイコン svg）
 *  2. 条件描画（onToggleExplorer / onOpenSettings 未指定でボタンを描画しない）
 *  3. トグルの排他ロジック（outline / comment / explorer の onClick が他を閉じる）
 *  4. update（sourceMode で outline / comment を disabled・open で active 色を付与）
 *  5. destroy（tooltip / button の listener 解除後は click で callback が呼ばれない）
 *
 * jsdom の罠回避: getComputedStyle で継承 CSS カスタムプロパティを検証せず、
 * el.style.cssText が var(--am-...) を含むことを見る。active 色は el.style.color が
 * var(--am-color-primary-main) を含むか / 空かで判定する（getComputedStyle 不使用）。
 */
import {
  createEditorSideToolbar,
  type EditorSideToolbarHandle,
} from "../components-vanilla/EditorSideToolbar";

/** i18n スタブ（key をそのまま返す）。 */
const t = (key: string): string => key;

describe("createEditorSideToolbar", () => {
  let handle: EditorSideToolbarHandle | undefined;

  afterEach(() => {
    handle?.destroy();
    handle?.el.remove();
    handle = undefined;
  });

  /** root 配下の icon button（data-ui-icon-button）を取得する。 */
  function buttons(h: EditorSideToolbarHandle): HTMLButtonElement[] {
    return [...h.el.querySelectorAll<HTMLButtonElement>("button[data-ui-icon-button]")];
  }

  describe("DOM 生成", () => {
    it("縦並びコンテナを生成し幅と border CSS 変数を持つ", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      expect(handle.el.tagName).toBe("DIV");
      expect(handle.el.style.cssText).toContain("flex-direction: column");
      expect(handle.el.style.cssText).toContain("width: 46px");
      expect(handle.el.style.cssText).toContain("var(--am-color-divider)");
    });

    it("アイコンが currentColor で消えないよう root にテーマ連動 color を設定する（ダークモード可視性の回帰）", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      // 未指定だと継承色（canvastext）に落ちダークでアイコンが埋もれるため text-secondary を明示。
      expect(handle.el.style.color).toBe("var(--am-color-text-secondary)");
    });

    it("非アクティブボタンの color は inherit（空文字だと <button> が UA 黒に戻りダークで不可視の回帰）", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const buttons = [...handle.el.querySelectorAll("button[data-ui-icon-button]")];
      // 生成直後は全 inactive → color:inherit で root のテーマ色を継承する（"" だと UA 既定色に落ちる）。
      for (const btn of buttons) {
        expect((btn as HTMLElement).style.color).toBe("inherit");
      }
    });

    it("explorer / settings 無しなら outline / comment の 2 ボタンのみ描画する", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const btns = buttons(handle);
      expect(btns).toHaveLength(2);
      expect(btns[0].getAttribute("aria-label")).toBe("outline");
      expect(btns[1].getAttribute("aria-label")).toBe("commentPanel");
    });

    it("explorer / settings callback 指定で 4 ボタンを描画する", () => {
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onToggleExplorer: () => {},
        onOpenSettings: () => {},
      });
      const btns = buttons(handle);
      expect(btns).toHaveLength(4);
      expect(btns[2].getAttribute("aria-label")).toBe("explorer");
      expect(btns[3].getAttribute("aria-label")).toBe("editorSettings");
    });

    it("並び順は上から バージョン情報 / アウトライン / コメント / 設定", () => {
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onOpenSettings: () => {},
        onOpenVersionDialog: () => {},
      });
      const labels = buttons(handle).map((b) => b.getAttribute("aria-label"));
      expect(labels).toEqual(["versionInfo", "outline", "commentPanel", "editorSettings"]);
    });

    it("バージョン情報ボタンのクリックで onOpenVersionDialog を呼ぶ", () => {
      const onOpenVersionDialog = jest.fn();
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onOpenVersionDialog,
      });
      const versionBtn = buttons(handle).find(
        (b) => b.getAttribute("aria-label") === "versionInfo",
      );
      versionBtn?.click();
      expect(onOpenVersionDialog).toHaveBeenCalledTimes(1);
    });

    it("バージョン情報は最上部に置き margin-top:auto で押し下げない（画面外回帰防止）", () => {
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onOpenSettings: () => {},
        onOpenVersionDialog: () => {},
      });
      // margin-top:auto を使うとレイアウト次第で version が画面外へ押し出され見落とされる。
      const pushedToBottom = [...handle.el.querySelectorAll<HTMLElement>("div")].some((d) =>
        d.style.cssText.includes("margin-top: auto"),
      );
      expect(pushedToBottom).toBe(false);
    });

    it("onOpenVersionDialog 未指定ならバージョン情報ボタンを描画しない", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const hasVersion = buttons(handle).some(
        (b) => b.getAttribute("aria-label") === "versionInfo",
      );
      expect(hasVersion).toBe(false);
    });

    it("light/dark テーマ切替ボタンは描画しない（設定パネルへ移設）", () => {
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onOpenSettings: () => {},
        onOpenVersionDialog: () => {},
      });
      expect(handle.el.querySelector('button[aria-label="settingDarkMode"]')).toBeNull();
    });

    it("各ボタンに inline svg アイコンを内包し SIDE_TOOLBAR_ICON_SIZE 寸法を持つ", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const btns = buttons(handle);
      for (const b of btns) {
        expect(b.querySelector("svg")).not.toBeNull();
        expect(b.style.width).toBe("32px");
        expect(b.style.height).toBe("32px");
      }
    });
  });

  describe("トグルの排他ロジック", () => {
    it("outline が閉じている時: comment(false) + explorer(開なら閉) + outline トグル", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        explorerOpen: true,
        onToggleOutline: () => calls.push("outline"),
        onToggleComment: (open) => calls.push(`comment:${open}`),
        onToggleExplorer: () => calls.push("explorer"),
      });
      buttons(handle)[0].click(); // outline ボタン
      expect(calls).toEqual(["comment:false", "explorer", "outline"]);
    });

    it("outline が開いている時: outline トグルのみ", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        outlineOpen: true,
        onToggleOutline: () => calls.push("outline"),
        onToggleComment: (open) => calls.push(`comment:${open}`),
      });
      buttons(handle)[0].click();
      expect(calls).toEqual(["outline"]);
    });

    it("comment が閉じている時: outline(開なら閉) + explorer(開なら閉) + comment(true)", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        outlineOpen: true,
        explorerOpen: true,
        onToggleOutline: () => calls.push("outline"),
        onToggleComment: (open) => calls.push(`comment:${open}`),
        onToggleExplorer: () => calls.push("explorer"),
      });
      buttons(handle)[1].click(); // comment ボタン
      expect(calls).toEqual(["outline", "explorer", "comment:true"]);
    });

    it("comment が開いている時: comment(false) のみ", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        commentOpen: true,
        onToggleComment: (open) => calls.push(`comment:${open}`),
      });
      buttons(handle)[1].click();
      expect(calls).toEqual(["comment:false"]);
    });

    it("explorer が閉じている時: outline(開なら閉) + comment(false) + explorer トグル", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        outlineOpen: true,
        onToggleOutline: () => calls.push("outline"),
        onToggleComment: (open) => calls.push(`comment:${open}`),
        onToggleExplorer: () => calls.push("explorer"),
      });
      buttons(handle)[2].click(); // explorer ボタン
      expect(calls).toEqual(["outline", "comment:false", "explorer"]);
    });

    it("explorer が開いている時: explorer トグルのみ", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        explorerOpen: true,
        onToggleComment: (open) => calls.push(`comment:${open}`),
        onToggleExplorer: () => calls.push("explorer"),
      });
      buttons(handle)[2].click();
      expect(calls).toEqual(["explorer"]);
    });

    it("settings ボタンは onOpenSettings をそのまま呼ぶ", () => {
      let opened = 0;
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onOpenSettings: () => {
          opened += 1;
        },
      });
      buttons(handle)[2].click(); // settings ボタン（explorer 無しなので index 2）
      expect(opened).toBe(1);
    });
  });

  describe("update", () => {
    it("sourceMode で outline / comment ボタンを disabled にする", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const [outline, comment] = buttons(handle);
      expect(outline.disabled).toBe(false);
      expect(comment.disabled).toBe(false);

      handle.update({ sourceMode: true });
      expect(outline.disabled).toBe(true);
      expect(comment.disabled).toBe(true);

      handle.update({ sourceMode: false });
      expect(outline.disabled).toBe(false);
      expect(comment.disabled).toBe(false);
    });

    it("open 状態で active 色（primary）を付与し、閉じると除去する", () => {
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {},
        onToggleExplorer: () => {},
      });
      const [outline, comment, explorer] = buttons(handle);

      handle.update({ outlineOpen: true });
      expect(outline.style.color).toContain("var(--am-color-primary-main)");
      // 非アクティブは "inherit"（"" だと UA 黒に戻りダークで不可視になる回帰）。
      expect(comment.style.color).toBe("inherit");

      handle.update({ outlineOpen: false, commentOpen: true, explorerOpen: true });
      expect(outline.style.color).toBe("inherit");
      expect(comment.style.color).toContain("var(--am-color-primary-main)");
      expect(explorer.style.color).toContain("var(--am-color-primary-main)");
    });

    it("初期 open 状態を反映して active 色を持つ", () => {
      handle = createEditorSideToolbar({
        t,
        commentOpen: true,
        onToggleComment: () => {},
      });
      const [, comment] = buttons(handle);
      expect(comment.style.color).toContain("var(--am-color-primary-main)");
    });

    it("排他ロジックは update 後の最新状態を参照する", () => {
      const calls: string[] = [];
      handle = createEditorSideToolbar({
        t,
        onToggleOutline: () => calls.push("outline"),
        onToggleComment: (open) => calls.push(`comment:${open}`),
      });
      // 初期 outlineOpen=false → click は comment(false) + outline
      buttons(handle)[0].click();
      expect(calls).toEqual(["comment:false", "outline"]);

      // update で outlineOpen=true にすると click は outline のみ
      calls.length = 0;
      handle.update({ outlineOpen: true });
      buttons(handle)[0].click();
      expect(calls).toEqual(["outline"]);
    });
  });

  describe("destroy", () => {
    it("destroy 後は click しても callback が呼ばれない", () => {
      let clicked = 0;
      handle = createEditorSideToolbar({
        t,
        onToggleComment: () => {
          clicked += 1;
        },
      });
      const comment = buttons(handle)[1];
      handle.destroy();
      comment.click();
      expect(clicked).toBe(0);
    });

    it("destroy で tooltip の portal 要素が残らない", () => {
      handle = createEditorSideToolbar({ t, onToggleComment: () => {} });
      const outline = buttons(handle)[0];
      // hover で tooltip を open（portal に append される）。
      outline.dispatchEvent(new Event("mouseenter"));
      const tipBefore = document.querySelectorAll("[data-am-tooltip]").length;
      expect(tipBefore).toBeGreaterThanOrEqual(1);

      handle.destroy();
      expect(document.querySelectorAll("[data-am-tooltip]").length).toBe(0);
    });
  });
});

describe("createEditorSideToolbar — レスポンシブ（旧 module.css parity）", () => {
  it("root にレスポンシブクラスが付き max-width:900px で隠すスタイルが注入される", () => {
    // 旧 EditorSideToolbar.module.css: @media (max-width:900px) { .root { display:none } }
    const handle = createEditorSideToolbar({ t: (k: string) => k, onToggleComment: () => {} });
    expect(handle.el.classList.contains("am-side-toolbar")).toBe(true);
    const style = document.getElementById("am-side-toolbar-style");
    expect(style?.textContent).toContain("max-width: 900px");
    expect(style?.textContent).toContain(".am-side-toolbar");
    handle.destroy();
  });
});
