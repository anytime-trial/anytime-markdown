/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import { createOzRenderer } from '../scene3d/ozRenderer';

// 3D の描画器は WebGL を要求する。jsdom では初期化できず、モックしないと標準表示のまま
// 切り替わらない（切り替わらなければ「3D 中は足せない」という検査そのものが成立しない）。
jest.mock('../scene3d/ozRenderer', () => ({ createOzRenderer: jest.fn() }));

const createOzRendererMock = createOzRenderer as jest.MockedFunction<typeof createOzRenderer>;

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: '金利', frequency: 10 },
        { label: '株価', frequency: 8 },
      ],
      links: [[0, 1, 0.5]],
    },
    // レイアウトは持たせない。持たせるなら算出器の版まで整合させる必要があり、この検査の
    // 対象（アイコンの出し分けと登録の経路）から離れる。座標は暫定配置で決まる。
  } as unknown as CooccurrenceFile;
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const changes: CooccurrenceFile[] = [];
  const handle = mountCooccurrenceViewer(container, {
    file: file(),
    themeMode: 'light',
    locale: 'ja',
    onFileChange(next) {
      changes.push(next);
    },
  });
  return { container, handle, changes };
}

function enterEditMode(container: HTMLElement): void {
  (container.querySelector('[data-edit-mode-toggle="true"]') as HTMLButtonElement).click();
}

/** 語一覧の行を押して図の選択を動かす（図のキャンバスは jsdom では当たり判定を持てない）。 */
function selectWord(container: HTMLElement, label: string): void {
  (container.querySelector('[role="tab"][aria-controls="cooc-panel-words"]') as HTMLButtonElement).click();
  const row = [...container.querySelectorAll<HTMLElement>('#cooc-panel-words [data-node-index]')].find(
    (candidate) => candidate.textContent?.includes(label) === true,
  );
  (row as HTMLElement).click();
}

function addHandle(container: HTMLElement): HTMLButtonElement | null {
  const handle = container.querySelector<HTMLButtonElement>('[data-role="add-handle"]');
  return handle === null || handle.hidden ? null : handle;
}

/**
 * ポップアップ内の入力欄を取る。
 *
 * スコープを切るのは、共起タブにも `data-field="strength"` の欄があり、図全体から拾うと
 * パネル側の欄へ値を入れてしまうため。
 */
function field(container: HTMLElement, name: string): HTMLInputElement {
  const popup = container.querySelector('[data-role="popup"]') as HTMLElement;
  return popup.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
}

describe('図からの要素追加', () => {
  beforeEach(() => {
    // jsdom はキャンバスも寸法の監視も持たない。描画そのものはこの検査の対象外で、
    // 見るのは追加アイコンの有無と位置の更新経路である。
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    createOzRendererMock.mockReturnValue({
      setModel: jest.fn(),
      setThemeMode: jest.fn(),
      setAnimating: jest.fn(),
      fitView: jest.fn(),
      exportPng: jest.fn().mockResolvedValue(null),
      dispose: jest.fn(),
    });
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

  it('編集モードが切のときは追加アイコンを出さない', () => {
    const { container, handle } = mount();
    selectWord(container, '金利');
    expect(addHandle(container)).toBeNull();
    handle.destroy();
  });

  it('編集モードで語を選ぶと追加アイコンが出る', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    expect(addHandle(container)).not.toBeNull();
    expect(addHandle(container)?.getAttribute('aria-label')).toBe('この語につながる語を追加');
    handle.destroy();
  });

  it('選択を外すと追加アイコンが消える', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    selectWord(container, '金利');
    expect(addHandle(container)).toBeNull();
    handle.destroy();
  });

  it('編集モードを切ると追加アイコンが消える', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    enterEditMode(container);
    expect(addHandle(container)).toBeNull();
    handle.destroy();
  });

  it('追加アイコンからの登録で語と共起が 1 つずつ増える', () => {
    const { container, handle, changes } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    addHandle(container)?.click();
    field(container, 'label').value = 'インフレ';
    field(container, 'frequency').value = '3';
    field(container, 'strength').value = '0.4';
    (container.querySelector('[data-action="submit"]') as HTMLButtonElement).click();

    const last = changes[changes.length - 1];
    expect(last.spec.nodes.map((node) => node.label)).toEqual(['金利', '株価', 'インフレ']);
    expect(last.spec.links).toHaveLength(2);
    // 追加した共起の端点は「選んでいた語」と「足した語」。
    expect(last.spec.links[1][0]).toBe(0);
    expect(last.spec.links[1][1]).toBe(2);
    handle.destroy();
  });

  it('登録に成功すると足した語が選択される', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    addHandle(container)?.click();
    field(container, 'label').value = 'インフレ';
    field(container, 'frequency').value = '3';
    field(container, 'strength').value = '0.4';
    (container.querySelector('[data-action="submit"]') as HTMLButtonElement).click();

    const selected = container.querySelector('#cooc-panel-words [aria-selected="true"]');
    expect(selected?.textContent).toContain('インフレ');
    handle.destroy();
  });

  it('OZ 風 3D では追加アイコンを出さず、理由を示す', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    handle.update({ skin: 'oz' });

    expect(addHandle(container)).toBeNull();
    expect(container.textContent).toContain('3D 表示中は図から追加できません');
    handle.destroy();
  });
});
