/**
 * @jest-environment jsdom
 */
/**
 * `<anytime-cooccurrence-viewer>` Web Component のユニットテスト。
 *
 * canvas / RAF / ResizeObserver のモックは既存 mount 統合テスト（mountPanels.test.ts）と同じ。
 * change イベントは noteEditing.test.ts と同じ実 UI 経路（語タブのメモ設定）で発火させる。
 * 「イベントが出た」だけでなく detail.file と file getter の追従まで見る。
 */
import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  computeSpecHash,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import '../element';
import { AnytimeCooccurrenceViewerElement } from '../AnytimeCooccurrenceViewerElement';

function file(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-08-01T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [
        { label: 'A', members: [0] },
        { label: 'B', members: [1] },
      ],
    },
  };
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

function createElement(): AnytimeCooccurrenceViewerElement {
  return document.createElement('anytime-cooccurrence-viewer') as AnytimeCooccurrenceViewerElement;
}

describe('AnytimeCooccurrenceViewerElement', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class {
        observe(): void {}
        disconnect(): void {}
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('anytime-cooccurrence-viewer タグが登録される', () => {
    expect(customElements.get('anytime-cooccurrence-viewer')).toBe(AnytimeCooccurrenceViewerElement);
  });

  it('connect 前に set した file で mount し、disconnect で破棄する', () => {
    const el = createElement();
    el.file = file();
    document.body.appendChild(el);
    expect(el.querySelector('.cooc-viewer')).not.toBeNull();
    expect(el.viewer).not.toBeNull();
    el.remove();
    expect(el.querySelector('.cooc-viewer')).toBeNull();
    expect(el.viewer).toBeNull();
  });

  it('file が無ければ mount しない', () => {
    const el = createElement();
    document.body.appendChild(el);
    expect(el.querySelector('.cooc-viewer')).toBeNull();
    expect(el.viewer).toBeNull();
  });

  it('connect 後の file set で mount し、以後の file set は再 mount せず update で反映する', () => {
    const el = createElement();
    document.body.appendChild(el);
    el.file = file();
    const mounted = el.viewer;
    expect(mounted).not.toBeNull();
    el.file = file();
    expect(el.viewer).toBe(mounted);
  });

  it('value（JSON 文字列）で授受でき、parse 失敗は現状維持で console.error を残す', () => {
    const el = createElement();
    el.value = JSON.stringify(file());
    document.body.appendChild(el);
    expect(el.querySelector('.cooc-viewer')).not.toBeNull();
    expect(JSON.parse(el.value).spec.nodes[0].label).toBe('Alpha');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      el.value = '{ not json';
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.parse(el.value).spec.nodes[0].label).toBe('Alpha');
  });

  it('theme / skin / show-panels の属性変更は再 mount せず live 反映する', () => {
    const el = createElement();
    el.file = file();
    document.body.appendChild(el);
    const mounted = el.viewer;

    el.setAttribute('theme', 'dark');
    el.setAttribute('skin', 'oz');
    el.setAttribute('show-panels', 'false');
    expect(el.viewer).toBe(mounted);

    const panels = el.querySelector('.cooc-viewer__panels') as HTMLElement;
    expect(panels.hidden).toBe(true);
    el.removeAttribute('show-panels');
    expect(panels.hidden).toBe(false);
  });

  it('locale の属性変更は現在の file を保持して再 mount する', () => {
    const el = createElement();
    el.file = file();
    document.body.appendChild(el);
    const mounted = el.viewer;

    el.setAttribute('locale', 'ja');
    expect(el.viewer).not.toBeNull();
    expect(el.viewer).not.toBe(mounted);
    expect(el.querySelector('.cooc-viewer')).not.toBeNull();
    expect(el.file?.spec.nodes[0]?.label).toBe('Alpha');
  });

  it('実編集（メモ設定）で change イベントと options.onFileChange の両方が発火し、file getter が追従する', () => {
    const el = createElement();
    el.setAttribute('locale', 'ja');
    const userOnFileChange = jest.fn();
    el.options = { onFileChange: userOnFileChange };
    el.file = file();
    document.body.appendChild(el);

    const changed: CooccurrenceFile[] = [];
    el.addEventListener('change', (event) => {
      changed.push((event as CustomEvent<{ file: CooccurrenceFile }>).detail.file);
    });

    // 既定は閲覧専用のため、書き換えは編集モードへ入ってから（noteEditing.test.ts と同じ）。
    (el.querySelector('[data-edit-mode-toggle="true"]') as HTMLButtonElement).click();
    (el.querySelector('[role="tab"][aria-controls="cooc-panel-words"]') as HTMLButtonElement).click();
    const scope = el.querySelector('#cooc-panel-words') as HTMLElement;
    (scope.querySelector('[role="option"]') as HTMLButtonElement).click();
    (scope.querySelector('.cooc-note-editor__input') as HTMLTextAreaElement).value = 'WC 経由のメモ';
    const setButton = Array.from(scope.querySelectorAll('button')).find(
      (b) => b.textContent === 'メモを設定',
    ) as HTMLButtonElement;
    setButton.click();

    expect(changed).toHaveLength(1);
    expect(userOnFileChange).toHaveBeenCalledTimes(1);
    expect(el.file).toBe(changed[0]);
  });

  it('update() は handle へ委譲し、未 mount では throw しない', () => {
    const el = createElement();
    expect(() => el.update({ themeMode: 'dark' })).not.toThrow();
    el.file = file();
    document.body.appendChild(el);
    expect(() => el.update({ themeMode: 'dark' })).not.toThrow();
  });
});
