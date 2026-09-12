const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { formatText } = require('./ingest-wiring-check.cjs');

const SCRIPT = path.join(__dirname, 'ingest-wiring-check.cjs');

/**
 * CLI の契約（終了コード 0 / 1 / 2）は SKILL.md §1.4 が手順として依存しているため、
 * 実プロセスで検査する。判定ロジックは judge のテストが持つので、ここは契約だけを見る。
 */
function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('CLI の終了コード契約', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-wiring-cli-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('error 判定が無ければ 0（Trail 未導入のワークスペース）', () => {
    const r = runCli(['--workspace', sandbox, '--no-network']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('対象外');
  });

  it('error 判定があれば 1', () => {
    fs.mkdirSync(path.join(sandbox, '.vscode'), { recursive: true });
    fs.mkdirSync(path.join(sandbox, '.anytime', 'trail', 'db'), { recursive: true });
    fs.writeFileSync(
      path.join(sandbox, '.vscode', 'settings.json'),
      JSON.stringify({ 'anytimeTrail.workspace.path': '/nonexistent-repo' }),
    );
    fs.writeFileSync(path.join(sandbox, '.anytime', 'trail', 'lep.json'), JSON.stringify({ stage: 'all' }));

    const r = runCli(['--workspace', sandbox, '--no-network']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('D1 監視リポジトリの解決結果: ERROR');
  });

  it('診断そのものが中断したら 2（error 判定ありの 1 と区別する）', () => {
    const r = runCli(['--workspace', sandbox, '--no-network', '--now', 'yesterday']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('中断');
  });

  it('--json は機械可読な JSON を返す', () => {
    const r = runCli(['--workspace', sandbox, '--no-network', '--json']);
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.findings.map((f) => f.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(report.summary).toMatchObject({ error: 0 });
  });
});

describe('formatText', () => {
  const report = (findings, summary) => ({ facts: { workspaceRoot: '/ws' }, findings, summary });

  it('fired は重大度を大文字で、それ以外は状態ラベルで出す', () => {
    const text = formatText(
      report(
        [
          { id: 'D1', title: 'a', severity: 'error', status: 'fired', detail: 'x' },
          { id: 'D3', title: 'b', severity: 'warn', status: 'ok', detail: 'y' },
          { id: 'D4', title: 'c', severity: 'warn', status: 'unmeasurable', detail: 'z' },
          { id: 'D5', title: 'd', severity: 'warn', status: 'not-applicable', detail: 'w' },
        ],
        { error: 1, warn: 0, unmeasurable: 1, notApplicable: 1 },
      ),
    );
    expect(text).toContain('D1 a: ERROR — x');
    expect(text).toContain('D3 b: ok — y');
    expect(text).toContain('D4 c: 測定不能 — z');
    expect(text).toContain('D5 d: 対象外 — w');
    expect(text).toContain('error 1 件 / warn 0 件 / 測定不能 1 件 / 対象外 1 件');
  });
});
