/**
 * レトロ機構是正（proposal 20260819-* / T-23・T-24・T-25）で追加した集計のリグレッション。
 *
 * いずれも「値が出ること」ではなく「誤警報を出さないこと」が要件のため、境界を固定する。
 * - quality.bySeverity: info を含む全体の対処率は実態より悪く出る（severity ごとに分ける）
 * - costWindow30d.opusCostUsd: 占有率は分母縮小で上がるため絶対値と対で読む
 * - delegation.delegationRatePct: 記録 0 件は 0% でなく null（「全部見送った」と誤読させない）
 * - docCore.semanticWired: 本番呼出元の有無。未配線なら充足率 0% は劣化ではない
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGrounding(setup, env = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-retro-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, ...env },
    });
    expect(r.status).toBe(0);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

function dbDirOf(ws) {
  const dir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('quality.bySeverity（重大度別の対処率）', () => {
  it('severity ごとに total / addressed / addressedPct を分けて出す', () => {
    const snap = runGrounding((ws) => {
      const dir = dbDirOf(ws);
      new DatabaseSync(path.join(dir, 'activity.db')).close();
      const db = new DatabaseSync(path.join(dir, 'caravan-book.db'));
      db.exec(`CREATE TABLE caravan_review_findings (
        id TEXT PRIMARY KEY, category TEXT, severity TEXT,
        target_file_path TEXT, addressed_commit_sha TEXT, recorded_at TEXT
      )`);
      const ins = db.prepare('INSERT INTO caravan_review_findings VALUES (?,?,?,NULL,?,?)');
      const now = new Date().toISOString();
      // error: 4 件中 1 件のみ対処 / info: 2 件とも未対処
      ins.run('e1', 'logic', 'error', 'sha1', now);
      ins.run('e2', 'logic', 'error', null, now);
      ins.run('e3', 'logic', 'error', null, now);
      ins.run('e4', 'logic', 'error', null, now);
      ins.run('i1', 'logic', 'info', null, now);
      ins.run('i2', 'logic', 'info', null, now);
      db.close();
    });

    const bySev = Object.fromEntries(snap.quality.bySeverity.map((r) => [r.severity, r]));
    expect(bySev.error).toEqual({ severity: 'error', total: 4, addressed: 1, addressedPct: 25 });
    expect(bySev.info).toEqual({ severity: 'info', total: 2, addressed: 0, addressedPct: 0 });
    // 全体では 1/6 = 16.7% だが、対処任意の info を除いた error は 25%。
    // 全体だけを見て閾値を引くと実態より悪く判定する（本メトリクスの存在理由）。
    expect(snap.quality.addressedFindings).toBe(1);
  });
});

describe('delegation の委譲率（量）', () => {
  function writePlan(ws, body) {
    const docsRoot = path.join(ws, 'docs');
    fs.mkdirSync(path.join(docsRoot, 'plan'), { recursive: true });
    fs.writeFileSync(path.join(docsRoot, 'plan', 'p.ja.md'), body, 'utf8');
    const lepDir = path.join(ws, '.anytime', 'trail');
    fs.mkdirSync(lepDir, { recursive: true });
    fs.writeFileSync(
      path.join(lepDir, 'lep.json'),
      JSON.stringify({ sources: { docs: { root: docsRoot } } }),
      'utf8',
    );
  }

  it('見送り行を除外 ID 別に数え、委譲率を算出する', () => {
    const snap = runGrounding((ws) => {
      dbDirOf(ws);
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writePlan(ws, [
        '- 委譲結果: 雛形v3 [codex] 採用',
        '- 委譲結果: 雛形v3 [codex] 採用',
        '- 委譲結果: 雛形v3 [codex] 差し戻し',
        '- 委譲見送り: [E1] 高重大度',
        '- 委譲見送り: [E2] 1 ファイル 10 行',
        '- 委譲見送り: [E1] 保護領域',
        '',
      ].join('\n'));
    });

    expect(snap.delegation.recorded).toBe(3);
    expect(snap.delegation.declined).toBe(3);
    expect(snap.delegation.declinedByExclusion).toEqual({ E1: 2, E2: 1 });
    expect(snap.delegation.delegationRatePct).toBe(50);
  });

  it('委譲・見送りの記録が 0 件なら率は null（0% と区別する）', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writePlan(ws, '# 記録の無いプラン\n');
    });

    expect(snap.delegation.recorded).toBe(0);
    expect(snap.delegation.declined).toBe(0);
    // 0% は「判断はあったが全部見送った」を意味する。記録が無い状態と混ぜない。
    expect(snap.delegation.delegationRatePct).toBeNull();
  });
});

describe('docCore.semanticWired（意味検索の配線状態）', () => {
  function writeCatalog(ws) {
    const dir = path.join(ws, '.anytime', 'markdown');
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'catalog.db'));
    db.exec('CREATE TABLE catalog_doc (path TEXT PRIMARY KEY, type TEXT)');
    db.exec('CREATE TABLE catalog_doc_relation (from_path TEXT, to_path TEXT)');
    db.exec('CREATE TABLE catalog_doc_embedding (path TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO catalog_doc VALUES (?,?)').run('spec/a.ja.md', 'spec');
    db.prepare('INSERT INTO catalog_doc VALUES (?,?)').run('report/b.ja.md', 'report');
    db.close();
  }

  function writePkg(ws, rel, body) {
    const abs = path.join(ws, 'packages', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }

  it('所有パッケージ外に本番呼出が無ければ false', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      // 所有パッケージ自身の定義・呼出は配線の証拠にならない
      writePkg(ws, 'markdown-catalog/src/embedding/embedDocs.ts', 'export function embedDocs() {}\n');
      writePkg(ws, 'other-pkg/src/index.ts', 'export const x = 1;\n');
    });

    expect(snap.docCore.semanticWired).toBe(false);
    expect(snap.docCore.embeddingCoveragePct).toBe(0);
  });

  it('所有パッケージ外の本番コードが呼んでいれば true', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      writePkg(ws, 'other-pkg/src/daemon.ts', 'import { embedDocs } from "x";\nawait embedDocs(db);\n');
    });

    expect(snap.docCore.semanticWired).toBe(true);
  });

  it('テストファイル内の呼出は配線とみなさない', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      writePkg(ws, 'other-pkg/src/__tests__/e.test.ts', 'embedDocs(fake);\n');
    });

    expect(snap.docCore.semanticWired).toBe(false);
  });

  it('走査上限に達したら false でなく null（測定不能）を返す', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      // 呼出の無いファイルを 2 つ置き、上限 1 で走査を打ち切らせる
      writePkg(ws, 'a-pkg/src/one.ts', 'export const a = 1;\n');
      writePkg(ws, 'b-pkg/src/two.ts', 'export const b = 2;\n');
    }, { ANYTIME_SEMANTIC_WIRED_MAX_FILES: '1' });

    // やり切れなかった走査の「見つからない」は未配線の証拠にならない。
    // false を返すと SKILL.md 側が充足率を閾値から外し、本物の配線切れを見逃す。
    expect(snap.docCore.semanticWired).toBeNull();
    expect(snap.errors.some((e) => /semanticWired scan incomplete/.test(e))).toBe(true);
  });

  it('上限に達しても配線が見つかっていれば true を返す', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      writePkg(ws, 'a-pkg/src/one.ts', 'await embedDocs(db);\n');
      writePkg(ws, 'b-pkg/src/two.ts', 'export const b = 2;\n');
    }, { ANYTIME_SEMANTIC_WIRED_MAX_FILES: '1' });

    expect(snap.docCore.semanticWired).toBe(true);
  });

  it('走査しきったうえで見つからなければ false（測定不能と区別する）', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
      writePkg(ws, 'a-pkg/src/one.ts', 'export const a = 1;\n');
    });

    expect(snap.docCore.semanticWired).toBe(false);
    expect(snap.errors.some((e) => /semanticWired scan incomplete/.test(e))).toBe(false);
  });

  it('孤立 doc は type 限定版も併せて出す', () => {
    const snap = runGrounding((ws) => {
      new DatabaseSync(path.join(dbDirOf(ws), 'activity.db')).close();
      writeCatalog(ws);
    });

    // spec / report の 2 件とも関係を持たないが、限定版は spec の 1 件だけ数える
    expect(snap.docCore.orphanDocs).toBe(2);
    expect(snap.docCore.orphanDocsScoped).toBe(1);
    expect(snap.docCore.orphanScopedTypes).toEqual(['spec', 'plan']);
  });
});
