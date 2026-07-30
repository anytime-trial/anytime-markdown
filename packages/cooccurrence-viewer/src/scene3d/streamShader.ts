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

/** 強度（2D の線幅 1..n）を線色の濃さへ写す。WebGL は線幅を変えられない（要件書 §2.2）。 */
export function linkStrengthAlpha(width: number): number {
  return Math.min(0.2 + width * 0.12, 0.65);
}

/**
 * 線 1 本の色を求める（共起の線と時間軸の点線で共通）。返る色は three の作業色空間
 * （linear-sRGB）であり、画面へ出す前に出力色空間への変換が要る。時間軸の点線は
 * LineDashedMaterial が変換を持つが、共起の線は {@link STREAM_FRAGMENT_SHADER} の末尾で
 * 自前で変換する。
 *
 * Why not sRGB 値を直接渡すか: 頂点属性・uniform に渡す色は three の他のマテリアルと同じ
 * linear-sRGB で統一する。ここだけ sRGB にすると、同じ `#A0BEFF` が球やラベルと違う色で出る。
 */
export function linkColorOf(
  target: Color,
  base: Color,
  fade: Color,
  link: { readonly width: number; readonly alpha: number },
): Color {
  return target.copy(fade).lerp(base, linkStrengthAlpha(link.width) * link.alpha);
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
