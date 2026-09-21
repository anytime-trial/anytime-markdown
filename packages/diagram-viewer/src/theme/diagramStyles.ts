/**
 * 図のスタイル。宿主（VS Code webview / web-app）のトークンを**そのまま引く**。
 *
 * 色を自前で持たない。持つと、ダークとライトの切り替えが宿主と別々に動き、片方のモードだけ
 * 読めない配色になる。ただし**「宿主の色」を名前で決め打たない** — web-app には
 * `--vscode-*` がライト固定で撒かれており（markdown-editor 由来）、実際にモードで
 * 入れ替わるのは `--am-color-*` のほうだった。参照順の根拠は下の宣言のコメントに書く。
 *
 * 移植元は anytime-travel の `src/styles.css` のうち系図の節。
 */

/** 図の根に当てるクラス名。宿主のスタイルと衝突しないよう接頭辞を付ける。 */
export const DIAGRAM_ROOT_CLASS = 'anytime-diagram';

/** 縁のアイコンの大きさ（px）。`@anytime-markdown/diagram-core` の `GUTTER_ICON_PX` と同じ値。 */
const GUTTER_ICON_PX = 20;

/** 空いた升目の ＋ の大きさ（px）。`@anytime-markdown/diagram-core` の `CELL_ADD_ICON_PX` と同じ値。 */
const CELL_ADD_ICON_PX = 28;

/**
 * 縁のアイコンを並べる帯の位置（枠の上端・左端からの px）。
 *
 * ここに置くのは、**見え方の操作の区画と重なるかを画面の距離で測る**のにこの値が要るため
 * （`ui/gutter.ts` の `covered`）。CSS 側にだけ持たせると、帯を動かした日に重なりの判定だけが
 * 古い位置のまま残り、隠れたアイコンが押せないまま出続ける。
 */
export const GUTTER_TRACK_PX = 14;

export const DIAGRAM_STYLES = `
.${DIAGRAM_ROOT_CLASS} {
  /*
    宿主のトークンを引く順序は **\`--am-color-*\` が先、\`--vscode-*\` が後**。

    web-app が実際にダーク／ライトで入れ替えているのは \`--am-color-*\`（\`<html data-theme>\` に
    インラインで置かれる）で、\`--vscode-*\` は markdown-editor が web 向けに撒いている
    **ライト固定**の一式である。\`--vscode-*\` を先に見ると、web-app をダークにしても図だけが
    白いまま取り残される（題名は濃い字が濃い地に乗って読めなくなる）。

    VS Code の webview では \`--am-color-*\` が無いので 2 番目の \`--vscode-*\` に落ちる。
    どちらも無い宿主だけが最後の水墨のライト既定を使う。

    \`--mui-palette-*\` は挟まない。web-app に存在せず（実測で 0 件）、在るように見えるだけの
    中継は、本当に効いている層がどれなのかを隠す。
  */
  --diagram-bg: var(--am-color-bg-default, var(--vscode-editor-background, #F2EFE8));
  --diagram-raised: var(--am-color-bg-paper, var(--vscode-editorWidget-background, #FBF9F3));
  --diagram-fg: var(--am-color-text-primary, var(--vscode-editor-foreground, #1F1E1C));
  --diagram-muted: var(--am-color-text-secondary, var(--vscode-descriptionForeground, #5C5A55));
  --diagram-border: var(--am-color-divider, var(--vscode-panel-border, rgba(31, 30, 28, 0.12)));
  --diagram-accent: var(--am-color-primary-main, var(--vscode-focusBorder, #3D4A52));
  --diagram-danger: var(--am-color-error-main, var(--vscode-errorForeground, #6B2A20));
  --diagram-radius: 6px;

  display: flex;
  flex-direction: column;
  /*
    宿主の残りの高さをすべて取る。\`flex: 0 1 auto\`（既定）のままだと、縦に伸びる器の中でも
    中身の高さで止まり、図の枠が最小高さ（240px）へ縮む — 画面は空いているのに図だけが小さい。
    横並びの器に置かれたときは \`flex-grow\` が幅に効き、高さは \`align-items: stretch\` が埋める。
  */
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  color: var(--diagram-fg);
  /* 書体は宿主から継ぐ。\`--vscode-font-family\` は web でもライト一式と一緒に撒かれており、
     先に見ると site の書体を上書きしてしまう。 */
  font-family: inherit;
  /* 器の字も宿主から継ぐ（箱の中だけは px で決める。刻みが箱の大きさを決めているため）。 */
  font-size: inherit;
}
.${DIAGRAM_ROOT_CLASS} *,
.${DIAGRAM_ROOT_CLASS} *::before,
.${DIAGRAM_ROOT_CLASS} *::after { box-sizing: border-box; }

.anytime-diagram-lead,
.anytime-diagram-note { margin: 4px 0; color: var(--diagram-muted); font-size: 0.85em; }
.anytime-diagram-title { margin: 0 0 4px; font-size: 1.1em; }

.anytime-diagram-toolbar,
.anytime-diagram-selection { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 8px 0; }

/*
  枠の中へ浮かせる区画（選択・線の見た目）。左下に重ね、下から上へ積む。

  \`align-items: flex-start\` で**中身の幅だけ**を取る。枠いっぱいに広げると、区画そのものは
  透けていても押下を奪い、図の下半分でドラッグ（平行移動）が効かなくなる。
*/
.anytime-diagram-panels {
  position: absolute; left: 8px; bottom: 8px; z-index: 2;
  display: flex; flex-direction: column-reverse; align-items: flex-start; gap: 4px;
  max-width: calc(100% - 16px); pointer-events: none;
}
.anytime-diagram-panels > * { pointer-events: auto; }
.anytime-diagram-panel {
  margin: 0; padding: 3px 8px; gap: 6px;
  border: 1px solid var(--diagram-border); border-radius: var(--diagram-radius);
  background: var(--diagram-raised); font-size: 11px;
}
.anytime-diagram-panel output { color: var(--diagram-muted); font-variant-numeric: tabular-nums; }
.anytime-diagram-panel select { font: inherit; font-size: 11px; padding: 1px 2px; }
/* 枠の中は図に譲る面積が惜しいので、操作は線画にする（値だけを字で残す）。 */
.anytime-diagram-panel .anytime-diagram-iconbutton {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: 4px; background: transparent; color: var(--diagram-fg); cursor: pointer;
}
.anytime-diagram-panel .anytime-diagram-iconbutton:hover:not(:disabled) { background: var(--diagram-bg); color: var(--diagram-accent); }
.anytime-diagram-panel .anytime-diagram-iconbutton:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: -2px; }
.anytime-diagram-panel .anytime-diagram-iconbutton:disabled { opacity: 0.4; cursor: default; }
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
/*
  線は**本文の色**から引く（補足の色ではない）。そのうえで、太さを図の倍率から切り離す。

  図は CSS の transform で縮めるので、全体表示（古事記の系図で 14%）では 1.8px の線が 0.25px に
  なり、アンチエイリアスに溶けて消える。**全体を眺めるときにこそ系統の線が要る**ので、画面上の
  太さを一定に保つ。

  \`vector-effect: non-scaling-stroke\` は使えない。あれが無視するのは SVG 自身の transform で、
  ここで縮めているのは HTML の親（\`.anytime-diagram-surface\`）だから効かない。枠と同じく
  倍率（\`--diagram-scale\`）で割る。上限は倍率の下限（2.5%）で線が帯にならない幅に取る。
*/
.anytime-diagram-edges path {
  fill: none; stroke: color-mix(in srgb, var(--diagram-fg) 62%, transparent);
  stroke-width: clamp(1.8px, calc(1.8px / var(--diagram-scale, 1)), 14px);
  stroke-linecap: round; stroke-linejoin: round; pointer-events: stroke; cursor: pointer;
}
.anytime-diagram-edges g.is-line-dimmed { opacity: 0.12; }
.anytime-diagram-edges g.is-line-selected path {
  stroke-width: clamp(2.5px, calc(2.5px / var(--diagram-scale, 1)), 18px);
}
.anytime-diagram-edges path:focus-visible {
  outline: none; stroke: var(--diagram-accent);
  stroke-width: clamp(3px, calc(3px / var(--diagram-scale, 1)), 20px);
}
.anytime-diagram-edges .edge-spouse { stroke: var(--diagram-accent); stroke-dasharray: 8 5; }
.anytime-diagram-edges .edge-oath,
.anytime-diagram-edges .edge-creation { stroke-dasharray: 2 5; }
.anytime-diagram-edges .point { stroke: var(--diagram-raised); stroke-width: 1.5; fill: var(--diagram-muted); }
.anytime-diagram-edges .point-junction { fill: var(--diagram-accent); }
/*
  見た目を上書きした家族。種別で決まる装い（親子は実線・婚姻は破線＋アクセント…）を**丸ごと**
  置き換える。色だけ変えたのに種別の破線が残ると、設定の区画に出ている値と図が食い違う。

  詳細度で勝たせる（\`g.is-look-set path\` はクラス 2 つ＋要素 1 つ）。記述順に頼ると、次に
  種別の規則を足した人が知らずに順序を崩す。
*/
.anytime-diagram-edges g.is-look-set { --link-color: color-mix(in srgb, var(--diagram-fg) 62%, transparent); }
.anytime-diagram-edges g.is-look-set.is-color-accent { --link-color: var(--diagram-accent); }
.anytime-diagram-edges g.is-look-set.is-color-danger { --link-color: var(--diagram-danger); }
.anytime-diagram-edges g.is-look-set.is-color-muted { --link-color: color-mix(in srgb, var(--diagram-fg) 32%, transparent); }
.anytime-diagram-edges g.is-look-set path { stroke: var(--link-color); stroke-dasharray: none; }
.anytime-diagram-edges g.is-look-set.is-dashed path {
  stroke-dasharray: calc(9px / var(--diagram-scale, 1)) calc(6px / var(--diagram-scale, 1));
}
/*
  端の印は塗り。**線の規則（\`fill: none\` / \`stroke\`）に負けない詳細度で書く** — 負けると
  矢尻が塗り無しになって消える。上書きのある家族は線と同じ色、無い家族は本文の色に落ちる。
*/
.anytime-diagram-edges .edge-cap {
  fill: color-mix(in srgb, var(--diagram-fg) 62%, transparent);
  stroke: none;
}
.anytime-diagram-edges g.is-look-set .edge-cap { fill: var(--link-color); stroke: none; }

/*
  置ける場所（空いた升目）の塗り。埋まった升目は塗らない — 塗ってある所へ運べば必ず収まる。
  塗りだけで示し枠線は引かない（箱の枠・選択の輪郭・系統線と線が 4 重になると境界が読めない）。
*/
.anytime-diagram-grid { position: absolute; inset: 0; pointer-events: none; }
.anytime-diagram-grid path { fill: color-mix(in srgb, var(--diagram-accent) 12%, transparent); }

/*
  箱の字は **px で決める**（\`em\` で積まない）。根の 13px に \`0.8em\` を 2 段重ねると群の札が
  8.3px まで落ち、字の形が潰れて「色がぼやけている」ように見えていた。箱の幅（既定 194px）は
  刻みで決まるので、字だけが宿主の設定で伸び縮みしても収まらなくなる。

  枠は薄い境界色と混ぜない。\`color-mix(accent 45%, border)\` は淡い水色（#7DA7C5）まで落ち、
  162 個の箱の輪郭が背景へ溶けていた。
*/
.anytime-diagram-node {
  position: absolute; display: flex; flex-direction: column; align-items: center; min-width: 0;
  padding: 4px 8px; overflow-y: auto; text-align: center; font-size: 12px; line-height: 1.35;
  border-style: solid;
  border-color: color-mix(in srgb, var(--diagram-accent) 72%, var(--diagram-border));
  /*
    枠も倍率から切り離す。SVG の \`vector-effect\` に当たるものが HTML の枠には無いので、
    図の倍率（\`--diagram-scale\`）で割って画面上の太さを 1.5px 前後に保つ。上限を置くのは、
    倍率の下限（2.5%）では 60px になり、箱が塗り潰しになってしまうため。
  */
  border-width: clamp(1.5px, calc(1.5px / var(--diagram-scale, 1)), 10px);
  border-radius: var(--diagram-radius); background: var(--diagram-bg);
}
.anytime-diagram-node strong { font-weight: 600; }

/*
  札の形。**border-radius だけで描ける形はここで描き、残りは札の中の SVG が描く**（\`shapes.ts\`）。
  2 通りに分かれるのは、編集中の札が \`overflow: hidden\` で輪郭線の外半分を切るため。CSS の枠は
  箱の内側に描かれるので切られず、切られない形をわざわざ SVG へ移す理由が無い。
*/
.anytime-diagram-node[data-shape="round"] { border-radius: 14px; }
.anytime-diagram-node[data-shape="stadium"] { border-radius: 999px; }
.anytime-diagram-node[data-shape="circle"] { border-radius: 50%; }

/*
  SVG が輪郭を描く形は、札そのものの枠と背景を消す。消さないと四角の枠が形の外側に残り、
  「四角の中に菱形が入っている」図になる。
*/
.anytime-diagram-node[data-shape="diamond"],
.anytime-diagram-node[data-shape="parallelogram"],
.anytime-diagram-node[data-shape="hexagon"],
.anytime-diagram-node[data-shape="cylinder"] { border-color: transparent; background: transparent; }
/* 文字の余白は札の大きさから \`shapeTextInset\` が px で出し、\`nodes.ts\` が当てる（百分率は親の幅基準）。 */

/*
  輪郭の層。**負の重ね順で札の中身の後ろへ敷く**（当たり判定は札そのものが持つ）。

  中身の側を \`position: relative\` で持ち上げない。札の子には絶対配置の取っ手（右上の操作列・
  辺の大きさの取っ手・接続点）が並んでおり、子をまとめて相対配置へ倒すと**取っ手が内容の流れへ
  戻って札の外に並ぶ**（実機で観測。名札まで箱の外へ出た）。

  負の重ね順が札そのものの背景より後ろへ回らないよう、札を独立した重ね合わせの文脈にする
  （\`isolation\`）。しないと、宿主の重ね順しだいで輪郭が図の面の下へ潜る。
*/
.anytime-diagram-node { isolation: isolate; }
.anytime-diagram-shape {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: -1; overflow: visible;
}
.anytime-diagram-shape .shape-outline {
  fill: var(--diagram-bg);
  stroke: color-mix(in srgb, var(--diagram-accent) 72%, var(--diagram-border));
  /* 太さは札の枠と同じ式で倍率から切り離す（\`.anytime-diagram-node\` の border-width と揃える）。 */
  stroke-width: clamp(1.5px, calc(1.5px / var(--diagram-scale, 1)), 10px);
  stroke-linejoin: round;
}
/* 円筒の蓋。塗ると本体の塗りの上に濃い月形が乗るので、線だけで描く。 */
.anytime-diagram-shape .shape-detail {
  fill: none;
  stroke: color-mix(in srgb, var(--diagram-accent) 72%, var(--diagram-border));
  stroke-width: clamp(1.5px, calc(1.5px / var(--diagram-scale, 1)), 10px);
}
.anytime-diagram-node span,
.anytime-diagram-node small {
  color: color-mix(in srgb, var(--diagram-fg) 70%, transparent); font-size: 10px;
}
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
.anytime-diagram-gutter .is-column { top: ${GUTTER_TRACK_PX}px; }
.anytime-diagram-gutter .is-row { left: ${GUTTER_TRACK_PX}px; }
/* 詰める側は取り消しの操作なので、入れる側と字だけでなく線種でも分ける。 */
.anytime-diagram-gutter .is-remove { border-style: dashed; }

/*
  手で引いた線。家族の線と**別の層**に置く（\`fill: none\` が端の印の塗りを消さないように）。
  線の太さは家族の線と同じく倍率から切り離し、全体表示でも消えないようにする。
*/
.anytime-diagram-links { position: absolute; inset: 0; pointer-events: none; }
/*
  線の色は**役割の名前**（\`DiagramLineColor\`）で選び、実際の色は宿主のトークンから引く。
  値（\`#c0392b\` のような）を保存に持たせると、ダークとライトの片方で背景に溶ける線が作れる。

  既定は本文の色を薄めたもの — 家族の線と同じ引き方にして、手で引いた線が「別の図から来た線」に
  見えないようにする。
*/
.anytime-diagram-links g { --link-color: color-mix(in srgb, var(--diagram-fg) 62%, transparent); }
.anytime-diagram-links g.is-color-accent { --link-color: var(--diagram-accent); }
.anytime-diagram-links g.is-color-danger { --link-color: var(--diagram-danger); }
.anytime-diagram-links g.is-color-muted { --link-color: color-mix(in srgb, var(--diagram-fg) 32%, transparent); }
.anytime-diagram-links .link-line {
  fill: none; stroke: var(--link-color);
  stroke-width: clamp(1.8px, calc(1.8px / var(--diagram-scale, 1)), 14px);
  stroke-linecap: round; stroke-linejoin: round;
}
.anytime-diagram-links .link-line.is-dashed {
  /* 破線の刻みも倍率で割る。割らないと、縮めた図で刻みが詰まって実線と見分けが付かない。 */
  stroke-dasharray: calc(9px / var(--diagram-scale, 1)) calc(6px / var(--diagram-scale, 1));
}
.anytime-diagram-links .link-cap { fill: var(--link-color); stroke: none; }
/*
  当たり判定だけの太い線。見た目は透明で、**押せる幅**（WCAG 2.2 の対象の大きさ）を作る。
  見える線は画面上 1.8px しかなく、狙って押すには細すぎる。
*/
.anytime-diagram-links .link-hit {
  fill: none; stroke: transparent;
  stroke-width: clamp(14px, calc(14px / var(--diagram-scale, 1)), 90px);
  pointer-events: stroke; cursor: pointer;
}
.anytime-diagram-links g.is-line-dimmed { opacity: 0.18; }
.anytime-diagram-links g.is-line-selected .link-line {
  stroke-width: clamp(3px, calc(3px / var(--diagram-scale, 1)), 18px);
}
.anytime-diagram-links .link-hit:focus-visible { outline: none; }
.anytime-diagram-links .link-hit:focus-visible + .link-line {
  stroke: var(--diagram-fg);
  stroke-width: clamp(3.5px, calc(3.5px / var(--diagram-scale, 1)), 20px);
}
/* 引いている最中の仮の線。確定した線と見分けが付くよう、細かい破線で薄く引く。 */
.anytime-diagram-links .link-preview {
  fill: none; stroke: var(--diagram-accent); opacity: 0.6;
  stroke-width: clamp(1.5px, calc(1.5px / var(--diagram-scale, 1)), 12px);
  stroke-dasharray: calc(4px / var(--diagram-scale, 1)) calc(4px / var(--diagram-scale, 1));
}

/*
  空いた升目の ＋。縁の ＋（\`anytime-diagram-gutter\`）と同じく**枠に貼り付く**が、置く場所が
  升目の真ん中なので大きく取れる。形も角丸の四角にして、丸い縁の ＋ と見分けが付くようにする
  （片方は行・列を増やし、もう片方は要素を増やす。取り違えると図の形が大きく変わる）。
*/
.anytime-diagram-celladd { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.anytime-diagram-celladd button {
  position: absolute; pointer-events: auto;
  width: ${CELL_ADD_ICON_PX}px; height: ${CELL_ADD_ICON_PX}px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed color-mix(in srgb, var(--diagram-accent) 55%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--diagram-raised) 82%, transparent);
  color: color-mix(in srgb, var(--diagram-accent) 80%, var(--diagram-muted));
  cursor: pointer; transform: translate(-50%, -50%); opacity: 0.55;
}
.anytime-diagram-celladd button:hover:not(:disabled),
.anytime-diagram-celladd button:focus-visible {
  opacity: 1; border-style: solid; border-color: var(--diagram-accent); color: var(--diagram-accent);
}
.anytime-diagram-celladd button:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }
.anytime-diagram-celladd button:disabled { opacity: 0.25; cursor: default; }

/*
  接続点。箱の**左辺の中央・枠の内側**に置く。

  辺の上（\`left: -5px\` のように箱をまたぐ位置）には置けない。編集中の箱は \`overflow: hidden\` で、
  はみ出した部分は**描かれず当たり判定も持たない** — 見た目には在るのに押せない取っ手になる
  （実機で 1 度そうなった）。内側なら切り取られない。

  左辺を選ぶのは、上辺が操作の取っ手の帯、右辺と下辺が箱の大きさの取っ手と重なるため。
  当たり判定は \`::before\` で広げ、見た目は小さく保つ（大きい丸は箱の中身を隠す）。
*/
.anytime-diagram-connect {
  position: absolute; left: 5px; top: 50%; transform: translateY(-50%);
  width: 9px; height: 9px; padding: 0;
  border: 1.5px solid var(--diagram-raised); border-radius: 999px;
  background: var(--diagram-accent); cursor: crosshair; touch-action: none;
}
.anytime-diagram-connect::before { content: ''; position: absolute; inset: -8px; }
.anytime-diagram-connect:hover:not(:disabled) { background: var(--diagram-fg); }
.anytime-diagram-connect:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 2px; }
.anytime-diagram-connect:disabled { opacity: 0.4; cursor: default; }
/*
  上・左へ空きを割り込ませる取っ手。箱の**内側の左上**に 2 つ並べる。

  クラス名は動かす軸（\`is-row\` = 同じ列を下へ、\`is-column\` = 同じ行を右へ）で、置き場所では
  ない。置き場所で向きを示せないのは、箱の高さの下限（72px）だと左辺に接続点と並べる余地が
  無いため — 向きは中の矢印が示す。
*/
.anytime-diagram-insert {
  position: absolute; top: 3px; width: 16px; height: 16px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--diagram-border); border-radius: 4px;
  background: var(--diagram-raised); color: var(--diagram-muted); cursor: pointer;
}
.anytime-diagram-insert.is-row { left: 3px; }
.anytime-diagram-insert.is-column { left: 22px; }
.anytime-diagram-insert:hover:not(:disabled) { border-color: var(--diagram-accent); color: var(--diagram-accent); }
.anytime-diagram-insert:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 1px; }
.anytime-diagram-insert:disabled { opacity: 0.45; cursor: default; }

/* 始点として待ち受けている札は、相手を選ぶまで印を出し続ける（どこから線が出るか読めるように）。 */
.anytime-diagram-node.is-connect-source { outline: 2px dashed var(--diagram-accent); outline-offset: 2px; }

/*
  線の中点の取っ手。図の面へ載せ、線の真上に中心を合わせる（translate(-50%, -50%)）。

  当たり判定は 24px 角まで広げる（WCAG 2.2 Target Size）。見た目を大きくしないのは、線が
  何本も交わる所で取っ手どうしが重なって、どの線の中点を掴んだのか分からなくなるため。
*/
/*
  取っ手の層は**札より上**に置く。線の中点は札の真下に来ることがあり（線は札の下をくぐる）、
  下に置くと札が押下を奪って取っ手が押せない。層そのものは当たり判定を持たないので、
  上に置いても札の操作は塞がない（実機で観測して直した）。
*/
.anytime-diagram-midpoints { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.anytime-diagram-midpoint {
  position: absolute; width: 11px; height: 11px; padding: 0;
  transform: translate(-50%, -50%); pointer-events: auto; touch-action: none; cursor: crosshair;
  border: 1px solid var(--diagram-accent); border-radius: 50%;
  background: var(--diagram-raised);
}
.anytime-diagram-midpoint::before { content: ''; position: absolute; inset: -7px; }
.anytime-diagram-midpoint:hover:not(:disabled) { background: var(--diagram-accent); }
.anytime-diagram-midpoint:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: 2px; }
.anytime-diagram-midpoint:disabled { opacity: 0.45; cursor: default; }
.anytime-diagram-midpoint.is-connect-source {
  background: var(--diagram-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--diagram-accent) 35%, transparent);
}

/*
  名札の書き換え口。箱の幅いっぱいに置く。箱は刻みで幅が決まるので、入力欄が箱をはみ出すと
  隣の升目に重なって、どの要素を書き換えているのか分からなくなる。
*/
.anytime-diagram-rename {
  width: 100%; min-width: 0; padding: 1px 3px; margin-bottom: 1px;
  font: inherit; font-size: 12px; text-align: center;
  color: var(--diagram-fg); background: var(--diagram-raised);
  border: 1px solid var(--diagram-accent); border-radius: 3px;
}

.anytime-diagram-error { color: var(--diagram-danger); }
/*
  隠す指定は**詳細度で勝たせる**（クラス 2 つ）。

  クラス 1 つ同士（\`.anytime-diagram-hidden\` と \`.anytime-diagram-confirm\`）では、後に書いたほうが
  勝つ。確認の覆いは \`display: flex\` を後段で宣言しているので、隠したつもりの覆いが枠いっぱいに
  出たままになり、図の上に 70% の地色を重ねて**人物も縁のアイコンも押せなくなっていた**
  （背景のドラッグだけは覆いから親へ上がるので効き、気づきにくい）。

  順序で直すと、次に何かを足した人が同じ罠へ落ちる。詳細度で勝たせれば書く場所に依らない。
*/
.${DIAGRAM_ROOT_CLASS} .anytime-diagram-hidden { display: none; }
.anytime-diagram-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* 確認（破棄・全解除）。宿主のダイアログを借りず、図の中だけで完結させる。 */
/*
  確認の覆いは **既定を「出さない」側に置く**。表に出すときだけ \`is-open\` を足す。

  以前は \`display: flex\` を無条件に宣言し、隠すのを \`anytime-diagram-hidden\` に任せていた。
  どちらもクラス 1 つで詳細度が並び、後に書いたこちらが勝つ。結果、確認していないのに覆いが
  枠いっぱいに出たままになり、図の上に 70% の地色を重ねて**人物の選択も縁のアイコンも
  押せない**状態になっていた（背景のドラッグだけは覆いから親へ上がるので効き、気づきにくい）。

  既定を none にすれば、出す条件が 1 か所（\`is-open\`）に集まり、詳細度にも記述順にも依らない。
*/
/*
  見え方の操作（拡大・縮小・全体表示・初期表示）。**図の枠の中**へ浮かせる。

  縁のアイコン（z-index 1）より上に置く。両方が上端・左端へ集まるので、下にすると操作の区画が
  ＋ に隠れる。代わりに、この区画と重なる ＋ は描かない（\`ui/gutter.ts\` の \`covered\`）。
*/
.anytime-diagram-viewcontrols {
  position: absolute; top: 8px; left: 8px; z-index: 2;
  display: flex; align-items: center; gap: 2px; padding: 2px;
  border: 1px solid var(--diagram-border); border-radius: var(--diagram-radius);
  background: var(--diagram-raised);
}
.anytime-diagram-viewcontrols button {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border: 0; border-radius: 4px; background: transparent; color: var(--diagram-fg); cursor: pointer;
}
.anytime-diagram-viewcontrols button:hover:not(:disabled) { background: var(--diagram-bg); color: var(--diagram-accent); }
.anytime-diagram-viewcontrols button:focus-visible { outline: 2px solid var(--diagram-accent); outline-offset: -2px; }
.anytime-diagram-viewcontrols button:disabled { opacity: 0.4; cursor: default; }
/* 倍率だけは**値**なので字のまま残す（いまどれだけ縮んでいるかは絵で表せない）。 */
.anytime-diagram-zoomlevel {
  min-width: 3.5em; padding: 0 2px; text-align: center;
  color: var(--diagram-muted); font-size: 11px; font-variant-numeric: tabular-nums;
}

/* 確認の覆いは見え方の操作より上（覆っている間はどの操作も受け付けない）。 */
.anytime-diagram-confirm {
  position: absolute; inset: 0; z-index: 3; display: none;
  background: color-mix(in srgb, var(--diagram-bg) 70%, transparent);
}
.anytime-diagram-confirm.is-open { display: flex; align-items: center; justify-content: center; }
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
