/**
 * MarkdownMinimap（vanilla）— スクロールバー横の変更オーバービュー。
 *
 * 旧 React 実装（`components/MarkdownMinimap.tsx` + `hooks/useMarkdownMinimap.ts`）が
 * G4-B の脱 React 移行（commit b1f921c70）で削除されたまま vanilla へ置換されず
 * 機能が欠落していた（回帰）。本ファイルはその 2 ファイルを 1 つの vanilla ハンドルへ
 * 統合して復元する。
 *
 * 「アクティブソース」抽象を持ち、表示対象を切り替えられる:
 * - 既定: 変更追跡（changeGutterExtension の getChangedPositions）を本文スクロールコンテナ
 *   （[data-am-content]）基準で表示。前後ナビは goToPrevChange/goToNextChange へ委譲。
 * - 比較モード: setDiffSource() で差分位置（右ペインの [data-diff-block]）を右ペインスクロール
 *   コンテナ基準で表示。前後ナビは右ペインの比率スクロール。
 *
 * テーマ追従色は CSS 変数（--am-color-success-main 等）で表現し、ダーク/ライト切替で
 * 自動再評価される（再描画不要）。
 */
import type { Editor } from "@anytime-markdown/markdown-core";
import { createIconButton, svgIcon, type IconButtonHandle } from "@anytime-markdown/ui-core";

import { getChangedPositions } from "../extensions/changeGutterExtension";
import type { TranslationFn } from "../types";

/** バー全体の幅(px)。旧 React 実装と同値。 */
const BAR_WIDTH = 16;
/** マーカー最小高さ(px)。バー高さの 3% と max を取る（旧実装と同値）。 */
const MARKER_MIN_HEIGHT = 3;
/** 変更/差分マーカー色（CSS 変数）。本文の右側 diff ハイライト緑と同系で揃える。 */
const MARKER_COLOR = "var(--am-color-success-main)";
/** ratio ベースのナビで「現在位置と同一」を弾く許容誤差。 */
const NAV_EPSILON = 0.001;
/** ui/icons.tsx と同一の Material SVG path（KeyboardArrowUp / KeyboardArrowDown）。 */
const ICON_ARROW_UP = "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z";
const ICON_ARROW_DOWN = "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z";

/** ratio 配列を返すマーカー源とスクロールコンテナの組（比較モードで外部注入）。 */
export interface MarkdownMinimapDiffSource {
  /** 差分の存在するペインのスクロールコンテナ（右ペイン）。 */
  scrollContainer: HTMLElement;
  /** 差分位置を 0〜1 の比率配列で返す。スクロール/リサイズ/更新ごとに呼ばれる。 */
  getRatios: () => number[];
}

/** {@link createMarkdownMinimap} のオプション。 */
export interface CreateMarkdownMinimapOptions {
  /** TipTap エディタ。`update` 購読と `domAtPos` による位置解決に使う。 */
  editor: Editor;
  /**
   * 本文のスクロールコンテナ（overflow:auto の `[data-am-content]`）。
   * 旧実装は `getElementById("md-editor-content")` で暗黙取得していたが、vanilla 化で
   * 当該 ID が廃止されたため、呼び元が明示的に渡す。
   */
  scrollContainer: HTMLElement;
  /** i18n。 */
  t: TranslationFn;
}

/** {@link createMarkdownMinimap} の戻り値。 */
export interface MarkdownMinimapHandle {
  /** root（呼び元が mainRow 等へ配置する）。 */
  el: HTMLElement;
  /** マーカーとボタン活性状態を再計算する（外部からの強制更新用）。 */
  refresh: () => void;
  /**
   * 表示/非表示を切り替える。source モード（WYSIWYG 非表示）では false にして、
   * レイアウトを持たない本文に対する誤ったマーカー集中表示を避ける。
   */
  setActive: (active: boolean) => void;
  /**
   * 比較モードの差分ソースを設定/解除する。設定中はマーカー源とスクロールコンテナが
   * 差分ペインへ切り替わり、前後ナビは比率スクロールになる。null で既定（変更追跡）へ戻す。
   */
  setDiffSource: (source: MarkdownMinimapDiffSource | null) => void;
  /** editor 購読・listener・子コントロールを解放する。 */
  destroy: () => void;
}

/**
 * 変更位置（doc 内オフセット）を、スクロールコンテナ全体に対する 0〜1 の比率配列へ変換する。
 *
 * 比率はスクロール位置に依存しない（`elTop - containerTop + scrollTop` で絶対 Y に正規化）。
 */
function calcChangeRatios(editor: Editor, container: HTMLElement): number[] {
  const { scrollTop, scrollHeight } = container;
  if (scrollHeight <= 0) return [];
  const containerTop = container.getBoundingClientRect().top;
  const positions = getChangedPositions(editor.state);

  return positions.flatMap((pos) => {
    // domAtPos は編集途中の detached ノードで throw し得る（vendored tiptap の既知挙動）。
    // これは「この瞬間その位置が DOM へ解決できない」だけの想定内の事象なので、当該マーカーを
    // スキップして次の refresh で再計算する。ただし silent catch は規約違反なので pos と内容を
    // ログする（このパッケージの library 層は console 経由が既定。vanillaMarkdownEditor の
    // localStorage ハンドラ等と同じ方針）。
    try {
      const domInfo = editor.view.domAtPos(pos);
      // node が Element ならそれ自身、Text 等なら親 Element を採用（どちらも getBoundingClientRect を持つ）。
      const el = domInfo.node instanceof Element ? domInfo.node : domInfo.node.parentElement;
      if (!el) return [];
      const elTop = el.getBoundingClientRect().top;
      const ratio = (elTop - containerTop + scrollTop) / scrollHeight;
      return [Math.max(0, Math.min(1, ratio))];
    } catch (err) {
      console.warn(
        `[MarkdownMinimap] domAtPos failed at pos=${pos}:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  });
}

/** 現在のスクロール位置から見て dir 方向の隣接マーカー比率へスムーススクロールする。 */
function scrollToAdjacentRatio(
  container: HTMLElement,
  ratios: readonly number[],
  dir: 1 | -1,
): void {
  const { scrollHeight } = container;
  if (ratios.length === 0 || scrollHeight <= 0) return;
  const current = container.scrollTop / scrollHeight;
  const sorted = [...ratios].sort((a, b) => a - b);
  // 順方向: 現在位置より下の最初のマーカー、無ければ先頭へ wrap。
  // 逆方向: 現在位置より上の最後のマーカー、無ければ末尾(最大比率)へ wrap。
  const target =
    dir > 0
      ? (sorted.find((r) => r > current + NAV_EPSILON) ?? sorted[0])
      : (sorted.findLast((r) => r < current - NAV_EPSILON) ?? sorted.at(-1) ?? sorted[0]);
  container.scrollTo({ top: target * scrollHeight, behavior: "smooth" });
}

/**
 * スクロールバー横の変更/差分オーバービューを生成する（旧 React `MarkdownMinimap` の vanilla 置換）。
 */
export function createMarkdownMinimap(
  opts: Readonly<CreateMarkdownMinimapOptions>,
): MarkdownMinimapHandle {
  const { editor, scrollContainer: defaultContainer, t } = opts;

  // 比較モードの差分ソース。null の間は既定（変更追跡）で動作する。
  let diffSource: MarkdownMinimapDiffSource | null = null;
  let active = true;

  /** 現在の表示対象スクロールコンテナ（既定=本文 / 比較=右ペイン）。 */
  const activeContainer = (): HTMLElement => diffSource?.scrollContainer ?? defaultContainer;
  /** 現在のマーカー比率。 */
  const activeRatios = (): number[] =>
    diffSource ? diffSource.getRatios() : calcChangeRatios(editor, defaultContainer);

  const root = document.createElement("div");
  root.setAttribute("data-am-minimap", "");
  root.style.cssText = [
    `width:${BAR_WIDTH}px`,
    "flex-shrink:0",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "user-select:none",
    "z-index:5",
  ].join(";");

  const goToPrev = (): void => {
    if (diffSource) {
      scrollToAdjacentRatio(activeContainer(), activeRatios(), -1);
    } else {
      editor.commands.goToPrevChange();
    }
  };
  const goToNext = (): void => {
    if (diffSource) {
      scrollToAdjacentRatio(activeContainer(), activeRatios(), 1);
    } else {
      editor.commands.goToNextChange();
    }
  };

  const prevBtn: IconButtonHandle = createIconButton({
    size: "xs",
    ariaLabel: t("minimapPrevChange"),
    title: t("minimapPrevChange"),
    children: svgIcon(ICON_ARROW_UP, 14),
    onClick: goToPrev,
  });

  // クリックジャンプ可能なバー本体。マーカーを absolute で重ねる基準（position:relative）。
  const bar = document.createElement("div");
  bar.setAttribute("data-am-minimap-bar", "");
  bar.style.cssText = [
    "flex:1 1 auto",
    "width:100%",
    "position:relative",
    "cursor:pointer",
    "overflow:hidden",
    "background-color:var(--am-color-action-hover)",
    "border-left:1px solid var(--am-color-divider)",
  ].join(";");
  bar.addEventListener("click", (e: MouseEvent) => {
    const rect = bar.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratio = (e.clientY - rect.top) / rect.height;
    const container = activeContainer();
    container.scrollTo({
      top: Math.max(0, Math.min(1, ratio)) * container.scrollHeight,
      behavior: "smooth",
    });
  });

  const nextBtn: IconButtonHandle = createIconButton({
    size: "xs",
    ariaLabel: t("minimapNextChange"),
    title: t("minimapNextChange"),
    children: svgIcon(ICON_ARROW_DOWN, 14),
    onClick: goToNext,
  });

  root.append(prevBtn.el, bar, nextBtn.el);

  const refresh = (): void => {
    if (editor.isDestroyed || !active) return;
    const ratios = activeRatios();
    const hasMarkers = ratios.length > 0;
    prevBtn.update({ disabled: !hasMarkers });
    nextBtn.update({ disabled: !hasMarkers });

    bar.replaceChildren();
    const barHeight = bar.clientHeight;
    const markerHeight =
      barHeight > 0 ? Math.max(MARKER_MIN_HEIGHT, barHeight * 0.03) : MARKER_MIN_HEIGHT;
    for (const ratio of ratios) {
      const marker = document.createElement("div");
      marker.setAttribute("data-am-minimap-marker", "");
      marker.style.cssText = [
        "position:absolute",
        "left:0",
        "right:0",
        `top:${ratio * 100}%`,
        `height:${markerHeight}px`,
        "border-radius:1px",
        "pointer-events:none",
        `background-color:${MARKER_COLOR}`,
      ].join(";");
      bar.appendChild(marker);
    }
  };

  // スクロール/リサイズ購読は現在のスクロールコンテナへ張り、ソース切替時に張り替える。
  // editor.update は対象が常に本文 editor（比較モードでも同一インスタンスを右ペインへ移設）の
  // ため不変。
  let boundContainer: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const bindContainer = (container: HTMLElement): void => {
    if (boundContainer === container) return;
    boundContainer?.removeEventListener("scroll", refresh);
    resizeObserver?.disconnect();
    boundContainer = container;
    container.addEventListener("scroll", refresh, { passive: true });
    resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    resizeObserver?.observe(container);
  };

  editor.on("update", refresh);
  bindContainer(defaultContainer);
  refresh();

  return {
    el: root,
    refresh,
    setActive: (next: boolean) => {
      if (active === next) return;
      active = next;
      root.style.display = next ? "flex" : "none";
      if (next) refresh();
    },
    setDiffSource: (source: MarkdownMinimapDiffSource | null) => {
      diffSource = source;
      bindContainer(activeContainer());
      refresh();
    },
    destroy: () => {
      editor.off("update", refresh);
      boundContainer?.removeEventListener("scroll", refresh);
      resizeObserver?.disconnect();
      prevBtn.destroy();
      nextBtn.destroy();
    },
  };
}
