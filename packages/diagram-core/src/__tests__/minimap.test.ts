/**
 * ミニマップの幾何。**囲んだ範囲へ寄せる**変換と、いま見えている範囲の逆算。
 *
 * どちらも画面（ドラッグ）でしか動かせない操作の中身なので、関数へ出して机上で測る
 * （`view.ts` の他の変換と同じ扱い）。
 */

import { MAX_SCALE, MIN_SCALE, minimapBox, viewForRect, visibleRect } from '../view';

const FRAME = { width: 800, height: 600 };

describe('いま見えている範囲', () => {
  it('倍率 1・原点なら枠の大きさそのもの', () => {
    const rect = visibleRect({ x: 0, y: 0, scale: 1 }, FRAME);
    // 原点は -0 になりうる（0 の符号は SVG の属性に出ないので揃えない）。
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect([rect.width, rect.height]).toEqual([800, 600]);
  });

  it('縮めるほど広く見え、平行移動のぶんだけ右下へずれる', () => {
    expect(visibleRect({ x: -100, y: -50, scale: 0.5 }, FRAME))
      .toEqual({ x: 200, y: 100, width: 1600, height: 1200 });
  });
});

describe('囲んだ範囲へ寄せる', () => {
  it('その範囲が枠いっぱいに見える倍率へ寄せ、中心を合わせる', () => {
    const view = viewForRect(FRAME, { x: 100, y: 100, width: 400, height: 300 }, 1);
    expect(view.scale).toBe(2);
    // 囲んだ中心（300, 250）が枠の中心（400, 300）へ来る。
    expect(view.x).toBe(400 - 300 * 2);
    expect(view.y).toBe(300 - 250 * 2);
  });

  it('縦横で倍率を変えない（図を歪ませない）', () => {
    const view = viewForRect(FRAME, { x: 0, y: 0, width: 400, height: 600 }, 1);
    expect(view.scale).toBe(1);
  });

  it('潰れた矩形では倍率を変えず、中心だけ寄せる（0 で割らない）', () => {
    const view = viewForRect(FRAME, { x: 250, y: 150, width: 0, height: 0 }, 0.5);
    expect(view.scale).toBe(0.5);
    expect(view.x).toBe(400 - 250 * 0.5);
    expect(view.y).toBe(300 - 150 * 0.5);
  });

  it('倍率は範囲の端で止める', () => {
    expect(viewForRect(FRAME, { x: 0, y: 0, width: 1, height: 1 }, 1).scale).toBe(MAX_SCALE);
    expect(viewForRect(FRAME, { x: 0, y: 0, width: 1e6, height: 1e6 }, 1).scale).toBe(MIN_SCALE);
  });
});

describe('ミニマップの寸法', () => {
  /*
    札の大きさは**決め打ち**。図と同じ形に縮めて札まで決めていた頃は、横長の図で高さが幅から
    決まり、高さの上限を上げても札が低いままだった（2026-09-22 実測）。
  */
  it('図の形に関わらず同じ大きさで出る', () => {
    const wide = minimapBox({ width: 2000, height: 1000 }, { width: 180, height: 148 });
    const tall = minimapBox({ width: 1000, height: 4000 }, { width: 180, height: 148 });
    expect([wide.width, wide.height]).toEqual([180, 148]);
    expect([tall.width, tall.height]).toEqual([180, 148]);
  });

  it('縦横同じ倍率で収め、余った側は札の左上が図の外を指す', () => {
    const box = minimapBox({ width: 2000, height: 1000 }, { width: 180, height: 148 });
    expect(box.scale).toBe(0.09);
    // 幅で決まるので左右に余白は無く、上下へ均等に余る。
    expect(box.x).toBe(0);
    expect(box.y).toBeCloseTo((1000 - 148 / 0.09) / 2);
  });

  it('縦長の図では高さで決まり、左右へ余る', () => {
    const box = minimapBox({ width: 1000, height: 4000 }, { width: 180, height: 148 });
    expect(box.scale).toBe(0.037);
    expect(box.y).toBe(0);
    expect(box.x).toBeCloseTo((1000 - 180 / 0.037) / 2);
  });

  it('大きさを持たない図でも 0 で割らない', () => {
    expect(minimapBox({ width: 0, height: 0 }, { width: 180, height: 148 }).scale).toBe(148);
  });
});
