/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createClusterListPanel } from '../ui/ClusterListPanel';
import { createLinkListPanel } from '../ui/LinkListPanel';
import { createTimelinePanel } from '../ui/TimelinePanel';
import { createWordListPanel } from '../ui/WordListPanel';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-31T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: '金利', frequency: 10 },
        { label: '株価', frequency: 8 },
      ],
      links: [[0, 1, 0.5]],
      clusters: [{ label: '政策', members: [0] }],
    },
  } as unknown as CooccurrenceFile;
}

/**
 * 編集モードに従うべきパネルの一覧。
 *
 * パネルを足したらここへ足す。検査を個々のパネルの試験へ分散させると、後から足したパネルが
 * 検査から漏れ、閲覧中にそこだけ書き換えられる状態が出荷される。
 */
const PANELS = [
  {
    name: 'words',
    create: (editable: boolean) =>
      createWordListPanel({
        file: file(),
        visibleNodeIndexes: new Set([0, 1]),
        selectedNodeIndex: 0,
        t,
        editable,
        onSelectNode() {},
        onFileChange() {},
      }),
  },
  {
    name: 'links',
    create: (editable: boolean) =>
      createLinkListPanel({
        file: file(),
        visibleLinkIndexes: new Set([0]),
        selectedNodeIndex: 0,
        t,
        editable,
        onFileChange() {},
      }),
  },
  {
    name: 'clusters',
    create: (editable: boolean) =>
      createClusterListPanel({
        file: file(),
        selectedClusterIndex: 0,
        laneView: { enabled: false, gap: 120 },
        t,
        editable,
        onSelectCluster() {},
        onFileChange() {},
        onHoverCluster() {},
        onLaneViewChange() {},
      }),
  },
  {
    name: 'timeline',
    create: (editable: boolean) =>
      createTimelinePanel({
        file: file(),
        view: {
          layered: false,
          axis: 'horizontal',
          gap: 160,
          showTimeLinks: true,
          selectedSliceLabels: undefined,
        },
        t,
        editable,
        onFileChange() {},
        onViewChange() {},
        onSliceRenamed() {},
      }),
  },
] as const;

function writeControls(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-edit-control="true"]')];
}

describe.each(PANELS)('$name パネルの編集モード', ({ create }) => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('編集モードが切のとき、書き換え系のコントロールがすべて押せない', () => {
    const panel = create(false);
    document.body.append(panel.element);
    const controls = writeControls(panel.element);
    // 目印が 1 つも無ければ「すべて無効」は空振りで真になる（fail-open）。
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((control) => {
      expect(control.disabled).toBe(true);
    });
  });

  it('編集モードが入のとき、少なくとも 1 つは押せる', () => {
    const panel = create(true);
    document.body.append(panel.element);
    expect(writeControls(panel.element).filter((control) => !control.disabled).length).toBeGreaterThan(0);
  });

  it('後から切り替えても反映される', () => {
    const panel = create(true);
    document.body.append(panel.element);
    panel.setEditable(false);
    writeControls(panel.element).forEach((control) => {
      expect(control.disabled).toBe(true);
    });
  });
});
