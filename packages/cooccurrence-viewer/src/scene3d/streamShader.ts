import { Color, ShaderMaterial } from 'three';

/**
 * OZ スキンの「データストリーム」（共起の線）のシェーダと色計算。
 *
 * Why not ozRenderer に置いたままにするか: ShaderMaterial は WebGL コンテキストが無いと
 * 生成できるだけで中身を検査できず、シェーダ本文と色計算がテストの外に出る。色空間の
 * 取り扱い（下記）は目で見るまで壊れていても気づけない種類の誤りなので、WebGL 非依存の
 * 単位で切り出してテストの射程に入れる。
 */

/** 破線の流れの速さ（world 単位 / 秒）と 1 周期の world 長。 */
export const FLOW_SPEED = 90;
export const DASH_PERIOD = 64;

/**
 * 破線の暗部が残す明るさ。0 にすると 1 本の線が分断されて別々の線に見える。
 */
export const DASH_MIN_VISIBILITY = 0.35;

/** 強度（2D の線幅 1..n）を下限色→最大色の混合比へ写す。WebGL は線幅を変えられない（要件書 §2.2）。 */
export function linkStrengthAlpha(width: number): number {
  return Math.min(0.2 + width * 0.12, 0.65);
}

/**
 * 淡色化の作業色。リンク 1 本ごとに new すると、再構築のたびに本数ぶんの割り当てになる。
 * linkColorOf の内部だけで完結し、呼び出しをまたいで値を持ち越さない。
 *
 * SHORTCUT: モジュールスコープの 1 個を使い回す. ceiling: 同期・非再入の呼び出し前提
 * （現状はジオメトリ構築の forEach から逐次呼ぶだけ）. upgrade: linkColorOf を非同期化するか
 * Worker で並列に回すならローカル変数へ戻す.
 */
const fadeWork = new Color();

/** 線色を決める 3 色。{@link OzThemePalette} がそのまま満たす。 */
export interface LinkColorPalette {
  /**
   * 強度が最小のときの色。ここを背景色にすると弱い線ほど背景へ溶けるため、それで下限
   * コントラストに届かないモード（ライト）では背景と別の色を置く。
   */
  readonly linkFloor: Color;
  /** 強度が最大のときの色。 */
  readonly linkBase: Color;
  /** 淡色化（選択の近傍外）の溶け込み先。 */
  readonly fade: Color;
}

/**
 * 線 1 本の色を求める（共起の線と時間軸の点線で共通）。返る色は three の作業色空間
 * （linear-sRGB）であり、画面へ出す前に出力色空間への変換が要る。時間軸の点線は
 * LineDashedMaterial が変換を持つが、共起の線は {@link STREAM_FRAGMENT_SHADER} の末尾で
 * 自前で変換する。
 *
 * Why not 背景（fade）を強度 lerp の起点に固定するか: それだと強度が低い線ほど背景へ溶ける。
 * ライトは lerp が linear 空間で行われる都合上、白から動ける幅が狭く、係数を上限まで振っても
 * 背景比 2.84:1 にしか届かず、弱い共起が「在るのに見えない」状態だった。起点を palette 側で
 * 選べるようにし、届かないモードだけ背景と別の下限色を置く（ダークは背景起点のままで 3.91:1）。
 *
 * Why not sRGB 値を直接渡すか: 頂点属性・uniform に渡す色は three の他のマテリアルと同じ
 * linear-sRGB で統一する。ここだけ sRGB にすると、同じ `#A0BEFF` が球やラベルと違う色で出る。
 */
export function linkColorOf(
  target: Color,
  palette: LinkColorPalette,
  link: { readonly width: number; readonly alpha: number },
): Color {
  target.copy(palette.linkFloor).lerp(palette.linkBase, linkStrengthAlpha(link.width));
  // 淡色化は強度とは別段で掛ける。強度側の lerp に畳み込むと、淡色化していない弱い共起まで
  // 背景へ寄ってしまい、下限色を起点にした意味が消える。
  //
  // Why not linear 空間のまま掛けるか: 2D 側の淡色化は canvas の globalAlpha（sRGB 合成）で、
  // 同じ LINK_DIM_ALPHA を共有している。linear のまま同じ係数を掛けると暗部のガンマで色が
  // 残り、選択の近傍外が 2D ほど引かない（背景比 1.05 のはずが 1.69 まで残った）。
  if (link.alpha < 1) {
    target.convertLinearToSRGB();
    fadeWork.copy(palette.fade).convertLinearToSRGB();
    target.lerp(fadeWork, 1 - link.alpha);
    target.convertSRGBToLinear();
  }
  return target;
}

/**
 * 属性名は three が vertexColors で予約する `color` と衝突しないよう streamColor にする。
 */
export const STREAM_VERTEX_SHADER = [
  'attribute vec3 streamColor;',
  'attribute float lineDist;',
  'attribute float flowDir;',
  'varying vec3 vColor;',
  'varying float vDist;',
  'varying float vFlow;',
  'void main() {',
  '  vColor = streamColor;',
  '  vDist = lineDist;',
  '  vFlow = flowDir;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

/**
 * uTime を進めると明部が線上距離方向へ流れる。flow = 0（both・点線）は静的に塗る。
 *
 * 末尾の `#include <colorspace_fragment>`（= `gl_FragColor = linearToOutputTexel(gl_FragColor)`）
 * が要るのは、vColor / uFade が linear-sRGB だから。ShaderMaterial は three の標準マテリアルと
 * 違って出力色空間への変換を自動では挟まないため、これを省くと linear 値がそのまま sRGB として
 * 書き込まれ、暗い色ほど潰れる。OZ ダークは溶け込み先（uFade）が濃紺 #0A0F2E なので、変換を
 * 落とすと弱い共起の線が背景と区別できない黒になる。
 */
export const STREAM_FRAGMENT_SHADER = [
  'uniform float uTime;',
  'uniform vec3 uFade;',
  'uniform float uSpeed;',
  'uniform float uPeriod;',
  'varying vec3 vColor;',
  'varying float vDist;',
  'varying float vFlow;',
  'void main() {',
  '  float visibility = 1.0;',
  '  if (abs(vFlow) > 0.5) {',
  '    float k = fract((vDist - vFlow * uTime * uSpeed) / uPeriod);',
  '    float dash = smoothstep(0.0, 0.2, k) * (1.0 - smoothstep(0.6, 0.8, k));',
  `    visibility = mix(${DASH_MIN_VISIBILITY.toFixed(2)}, 1.0, dash);`,
  '  }',
  '  gl_FragColor = vec4(mix(uFade, vColor, visibility), 1.0);',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

/** データストリームの破線マテリアル。ジオメトリは固定で uniform 更新のみ（要件書 §5 v2）。 */
export function makeStreamMaterial(fade: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: fade.clone() },
      uSpeed: { value: FLOW_SPEED },
      uPeriod: { value: DASH_PERIOD },
    },
    vertexShader: STREAM_VERTEX_SHADER,
    fragmentShader: STREAM_FRAGMENT_SHADER,
  });
}
