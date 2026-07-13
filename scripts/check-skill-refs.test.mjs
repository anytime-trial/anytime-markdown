import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRefs, lintSkillsDir, selectBundledOnly, skillRefCandidates, verificationTarget } from './check-skill-refs.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('docPath を全角括弧・読点の手前で切り出す', () => {
  const { paths } = extractRefs(
    '参照（/Shared/anytime-markdown-docs/spec/10.web-app/design.md）参照義務、以降',
  );
  assert.deepEqual(paths, [
    { kind: 'docPath', value: '/Shared/anytime-markdown-docs/spec/10.web-app/design.md', truncated: false },
  ]);
});

test('プレースホルダで切れた参照は truncated=true でディレクトリ検証に落ちる', () => {
  const { paths } = extractRefs('出力: /Shared/anytime-markdown-docs/report/<YYYYMMDD>-dev-health.ja.md');
  assert.equal(paths[0].truncated, true);
  assert.equal(verificationTarget(paths[0]), '/Shared/anytime-markdown-docs/report');
});

test('repoPath と npm script を抽出し --workspace 行は除外する', () => {
  const md = [
    '`scripts/gen-spec-index.mjs` を実行',
    'npm run check-skills を回す',
    'npm run compile --workspace=anytime-trail',
  ].join('\n');
  const { paths, npmScripts } = extractRefs(md);
  assert.deepEqual(paths, [{ kind: 'repoPath', value: 'scripts/gen-spec-index.mjs', truncated: false }]);
  assert.deepEqual(npmScripts, ['check-skills']);
});

test('文末ピリオド・コロンを参照値から除去する', () => {
  const { paths } = extractRefs('詳細は /Shared/anytime-markdown-docs/proposal/index.ja.md.');
  assert.equal(paths[0].value, '/Shared/anytime-markdown-docs/proposal/index.ja.md');
});

test('lintSkillsDir: リポ外 dir では repoPath/npm script チェックをスキップし更新日を検出する', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'check-skill-refs-'));
  try {
    mkdirSync(join(tmp, 'dummy-skill'));
    writeFileSync(
      join(tmp, 'dummy-skill', 'SKILL.md'),
      [
        '# dummy-skill',
        '更新日: 2026-07-04',
        '',
        '存在しない `packages/no-such-pkg/file.ts` を参照する。',
        'npm run no-such-script も参照する。',
      ].join('\n'),
      'utf-8',
    );
    const results = lintSkillsDir(tmp, new Set());
    assert.equal(results.length, 1);
    assert.equal(results[0].skill, 'dummy-skill');
    assert.deepEqual(results[0].missingRefs, []);
    assert.deepEqual(results[0].missingScripts, []);
    assert.equal(results[0].hasUpdateDate, true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lintSkillsDir: docsRoot 不在(CI ランナー)では docPath 検証をスキップし typo は検出する', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'check-skill-refs-'));
  try {
    mkdirSync(join(tmp, 'dummy-skill'));
    writeFileSync(
      join(tmp, 'dummy-skill', 'SKILL.md'),
      [
        '# dummy-skill',
        '更新日: 2026-07-09',
        '',
        '正規参照 /Shared/anytime-markdown-docs/no-such-dir/x.md を読む。',
        'typo 参照 /anytime-markdown-docs/spec/index.ja.md も書いてしまった。',
      ].join('\n'),
      'utf-8',
    );
    const results = lintSkillsDir(tmp, new Set(), { docsRootAvailable: false });
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].missingRefs, [
      '(typo? /Shared 欠落) /anytime-markdown-docs/spec/index.ja.md',
    ]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lintSkillsDir: docsRoot 実在時は docPath の参照切れを検出する', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'check-skill-refs-'));
  try {
    mkdirSync(join(tmp, 'dummy-skill'));
    writeFileSync(
      join(tmp, 'dummy-skill', 'SKILL.md'),
      ['# dummy-skill', '更新日: 2026-07-09', '', '/Shared/anytime-markdown-docs/no-such-dir/x.md'].join('\n'),
      'utf-8',
    );
    const results = lintSkillsDir(tmp, new Set(), { docsRootAvailable: true });
    assert.deepEqual(results[0].missingRefs, ['/Shared/anytime-markdown-docs/no-such-dir/x.md']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lintSkillsDir: リポ内実在 dir で結果スキーマ {dir, skill, missingRefs, missingScripts, hasUpdateDate} を返す', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const rootScripts = new Set(Object.keys(pkg.scripts ?? {}));
  const results = lintSkillsDir(join(repoRoot, '.claude', 'skills'), rootScripts);
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.deepEqual(
      Object.keys(r).sort(),
      ['dir', 'hasUpdateDate', 'missingRefs', 'missingScripts', 'skill'],
    );
    assert.equal(typeof r.dir, 'string');
    assert.equal(typeof r.skill, 'string');
    assert.ok(Array.isArray(r.missingRefs));
    assert.ok(Array.isArray(r.missingScripts));
    assert.equal(typeof r.hasUpdateDate, 'boolean');
  }
});

test('selectBundledOnly: canonical に無いスキルの結果だけを残す', () => {
  const results = [
    { skill: 'anytime-markdown-output', missingRefs: [] },
    { skill: 'anytime-dev-health', missingRefs: [] },
    { skill: 'anytime-mermaid', missingRefs: [] },
  ];
  const canonicalNames = new Set(['anytime-dev-health', 'i18n-naming']);
  assert.deepEqual(
    selectBundledOnly(results, canonicalNames).map((r) => r.skill),
    ['anytime-markdown-output', 'anytime-mermaid'],
  );
});

test('selectBundledOnly: canonicalNames が空なら全件を残す', () => {
  const results = [{ skill: 'a', missingRefs: [] }, { skill: 'b', missingRefs: [] }];
  assert.deepEqual(selectBundledOnly(results, new Set()).map((r) => r.skill), ['a', 'b']);
});

test('lintSkillsDir: packages/vscode-markdown-extension/skills の同梱 only スキルを検査する（canonical 無しの CI 相当）', () => {
  const results = lintSkillsDir(
    join(repoRoot, 'packages', 'vscode-markdown-extension', 'skills'),
    new Set(),
  );
  assert.ok(results.length >= 1);
  for (const r of results) {
    assert.deepEqual(
      Object.keys(r).sort(),
      ['dir', 'hasUpdateDate', 'missingRefs', 'missingScripts', 'skill'],
    );
  }
  assert.ok(results.map((r) => r.skill).includes('anytime-markdown-output'));
});

test('lintSkillsDir: SKILL.md 実在スキルは対象・SKILL.md.template のみのスキルは対象外', () => {
  // anytime-note(SKILL.md.template のみ)は packages/vscode-agent-extension/skills 配下にある。
  // SKILL.md 実在の anytime-dev-cycle と同居する dir を対象にし、包含/除外の両方を実質検証する。
  const results = lintSkillsDir(
    join(repoRoot, 'packages', 'vscode-agent-extension', 'skills'),
    new Set(),
  );
  const skillNames = results.map((r) => r.skill);
  assert.ok(skillNames.includes('anytime-dev-cycle'));
  assert.ok(!skillNames.includes('anytime-note'));
});

test('/Shared 欠落 typo パスは typoPath として検出され missingRefs で fail する', () => {
  const md = '/anytime-markdown-docs/report/x.md は NG、/Shared/anytime-markdown-docs/report/ は OK';
  const { paths } = extractRefs(md);
  assert.deepEqual(
    paths.filter((p) => p.kind === 'typoPath'),
    [{ kind: 'typoPath', value: '/anytime-markdown-docs/report/x.md', truncated: false }],
  );
  // lintSkillsDir 経由でも typo のみが missingRefs に上がる(正規 docPath は実在するため fail しない)
  const tmp = mkdtempSync(join(tmpdir(), 'check-skill-refs-typo-'));
  try {
    mkdirSync(join(tmp, 'typo-skill'));
    writeFileSync(join(tmp, 'typo-skill', 'SKILL.md'), `# typo-skill\n更新日: 2026-07-04\n\n${md}\n`, 'utf-8');
    const results = lintSkillsDir(tmp, new Set());
    assert.deepEqual(results[0].missingRefs, ['(typo? /Shared 欠落) /anytime-markdown-docs/report/x.md']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lintSkillsDir: 相対パス指定でも絶対パス指定と同一結果になる（isRepoLocal 偽陰性の回帰）', (t) => {
  if (resolve(process.cwd()) !== resolve(repoRoot)) {
    t.skip('cwd が repoRoot でないためスキップ');
    return;
  }
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  const rootScripts = new Set(Object.keys(pkg.scripts ?? {}));
  const relative = lintSkillsDir('.claude/skills', rootScripts);
  const absolute = lintSkillsDir(join(repoRoot, '.claude', 'skills'), rootScripts);
  const strip = (rs) => rs.map(({ dir: _dir, ...rest }) => rest);
  assert.equal(JSON.stringify(strip(relative)), JSON.stringify(strip(absolute)));
});

// スキル間参照(`.claude/skills/<name>/...`)の実在検証。
// リグレッション: 参照が未検証だったため、anytime-cross-review が統合で消えた
// `.claude/skills/anytime-delegation/references/codex-cli.md` を指したまま出荷された。
// CI では `.claude/skills/` の同梱スキルが gitignore で存在しないため、packages 正本側でも解決する。
test('extractRefs: .claude/skills/... をスキル間参照として抽出する', () => {
  const md = '詳細は `.claude/skills/anytime-dev-cycle/references/codex-cli.md` を参照する。';
  const { paths } = extractRefs(md);
  const skillRefs = paths.filter((p) => p.kind === 'skillRef');
  assert.equal(skillRefs.length, 1);
  assert.equal(skillRefs[0].value, '.claude/skills/anytime-dev-cycle/references/codex-cli.md');
});

test('lintSkillsDir: 実在しないスキル間参照を missingRefs に載せる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-refs-'));
  try {
    mkdirSync(join(dir, 'sample-skill'), { recursive: true });
    writeFileSync(
      join(dir, 'sample-skill', 'SKILL.md'),
      [
        '# sample',
        '',
        '更新日: 2026-07-13',
        '',
        '`.claude/skills/anytime-delegation/references/codex-cli.md` を参照する。',
      ].join('\n'),
    );
    const [res] = lintSkillsDir(dir, new Set(), { docsRootAvailable: false });
    assert.ok(
      res.missingRefs.some((r) => r.includes('anytime-delegation/references/codex-cli.md')),
      `参照切れを検出できていない: ${JSON.stringify(res.missingRefs)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lintSkillsDir: canonical 不在(CI)でも packages 正本にあるスキル間参照は通す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-refs-'));
  try {
    mkdirSync(join(dir, 'sample-skill'), { recursive: true });
    // packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md は git 正本に実在する。
    // .claude/skills/ 側は gitignore で CI に存在しないが、参照は解決できなければならない。
    writeFileSync(
      join(dir, 'sample-skill', 'SKILL.md'),
      [
        '# sample',
        '',
        '更新日: 2026-07-13',
        '',
        '`.claude/skills/anytime-dev-cycle/references/delegation.md` を参照する。',
      ].join('\n'),
    );
    const [res] = lintSkillsDir(dir, new Set(), { docsRootAvailable: false, canonicalAvailable: false });
    assert.deepEqual(res.missingRefs, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skillRefCandidates: canonicalAvailable=false なら canonical を候補から外す（seam が実際に効く）', () => {
  const value = '.claude/skills/anytime-dev-cycle/references/delegation.md';
  const withCanonical = skillRefCandidates(value, ['vscode-agent-extension'], true);
  const withoutCanonical = skillRefCandidates(value, ['vscode-agent-extension'], false);

  assert.ok(withCanonical.includes(value), 'canonical が候補に含まれていない');
  assert.ok(!withoutCanonical.includes(value), 'canonicalAvailable=false でも canonical が候補に残っている');
  assert.deepEqual(withoutCanonical, [
    'packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md',
  ]);
});

test('lintSkillsDir: canonical 不在(CI)で packages 側にも無い参照は参照切れになる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-refs-'));
  try {
    mkdirSync(join(dir, 'sample-skill'), { recursive: true });
    writeFileSync(
      join(dir, 'sample-skill', 'SKILL.md'),
      [
        '# sample',
        '',
        '更新日: 2026-07-13',
        '',
        '`.claude/skills/production-release/SKILL.md` を参照する。',
      ].join('\n'),
    );
    // production-release は拡張同梱ではなくリポジトリ固有スキル（packages 側に正本が無い）。
    // canonical が使える環境では解決できるが、CI(canonical 不在)では解決できない。
    const local = lintSkillsDir(dir, new Set(), { docsRootAvailable: false, canonicalAvailable: true });
    const ci = lintSkillsDir(dir, new Set(), { docsRootAvailable: false, canonicalAvailable: false });

    assert.deepEqual(local[0].missingRefs, []);
    assert.ok(
      ci[0].missingRefs.some((r) => r.includes('production-release')),
      'canonical 不在時に解決できない参照を検出できていない',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
