/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createAddElementPopup, type AddElementSubmitValues } from '../ui/AddElementPopup';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(timeline = false): CooccurrenceFile {
  const spec: Record<string, unknown> = {
    nodes: [
      { label: '金利', frequency: 10 },
      { label: '株価', frequency: 8 },
    ],
    links: [[0, 1, 0.5]],
    clusters: [{ label: '政策', members: [0] }],
  };
  if (timeline) {
    spec.timeline = {
      slices: [{ label: '前期' }, { label: '後期' }],
      nodes: [],
      links: [],
    };
  }
  return {
    meta: { schemaVersion: timeline ? 4 : 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec,
  } as unknown as CooccurrenceFile;
}

function setup(options?: { timeline?: boolean; reject?: string }) {
  const container = document.createElement('div');
  document.body.append(container);
  // 閉じたときのフォーカスの戻し先。実際の呼び出し側では図の追加アイコンがこれにあたる。
  const opener = document.createElement('button');
  container.append(opener);
  const submitted: AddElementSubmitValues[] = [];
  const popup = createAddElementPopup({
    container,
    t,
    onSubmit(values) {
      submitted.push(values);
      return options?.reject === undefined ? { ok: true } : { ok: false, reason: options.reject };
    },
  });
  popup.show({
    file: file(options?.timeline),
    sourceNodeIndex: 0,
    anchor: { x: 10, y: 10 },
    returnFocusTo: opener,
  });
  return { popup, container, submitted, opener };
}

function field(container: HTMLElement, name: string): HTMLInputElement {
  return container.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
}

function click(container: HTMLElement, action: string): void {
  (container.querySelector(`[data-action="${action}"]`) as HTMLButtonElement).click();
}

function fill(container: HTMLElement, label: string, frequency: string, strength: string): void {
  field(container, 'label').value = label;
  field(container, 'frequency').value = frequency;
  field(container, 'strength').value = strength;
}

describe('createAddElementPopup', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('開くと語名の欄へフォーカスが移る', () => {
    const { container } = setup();
    expect(document.activeElement).toBe(field(container, 'label'));
  });

  it('相手の語の名前を強度の見出しに出す', () => {
    const { container } = setup();
    expect(container.textContent).toContain('金利');
  });

  it('語名が空なら登録せず理由を出す', () => {
    const { container, submitted } = setup();
    click(container, 'submit');
    expect(submitted).toHaveLength(0);
    expect(container.querySelector('[data-role="error"]')?.textContent).toBe('語名を入力してください');
  });

  it('既存と同じ語名なら登録しない', () => {
    const { container, submitted } = setup();
    fill(container, '株価', '3', '0.4');
    click(container, 'submit');
    expect(submitted).toHaveLength(0);
    expect(container.querySelector('[data-role="error"]')?.textContent).toBe('同じ名前の語がすでにあります');
  });

  it('数値でない頻度なら登録しない', () => {
    const { container, submitted } = setup();
    fill(container, 'インフレ', 'x', '0.4');
    click(container, 'submit');
    expect(submitted).toHaveLength(0);
    expect(container.querySelector('[data-role="error"]')?.textContent).toBe(
      '頻度には 0 以上の数値を入力してください',
    );
  });

  it('正しい入力なら登録して閉じる', () => {
    const { container, submitted, popup } = setup();
    fill(container, ' インフレ ', '3', '0.4');
    click(container, 'submit');
    expect(submitted).toEqual([
      { label: 'インフレ', frequency: '3', strength: '0.4', clusterIndex: null },
    ]);
    expect(popup.isOpen()).toBe(false);
  });

  it('クラスタを選ぶと添字を渡す', () => {
    const { container, submitted } = setup();
    fill(container, 'インフレ', '3', '0.4');
    (container.querySelector('[data-field="cluster"]') as HTMLSelectElement).value = '0';
    click(container, 'submit');
    expect(submitted[0]?.clusterIndex).toBe(0);
  });

  it('書き込みが拒まれたら理由を出して閉じない', () => {
    const { container, popup } = setup({ reject: 'link strength must not be negative' });
    fill(container, 'インフレ', '3', '0.4');
    click(container, 'submit');
    expect(popup.isOpen()).toBe(true);
    expect(container.querySelector('[data-role="error"]')?.textContent).toBe(
      '登録できませんでした: link strength must not be negative',
    );
  });

  it('時間軸を持つ図ではスライス別の欄を出す', () => {
    const { container } = setup({ timeline: true });
    expect(container.querySelector('[data-field="frequency"]')).toBeNull();
    expect(container.querySelector('[data-field="strength"]')).toBeNull();
    expect(container.querySelectorAll('[data-field^="sliceFrequency-"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-field^="sliceStrength-"]')).toHaveLength(2);
  });

  it('時間軸を持つ図ではスライス別の値を渡す', () => {
    const { container, submitted } = setup({ timeline: true });
    field(container, 'label').value = 'インフレ';
    field(container, 'sliceFrequency-0').value = '2';
    field(container, 'sliceStrength-1').value = '0.3';
    click(container, 'submit');
    expect(submitted).toEqual([
      {
        label: 'インフレ',
        sliceFrequencies: ['2', ''],
        sliceStrengths: ['', '0.3'],
        clusterIndex: null,
      },
    ]);
  });

  it('Esc で閉じ、フォーカスを開いた操作面へ戻す', () => {
    const { container, popup, opener } = setup();
    container
      .querySelector('[data-role="popup"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup.isOpen()).toBe(false);
    // 戻さないとフォーカスが body へ落ち、キーボードでは図の先頭から辿り直しになる。
    expect(document.activeElement).toBe(opener);
  });

  it('キャンセルで閉じ、フォーカスを開いた操作面へ戻す', () => {
    const { container, popup, submitted, opener } = setup();
    click(container, 'cancel');
    expect(popup.isOpen()).toBe(false);
    expect(submitted).toHaveLength(0);
    expect(document.activeElement).toBe(opener);
  });

  it('登録に成功して閉じたときもフォーカスを戻す', () => {
    const { container, opener } = setup();
    fill(container, 'インフレ', '3', '0.4');
    click(container, 'submit');
    expect(document.activeElement).toBe(opener);
  });

  it('開いているあいだは共起の相手を答える', () => {
    const { popup } = setup();
    expect(popup.getSourceNodeIndex()).toBe(0);
    popup.hide();
    expect(popup.getSourceNodeIndex()).toBeNull();
  });

  it('開き直すと前回の入力を持ち越さない', () => {
    const { container, popup } = setup();
    fill(container, 'インフレ', '3', '0.4');
    popup.hide();
    popup.show({ file: file(), sourceNodeIndex: 1, anchor: { x: 10, y: 10 } });
    expect(field(container, 'label').value).toBe('');
    expect(container.textContent).toContain('株価');
  });
});
