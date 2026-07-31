import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import {
  addHandlePlacement,
  shouldShowAddHandle,
  validateAddElementForm,
} from '../ui/addElementModel';

const VIEWPORT = { scale: 1, offsetX: 0, offsetY: 0 };
const CANVAS = { width: 400, height: 300 };

describe('shouldShowAddHandle', () => {
  const base = { editMode: true, skin: 'standard' as const, selectedNodeIndex: 1, hasPosition: true };

  it('編集モード・2D・語を選択・位置が確定のときだけ出す', () => {
    expect(shouldShowAddHandle(base)).toBe(true);
  });

  it('編集モードでなければ出さない', () => {
    expect(shouldShowAddHandle({ ...base, editMode: false })).toBe(false);
  });

  it('OZ 風 3D では出さない', () => {
    expect(shouldShowAddHandle({ ...base, skin: 'oz' })).toBe(false);
  });

  it('語を選んでいなければ出さない', () => {
    expect(shouldShowAddHandle({ ...base, selectedNodeIndex: null })).toBe(false);
  });

  it('位置が確定していなければ出さない', () => {
    expect(shouldShowAddHandle({ ...base, hasPosition: false })).toBe(false);
  });
});

describe('addHandlePlacement', () => {
  it('語の右上へ置く', () => {
    expect(
      addHandlePlacement({
        node: { x: 100, y: 100, radius: 10 },
        viewport: VIEWPORT,
        canvas: CANVAS,
        handleSize: 28,
        gap: 4,
      }),
    ).toEqual({ x: 114, y: 58 });
  });

  it('拡大してもアイコンの大きさの分は変わらない（アイコンは拡縮しない）', () => {
    expect(
      addHandlePlacement({
        node: { x: 100, y: 100, radius: 10 },
        viewport: { scale: 2, offsetX: 0, offsetY: 0 },
        canvas: CANVAS,
        handleSize: 28,
        gap: 4,
      }),
    ).toEqual({ x: 224, y: 148 });
  });

  it('図の右端では内側へ折り返す', () => {
    expect(
      addHandlePlacement({
        node: { x: 398, y: 100, radius: 10 },
        viewport: VIEWPORT,
        canvas: CANVAS,
        handleSize: 28,
        gap: 4,
      }),
    ).toEqual({ x: 372, y: 58 });
  });

  it('図の上端では内側へ折り返す', () => {
    expect(
      addHandlePlacement({
        node: { x: 100, y: 2, radius: 10 },
        viewport: VIEWPORT,
        canvas: CANVAS,
        handleSize: 28,
        gap: 4,
      }),
    ).toEqual({ x: 114, y: 0 });
  });
});

function fileWith(labels: readonly string[]): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: labels.map((label) => ({ label, frequency: 1 })),
      links: [],
    },
  } as unknown as CooccurrenceFile;
}

describe('validateAddElementForm', () => {
  const file = fileWith(['金利', '株価']);

  it('正しい入力は通す', () => {
    expect(validateAddElementForm(file, { label: 'インフレ', frequency: '4', strength: '0.6' })).toBeNull();
  });

  it('空の語名は弾く', () => {
    expect(validateAddElementForm(file, { label: '   ', frequency: '4', strength: '0.6' })).toBe('empty-label');
  });

  it('既存の語名は弾く（前後の空白は無視する）', () => {
    expect(validateAddElementForm(file, { label: ' 株価 ', frequency: '4', strength: '0.6' })).toBe(
      'duplicate-label',
    );
  });

  it('数値でない頻度は弾く', () => {
    expect(validateAddElementForm(file, { label: 'インフレ', frequency: 'a', strength: '0.6' })).toBe(
      'invalid-frequency',
    );
  });

  it('空欄の頻度は弾く', () => {
    expect(validateAddElementForm(file, { label: 'インフレ', frequency: '', strength: '0.6' })).toBe(
      'invalid-frequency',
    );
  });

  it('負の強度は弾く', () => {
    expect(validateAddElementForm(file, { label: 'インフレ', frequency: '4', strength: '-1' })).toBe(
      'invalid-strength',
    );
  });

  it('時間軸ありではスライス別の値を見る', () => {
    expect(
      validateAddElementForm(file, {
        label: 'インフレ',
        sliceFrequencies: ['1', ''],
        sliceStrengths: ['0.2', 'x'],
      }),
    ).toBe('invalid-strength');
  });

  it('時間軸ありで頻度が全期空なら弾く', () => {
    // 全期を空にすると頻度 0・どの期にも現れない語になり、図から足したのに図に出ない。
    expect(
      validateAddElementForm(file, {
        label: 'インフレ',
        sliceFrequencies: ['', ''],
        sliceStrengths: ['0.2', ''],
      }),
    ).toBe('no-slice-frequency');
  });

  it('時間軸ありで強度が全期空なら弾く', () => {
    expect(
      validateAddElementForm(file, {
        label: 'インフレ',
        sliceFrequencies: ['1', ''],
        sliceStrengths: ['', ''],
      }),
    ).toBe('no-slice-strength');
  });

  it('時間軸ありの空欄は「その期に無い」として通す', () => {
    expect(
      validateAddElementForm(file, {
        label: 'インフレ',
        sliceFrequencies: ['1', ''],
        sliceStrengths: ['', '0.4'],
      }),
    ).toBeNull();
  });
});
