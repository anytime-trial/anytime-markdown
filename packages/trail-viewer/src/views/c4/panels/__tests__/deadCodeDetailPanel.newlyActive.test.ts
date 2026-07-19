/**
 * Phase 6 S5-D: Dead Code パネルの Newly Active バッジ。
 * dead code のシグナル一覧とは別枠で出す（スコアに加算しないことを表示上も分ける）。
 */
import type { FileAnalysisApiEntry } from '../../../../c4/hooks/fetchFileAnalysisApi';
import { mountDeadCodeDetailPanel } from '../deadCodeDetailPanel';

const colors = {
  text: '#fff',
  textSecondary: '#ccc',
  textMuted: '#888',
  border: '#333',
} as unknown as Parameters<typeof mountDeadCodeDetailPanel>[1]['colors'];

const t = (key: string): string => key;

function entry(overrides: Partial<FileAnalysisApiEntry> = {}): FileAnalysisApiEntry {
  return {
    filePath: 'packages/x/src/a.ts',
    importanceScore: 0,
    fanInTotal: 0,
    cognitiveComplexityMax: 0,
    lineCount: 10,
    functionCount: 1,
    deadCodeScore: 20,
    signals: {
      orphan: false,
      fanInZero: false,
      noRecentChurn: false,
      zeroCoverage: false,
      isolatedCommunity: false,
    },
    isIgnored: false,
    ignoreReason: '',
    centralityScore: 0,
    crossPkgInCount: 0,
    externalConsumerPkgs: 0,
    isBarrel: false,
    ...overrides,
  };
}

describe('deadCodeDetailPanel: newly active badge', () => {
  test('newlyActive のファイルがあればバッジと件数を出す', () => {
    const host = document.createElement('div');
    const handle = mountDeadCodeDetailPanel(host, {
      t,
      colors,
      entries: [
        entry({ filePath: 'a.ts', newlyActive: true }),
        entry({ filePath: 'b.ts', newlyActive: true }),
        entry({ filePath: 'c.ts', newlyActive: false }),
      ],
    });
    expect(host.textContent).toContain('c4.popup.newlyActive (2)');
    handle.destroy();
  });

  test('newlyActive が無ければバッジを出さない', () => {
    const host = document.createElement('div');
    const handle = mountDeadCodeDetailPanel(host, {
      t,
      colors,
      entries: [entry({ newlyActive: false })],
    });
    expect(host.textContent).not.toContain('c4.popup.newlyActive');
    handle.destroy();
  });

  test('旧サーバー応答（newlyActive 未定義）でもバッジを出さない', () => {
    const host = document.createElement('div');
    const handle = mountDeadCodeDetailPanel(host, { t, colors, entries: [entry()] });
    expect(host.textContent).not.toContain('c4.popup.newlyActive');
    handle.destroy();
  });
});
