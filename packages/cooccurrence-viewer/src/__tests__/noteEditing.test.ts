/**
 * @jest-environment jsdom
 */
import { readCooccurrenceNote, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [{ label: 'alpha-cluster', members: [0] }],
    },
  };
}

function mount(onFileChange: (next: CooccurrenceFile) => void): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountCooccurrenceViewer(container, { file: file(), themeMode: 'light', locale: 'ja', onFileChange });
  return container;
}

function openTab(container: HTMLElement, panelId: string): void {
  (container.querySelector(`[role="tab"][aria-controls="${panelId}"]`) as HTMLButtonElement).click();
}

function panel(container: HTMLElement, panelId: string): HTMLElement {
  return container.querySelector(`#${panelId}`) as HTMLElement;
}

function noteInput(scope: HTMLElement): HTMLTextAreaElement {
  return scope.querySelector('.cooc-note-editor__input') as HTMLTextAreaElement;
}

function noteButton(scope: HTMLElement, label: string): HTMLButtonElement {
  return [...scope.querySelectorAll<HTMLButtonElement>('.cooc-note-editor__button')].find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement;
}

function selectFirstRow(scope: HTMLElement): void {
  (scope.querySelector('[role="option"]') as HTMLButtonElement).click();
}

describe('メモの編集', () => {
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
    for (const id of [
      'cooccurrence-viewer-style',
      'cooccurrence-filter-panel-style',
      'cooccurrence-word-list-panel-style',
      'cooccurrence-link-list-panel-style',
      'cooccurrence-cluster-list-panel-style',
      'cooccurrence-note-popup-style',
      'cooccurrence-note-editor-style',
      'cooccurrence-side-rail-style',
      'cooccurrence-minimap-panel-style',
      'cooccurrence-export-panel-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('語タブでメモを設定するとホストへ通知され、行に印が付く', () => {
    let latest: CooccurrenceFile | null = null;
    const container = mount((next) => {
      latest = next;
    });
    openTab(container, 'cooc-panel-words');
    const scope = panel(container, 'cooc-panel-words');
    selectFirstRow(scope);

    noteInput(scope).value = '一行目\n二行目';
    noteButton(scope, 'メモを設定').click();

    expect(latest).not.toBeNull();
    expect(readCooccurrenceNote(latest!.spec, 'nodes', 0)).toBe('一行目\n二行目');
    // 印が無いと、ホバーしなければメモの存在すら分からない（設計書 §3.1）。
    expect(panel(container, 'cooc-panel-words').textContent).toContain('＊');
  });

  it('空のメモは保存されず、理由が表示される', () => {
    let latest: CooccurrenceFile | null = null;
    const container = mount((next) => {
      latest = next;
    });
    openTab(container, 'cooc-panel-words');
    const scope = panel(container, 'cooc-panel-words');
    selectFirstRow(scope);

    noteInput(scope).value = '';
    noteButton(scope, 'メモを設定').click();

    expect(latest).toBeNull();
    expect((scope.querySelector('.cooc-words__error') as HTMLElement).textContent).not.toBe('');
  });

  it('メモを削除すると通知され、印が消える', () => {
    let latest: CooccurrenceFile | null = null;
    const container = mount((next) => {
      latest = next;
    });
    openTab(container, 'cooc-panel-words');
    let scope = panel(container, 'cooc-panel-words');
    selectFirstRow(scope);
    noteInput(scope).value = 'メモ';
    noteButton(scope, 'メモを設定').click();

    scope = panel(container, 'cooc-panel-words');
    selectFirstRow(scope);
    noteButton(scope, 'メモを削除').click();

    expect(readCooccurrenceNote(latest!.spec, 'nodes', 0)).toBeUndefined();
    expect(panel(container, 'cooc-panel-words').textContent).not.toContain('＊');
  });

  it('共起タブとクラスタタブでもメモを設定できる', () => {
    let latest: CooccurrenceFile | null = null;
    const container = mount((next) => {
      latest = next;
    });

    openTab(container, 'cooc-panel-links');
    const links = panel(container, 'cooc-panel-links');
    selectFirstRow(links);
    noteInput(links).value = '共起のメモ';
    noteButton(links, 'メモを設定').click();
    expect(readCooccurrenceNote(latest!.spec, 'links', 0)).toBe('共起のメモ');

    openTab(container, 'cooc-panel-clusters');
    const clusters = panel(container, 'cooc-panel-clusters');
    selectFirstRow(clusters);
    noteInput(clusters).value = 'クラスタのメモ';
    noteButton(clusters, 'メモを設定').click();
    expect(readCooccurrenceNote(latest!.spec, 'clusters', 0)).toBe('クラスタのメモ');
  });

  it('クラスタが無い図では一覧が空である旨を出す', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const withoutClusters = file();
    delete withoutClusters.spec.clusters;
    mountCooccurrenceViewer(container, { file: withoutClusters, themeMode: 'light', locale: 'ja' });

    openTab(container, 'cooc-panel-clusters');

    expect(panel(container, 'cooc-panel-clusters').textContent).toContain('クラスタがありません');
  });
});
