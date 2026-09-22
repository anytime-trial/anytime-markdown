/**
 * `<anytime-diagram-viewer>` の境界（jsdom）。
 *
 * 図の中身は `mountDiagramViewer.test.ts` と `elementAnnex.test.ts` が測る。ここで測るのは
 * **要素の皮**だけ — 属性とプロパティが mount へ届くか、イベントが出るか、付け外しで
 * mount と destroy が対称か。
 */

import type { DiagramDocument } from '@anytime-markdown/diagram-core';

import { AnytimeDiagramViewerElement } from '../AnytimeDiagramViewerElement';
import type { DiagramElementAnnex } from '../types';

const DOC: DiagramDocument = {
  version: 1,
  title: '検査用の系図',
  lead: '',
  note: '',
  legend: '',
  groups: [],
  families: [{ parents: ['父'], children: ['子'], kind: 'birth', groups: {} }],
  nodes: [],
  shapes: {},
  connectors: [],
  annotations: {},
  layout: { placements: {} },
};

const TAG = 'anytime-diagram-viewer';

/**
 * 登録は `element.ts` が持つ。テストでは**このファイルの中で直に登録する** — `element.ts` を
 * import すると、副作用の分離そのものを測る検査（登録が走らないこと）と同じ実行環境で
 * 登録が済んでしまい、あちらが常に緑になる。
 */
beforeAll(() => {
  if (!customElements.get(TAG)) customElements.define(TAG, AnytimeDiagramViewerElement);
});

let host: AnytimeDiagramViewerElement;

function place(): AnytimeDiagramViewerElement {
  const element = document.createElement(TAG) as AnytimeDiagramViewerElement;
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  host?.remove();
  document.body.innerHTML = '';
});

describe('ライフサイクル', () => {
  it('図を渡すまで mount しない', () => {
    host = place();
    expect(host.viewer).toBeNull();
    expect(host.querySelector('.anytime-diagram')).toBeNull();
  });

  it('図を渡すと mount する', () => {
    host = place();
    host.document = DOC;
    expect(host.viewer).not.toBeNull();
    expect(host.querySelector('.anytime-diagram')).not.toBeNull();
  });

  it('取り外すと destroy し、付け直すと mount し直す', () => {
    host = place();
    host.document = DOC;
    host.remove();
    expect(host.viewer).toBeNull();
    document.body.appendChild(host);
    // 付け外しが対称でないと、DOM を動かしただけで図が消えるか二重に積まれる。
    expect(host.viewer).not.toBeNull();
    expect(host.querySelectorAll('.anytime-diagram')).toHaveLength(1);
  });

  it('図に null を渡すと destroy する', () => {
    host = place();
    host.document = DOC;
    host.document = null;
    expect(host.viewer).toBeNull();
  });
});

describe('プロパティ', () => {
  it('`value` は JSON 文字列として図を受ける', () => {
    host = place();
    host.value = JSON.stringify(DOC);
    expect(host.document?.title).toBe('検査用の系図');
  });

  it('`value` の parse に失敗しても throw せず、現在の図を保つ', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    host = place();
    host.document = DOC;
    host.value = '{ 壊れた JSON';
    expect(host.document).toBe(DOC);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('mount 前に渡した `elementAnnex` も mount 時に届く', () => {
    const annex: Readonly<Record<string, DiagramElementAnnex>> = {
      父: { summary: '地図で見る', items: [{ id: 'spot-a', label: '高千穂峰' }] },
    };
    host = place();
    host.elementAnnex = annex;
    host.document = DOC;
    const summary = host.querySelector('.anytime-diagram-node[data-person="父"] .anytime-diagram-annex summary');
    expect(summary?.textContent).toBe('地図で見る (1)');
  });
});

describe('属性', () => {
  it('`editable` を付けて mount すると編集に入れる', () => {
    host = place();
    host.setAttribute('editable', '');
    host.document = DOC;
    expect(host.querySelector('.anytime-diagram-toolbar')).not.toBeNull();
  });

  it('`theme="dark"` で配色トークンを自分へ当てる', () => {
    host = place();
    host.setAttribute('theme', 'dark');
    host.document = DOC;
    expect(host.style.getPropertyValue('--am-color-bg-default')).toBe('#0D1117');
    expect(host.style.getPropertyValue('--am-color-text-primary')).toBe('#ffffffde');
  });

  it('`theme` の切り替えは再 mount なしでトークンを差し替える', () => {
    host = place();
    host.setAttribute('theme', 'dark');
    host.document = DOC;
    const viewer = host.viewer;
    host.setAttribute('theme', 'light');
    expect(host.style.getPropertyValue('--am-color-bg-default')).toBe('#F2EFE8');
    expect(host.viewer).toBe(viewer);
  });

  it('未知の `theme` はライトへ倒す', () => {
    host = place();
    // 属性は外部入力。壊れた値を配色の判定へそのまま通さない。
    host.setAttribute('theme', 'ダーク');
    host.document = DOC;
    expect(host.style.getPropertyValue('--am-color-bg-default')).toBe('#F2EFE8');
  });

  it('`compact` の切り替えは再 mount せず handle へ委譲する', () => {
    host = place();
    host.document = DOC;
    const viewer = host.viewer;
    host.setAttribute('compact', '');
    expect(host.viewer).toBe(viewer);
  });

  it('`always-editing` の切り替えは現在の図を保って張り直す', () => {
    host = place();
    host.document = DOC;
    const viewer = host.viewer;
    host.setAttribute('always-editing', '');
    // 常時編集は下書きの始め方を変えるので mount 時にしか決まらない。
    expect(host.viewer).not.toBe(viewer);
    expect(host.querySelectorAll('.anytime-diagram')).toHaveLength(1);
  });
});

describe('イベント', () => {
  it('札を押すと `element-select` を出す', () => {
    const seen: unknown[] = [];
    host = place();
    host.addEventListener('element-select', (event) => seen.push((event as CustomEvent).detail));
    host.document = DOC;
    host.querySelector('.anytime-diagram-node[data-person="父"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual([{ name: '父', additive: false }]);
  });

  it('添えた項目を押すと `element-annex` を出す（`options` を渡さなくても押せる）', () => {
    const seen: unknown[] = [];
    host = place();
    host.addEventListener('element-annex', (event) => seen.push((event as CustomEvent).detail));
    host.elementAnnex = { 父: { summary: '地図で見る', items: [{ id: 'spot-a', label: '高千穂峰' }] } };
    host.document = DOC;
    const item = host.querySelector<HTMLButtonElement>('.anytime-diagram-annex-item');
    expect(item?.disabled).toBe(false);
    item?.click();
    expect(seen).toEqual([{ name: '父', id: 'spot-a' }]);
  });

  it('イベントは器の外まで届く（bubbles / composed）', () => {
    const seen: string[] = [];
    document.addEventListener('element-select', () => seen.push('element-select'));
    host = place();
    host.document = DOC;
    host.querySelector('.anytime-diagram-node[data-person="父"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual(['element-select']);
  });
});

describe('escape hatch', () => {
  it('`options` の受け口はイベントと両方呼ばれる', () => {
    const seen: string[] = [];
    host = place();
    host.addEventListener('element-select', () => seen.push('event'));
    host.options = { onSelect: () => seen.push('callback') };
    host.document = DOC;
    host.querySelector('.anytime-diagram-node[data-person="父"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual(['event', 'callback']);
  });

  it('mount 済みで `options` を差し替えると、図を保ったまま張り直す', () => {
    host = place();
    host.document = DOC;
    host.options = { compact: true };
    expect(host.document).toBe(DOC);
    expect(host.querySelectorAll('.anytime-diagram')).toHaveLength(1);
  });
});

