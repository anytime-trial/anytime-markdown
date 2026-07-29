/**
 * @jest-environment jsdom
 */
import { LINK_DIRECTION, readLink, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createLinkListPanel, type LinkListPanelHandle } from '../ui/LinkListPanel';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: '納期遅延', frequency: 10 },
        { label: '仕様変更', frequency: 8 },
        { label: '人員不足', frequency: 6 },
      ],
      links: [
        [0, 1, 8],
        [1, 2, 5, LINK_DIRECTION.forward],
      ],
    },
  };
}

interface Harness {
  handle: LinkListPanelHandle;
  changed: CooccurrenceFile[];
}

function mount(overrides: Partial<Parameters<typeof createLinkListPanel>[0]> = {}): Harness {
  const changed: CooccurrenceFile[] = [];
  const handle = createLinkListPanel({
    file: file(),
    visibleLinkIndexes: new Set([0, 1]),
    selectedNodeIndex: null,
    t: (key) => key,
    onFileChange: (next) => changed.push(next),
    ...overrides,
  });
  document.body.appendChild(handle.element);
  return { handle, changed };
}

function rows(handle: LinkListPanelHandle): HTMLElement[] {
  return [...handle.element.querySelectorAll<HTMLElement>('[role="option"]')];
}

function field(handle: LinkListPanelHandle, name: string): HTMLSelectElement | HTMLInputElement {
  const element = handle.element.querySelector<HTMLSelectElement | HTMLInputElement>(`[data-field="${name}"]`);
  if (!element) throw new Error(`field not found: ${name}`);
  return element;
}

function action(handle: LinkListPanelHandle, name: string): HTMLButtonElement {
  const element = handle.element.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
  if (!element) throw new Error(`action not found: ${name}`);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('共起パネル', () => {
  it('共起の行を一覧に出す', () => {
    const { handle } = mount();
    expect(rows(handle)).toHaveLength(2);
  });

  it('行に両端の語名と向きの記号を出す', () => {
    const { handle } = mount();
    const texts = rows(handle).map((row) => row.textContent ?? '');
    expect(texts[0]).toContain('納期遅延');
    expect(texts[0]).toContain('仕様変更');
    expect(texts[0]).toContain('—');
    expect(texts[1]).toContain('→');
  });

  it('検索で行が絞られる', () => {
    const { handle } = mount();
    const search = handle.element.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('search input not found');
    search.value = '人員';
    search.dispatchEvent(new Event('input'));
    expect(rows(handle)).toHaveLength(1);
  });

  it('絞り込みで図から消えた共起も一覧に残る', () => {
    // 一覧は編集面である（設計書 §3.3）。図に出ていないことは印で示す。
    const { handle } = mount({ visibleLinkIndexes: new Set([0]) });
    expect(rows(handle)).toHaveLength(2);
    expect(rows(handle)[1].dataset.hiddenByFilter).toBe('true');
  });

  it('図で選んだ語に関わる共起へ印を付ける', () => {
    const { handle } = mount({ selectedNodeIndex: 2 });
    expect(rows(handle)[0].dataset.related).toBe('false');
    expect(rows(handle)[1].dataset.related).toBe('true');
  });

  it('行を選ぶとフォームへ現在値が入る', () => {
    const { handle } = mount();
    rows(handle)[1].click();
    expect(field(handle, 'strength').value).toBe('5');
    expect(field(handle, 'direction').value).toBe(String(LINK_DIRECTION.forward));
  });

  it('向きを変えて更新すると新しいファイルが返る', () => {
    const { handle, changed } = mount();
    rows(handle)[0].click();
    (field(handle, 'direction') as HTMLSelectElement).value = String(LINK_DIRECTION.both);
    action(handle, 'update').click();

    expect(changed).toHaveLength(1);
    expect(readLink(changed[0].spec.links[0]).direction).toBe(LINK_DIRECTION.both);
  });

  it('更新で強度と向きの両方が反映される', () => {
    const { handle, changed } = mount();
    rows(handle)[0].click();
    (field(handle, 'strength') as HTMLInputElement).value = '9';
    (field(handle, 'direction') as HTMLSelectElement).value = String(LINK_DIRECTION.backward);
    action(handle, 'update').click();

    expect(readLink(changed[0].spec.links[0])).toMatchObject({ strength: 9, direction: LINK_DIRECTION.backward });
  });

  it('向き付きで共起を追加できる', () => {
    const { handle, changed } = mount();
    (field(handle, 'source') as HTMLSelectElement).value = '0';
    (field(handle, 'target') as HTMLSelectElement).value = '2';
    (field(handle, 'strength') as HTMLInputElement).value = '3';
    (field(handle, 'direction') as HTMLSelectElement).value = String(LINK_DIRECTION.forward);
    action(handle, 'add').click();

    expect(changed).toHaveLength(1);
    expect(changed[0].spec.links).toHaveLength(3);
    expect(readLink(changed[0].spec.links[2])).toMatchObject({ source: 0, target: 2, direction: LINK_DIRECTION.forward });
  });

  it('共起を削除できる', () => {
    const { handle, changed } = mount();
    rows(handle)[0].click();
    action(handle, 'delete').click();
    expect(changed[0].spec.links).toHaveLength(1);
  });

  it('選択していないときの更新と削除は何もしない', () => {
    const { handle, changed } = mount();
    action(handle, 'update').click();
    action(handle, 'delete').click();
    expect(changed).toEqual([]);
  });

  it('検証に落ちる編集は反映せず理由を出す', () => {
    const { handle, changed } = mount();
    (field(handle, 'source') as HTMLSelectElement).value = '0';
    (field(handle, 'target') as HTMLSelectElement).value = '0';
    action(handle, 'add').click();

    expect(changed).toEqual([]);
    expect(handle.element.querySelector('.cooc-links__error')?.textContent).not.toBe('');
  });

  it('負の強度を拒否する', () => {
    const { handle, changed } = mount();
    rows(handle)[0].click();
    (field(handle, 'strength') as HTMLInputElement).value = '-1';
    action(handle, 'update').click();

    expect(changed).toEqual([]);
    expect(handle.element.querySelector('.cooc-links__error')?.textContent).not.toBe('');
  });

  it('強度が検証に落ちたとき向きだけが適用されることはない', () => {
    // 片方だけ適用された中途半端な状態を残さない。
    const { handle, changed } = mount();
    rows(handle)[0].click();
    (field(handle, 'strength') as HTMLInputElement).value = '-1';
    (field(handle, 'direction') as HTMLSelectElement).value = String(LINK_DIRECTION.both);
    action(handle, 'update').click();

    expect(changed).toEqual([]);
  });
});
