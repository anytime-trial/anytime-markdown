const {
  extractSkillUpdated,
  needsPreflight,
  classifyOutcome,
  findIncompletePlans,
} = require('./preflight.cjs');

describe('extractSkillUpdated', () => {
  it('SKILL.md の「更新日:」行から日付を取り出す', () => {
    const md = '# anytime-dev-cycle — 開発基本スキル\n\n更新日: 2026-07-13\n\n本文';
    expect(extractSkillUpdated(md)).toBe('2026-07-13');
  });

  it('括弧の注記が付いていても日付のみ返す', () => {
    const md = '更新日: 2026-07-13（旧スキル統合）';
    expect(extractSkillUpdated(md)).toBe('2026-07-13');
  });

  it('更新日行が無ければ null', () => {
    expect(extractSkillUpdated('# タイトルのみ')).toBeNull();
  });
});

describe('needsPreflight', () => {
  it('マーカーが無ければ初回として実行必須', () => {
    expect(needsPreflight(null, '2026-07-13')).toEqual({
      required: true,
      reason: 'first-run',
    });
  });

  it('skillUpdated が現行 SKILL.md と一致すれば再実行不要', () => {
    const marker = { checkedAt: '2026-07-13T00:00:00.000Z', skillUpdated: '2026-07-13' };
    expect(needsPreflight(marker, '2026-07-13')).toEqual({ required: false, reason: 'cached' });
  });

  it('skillUpdated が不一致（スキル更新後）なら再実行必須', () => {
    const marker = { checkedAt: '2026-07-01T00:00:00.000Z', skillUpdated: '2026-07-12' };
    expect(needsPreflight(marker, '2026-07-13')).toEqual({
      required: true,
      reason: 'skill-updated',
    });
  });

  it('マーカーが壊れていて skillUpdated を持たない場合も実行必須', () => {
    expect(needsPreflight({}, '2026-07-13')).toEqual({ required: true, reason: 'invalid-marker' });
  });
});

describe('classifyOutcome', () => {
  const checks = [
    { id: 'git-develop', kind: 'required', passed: true, detail: 'develop あり' },
    { id: 'docs-root', kind: 'required', passed: false, detail: 'ディレクトリ欠落' },
    { id: 'codex-cli', kind: 'optional', passed: false, detail: 'PATH に codex なし' },
    { id: 'agent-core', kind: 'optional', passed: true, detail: 'packages/agent-core あり' },
  ];

  it('必須 NG と任意 NG（縮退）を分類し、必須 NG があれば ok=false', () => {
    expect(classifyOutcome(checks)).toEqual({
      ok: false,
      requiredFailures: ['docs-root'],
      degraded: ['codex-cli'],
    });
  });

  it('必須が全て pass なら任意 NG が残っても ok=true（縮退で続行）', () => {
    const allRequiredPass = checks.map((c) =>
      c.kind === 'required' ? { ...c, passed: true } : c,
    );
    expect(classifyOutcome(allRequiredPass)).toEqual({
      ok: true,
      requiredFailures: [],
      degraded: ['codex-cli'],
    });
  });
});

describe('findIncompletePlans', () => {
  it('未チェックのタスク行（- [ ] / N. [ ]）を含むプランのみ返す', () => {
    const entries = [
      { file: 'a.ja.md', content: '## タスク\n\n1. [x] 済み\n2. [ ] 未了\n' },
      { file: 'b.ja.md', content: '- [x] 済み\n- [x] 済み\n' },
      { file: 'c.ja.md', content: '- [ ] 未了\n' },
      { file: 'd.ja.md', content: 'タスク表なし\n' },
    ];
    expect(findIncompletePlans(entries)).toEqual(['a.ja.md', 'c.ja.md']);
  });

  it('コードフェンス内のチェックボックス例はカウントしない', () => {
    const entries = [
      { file: 'tmpl.ja.md', content: '```markdown\n- [ ] テンプレ例\n```\n- [x] 実タスク\n' },
    ];
    expect(findIncompletePlans(entries)).toEqual([]);
  });
});

describe('collectChecks: skill-integrity（統合・tmp dir）', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { collectChecks } = require('./preflight.cjs');

  function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
    const docsRoot = path.join(root, 'docs');
    for (const d of ['proposal', 'plan', 'spec', 'review']) {
      fs.mkdirSync(path.join(docsRoot, d), { recursive: true });
    }
    const skillDir = path.join(root, 'skill');
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
    for (const f of [
      'agent-rotation.md',
      'delegation.md',
      'codex-cli.md',
      'stopping-rules-playbook.md',
      'task-criteria.md',
    ]) {
      fs.writeFileSync(path.join(skillDir, 'references', f), '# stub\n');
    }
    for (const f of [
      'criteria.cjs',
      'benchmarks.json',
      'ollama-benchmarks.cjs',
      'ollama-delegate.cjs',
      'ollama-probe.cjs',
      'ollama-report.cjs',
      'ollama-verify.cjs',
    ]) {
      fs.writeFileSync(path.join(skillDir, f), '// stub\n');
    }
    return { root, docsRoot, skillDir };
  }

  it('references と委譲スクリプトが揃っていれば passed=true', () => {
    const { root, docsRoot, skillDir } = makeFixture();
    const { checks } = collectChecks({ workspaceRoot: root, docsRoot, skillDir });
    const integrity = checks.find((c) => c.id === 'skill-integrity');
    expect(integrity.passed).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('委譲スクリプト（ollama-verify.cjs 等）が欠落したら passed=false で欠落名を報告する', () => {
    const { root, docsRoot, skillDir } = makeFixture();
    fs.rmSync(path.join(skillDir, 'ollama-verify.cjs'));
    const { checks } = collectChecks({ workspaceRoot: root, docsRoot, skillDir });
    const integrity = checks.find((c) => c.id === 'skill-integrity');
    expect(integrity.passed).toBe(false);
    expect(integrity.detail).toContain('ollama-verify.cjs');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
