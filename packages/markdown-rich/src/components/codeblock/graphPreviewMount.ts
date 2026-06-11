import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GraphView } from "./GraphView";
import { type GraphMountHandle } from "./previewContracts";

/**
 * math ブロックのグラフ描画（JSXGraph / Plotly + パラメータスライダー）の React マウント。
 *
 * 反転アーキテクチャ（plan §5.2）: グラフは外部ライブラリ + 操作スライダーを伴う
 * 重量 React 部品のため、native codeblock NodeView の math グラフ表示だけは
 * `createRoot` で `GraphView` をマウントする（embed と同方針の限定許容）。
 * 表示 ON/OFF は overlay のグラフトグル → node 属性 `graphEnabled` で駆動する。
 *
 * 型定義は `previewContracts.ts` に集約されている。
 */

export type { GraphMountHandle } from "./previewContracts";

export function mountGraphPreview(container: HTMLElement): GraphMountHandle {
  const root: Root = createRoot(container);
  return {
    render(code, enabled, isDark) {
      root.render(createElement(GraphView, { code, enabled, isDark }));
    },
    destroy() {
      root.unmount();
    },
  };
}
