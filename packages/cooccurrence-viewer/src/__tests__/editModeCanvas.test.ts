/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import ja from '../i18n/ja.json';
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

  it('開いたまま別の語を選ぶとポップアップを閉じる', () => {
    // 見出しには開いた時点の相手が出たままになる。開いたままにすると「金利 との共起」と
    // 読める画面で、後から選んだ語へ結ばれる。
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    addHandle(container)?.click();
    expect((container.querySelector('[data-role="popup"]') as HTMLElement).hidden).toBe(false);

    selectWord(container, '株価');
    expect((container.querySelector('[data-role="popup"]') as HTMLElement).hidden).toBe(true);
    handle.destroy();
  });

  it('パネル側の編集でファイルが差し替わるとポップアップを閉じる', () => {
    const { container, handle } = mount();
    enterEditMode(container);
    selectWord(container, '金利');
    addHandle(container)?.click();

    // 語一覧から語を 1 つ足す（添字がずれ、ポップアップは相手を失う）。
    const words = container.querySelector('#cooc-panel-words') as HTMLElement;
    (words.querySelectorAll('input')[1] as HTMLInputElement).value = '為替';
    [...words.querySelectorAll('button')].find((button) => button.textContent === '追加')?.click();

    expect((container.querySelector('[data-role="popup"]') as HTMLElement).hidden).toBe(true);
    handle.destroy();
  });

  it('編集モードを切ると、開いた全パネルの書き換え操作が押せなくなる', () => {
    // パネルを列挙せずに mount の配線を見る。setEditMode からどれか 1 枚への配布が
    // 落ちても、この検査なら落ちる。
    const { container, handle } = mount();
    enterEditMode(container);
    for (const panelId of ['cooc-panel-words', 'cooc-panel-links', 'cooc-panel-clusters', 'cooc-panel-timeline']) {
      (container.querySelector(`[role="tab"][aria-controls="${panelId}"]`) as HTMLButtonElement).click();
    }
    const controls = [...container.querySelectorAll<HTMLButtonElement>('[data-edit-control="true"]')];
    expect(controls.length).toBeGreaterThan(0);

    enterEditMode(container);
    expect(controls.filter((control) => !control.disabled)).toEqual([]);
    handle.destroy();
  });

  it('WebGL の縮退の告知を編集モードの切り替えで消さない', () => {
    // 注記の枠は 1 つしかない。持ち主を見ずに消すと、別の理由の告知を横から消す。
    // 初期化の失敗は例外で表れる（null を返しても失敗とは扱われない）。
    createOzRendererMock.mockImplementation(() => {
      throw new Error('webgl unavailable');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, handle } = mount();
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === ja.Cooccurrence['toolbar.skinOz'])
      ?.click();
    expect(container.textContent).toContain('WebGL を初期化できない');

    enterEditMode(container);
    expect(container.textContent).toContain('WebGL を初期化できない');
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
