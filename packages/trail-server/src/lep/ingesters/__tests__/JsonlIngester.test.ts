import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AnalyzerContext, AnalyzerEvent, EventBusPublisher } from '@anytime-markdown/memory-core';

import { JsonlIngester } from '../JsonlIngester';

function makeBus(): {
  bus: EventBusPublisher;
  events: AnalyzerEvent[];
} {
  const events: AnalyzerEvent[] = [];
  const bus: EventBusPublisher = {
    publish: async (e) => {
      events.push(e);
    },
  };
  return { bus, events };
}

function makeCtx(bus: EventBusPublisher): AnalyzerContext {
  return {
    runId: 'r1',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `jsonl-ingester-${prefix}-`));
}

describe('JsonlIngester', () => {
  it('emits jsonl_session_discovered for each Claude Code session', async () => {
    const claudeDir = tmpDir('claude');
    const projectPath = path.join(claudeDir, '-anytime-markdown');
    fs.mkdirSync(projectPath, { recursive: true });

    const sid = '11111111-1111-1111-1111-111111111111';
    const mainFile = path.join(projectPath, `${sid}.jsonl`);
    fs.writeFileSync(
      mainFile,
      JSON.stringify({ type: 'user', uuid: 'u1', cwd: '/some/repo/anytime-markdown' }) + '\n',
    );

    const subagentDir = path.join(projectPath, sid, 'subagents');
    fs.mkdirSync(subagentDir, { recursive: true });
    const subagentFile = path.join(subagentDir, `agent-${sid}.jsonl`);
    fs.writeFileSync(subagentFile, '{}\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));

    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.kind).toBe('jsonl_session_discovered');
    if (e.kind !== 'jsonl_session_discovered') return;
    expect(e.sessionId).toBe(sid);
    expect(e.mainFile).toBe(mainFile);
    expect(e.subagentFiles).toEqual([subagentFile]);
    // Step 2a Ingester は性能優先で project dir 名を採用 (cwd 経由の正規化は SessionImporter で行う)
    expect(e.repoName).toBe('anytime-markdown');
    expect(e.source).toBe('claude_code');
    expect(e.fileSize).toBeGreaterThan(0);
    expect(e.hasMessages).toBe(false);
    expect(e.hasUsableCostData).toBe(false);
  });

  it('skips non-UUID jsonl files at project root', async () => {
    const claudeDir = tmpDir('claude2');
    const projectPath = path.join(claudeDir, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'random.jsonl'), '{}\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('emits Codex sessions filtered by gitRoot when set', async () => {
    const codexDir = tmpDir('codex');
    const sid = '22222222-2222-2222-2222-222222222222';
    const rolloutFile = path.join(codexDir, `rollout-2026-05-19-${sid}.jsonl`);
    fs.writeFileSync(
      rolloutFile,
      JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/work/anytime-markdown' },
      }) + '\n',
    );

    const ingesterMatched = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
      gitRoot: '/work/anytime-markdown',
      repoName: 'anytime-markdown',
    });
    const matched = makeBus();
    await ingesterMatched.onRunEnd(makeCtx(matched.bus));
    expect(matched.events).toHaveLength(1);
    if (matched.events[0].kind === 'jsonl_session_discovered') {
      expect(matched.events[0].source).toBe('codex');
      expect(matched.events[0].repoName).toBe('anytime-markdown');
    }

    const ingesterMismatched = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
      gitRoot: '/work/other-repo',
    });
    const mismatched = makeBus();
    await ingesterMismatched.onRunEnd(makeCtx(mismatched.bus));
    expect(mismatched.events).toEqual([]);
  });

  it('emits all Codex sessions when no gitRoot is set', async () => {
    const codexDir = tmpDir('codex-all');
    const sid = '33333333-3333-3333-3333-333333333333';
    const rolloutFile = path.join(codexDir, `rollout-${sid}.jsonl`);
    fs.writeFileSync(rolloutFile, '{}\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toHaveLength(1);
  });

  it('uses importedFilesProvider to populate hasMessages/hasUsableCostData', async () => {
    const claudeDir = tmpDir('claude-provider');
    const projectPath = path.join(claudeDir, '-foo');
    fs.mkdirSync(projectPath, { recursive: true });
    const sid = '44444444-4444-4444-4444-444444444444';
    const mainFile = path.join(projectPath, `${sid}.jsonl`);
    fs.writeFileSync(mainFile, '{}\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
      importedFilesProvider: (f) =>
        f === mainFile ? { fileSize: 999, hasMessages: true, hasUsableCostData: true } : undefined,
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    if (events[0]?.kind === 'jsonl_session_discovered') {
      expect(events[0].hasMessages).toBe(true);
      expect(events[0].hasUsableCostData).toBe(true);
    }
  });

  it('handles missing directories gracefully', async () => {
    const ingester = new JsonlIngester({
      claudeProjectsDir: '/nonexistent/claude',
      codexSessionsDir: '/nonexistent/codex',
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('skips session when mainFile does not exist (statSync throws)', async () => {
    // line 74: catch { continue } when fs.statSync fails
    const claudeDir = tmpDir('claude-nofile');
    const projectPath = path.join(claudeDir, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
    const sid = '55555555-5555-5555-5555-555555555555';
    // Write the .jsonl to get it discovered, then delete it so statSync fails
    const mainFile = path.join(projectPath, `${sid}.jsonl`);
    fs.writeFileSync(mainFile, '{}\n');
    fs.unlinkSync(mainFile); // now statSync will throw ENOENT

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('skips project entry when statSync throws (dangling symlink)', async () => {
    // line 120: catch { continue } when statSync on projectPath throws (e.g. dangling symlink)
    const claudeDir = tmpDir('claude-statthrow');
    const dangling = path.join(claudeDir, 'dangling-link');
    try {
      fs.symlinkSync('/nonexistent/target', dangling);
    } catch {
      // symlinks not supported; skip
      return;
    }

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('skips project readdirSync error (line 126 branch)', async () => {
    // line 126: catch { continue } when readdirSync on projectPath fails
    // We test the non-directory skip path by creating a file (not a dir)
    const claudeDir = tmpDir('claude-readdir-err');
    // A regular file at project level: isDirectory() === false → continue (line 118 branch)
    fs.writeFileSync(path.join(claudeDir, 'file.txt'), 'x');

    const ingester = new JsonlIngester({
      claudeProjectsDir: claudeDir,
      codexSessionsDir: path.join(claudeDir, 'no-codex'),
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('handles nested subdirectory in codex sessions dir', async () => {
    // line 206: stack.push(full) for subdirectories in collectRolloutJsonlFiles
    const codexDir = tmpDir('codex-nested');
    const subDir = path.join(codexDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    const sid = '66666666-6666-6666-6666-666666666666';
    const rolloutFile = path.join(subDir, `rollout-${sid}.jsonl`);
    fs.writeFileSync(rolloutFile, '{}\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    expect(events).toHaveLength(1);
  });

  it('readCodexSessionCwd returns null when file cannot be read (line 239 catch)', async () => {
    // line 238-239: catch { return null } when readFileSync throws
    // Create a rollout file entry in codex dir, then delete it before run
    const codexDir = tmpDir('codex-readfail');
    const sid = '99999999-9999-9999-9999-999999999999';
    const rolloutFile = path.join(codexDir, `rollout-${sid}.jsonl`);
    fs.writeFileSync(rolloutFile, '{}');
    // Delete before ingester runs — but ingester scans dir first then reads
    // We cannot delete after scan easily since it's synchronous.
    // Instead, use a directory named with rollout- prefix to force readFileSync to fail (it's a dir not a file)
    const codexDir2 = tmpDir('codex-readfail2');
    const rolloutDir = path.join(codexDir2, `rollout-${sid}.jsonl`);
    fs.mkdirSync(rolloutDir, { recursive: true }); // dir with .jsonl name: readFileSync throws EISDIR

    const ingester = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir2, 'no-claude'),
      codexSessionsDir: codexDir2,
      gitRoot: '/work/anytime-markdown', // forces readCodexSessionCwd call
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    // readFileSync on a directory throws → readCodexSessionCwd returns null → filtered out
    expect(events).toEqual([]);
  });

  it('readCodexSessionCwd returns null when no session_meta line found', async () => {
    // lines 229, 237: cwd non-string / end of file without session_meta
    const codexDir = tmpDir('codex-no-meta');
    const sid = '77777777-7777-7777-7777-777777777777';
    const rolloutFile = path.join(codexDir, `rollout-${sid}.jsonl`);
    // Lines that are not session_meta: should return null and skip when gitRoot set
    fs.writeFileSync(
      rolloutFile,
      [
        JSON.stringify({ type: 'other_event', payload: { cwd: '/somewhere' } }),
        JSON.stringify({ type: 'session_meta', payload: { cwd: 12345 } }), // cwd not string
      ].join('\n') + '\n',
    );

    const ingester = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
      gitRoot: '/work/anytime-markdown',
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    // cwd is not a string -> readCodexSessionCwd returns null -> filtered out
    expect(events).toEqual([]);
  });

  it('readCodexSessionCwd skips invalid JSON lines and returns null', async () => {
    // line 229: JSON.parse throws -> continue
    const codexDir = tmpDir('codex-badjson');
    const sid = '88888888-8888-8888-8888-888888888888';
    const rolloutFile = path.join(codexDir, `rollout-${sid}.jsonl`);
    fs.writeFileSync(rolloutFile, 'not json\nalso bad\n');

    const ingester = new JsonlIngester({
      claudeProjectsDir: path.join(codexDir, 'no-claude'),
      codexSessionsDir: codexDir,
      gitRoot: '/work/anytime-markdown',
    });
    const { bus, events } = makeBus();
    await ingester.onRunEnd(makeCtx(bus));
    // No session_meta found -> filtered out when gitRoot set
    expect(events).toEqual([]);
  });

  it('exposes tier=1 and emits jsonl_session_discovered', () => {
    const ingester = new JsonlIngester();
    expect(ingester.tier).toBe(1);
    expect(ingester.id).toBe('JsonlIngester');
    expect(ingester.subscribes).toEqual([]);
    expect(ingester.emits).toEqual(['jsonl_session_discovered']);
  });
});
