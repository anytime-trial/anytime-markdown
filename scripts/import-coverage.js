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

const DB_PATH = path.join(os.homedir(), '.claude', 'trail', 'trail.db');

function main() {
  // git root 取得
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

  // 最新タグ取得
  let latestTag;
  try {
    latestTag = execSync('git tag --sort=-creatordate | head -1', { encoding: 'utf-8', shell: true }).trim();
    if (!latestTag) throw new Error('no tags');
  } catch {
    console.error('[import-coverage] No git tags found. Create a release tag first.');
    process.exit(1);
  }

  // DB 確認
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[import-coverage] trail.db not found: ${DB_PATH}`);
    console.error('Run Trail Import in VS Code first to initialize the DB.');
    process.exit(1);
  }

  // better-sqlite3 で trail.db を直接開く (旧 sql.js は撤去済)
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);
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
    if (!fs.existsSync(summaryPath)) continue;

    let summary;
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } catch {
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
