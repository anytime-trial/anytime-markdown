#!/usr/bin/env node
/**
 * Trail DB に全パッケージの coverage-summary.json を取り込む。
 * npm run import-coverage または production-release スキルの Step 10 から実行する。
 *
 * 前提:
 *   - npm test が実行済みで packages/*\/coverage/coverage-summary.json が存在する
 *   - git fetch --tags 済みで最新のリリースタグが取得されている
 *   - trail.db が ~/.claude/trail/trail.db に存在する
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function resolveDbPath(gitRoot) {
  // TRAIL_HOME 環境変数が最優先。次に新 default <gitRoot>/.anytime/trail/db/trail.db、
  // 最後に旧 default ~/.claude/trail/trail.db (0.18.0 以前) にフォールバック。
  if (process.env.TRAIL_HOME) {
    return path.join(process.env.TRAIL_HOME, 'db', 'trail.db');
  }
  const newDefault = path.join(gitRoot, '.anytime', 'trail', 'db', 'trail.db');
  if (fs.existsSync(newDefault)) return newDefault;
  return path.join(os.homedir(), '.claude', 'trail', 'trail.db');
}

function main() {
  // git root 取得
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  const DB_PATH = resolveDbPath(gitRoot);

  // better-sqlite3 で trail.db を直接開く (旧 sql.js は撤去済)
  // TOCTOU 競合を避けるため existsSync ではなく { fileMustExist: true } で ENOENT を判定。
  const Database = require('better-sqlite3');
  let db;
  try {
    db = new Database(DB_PATH, { fileMustExist: true });
  } catch (err) {
    if (err.code === 'SQLITE_CANTOPEN' || err.code === 'ENOENT') {
      console.error(`[import-coverage] trail.db not found: ${DB_PATH}`);
      console.error('Run Trail Import in VS Code first to initialize the DB.');
      process.exit(1);
    }
    throw err;
  }

  // release_coverage は releases.tag への FK を持つため、git の最新タグではなく
  // releases テーブルに登録済みの最新タグを採用する。Trail 拡張の import で
  // 取り込まれたタグのみが対象になり、import 前のタグ (例: 直近 push 直後) は
  // 自動でスキップされる。
  const latestRow = db
    .prepare('SELECT tag FROM releases ORDER BY released_at DESC LIMIT 1')
    .get();
  if (!latestRow?.tag) {
    console.error('[import-coverage] No releases recorded in trail.db. Run Trail Import in VS Code first.');
    db.close();
    process.exit(1);
  }
  const latestTag = latestRow.tag;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO release_coverage (
      release_tag, package, file_path,
      lines_total, lines_covered, lines_pct,
      statements_total, statements_covered, statements_pct,
      functions_total, functions_covered, functions_pct,
      branches_total, branches_covered, branches_pct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // 全パッケージの coverage-summary.json を読み込んで INSERT
  const packagesDir = path.join(gitRoot, 'packages');
  let count = 0;

  for (const pkgDir of fs.readdirSync(packagesDir)) {
    const summaryPath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-summary.json');

    // TOCTOU 競合を避けるため existsSync を使わず readFileSync の ENOENT で判定。
    let summary;
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      console.warn(`[import-coverage] Skipping unreadable file: ${summaryPath}`);
      continue;
    }

    const toPct = (v) => (typeof v === 'number' ? v : null);

    for (const [key, entry] of Object.entries(summary)) {
      if (!entry?.lines || !entry?.statements || !entry?.functions || !entry?.branches) continue;

      const filePath = key === 'total' ? '__total__' : key;

      insert.run(
        latestTag,
        pkgDir,
        filePath,
        entry.lines.total,
        entry.lines.covered,
        toPct(entry.lines.pct),
        entry.statements.total,
        entry.statements.covered,
        toPct(entry.statements.pct),
        entry.functions.total,
        entry.functions.covered,
        toPct(entry.functions.pct),
        entry.branches.total,
        entry.branches.covered,
        toPct(entry.branches.pct),
      );
      count++;
    }
  }

  db.close();

  console.log(`[import-coverage] ${count} entries saved for tag: ${latestTag}`);
}

try {
  main();
} catch (err) {
  console.error('[import-coverage] failed:', err);
  process.exit(1);
}
