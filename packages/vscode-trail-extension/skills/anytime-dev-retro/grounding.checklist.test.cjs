/**
 * grounding.cjs の観点キー集計（quality.checklistNone / checklistRefRecorded /
 * checklistNoneClusters）のリグレッションテスト。
 *
 * 由来: cross-review 合意指摘(2026-07-18)。substr によるパッケージ名抽出・
 * pragma_table_info による列存在分岐・HAVING c >= 2 のクラスタ閾値は
 * 壊れても既存テストでは検知できない。列定義は memory-core migration
 * 015_checklist_ref.sql と同期する。
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGroundingQuality(setup) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-checklist-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout).quality;
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

// grounding が参照する列のみ持つ最小 memory-core.db を <ws>/.anytime/trail/db に作る。
// 他の quality クエリはテーブル不在で失敗するが q() が errors に積んで続行する。
// trail.db は DB_DIR 解決（trail.db の存在で候補ディレクトリを確定する）のために空で置く。
function writeMemoryDb(ws, { withColumn, rows }) {
  const dbDir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  new DatabaseSync(path.join(dbDir, 'trail.db')).close();
  const db = new DatabaseSync(path.join(dbDir, 'memory-core.db'));
  db.exec(`CREATE TABLE memory_review_findings (
    id TEXT PRIMARY KEY,
    category TEXT,
    severity TEXT,
    target_file_path TEXT,
    addressed_commit_sha TEXT${withColumn ? ',\n    checklist_ref TEXT' : ''}
  )`);
  let i = 0;
  for (const row of rows) {
    if (withColumn) {
      db.prepare('INSERT INTO memory_review_findings VALUES (?,?,?,?,NULL,?)').run(
        `f${i++}`, row.category, 'info', row.file ?? null, row.checklist_ref ?? null,
      );
    } else {
      db.prepare('INSERT INTO memory_review_findings VALUES (?,?,?,?,NULL)').run(
        `f${i++}`, row.category, 'info', row.file ?? null,
      );
    }
  }
  db.close();
}

describe('grounding.cjs 観点キー集計', () => {
  test("checklist_ref='none' の 2 件以上のカテゴリ×パッケージ束だけがクラスタになる", () => {
    const quality = runGroundingQuality((ws) =>
      writeMemoryDb(ws, {
        withColumn: true,
        rows: [
          { category: 'logic', file: 'packages/memory-core/src/a.ts', checklist_ref: 'none' },
          { category: 'logic', file: 'packages/memory-core/src/b.ts', checklist_ref: 'none' },
          // 1 件のみの束は HAVING c >= 2 で除外される
          { category: 'perf', file: 'packages/web-app/src/c.ts', checklist_ref: 'none' },
          // 'none' 以外（章あり・未記録）は集計対象外
          { category: 'logic', file: 'packages/memory-core/src/d.ts', checklist_ref: '§14' },
          { category: 'logic', file: 'packages/memory-core/src/e.ts', checklist_ref: null },
        ],
      }),
    );
    expect(quality.checklistNone).toBe(3);
    expect(quality.checklistRefRecorded).toBe(4);
    expect(quality.checklistNoneClusters).toEqual([
      { category: 'logic', package: 'memory-core', count: 2 },
    ]);
  });

  test("packages/*/* に一致しないパスと NULL パスは '(unknown)' に束ねる", () => {
    const quality = runGroundingQuality((ws) =>
      writeMemoryDb(ws, {
        withColumn: true,
        rows: [
          { category: 'other', file: 'src/foo.ts', checklist_ref: 'none' },
          { category: 'other', file: null, checklist_ref: 'none' },
        ],
      }),
    );
    expect(quality.checklistNoneClusters).toEqual([
      { category: 'other', package: '(unknown)', count: 2 },
    ]);
  });

  test('checklist_ref 列が無い（未マイグレーション）DB では null に縮退し誤った 0 を出さない', () => {
    const quality = runGroundingQuality((ws) =>
      writeMemoryDb(ws, {
        withColumn: false,
        rows: [{ category: 'logic', file: 'packages/memory-core/src/a.ts' }],
      }),
    );
    expect(quality.checklistNone).toBeNull();
    expect(quality.checklistRefRecorded).toBeNull();
    expect(quality.checklistNoneClusters).toBeNull();
  });
});
