/**
 * ui-core Menu を graph-viewer の従来意匠（旧 `.gv-menu-paper`）で開くラッパー。
 *
 * ui-core の Menu 既定（radius 8px / elevation 3 / padding 8px 0）と gv の従来意匠
 * （radius 4px / elevation 2 / padding 4px 0）の差分を `paperStyle` で固定し、
 * 移行中の視覚不変を保つ。項目側の寸法差（min-height / font-size / アイコン幅）は
 * `applyGraphUiThemeVars` が graph ルートへ書き出す `--am-menu-*` 変数が担う。
 *
 * ポータル先は必須引数にする。graph-viewer は `--am-color-*` を documentElement でなく
 * 自ルートへスコープするため（`ui/tokens.ts`）、`document.body` へポータルすると
 * トークンが届かず配色が崩れる。呼び元は graph ルート（またはその配下）を渡すこと。
 *
 * ui-vanilla 撤去（フェーズ4）完了後、意匠を ui-core 標準へ寄せるかを別途判断し、
 * 寄せる場合は本ラッパーを削除して ui-core Menu を直接使う。
 */

import { createMenu } from '@anytime-markdown/ui-core/Menu';
import type { VanillaContent } from '@anytime-markdown/ui-core/dom';

export interface GraphMenuOptions {
  /** 閉じる要求（backdrop クリック / ESC / Tab）時のコールバック。 */
  readonly onClose: () => void;
  /** menu（ul）内に入れる項目。 */
  readonly children: VanillaContent;
  /** ポータル先（graph ルートまたはその配下）。`--am-color-*` の届く要素を渡す。 */
  readonly portalTarget: HTMLElement;
  /** anchorEl 方式（要素基準で配置）。 */
  readonly anchorEl?: HTMLElement;
  /** アンカー参照方式。既定 "anchorEl"。 */
  readonly anchorReference?: 'anchorEl' | 'anchorPosition';
  /** anchorReference="anchorPosition" 時の固定座標（viewport 基準）。 */
  readonly anchorPosition?: { top: number; left: number };
}

export interface GraphMenuHandle {
  /** backdrop + menu を内包する wrapper 要素。 */
  readonly el: HTMLDivElement;
  /** メニューを閉じて DOM から取り外す（冪等）。 */
  close(): void;
}

// 旧 .gv-menu-paper の意匠（ui/injectStyles.ts）と一致させる paperStyle。
// box-shadow は design.md 4.3 のエレベーション 2（ドロップダウン）。
const GV_PAPER_STYLE: Partial<CSSStyleDeclaration> = {
  padding: '4px 0',
  borderRadius: '4px',
  boxShadow:
    '0 5px 5px -3px rgba(0,0,0,.20), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12)',
};

/**
 * graph-viewer 意匠の ui-core Menu を開く。返り値の `close()` は ui-core の `destroy()`
 * （listener 解除・フォーカス復帰・DOM 取り外し）に対応する。
 */
export function createGraphMenu(opts: GraphMenuOptions): GraphMenuHandle {
  const menu = createMenu({
    onClose: opts.onClose,
    anchorReference: opts.anchorReference,
    anchorEl: opts.anchorEl ?? null,
    anchorPosition: opts.anchorPosition,
    children: opts.children,
    paperStyle: GV_PAPER_STYLE,
    portalTarget: opts.portalTarget,
  });
  return { el: menu.el, close: menu.destroy };
}
