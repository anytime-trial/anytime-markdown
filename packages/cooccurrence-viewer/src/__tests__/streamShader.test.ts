/**
 * @jest-environment jsdom
 */
import { Color, ShaderChunk } from 'three';

import { paletteOf } from '../scene3d/ozRenderer';
import {
  DASH_MIN_VISIBILITY,
  STREAM_FRAGMENT_SHADER,
  linkColorOf,
  linkStrengthAlpha,
  makeStreamMaterial,
} from '../scene3d/streamShader';
import type { ThemeMode } from '../types';

/** sRGB 8bit 3 成分。 */
type Rgb = readonly [number, number, number];

function parseStyle(style: string): Rgb {
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(style);
  if (match === null) throw new Error(`Unexpected color style: ${style}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** three が画面へ書き出す色（出力色空間 = sRGB）。 */
function toScreenRgb(color: Color): Rgb {
  return parseStyle(color.getStyle());
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * 共起 1 本が画面へ出る色。明部（破線の山）と暗部（谷）を分けて返す。
 * 暗部は fragment shader の `mix(uFade, vColor, DASH_MIN_VISIBILITY)` と同じ計算。
 */
function screenColorsOf(mode: ThemeMode, width: number): { bright: Rgb; dim: Rgb; background: Rgb } {
  const palette = paletteOf(mode);
  const link = linkColorOf(new Color(), palette.linkBase, palette.fade, { width, alpha: 1 });
  return {
    bright: toScreenRgb(link),
    dim: toScreenRgb(palette.fade.clone().lerp(link, DASH_MIN_VISIBILITY)),
    background: toScreenRgb(palette.background),
  };
}

describe('streamShader: 出力色空間', () => {
  /**
   * ShaderMaterial は three の標準マテリアルと違い出力色空間への変換を自動で挟まない。
   * この include を落とすと linear-sRGB 値がそのまま sRGB として書き込まれ、OZ ダークでは
   * 弱い共起の線が背景（濃紺 #0A0F2E）と区別できない黒になる。
   */
  test('fragment shader は linear-sRGB を出力色空間へ変換する', () => {
    expect(STREAM_FRAGMENT_SHADER).toContain('#include <colorspace_fragment>');
  });

  test('変換は gl_FragColor を組み立てた後に置く', () => {
    const assign = STREAM_FRAGMENT_SHADER.indexOf('gl_FragColor = vec4(');
    const convert = STREAM_FRAGMENT_SHADER.indexOf('#include <colorspace_fragment>');
    expect(assign).toBeGreaterThanOrEqual(0);
    expect(convert).toBeGreaterThan(assign);
  });

  /**
   * `#include <未知のチャンク>` は three 側で例外にならず空へ置換され、変換が無言で外れる。
   * three の更新でチャンク名が変わったらここで落とす。
   */
  test('three に colorspace_fragment チャンクが実在し linearToOutputTexel を呼ぶ', () => {
    expect(ShaderChunk.colorspace_fragment).toContain('linearToOutputTexel');
  });

  test('makeStreamMaterial は同じシェーダを使い uFade を複製して持つ', () => {
    const fade = new Color('#0A0F2E');
    const material = makeStreamMaterial(fade);
    expect(material.fragmentShader).toBe(STREAM_FRAGMENT_SHADER);
    const uniformFade = material.uniforms.uFade.value as Color;
    expect(uniformFade.getHex()).toBe(fade.getHex());
    expect(uniformFade).not.toBe(fade);
  });
});

describe('streamShader: 画面へ出る線の視認性', () => {
  /**
   * 色空間変換が効いていること自体は上の describe が担保する。ここが見るのは「変換が効いた
   * 前提でどう見えるか」— 強度写像（linkStrengthAlpha）とパレット側の回帰。
   *
   * 非テキスト要素のコントラスト下限（WCAG 1.4.11）は 3:1。破線の谷は線の一部でしかないため
   * 明部にのみ 3:1 を課し、谷は背景と識別できること（1.8:1）までを保証する。
   */
  test('dark: 最弱リンクでも背景から見分けられる', () => {
    const { bright, dim, background } = screenColorsOf('dark', 1);
    expect(contrastRatio(bright, background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(dim, background)).toBeGreaterThanOrEqual(1.8);
  });

  /**
   * ライトは溶け込み先が白（#F4F5FB）で linkBase も中間グレーのため、最弱リンクの明部でも
   * 1.26:1 しかない（dark は 3.91:1）。これは色空間の誤りとは別の既知の弱さで、揃えるには
   * パレット（linkBase）の変更が要る。ここでは悪化だけを検知する。
   */
  test('light: 既知の薄さを下回らない', () => {
    const { bright, background } = screenColorsOf('light', 1);
    expect(contrastRatio(bright, background)).toBeGreaterThanOrEqual(1.2);
  });

  test('強度が上がるほど線は背景から離れる', () => {
    const background = screenColorsOf('dark', 1).background;
    const ratios = [1, 3, 5].map((width) => contrastRatio(screenColorsOf('dark', width).bright, background));
    expect(ratios[1]).toBeGreaterThan(ratios[0]);
    expect(ratios[2]).toBeGreaterThan(ratios[1]);
  });

  test('linkStrengthAlpha は上限 0.65 で頭打ちになる', () => {
    expect(linkStrengthAlpha(1)).toBeCloseTo(0.32);
    expect(linkStrengthAlpha(100)).toBe(0.65);
  });
});
