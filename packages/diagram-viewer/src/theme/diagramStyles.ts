/**
 * 図のスタイル。宿主（VS Code webview / web-app）のトークンを**そのまま引く**。
 *
 * 色を自前で持たない。持つと、ダークとライトの切り替えが宿主と別々に動き、片方のモードだけ
 * 読めない配色になる（`--vscode-*` も MUI の `--mui-palette-*` も、モードが変わればその場で
 * 値が入れ替わる）。どちらの宿主でもないときだけ、水墨のライト既定へ落とす。
 *
 * 移植元は anytime-travel の `src/styles.css` のうち系図の節。
 */

/** 図の根に当てるクラス名。宿主のスタイルと衝突しないよう接頭辞を付ける。 */
export const DIAGRAM_ROOT_CLASS = 'anytime-diagram';

/** 縁のアイコンの大きさ（px）。`@anytime-markdown/diagram-core` の `GUTTER_ICON_PX` と同じ値。 */
const GUTTER_ICON_PX = 20;

export const DIAGRAM_STYLES = `
.${DIAGRAM_ROOT_CLASS} {
  --diagram-bg: var(--vscode-editor-background, var(--mui-palette-background-default, #F2EFE8));
  --diagram-raised: var(--vscode-editorWidget-background, var(--mui-palette-background-paper, #FBF9F3));
  --diagram-fg: var(--vscode-editor-foreground, var(--mui-palette-text-primary, #1F1E1C));
  --diagram-muted: var(--vscode-descriptionForeground, var(--mui-palette-text-secondary, #5C5A55));
  --diagram-border: var(--vscode-panel-border, var(--mui-palette-divider, rgba(31, 30, 28, 0.12)));
  --diagram-accent: var(--vscode-focusBorder, var(--mui-palette-primary-main, #3D4A52));
  --diagram-danger: var(--vscode-errorForeground, var(--mui-palette-error-main, #6B2A20));
  --diagram-radius: 6px;

  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  color: var(--diagram-fg);
  font-family: var(--vscode-font-family, inherit);
  font-size: 13px;
}
.${DIAGRAM_ROOT_CLASS} *,
.${DIAGRAM_ROOT_CLASS} *::before,
.${DIAGRAM_ROOT_CLASS} *::after { box-sizing: border-box; }

.anytime-diagram-lead,
.anytime-diagram-note { margin: 4px 0; color: var(--diagram-muted); font-size: 0.85em; }
.anytime-diagram-title { margin: 0 0 4px; font-size: 1.1em; }

.anytime-diagram-toolbar,
.anytime-diagram-selection { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.anytime-diagram-toolbar button,
.anytime-diagram-toolbar select,
.anytime-diagram-selection button {
  background: var(--diagram-bg); color: var(--diagram-fg); border: 1px solid var(--diagram-border);
  border-radius: var(--diagram-radius); padding: 6px 10px; font: inherit; cursor: pointer;
}
.anytime-diagram-toolbar button:disabled,
.anytime-diagram-selection button:disabled { opacity: 0.45; cursor: default; }
.anytime-diagram-toolbar select { max-width: min(65vw, 300px); cursor: default; }
.anytime-diagram-toolbar output,
.anytime-diagram-selection output { color: var(--diagram-muted); }

/* 図の枠。編集画面では残りの高さをすべて取る（あふれは枠の中だけで起こす）。 */
.anytime-diagram-viewport {
  position: relative; flex: 1; width: 100%; min-height: 240px; overflow: hidden;
  border: 1px solid var(--diagram-border); border-radius: var(--diagram-radius);
  background: var(--diagram-raised);
  touch-action: none; cursor: grab; user-select: none; overscroll-behavior: contain;
}
.anytime-diagram-viewport:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: -2px; }
.anytime-diagram-viewport.is-dragging { cursor: grabbing; }
.anytime-diagram-surface { position: absolute; top: 0; left: 0; transform-origin: 0 0; }

.anytime-diagram-edges { position: absolute; inset: 0; pointer-events: none; }
.anytime-diagram-edges path {
  fill: none; stroke: var(--diagram-muted); stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round; pointer-events: stroke; cursor: pointer;
}
.anytime-diagram-edges g.is-line-dimmed { opacity: 0.12; }
.anytime-diagram-edges g.is-line-selected path { stroke-width: 2.5; }
.anytime-diagram-edges path:focus-visible { outline: none; stroke: var(--diagram-accent); stroke-width: 3; }
.anytime-diagram-edges .edge-spouse { stroke: var(--diagram-accent); stroke-dasharray: 8 5; }
.anytime-diagram-edges .edge-oath,
.anytime-diagram-edges .edge-creation { stroke-dasharray: 2 5; }
.anytime-diagram-edges .point { stroke: var(--diagram-raised); stroke-width: 1.5; fill: var(--diagram-muted); }
.anytime-diagram-edges .point-junction { fill: var(--diagram-accent); }

/*
  置ける場所（空いた升目）の塗り。埋まった升目は塗らない — 塗ってある所へ運べば必ず収まる。
  塗りだけで示し枠線は引かない（箱の枠・選択の輪郭・系統線と線が 4 重になると境界が読めない）。
*/
.anytime-diagram-grid { position: absolute; inset: 0; pointer-events: none; }
.anytime-diagram-grid path { fill: color-mix(in srgb, var(--diagram-accent) 12%, transparent); }

.anytime-diagram-node {
  position: absolute; display: flex; flex-direction: column; align-items: center; min-width: 0;
  padding: 4px 8px; overflow-y: auto; text-align: center; font-size: 0.8em;
  border: 1px solid color-mix(in srgb, var(--diagram-accent) 45%, var(--diagram-border));
  border-radius: var(--diagram-radius); background: var(--diagram-bg);
}
.anytime-diagram-node strong { font-weight: 600; }
.anytime-diagram-node span,
.anytime-diagram-node small { color: var(--diagram-muted); font-size: 0.8em; }
.anytime-diagram-node.is-selected { outline: 3px solid var(--diagram-accent); }
.anytime-diagram-node.is-node-dimmed { opacity: 0.16; }
/*
  編集中は箱をスクロールさせない。\`overflow-y: auto\` のままだと箱はスクロールコンテナで、
  絶対配置の取っ手（右辺・下辺）は内容と一緒に流れて視界から消える。**小さくしすぎた箱を
  戻すための取っ手が、小さい箱でこそ隠れる**という自己強化になる。
*/
.anytime-diagram-viewport.is-editing .anytime-diagram-node { cursor: move; overflow: hidden; }
.anytime-diagram-node.is-moved { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--diagram-accent) 62%, transparent); }

.anytime-diagram-handle { position: absolute; top: 2px; right: 2px; display: flex; gap: 2px; }
.anytime-diagram-handle button {
  min-width: 22px; min-height: 22px; padding: 0; line-height: 1;
  border: 1px solid var(--diagram-border); border-radius: 4px;
  background: var(--diagram-raised); color: var(--diagram-fg); cursor: pointer;
}
.anytime-diagram-handle button:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }
.anytime-diagram-pick[aria-pressed="true"] {
  border-color: var(--diagram-accent); color: var(--diagram-accent);
  box-shadow: inset 0 0 0 1px var(--diagram-accent);
}

/*
  箱の大きさの取っ手。左上の箱の右辺・下辺・右下に置く。掴む縁そのものを取っ手にすると、
  変える対象と操作する場所が一致し、いまの大きさを別の場所で読まなくて済む。
*/
.anytime-diagram-size {
  position: absolute; padding: 0; border: 0; touch-action: none;
  background: color-mix(in srgb, var(--diagram-muted) 40%, transparent); cursor: ew-resize;
}
.anytime-diagram-size.is-width { top: 0; bottom: 0; right: 0; width: 6px; }
.anytime-diagram-size.is-height { left: 0; right: 0; bottom: 0; height: 6px; cursor: ns-resize; }
.anytime-diagram-size.is-both { right: 0; bottom: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.anytime-diagram-size:hover:not(:disabled),
.anytime-diagram-size:focus-visible { background: var(--diagram-accent); }
.anytime-diagram-size:disabled { opacity: 0.45; cursor: default; }
/* 当たり判定は 24px 角まで広げる（WCAG 2.2 Target Size）。見た目は細いままにする。 */
.anytime-diagram-size::before { content: ''; position: absolute; inset: -9px; }
.anytime-diagram-size:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }

/*
  行・列の増減のアイコン。図の枠の上端・左端に貼り付く（図と一緒には流れない）。
  枠全体を覆う層に \`pointer-events: none\` を当て、アイコンだけが押下を受け取る — 層に当たり
  判定を持たせると、上端・左端で始めたドラッグ（図の平行移動）がその帯の中だけ効かなくなる。
*/
.anytime-diagram-gutter { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.anytime-diagram-gutter button {
  position: absolute; pointer-events: auto; width: ${GUTTER_ICON_PX}px; height: ${GUTTER_ICON_PX}px; padding: 0;
  display: flex; align-items: center; justify-content: center; line-height: 1; font-size: 0.8em;
  border: 1px solid var(--diagram-border); border-radius: 999px;
  background: var(--diagram-raised); color: var(--diagram-muted);
  cursor: pointer; transform: translate(-50%, -50%);
}
.anytime-diagram-gutter button:hover:not(:disabled) { border-color: var(--diagram-accent); color: var(--diagram-accent); }
.anytime-diagram-gutter button:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }
.anytime-diagram-gutter button:disabled { opacity: 0.45; cursor: default; }
/* 縦の位置は枠に固定し、横だけが図に従う（列の操作）。行の操作はその逆。 */
.anytime-diagram-gutter .is-column { top: 14px; }
.anytime-diagram-gutter .is-row { left: 14px; }
/* 詰める側は取り消しの操作なので、入れる側と字だけでなく線種でも分ける。 */
.anytime-diagram-gutter .is-remove { border-style: dashed; }

.anytime-diagram-error { color: var(--diagram-danger); }
.anytime-diagram-hidden { display: none; }
.anytime-diagram-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* 確認（破棄・全解除）。宿主のダイアログを借りず、図の中だけで完結させる。 */
.anytime-diagram-confirm {
  position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--diagram-bg) 70%, transparent);
}
.anytime-diagram-confirm-box {
  max-width: 420px; padding: 16px; border: 1px solid var(--diagram-border);
  border-radius: var(--diagram-radius); background: var(--diagram-raised);
}
.anytime-diagram-confirm-box h3 { margin: 0 0 8px; font-size: 1em; }
.anytime-diagram-confirm-box p { margin: 0 0 12px; color: var(--diagram-muted); }
.anytime-diagram-confirm-box div { display: flex; gap: 8px; justify-content: flex-end; }
.anytime-diagram-confirm-box button {
  background: var(--diagram-bg); color: var(--diagram-fg); border: 1px solid var(--diagram-border);
  border-radius: var(--diagram-radius); padding: 6px 12px; font: inherit; cursor: pointer;
}
`;
