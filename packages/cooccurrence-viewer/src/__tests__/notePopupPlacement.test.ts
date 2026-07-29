import { placeNotePopup } from '../ui/notePopupModel';

/**
 * ポップアップの位置決め（設計書 §3.1「表示領域の内側へ収める」）。
 *
 * canvas 描画から DOM へ移したとき、旧実装（`drawTooltip`）が持っていた上限のクランプが
 * 落ち、図の右下端の語でポップアップが切れる退行が入った（マージ前レビューで検出）。
 * jsdom では要素の寸法が 0 になり DOM 経由では検査できないため、境界だけを純関数で固定する。
 */
const BASE = {
  size: { width: 200, height: 100 },
  bounds: { width: 800, height: 600 },
  offset: 14,
  margin: 8,
};

describe('placeNotePopup', () => {
  it('余裕があれば対象の右下へ逃がす', () => {
    expect(placeNotePopup({ ...BASE, anchor: { x: 100, y: 100 } })).toEqual({ left: 114, top: 114 });
  });

  it('右端では左へ折り返し、表示領域からはみ出さない', () => {
    const { left } = placeNotePopup({ ...BASE, anchor: { x: 790, y: 100 } });

    expect(left).toBe(790 - 14 - 200);
    expect(left + BASE.size.width).toBeLessThanOrEqual(BASE.bounds.width - BASE.margin);
  });

  it('下端では上へ折り返す', () => {
    const { top } = placeNotePopup({ ...BASE, anchor: { x: 100, y: 590 } });

    expect(top).toBe(590 - 14 - 100);
    expect(top + BASE.size.height).toBeLessThanOrEqual(BASE.bounds.height - BASE.margin);
  });

  it('右下の角では両方向とも折り返す', () => {
    const { left, top } = placeNotePopup({ ...BASE, anchor: { x: 790, y: 590 } });

    expect(left + BASE.size.width).toBeLessThanOrEqual(BASE.bounds.width - BASE.margin);
    expect(top + BASE.size.height).toBeLessThanOrEqual(BASE.bounds.height - BASE.margin);
  });

  // 退行の本体。折り返した先が縁を越えるとき、下限のクランプだけでは右端・下端が切れる。
  // 対象が表示領域の右下より外にある（拡大して図がはみ出した状態でホバーする）と起きる。
  it('折り返し先が縁を越える位置では縁に寄せる', () => {
    const { left, top } = placeNotePopup({ ...BASE, anchor: { x: 1000, y: 900 } });

    expect(left).toBe(BASE.bounds.width - BASE.margin - BASE.size.width);
    expect(top).toBe(BASE.bounds.height - BASE.margin - BASE.size.height);
    expect(left + BASE.size.width).toBeLessThanOrEqual(BASE.bounds.width - BASE.margin);
    expect(top + BASE.size.height).toBeLessThanOrEqual(BASE.bounds.height - BASE.margin);
  });

  it('狭い領域でも折り返した結果が内側に収まる', () => {
    const narrow = { ...BASE, bounds: { width: 240, height: 140 } };
    const { left, top } = placeNotePopup({ ...narrow, anchor: { x: 230, y: 130 } });

    expect(left).toBeGreaterThanOrEqual(narrow.margin);
    expect(top).toBeGreaterThanOrEqual(narrow.margin);
    expect(left + narrow.size.width).toBeLessThanOrEqual(narrow.bounds.width - narrow.margin);
    expect(top + narrow.size.height).toBeLessThanOrEqual(narrow.bounds.height - narrow.margin);
  });

  it('表示領域よりポップアップが大きいときは先頭が読める側へ寄せる', () => {
    const tiny = { ...BASE, bounds: { width: 100, height: 60 } };

    // 縁の余白を確保できないため、上端・左端に合わせる（下端に合わせると先頭が切れる）。
    expect(placeNotePopup({ ...tiny, anchor: { x: 50, y: 30 } })).toEqual({ left: 8, top: 8 });
  });

  it('対象が表示領域の外にあっても縁の内側へ収める', () => {
    const { left, top } = placeNotePopup({ ...BASE, anchor: { x: -500, y: -500 } });

    expect(left).toBe(BASE.margin);
    expect(top).toBe(BASE.margin);
  });
});
