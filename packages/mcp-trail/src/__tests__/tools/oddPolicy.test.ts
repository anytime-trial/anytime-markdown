import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleGetOddPolicy, handleEvaluateApprovalPolicy } from '../../tools/oddPolicy';

function sandbox(): { readonly path: string; readonly cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odd-policy-'));
  return { path: dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function writeRegistry(root: string, content: string): void {
  const dir = path.join(root, '.anytime', 'trail');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'odd.json'), content, 'utf8');
}

describe('ODD policy MCP ハンドラ', () => {
  let ws: ReturnType<typeof sandbox>;

  beforeEach(() => {
    ws = sandbox();
  });

  afterEach(() => {
    ws.cleanup();
  });

  it('レジストリが無いワークスペースは derived を返し、ルートにワークスペースを含む', () => {
    const result = handleGetOddPolicy({ workspacePath: ws.path });
    expect(result.kind).toBe('derived');
    if (result.kind === 'invalid') return;
    expect(result.registry.roots).toContain(ws.path);
  });

  it('レジストリがあれば registry として読む', () => {
    writeRegistry(
      ws.path,
      JSON.stringify({
        version: 1,
        roots: [ws.path],
        restricted: [],
        operations: { code_change: 'allow' },
      }),
    );
    const result = handleGetOddPolicy({ workspacePath: ws.path });
    expect(result.kind).toBe('registry');
  });

  it('壊れたレジストリは invalid になり、評価は confirm へ倒れる', () => {
    writeRegistry(ws.path, '{ broken');
    expect(handleGetOddPolicy({ workspacePath: ws.path }).kind).toBe('invalid');

    const evaluation = handleEvaluateApprovalPolicy({
      operation_kind: 'code_change',
      target_paths: [path.join(ws.path, 'src', 'index.ts')],
      workspacePath: ws.path,
    });
    expect(evaluation).toEqual({
      verdict: 'confirm',
      reasons: ['registry_invalid'],
      declaredVerdict: null,
      source: 'invalid',
    });
  });

  it('allow 指定の操作は allow、未指定の操作は confirm を返す', () => {
    writeRegistry(
      ws.path,
      JSON.stringify({
        version: 1,
        roots: [ws.path],
        restricted: [],
        operations: { code_change: 'allow' },
      }),
    );
    const allowed = handleEvaluateApprovalPolicy({
      operation_kind: 'code_change',
      target_paths: [path.join(ws.path, 'src', 'index.ts')],
      is_god_node: false,
      workspacePath: ws.path,
    });
    expect(allowed.verdict).toBe('allow');

    const alwaysHuman = handleEvaluateApprovalPolicy({
      operation_kind: 'remote_push',
      target_paths: [path.join(ws.path, 'src', 'index.ts')],
      is_god_node: false,
      workspacePath: ws.path,
    });
    expect(alwaysHuman.verdict).toBe('confirm');
    expect(alwaysHuman.reasons).toEqual(['always_human_operation']);
  });

  it('destructive_git は allow を宣言しても confirm（MCP 経路でも規約が効く）', () => {
    writeRegistry(
      ws.path,
      JSON.stringify({
        version: 1,
        roots: [ws.path],
        restricted: [],
        operations: { destructive_git: 'allow' },
      }),
    );
    const result = handleEvaluateApprovalPolicy({
      operation_kind: 'destructive_git',
      target_paths: [path.join(ws.path, 'src', 'index.ts')],
      is_god_node: false,
      workspacePath: ws.path,
    });
    expect(result.verdict).toBe('confirm');
    expect(result.reasons).toEqual(['always_human_operation']);
  });

  it('レジストリが restricted を空にしても package.json は制限領域のまま', () => {
    // レジストリは restricted を丸ごと置き換えるため、既定の保護が黙って消える
    // 「妥当だが保護が抜けている」状態を固定ルールで塞ぐ
    writeRegistry(
      ws.path,
      JSON.stringify({
        version: 1,
        roots: [ws.path],
        restricted: [],
        operations: { code_change: 'allow' },
      }),
    );
    for (const target of ['package.json', 'CLAUDE.md', '.anytime/trail/odd.json']) {
      const result = handleEvaluateApprovalPolicy({
        operation_kind: 'code_change',
        target_paths: [path.join(ws.path, target)],
        is_god_node: false,
        workspacePath: ws.path,
      });
      expect(result.reasons).toEqual(['restricted_area']);
    }
  });

  it('is_god_node 未指定（中心性データ無し）は抑止せず impact_unknown を残す', () => {
    writeRegistry(
      ws.path,
      JSON.stringify({
        version: 1,
        roots: [ws.path],
        restricted: [],
        operations: { code_change: 'allow' },
      }),
    );
    const result = handleEvaluateApprovalPolicy({
      operation_kind: 'code_change',
      target_paths: [path.join(ws.path, 'src', 'index.ts')],
      workspacePath: ws.path,
    });
    expect(result.verdict).toBe('allow');
    expect(result.reasons).toEqual(['policy_allow', 'impact_unknown']);
  });
});
