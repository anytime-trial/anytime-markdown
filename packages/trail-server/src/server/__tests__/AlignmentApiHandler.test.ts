import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type * as http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { AlignmentApiHandler } from '../AlignmentApiHandler';

interface CapturedResponse {
  status: number;
  body: unknown;
}

function createResponse(captured: CapturedResponse): http.ServerResponse {
  return {
    writeHead: (status: number) => {
      captured.status = status;
    },
    end: (payload?: string) => {
      captured.body = payload ? JSON.parse(payload) : undefined;
    },
  } as unknown as http.ServerResponse;
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
} as never;

function trailDbWithoutHandle(): TrailDatabase {
  return { getRawSqliteHandle: () => null } as unknown as TrailDatabase;
}

function runGit(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

describe('AlignmentApiHandler', () => {
  let codeRoot: string;
  let docsRoot: string;

  beforeEach(() => {
    codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alignment-api-code-'));
    docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alignment-api-docs-'));

    for (const root of [codeRoot, docsRoot]) {
      runGit(['init'], root);
      runGit(['config', 'user.email', 'dev@example.com'], root);
      runGit(['config', 'user.name', 'Dev'], root);
    }

    fs.mkdirSync(path.join(codeRoot, 'packages', 'trail-core', 'src'), { recursive: true });
    fs.writeFileSync(path.join(codeRoot, 'packages', 'trail-core', 'package.json'), '{"name":"trail-core"}');
    fs.writeFileSync(path.join(codeRoot, 'packages', 'trail-core', 'src', 'api.ts'), 'export const a = 1;\n');
    runGit(['add', '.'], codeRoot);
    runGit(['commit', '-m', 'init'], codeRoot);

    fs.mkdirSync(path.join(docsRoot, 'spec'), { recursive: true });
    fs.writeFileSync(
      path.join(docsRoot, 'spec', 'trail-core.ja.md'),
      ['---', 'title: "S"', 'c4Scope: ["pkg_trail-core"]', '---', '# S', ''].join('\n'),
    );
    runGit(['add', '.'], docsRoot);
    runGit(['commit', '-m', 'init docs'], docsRoot);
  });

  afterEach(() => {
    fs.rmSync(codeRoot, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
  });

  function createHandler(overrides: { gitRepoRoot?: string; docsRepoRoot?: string } = {}): AlignmentApiHandler {
    return new AlignmentApiHandler(trailDbWithoutHandle(), silentLogger, {
      gitRepoRoot: 'gitRepoRoot' in overrides ? overrides.gitRepoRoot : codeRoot,
      resolveDocsRepoRoot: () => overrides.docsRepoRoot ?? docsRoot,
    });
  }

  async function call(
    handler: AlignmentApiHandler,
    query: string,
  ): Promise<CapturedResponse> {
    const captured: CapturedResponse = { status: 0, body: undefined };
    await handler.handle(createResponse(captured), new URLSearchParams(query));
    return captured;
  }

  it('ignores repository paths supplied by the caller and uses the server-configured roots', async () => {
    fs.appendFileSync(
      path.join(codeRoot, 'packages', 'trail-core', 'src', 'api.ts'),
      Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join('\n'),
    );

    const captured = await call(
      createHandler(),
      'scope=worktree&gitRepoRoot=/etc&docsRepoRoot=/etc',
    );

    expect(captured.status).toBe(200);
    const report = captured.body as { scope: string; findings: { status: string; specPath: string | null }[] };
    expect(report.scope).toBe('worktree');
    expect(report.findings).toEqual([
      expect.objectContaining({ status: 'stale', specPath: 'spec/trail-core.ja.md' }),
    ]);
  });

  it('returns 409 when the server has no gitRoot configured', async () => {
    const captured = await call(createHandler({ gitRepoRoot: undefined }), 'scope=worktree');

    expect(captured.status).toBe(409);
    expect(captured.body).toEqual({ error: expect.stringContaining('gitRoot') });
  });

  it('returns 409 when the spec repository is not configured', async () => {
    const captured = await call(createHandler({ docsRepoRoot: '' }), 'scope=worktree');

    expect(captured.status).toBe(409);
    expect(captured.body).toEqual({ error: expect.stringContaining('lep.json') });
  });

  it('returns 409 when a db-backed scope is requested but trail.db is not open', async () => {
    const captured = await call(createHandler(), 'scope=session&sessionId=abc');

    expect(captured.status).toBe(409);
    expect(captured.body).toEqual({ error: expect.stringContaining('trail.db is not open') });
  });

  it('returns 400 for an unknown scope', async () => {
    const captured = await call(createHandler(), 'scope=everything');

    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: expect.stringContaining('scope must be one of') });
  });

  it('returns 400 when scope=session is missing sessionId', async () => {
    const captured = await call(createHandler(), 'scope=session');

    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: expect.stringContaining('sessionId is required') });
  });

  it('returns 400 when scope=range is missing refs', async () => {
    const captured = await call(createHandler(), 'scope=range&fromRef=abc');

    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: expect.stringContaining('fromRef and toRef are required') });
  });

  it('returns 400 when minAddedLines is not an integer', async () => {
    const captured = await call(createHandler(), 'scope=worktree&minAddedLines=many');

    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ error: expect.stringContaining('minAddedLines must be an integer') });
  });

  it('honours minAddedLines by skipping changes below the threshold', async () => {
    fs.appendFileSync(path.join(codeRoot, 'packages', 'trail-core', 'src', 'api.ts'), 'const small = 1;\n');

    const captured = await call(createHandler(), 'scope=worktree&minAddedLines=100');

    expect(captured.status).toBe(200);
    const report = captured.body as { checkedFiles: number; skippedMinor: number; findings: unknown[] };
    expect(report.checkedFiles).toBe(1);
    expect(report.skippedMinor).toBe(1);
    expect(report.findings).toEqual([]);
  });
});
