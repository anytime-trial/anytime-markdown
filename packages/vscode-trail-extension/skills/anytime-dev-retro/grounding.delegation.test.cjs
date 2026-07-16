/**
 * grounding.cjs の委任成績集計（delegation ブロック）のリグレッションテスト。
 *
 * 由来: 正規表現末尾の \b は JS では \w=[A-Za-z0-9_] 基準のため日本語直後に成立せず、
 * 「採用」「差し戻し」が永久に不一致になるバグをマージ前レビューが検出した(2026-07-16)。
 * 書式契約は anytime-dev-cycle references/delegation.md §2.2 と同期する。
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGrounding(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-delegation-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout).delegation;
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

function writeDocs(ws, planLines) {
  const docs = path.join(ws, 'docs');
  fs.mkdirSync(path.join(docs, 'plan'), { recursive: true });
  fs.mkdirSync(path.join(ws, '.anytime', 'trail'), { recursive: true });
  fs.writeFileSync(
    path.join(ws, '.anytime', 'trail', 'lep.json'),
    JSON.stringify({ sources: { docs: { root: docs } } }),
  );
  fs.writeFileSync(path.join(docs, 'plan', 'p.md'), planLines.join('\n'));
}

describe('grounding.cjs delegation 集計', () => {
  test('採用/差し戻し/abstain を版数別に数える（日本語直後の境界で取りこぼさない）', () => {
    const delegation = runGrounding((ws) =>
      writeDocs(ws, [
        '- 委譲結果: 雛形v2 採用 — 所感',
        '- 委譲結果: 雛形v2 差し戻し — 乖離内容',
        '- 委譲結果: 雛形v2 採用',
        '- 委譲結果: 雛形v3 abstain — 前提不整合',
        '- 委譲結果: 雛形v2 採用形 これは誤マッチさせない',
        '  - 委譲結果: 雛形v2 採用 — 行頭固定なのでネストは数えない',
      ]),
    );
    expect(delegation.recorded).toBe(4);
    expect(delegation.byVersion.v2).toEqual({ 採用: 2, 差し戻し: 1, abstain: 0 });
    expect(delegation.byVersion.v3).toEqual({ 採用: 0, 差し戻し: 0, abstain: 1 });
  });

  test('docs root 未解決は測定不能 null（0 件と区別する）', () => {
    const delegation = runGrounding(() => {
      /* lep.json なし */
    });
    expect(delegation.recorded).toBeNull();
    expect(delegation.byVersion).toBeNull();
  });
});
