import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GraphView } from "./GraphView";

/**
 * math ブロックのグラフ描画（JSXGraph / Plotly + パラメータスライダー）の React マウント。
 *
 * 反転アーキテクチャ（plan §5.2）: グラフは外部ライブラリ + 操作スライダーを伴う
 * 重量 React 部品のため、native codeblock NodeView の math グラフ表示だけは
 * `createRoot` で `GraphView` をマウントする（embed と同方針の限定許容）。
 * 表示 ON/OFF は overlay のグラフトグル → node 属性 `graphEnabled` で駆動する。
 */

export interface GraphMountHandle {
  render(code: string, enabled: boolean, isDark: boolean): void;
  destroy(): void;
}

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
