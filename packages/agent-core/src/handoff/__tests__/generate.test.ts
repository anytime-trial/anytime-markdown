// handoff 生成（transcript 解決 → 圧縮ステート組成 → 保存 → レンダリング）のテスト。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../../status/AgentStatusStore';
import { findTranscriptPath, generateHandoff } from '../generate';

function writeTranscript(projectsDir: string, sessionId: string): void {
  const projDir = join(projectsDir, '-some-project');
  mkdirSync(projDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'バグを直して' } }),
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/x/a.ts' } }] },
    }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '修正完了' }] } }),
  ].join('\n');
  writeFileSync(join(projDir, `${sessionId}.jsonl`), lines);
}

describe('handoff generate', () => {
  let dir: string;
  let projectsDir: string;
  let store: AgentStatusStore;
  const SID = 'sess-123';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'handoff-gen-'));
    projectsDir = join(dir, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('findTranscriptPath は projects 配下から sessionId.jsonl を見つける', () => {
    writeTranscript(projectsDir, SID);
    const p = findTranscriptPath(SID, projectsDir);
    expect(p).toContain(`${SID}.jsonl`);
    expect(findTranscriptPath('missing', projectsDir)).toBeNull();
  });

  it('generateHandoff は payload/markdown/injection を返し summary を保存する', () => {
    writeTranscript(projectsDir, SID);
    store.upsertEditing({ sessionId: SID, editing: true, branch: 'fix/bug' });

    const result = generateHandoff(store, SID, { projectsDir });
    expect(result).not.toBeNull();
    expect(result!.payload.structured.goal).toBe('バグを直して');
    expect(result!.payload.structured.branch).toBe('fix/bug');
    expect(result!.payload.structured.filesTouched).toEqual(['/x/a.ts']);
    expect(result!.markdown).toContain('バグを直して');
    expect(result!.injection).toContain('BEGIN handoff context');

    // summary 列に payload が保存され handoff_at が立つ
    const row = store.queryOne(SID);
    expect(JSON.parse(row!.summary).structured.goal).toBe('バグを直して');
    expect(row!.handoffAt).not.toBeNull();
    // 編集列は壊さない
    expect(row!.branch).toBe('fix/bug');
  });

  it('transcript が無ければ null を返す', () => {
    expect(generateHandoff(store, 'no-such', { projectsDir })).toBeNull();
  });
});
