/**
 * 脱React の vanilla DOM「SlashCommandMenu」ファクトリ
 * （framework-decoupling Phase 3 / 脱React chrome seam）。
 *
 * React 原版 `components/SlashCommandMenu.tsx`（MUI/ui Paper / MenuList / MenuItem /
 * ListItemIcon / ListItemText / Text / useFloating + createPortal 消費）の素 DOM 版。
 *
 * ProseMirror の slashCommand 拡張（`extensions/slashCommandExtension`）が
 * `slashCommandCallbackRef.current` を通じて流す suggestion state
 * （active / query / from / navigationKey）を駆動源とするフローティングメニュー。
 *
 * 変換規約:
 * - React props → ファクトリ options（`editor` / `t` / `items` / `setCallback` を opts で受ける）。
 *   React 版は `slashCommandCallbackRef`（RefObject）に callback を代入していたが、vanilla 版は
 *   opts.setCallback（host が plugin の onStateChange へ橋渡しする setter）を呼んで callback を
 *   公開する。host は plugin から `handle` の受け取った callback を呼ぶことで suggestion を更新する。
 *   戻り値は `{ update, destroy }`（トリガー要素は持たない＝メニュー本体は active 時に都度生成）。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。NoResults の
 *   テキスト色は `getTextSecondary(isDark)`（固定色）→ `--am-color-text-secondary` に委ねる。
 * - `useMarkdownT` → `t` を opts で受領。
 * - `useState`/`useEffect`/`useRef`/`useMemo` → closure 変数 + 明示的 listener 登録/解除。
 * - React の `<div role=menu>` + `Paper` + `MenuList` + 各 `MenuItem` →
 *   active 時に素 DOM（floating コンテナ + createMenuList + createMenuItem 群）を都度生成し、
 *   `from`（カーソル位置）の `coordsAtPos` から作る virtual anchor へ createFloating で配置する。
 *   非 active 時 / destroy 時にそのハンドルを解放する。
 * - icon は React.ReactElement ではなく SVG path 文字列（`iconPath`）で受ける（React 非依存）。
 *
 * 本番未配線（追加のみ）。host が editor / items / setCallback を渡して生成する想定。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { SLASH_COMMAND_FONT_SIZE } from "../constants/dimensions";
import { Z_FULLSCREEN } from "../constants/zIndex";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import type { TranslationFn } from "../types";
import {
  createFloating,
  createListItemIcon,
  createListItemText,
  createMenuItem,
  createMenuList,
  svgIcon,
  type Placement,
} from "@anytime-markdown/ui-core";

/**
 * vanilla 版のスラッシュコマンド項目（React `SlashCommandItem` の vanilla 置換）。
 * icon を React.ReactElement ではなく SVG path（または複数 path）で持つ。action は editor 操作のみ
 * （React 非依存）のため React 版と同一の関数をそのまま流用できる。
 */
export interface VanillaSlashCommandItem {
  /** 一意 id（key 用）。 */
  id: string;
  /** 表示ラベルの i18n キー。 */
  labelKey: string;
  /** アイコンの SVG path（24x24 viewBox。複数 path も可）。 */
  iconPath: string | readonly string[];
  /** フィルタ用キーワード。 */
  keywords: string[];
  /** 確定時の editor 操作。 */
  action: (editor: Editor) => void;
}

/**
 * label / keyword による項目フィルタ（React `filterSlashItems` と同一ロジックの vanilla 版・
 * React import を持ち込まないため再実装）。空クエリは全件返す。
 */
export function filterVanillaSlashItems(
  items: readonly VanillaSlashCommandItem[],
  query: string,
  t: TranslationFn,
): VanillaSlashCommandItem[] {
  if (!query) return [...items];
  const lower = query.toLowerCase();
  return items.filter((item) => {
    const label = t(item.labelKey).toLowerCase();
    if (label.includes(lower)) return true;
    return item.keywords.some((kw) => kw.toLowerCase().includes(lower));
  });
}

/** {@link createSlashCommandMenu} のオプション（React `SlashCommandMenuProps` の vanilla 置換）。 */
export interface CreateSlashCommandMenuOptions {
  /** 駆動対象 editor（coordsAtPos でアンカー座標を求め、chain で確定操作を実行する）。 */
  editor: Editor;
  /** i18n 翻訳関数。 */
  t: TranslationFn;
  /** メニューに並べるスラッシュコマンド項目。 */
  items: readonly VanillaSlashCommandItem[];
  /**
   * suggestion 更新 callback を host へ公開する setter（React の slashCommandCallbackRef 代入相当）。
   * host は plugin の onStateChange からこの callback を呼ぶことで active/query/navigationKey を流す。
   * destroy 時には no-op を再登録して stale 呼び出しを防ぐ。
   */
  setCallback: (cb: (state: SlashCommandState) => void) => void;
  /** floating の配置（既定 bottom-start）。 */
  placement?: Placement;
  /** ポータルマウント先（既定 document.body）。 */
  portalTarget?: HTMLElement;
}

/** {@link createSlashCommandMenu} の戻り値。 */
export interface SlashCommandMenuHandle {
  /**
   * 現在開いているメニューの floating コンテナ（active 時のみ。閉じていれば null）。
   * テスト・host の参照用。直接 append しない（生成時に portalTarget へ self-append 済み）。
   */
  getMenuEl: () => HTMLDivElement | null;
  /** items / t の差し替え（開いていれば再描画）。 */
  update: (next: Partial<Pick<CreateSlashCommandMenuOptions, "items" | "t">>) => void;
  /** 開いているメニュー・callback・listener を解放する。 */
  destroy: () => void;
}

/** suggestion state から virtual anchor（getBoundingClientRect を持つ ReferenceElement）を作る。 */
function buildVirtualAnchor(
  editor: Editor,
  from: number,
): { getBoundingClientRect: () => DOMRect } | null {
  if (!editor?.view) return null;
  try {
    const coords = editor.view.coordsAtPos(from);
    const rect: DOMRect = {
      x: coords.left,
      y: coords.bottom,
      top: coords.bottom,
      left: coords.left,
      bottom: coords.bottom + 4,
      right: coords.left,
      width: 0,
      height: 4,
      toJSON: () => ({}),
    };
    return { getBoundingClientRect: () => rect };
  } catch (err) {
    console.warn("SlashCommandMenu: failed to get cursor coordinates", err);
    return null;
  }
}

/**
 * vanilla SlashCommandMenu を生成する。
 *
 * - active=true で virtual anchor を作り、floating コンテナ（role=menu）+ Paper 相当 + status 行 +
 *   フィルタ済み項目の MenuItem 群を都度生成して portalTarget へ self-append する。
 * - ArrowUp/Down は selectedIndex を移動し、選択項目を viewport へスクロールする。
 * - Enter は ProseMirror トランザクション中の副作用を避けるため setTimeout(0) で `from`〜カーソル
 *   までを削除してから item.action を実行する（React 版と同一ロジック）。
 * - Escape / active=false で閉じる。クリックでも該当 index を確定する。
 *
 * @returns `getMenuEl` / `update` / `destroy`。
 */
export function createSlashCommandMenu(
  opts: CreateSlashCommandMenuOptions,
): SlashCommandMenuHandle {
  const { editor, setCallback } = opts;
  let t = opts.t;
  let items = opts.items;
  const placement: Placement = opts.placement ?? "bottom-start";
  const portalTarget = opts.portalTarget ?? document.body;

  // --- suggestion state（React の useState 群の closure 版）。 ---
  let active = false;
  let query = "";
  let from = 0;
  let selectedIndex = 0;

  // --- 現在開いているメニューの DOM / floating ハンドル。 ---
  let menuEl: HTMLDivElement | null = null;
  let floating: { update: () => void; destroy: () => void } | null = null;
  let menuList: ReturnType<typeof createMenuList> | null = null;
  let menuItemHandles: Array<{ destroy: () => void }> = [];
  let filteredItems: VanillaSlashCommandItem[] = [];
  let destroyed = false;

  /** 開いているメニュー DOM / floating / 子ハンドルを解放する（state は触らない）。 */
  const teardownMenu = (): void => {
    floating?.destroy();
    floating = null;
    for (const h of menuItemHandles) h.destroy();
    menuItemHandles = [];
    menuList?.destroy();
    menuList = null;
    menuEl?.remove();
    menuEl = null;
  };

  /** index の項目を確定する（"/" + query 削除 → action → 閉じる）。React 版 executeCommand 相当。 */
  const executeCommand = (index: number): void => {
    const item = filteredItems[index];
    if (!item) return;
    const cursorPos = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from, to: cursorPos }).run();
    item.action(editor);
    close();
  };

  /** active=false にして開いているメニューを閉じ、state をリセットする。 */
  const close = (): void => {
    active = false;
    query = "";
    selectedIndex = 0;
    teardownMenu();
  };

  /** selectedIndex に応じて選択項目のハイライト・aria・スクロールを反映する。 */
  const applySelection = (): void => {
    if (!menuEl) return;
    const itemEls = [...menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    itemEls.forEach((el, i) => {
      const selected = i === selectedIndex;
      // createMenuItem の selected 背景は update 経由でないと反映されないため、
      // ここでは aria-current のみ付け、背景は menuItemHandles 側の update で同期する。
      if (selected) {
        el.setAttribute("aria-current", "true");
      } else {
        el.removeAttribute("aria-current");
      }
    });
    menuItemHandles.forEach((h, i) => {
      (h as { update?: (n: { selected: boolean }) => void }).update?.({
        selected: i === selectedIndex,
      });
    });
    // scrollIntoView は jsdom 未実装。メソッド自体を optional 呼び出しして環境差を吸収する。
    itemEls[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  };

  /**
   * active 状態のメニュー DOM を（再）構築する。query 変化や items 差し替えでも呼ぶ。
   * 既存メニューは teardown してから作り直す（差分更新ではなく素朴に再生成）。
   */
  const renderMenu = (): void => {
    teardownMenu();
    if (!active || destroyed) return;

    const anchor = buildVirtualAnchor(editor, from);
    if (!anchor) return;

    filteredItems = filterVanillaSlashItems(items, query, t);

    // floating コンテナ（React 版の role=menu div）。
    const container = document.createElement("div");
    container.setAttribute("role", "menu");
    container.setAttribute("aria-label", t("slashCommandPlaceholder"));
    container.style.zIndex = String(Z_FULLSCREEN);

    // Paper 相当（max-height / overflow / 寸法 / elevation）。
    const paper = document.createElement("div");
    paper.style.cssText =
      "max-height:300px;overflow:auto;min-width:200px;max-width:280px;" +
      "box-sizing:border-box;background-color:var(--am-color-bg-paper);" +
      "border-radius:var(--am-radius-md);box-shadow:var(--am-elevation-3);";
    container.appendChild(paper);

    // status 行（スクリーンリーダー向け。常に出す）。
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    if (filteredItems.length > 0) {
      // 視覚的に隠す（React 版の clip rect 相当）。
      status.style.cssText =
        "position:absolute;width:100%;height:100%;overflow:hidden;clip:rect(0,0,0,0);";
      status.textContent = `${filteredItems.length} items`;
    } else {
      status.style.cssText =
        `padding:12px 16px;color:var(--am-color-text-secondary);` +
        `font-size:${SLASH_COMMAND_FONT_SIZE};text-align:center;`;
      status.textContent = t("slashCommandNoResults");
    }
    paper.appendChild(status);

    if (filteredItems.length > 0) {
      // MenuList（dense）。キーボード state machine は SlashCommand 側で持つため keyboard=false。
      const list = createMenuList({ dense: true, keyboard: false });
      menuList = list;
      for (let i = 0; i < filteredItems.length; i += 1) {
        const item = filteredItems[i];
        const icon = createListItemIcon({ children: svgIcon(item.iconPath, 20) });
        const text = createListItemText({ children: t(item.labelKey) });
        const index = i;
        const mi = createMenuItem({
          dense: true,
          role: "menuitem",
          selected: i === selectedIndex,
          style: { fontSize: SLASH_COMMAND_FONT_SIZE, minHeight: "36px" },
          children: [icon.el, text.el],
          onClick: () => executeCommand(index),
        });
        menuItemHandles.push(mi);
        list.el.appendChild(mi.el);
      }
      paper.appendChild(list.el);
    }

    portalTarget.appendChild(container);
    menuEl = container;

    // virtual anchor へ floating 配置（React 版 useFloating offset 4 / flip / shift）。
    floating = createFloating({
      reference: anchor,
      floating: container,
      placement,
      offsetPx: 4,
    });

    applySelection();
  };

  /** ArrowDown/ArrowUp の selectedIndex 移動（wraparound・React 版と同一）。 */
  const moveSelection = (delta: number): void => {
    const list = filterVanillaSlashItems(items, query, t);
    if (list.length === 0) {
      selectedIndex = 0;
      return;
    }
    if (delta > 0) {
      selectedIndex = selectedIndex < list.length - 1 ? selectedIndex + 1 : 0;
    } else {
      selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : list.length - 1;
    }
    applySelection();
  };

  /** Enter 確定（ProseMirror トランザクション中の副作用回避のため setTimeout(0)）。 */
  const confirmDeferred = (stateFrom: number, stateQuery: string): void => {
    setTimeout(() => {
      if (destroyed) return;
      const currentIndex = selectedIndex;
      const list = filterVanillaSlashItems(items, stateQuery, t);
      const item = list[currentIndex];
      if (!item) return;
      const cursorPos = editor.state.selection.from;
      editor.chain().focus().deleteRange({ from: stateFrom, to: cursorPos }).run();
      item.action(editor);
      close();
    }, 0);
  };

  /**
   * suggestion callback 本体（React 版 useEffect 内の slashCommandCallbackRef.current 相当）。
   * plugin から navigationKey 付きで呼ばれ、state を更新してメニューを再描画する。
   */
  const callback = (state: SlashCommandState): void => {
    if (destroyed) return;
    active = state.active;
    query = state.query;
    from = state.from;

    if (!state.active) {
      selectedIndex = 0;
      teardownMenu();
      return;
    }

    if (state.navigationKey === "ArrowDown") {
      moveSelection(1);
      return;
    }
    if (state.navigationKey === "ArrowUp") {
      moveSelection(-1);
      return;
    }
    if (state.navigationKey === "Enter") {
      confirmDeferred(state.from, state.query);
      return;
    }
    if (state.navigationKey === "Escape") {
      close();
      return;
    }

    // navigationKey === null（query 変化 / 初回 active）: selectedIndex リセットして再描画。
    selectedIndex = 0;
    // 既に開いていれば再構築（query フィルタ反映）、未オープンなら新規描画。
    renderMenu();
  };

  // host へ callback を公開（React 版 slashCommandCallbackRef.current = ... 相当）。
  setCallback(callback);

  return {
    getMenuEl: () => menuEl,
    update(next) {
      if (next.t !== undefined) t = next.t;
      if (next.items !== undefined) items = next.items;
      if (active) renderMenu();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // stale 呼び出し防止（React 版 unmount cleanup 相当）。
      setCallback(() => {});
      teardownMenu();
      active = false;
    },
  };
}
