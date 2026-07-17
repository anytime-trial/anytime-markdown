import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type * as http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { readEmergencyState, resolveAirspaceDir, writeEmergencyState } from '@anytime-markdown/agent-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import { assertGitAllowlist, EmergencyApiHandler } from '../EmergencyApiHandler';

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

/**
 * POST 用のリクエストを模す。`body` を data/end イベントで流す。
 * 既定は「正当なブラウザからの同一オリジン相当」= Origin 無し + 正しいヘッダ。
 */
function createPostRequest(
  body: unknown,
  headers: Record<string, string> = {},
): http.IncomingMessage {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
  const req = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-anytime-emergency': '1',
      ...headers,
    },
    on(event: string, cb: (chunk?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      return req;
    },
  } as unknown as http.IncomingMessage;

  // handler が on('data'/'end') を登録し終えた後に流す
  queueMicrotask(() => {
    for (const cb of listeners['data'] ?? []) cb(Buffer.from(payload));
    for (const cb of listeners['end'] ?? []) cb();
  });
  return req;
}

function createGetRequest(headers: Record<string, string> = {}): http.IncomingMessage {
  return { method: 'GET', headers } as unknown as http.IncomingMessage;
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
} as never;

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

/** end() が呼ばれるまで待つ（handler は非同期に応答する）。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
}

describe('EmergencyApiHandler', () => {
  let repoRoot: string;
  let airspaceDir: string;
  let headCommit: string;
  let recorded: Record<string, unknown>[];
  let handler: EmergencyApiHandler;

  /** 既定では HEAD だけがセーフポイントとして記録済み。 */
  function fakeTrailDb(points?: { commitHash: string }[]): TrailDatabase {
    return {
      recordEmergencyEvent: (input: Record<string, unknown>) => {
        recorded.push(input);
      },
      listSafePoints: () => points ?? [{ commitHash: headCommit }],
    } as unknown as TrailDatabase;
  }

  beforeEach(() => {
    repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'emergency-api-')));
    runGit(['init'], repoRoot);
    runGit(['config', 'user.email', 'dev@example.com'], repoRoot);
    runGit(['config', 'user.name', 'Dev'], repoRoot);
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\n');
    runGit(['add', '.'], repoRoot);
    runGit(['commit', '-m', 'init'], repoRoot);
    headCommit = runGit(['rev-parse', 'HEAD'], repoRoot);
    airspaceDir = resolveAirspaceDir(repoRoot) as string;

    recorded = [];
    handler = new EmergencyApiHandler(fakeTrailDb(), silentLogger, { gitRepoRoot: repoRoot });
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('GET /api/trail/emergency-state', () => {
    it('台帳が無ければ inactive を返す', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      handler.handleGetState(createGetRequest(), createResponse(captured));
      await settle();

      expect(captured.status).toBe(200);
      expect(captured.body).toEqual({ active: false });
    });

    it('発動中は理由・発動者・発動時刻を返す', async () => {
      writeEmergencyState(airspaceDir, {
        active: true,
        reason: 'runaway loop',
        triggeredBy: 'human',
        triggeredAt: '2026-07-16T10:00:00.000Z',
      });

      const captured: CapturedResponse = { status: 0, body: undefined };
      handler.handleGetState(createGetRequest(), createResponse(captured));
      await settle();

      expect(captured.status).toBe(200);
      expect(captured.body).toEqual({
        active: true,
        reason: 'runaway loop',
        triggeredBy: 'human',
        triggeredAt: '2026-07-16T10:00:00.000Z',
      });
    });

    it('gitRepoRoot 未設定なら 409（inactive と偽らない）', async () => {
      const noRoot = new EmergencyApiHandler(fakeTrailDb(), silentLogger, {});
      const captured: CapturedResponse = { status: 0, body: undefined };
      noRoot.handleGetState(createGetRequest(), createResponse(captured));
      await settle();

      expect(captured.status).toBe(409);
    });
  });

  describe('送信元検証（変更系 POST）', () => {
    it('localhost 以外の Origin を 403 で拒否する', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(
        createPostRequest({ reason: 'x' }, { origin: 'https://evil.example.com' }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(403);
      expect(readEmergencyState(airspaceDir)).toBeNull();
    });

    it('カスタムヘッダが無ければ 403（単純リクエストでの CSRF を拒否）', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(
        createPostRequest({ reason: 'x' }, { 'x-anytime-emergency': '' }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(403);
      expect(readEmergencyState(airspaceDir)).toBeNull();
    });

    it('Content-Type が JSON でなければ 415', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(
        createPostRequest({ reason: 'x' }, { 'content-type': 'text/plain' }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(415);
    });

    it('localhost の Origin は許可する', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(
        createPostRequest({ reason: 'ok' }, { origin: 'http://localhost:19841' }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(200);
      expect(readEmergencyState(airspaceDir)?.active).toBe(true);
    });
  });

  describe('POST /api/trail/emergency/kill-switch', () => {
    it('台帳を発動状態で書き、emergency_log へ human/trail-viewer 経路を記録する', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(createPostRequest({ reason: 'runaway' }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(200);
      const state = readEmergencyState(airspaceDir);
      expect(state?.active).toBe(true);
      expect(state?.reason).toBe('runaway');
      expect(state?.triggeredBy).toBe('human');

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ event: 'kill_switch_on', reason: 'runaway', actor: 'human' });
      expect(JSON.parse(recorded[0]['detailJson'] as string)).toMatchObject({ via: 'trail-viewer' });
    });

    it('理由が空なら 400（台帳を書かない）', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(createPostRequest({ reason: '  ' }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(400);
      expect(readEmergencyState(airspaceDir)).toBeNull();
      expect(recorded).toHaveLength(0);
    });

    it('壊れた JSON は 400', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(createPostRequest('{not json'), createResponse(captured));
      await settle();

      expect(captured.status).toBe(400);
    });
  });

  describe('POST /api/trail/emergency/release', () => {
    it('発動中なら台帳を消し kill_switch_off を記録する', async () => {
      writeEmergencyState(airspaceDir, {
        active: true,
        reason: 'runaway',
        triggeredBy: 'agent',
        triggeredAt: '2026-07-16T10:00:00.000Z',
      });

      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleRelease(createPostRequest({ reason: 'resolved' }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(200);
      expect(readEmergencyState(airspaceDir)).toBeNull();
      expect(recorded[0]).toMatchObject({ event: 'kill_switch_off', reason: 'resolved', actor: 'human' });
    });

    it('未発動なら 409（記録もしない）', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleRelease(createPostRequest({ reason: 'x' }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(409);
      expect(recorded).toHaveLength(0);
    });
  });

  describe('POST /api/trail/emergency/rollback', () => {
    it('recover-<shortSha> ブランチを作り作業ツリーを変更しない', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleRollback(createPostRequest({ commitHash: headCommit }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(200);
      const shortSha = headCommit.slice(0, 8);
      expect(captured.body).toMatchObject({ ok: true, recoverBranch: `recover-${shortSha}` });
      expect(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).toBe(`recover-${shortSha}`);
      expect(runGit(['status', '--porcelain'], repoRoot)).toBe('');
      expect(recorded[0]).toMatchObject({ event: 'rollback_executed', actor: 'human' });
      expect(JSON.parse(recorded[0]['detailJson'] as string)).toMatchObject({
        commitHash: headCommit,
        recoverBranch: `recover-${shortSha}`,
        via: 'trail-viewer',
      });
    });

    it('commitHash が 16 進数でなければ 400（git を実行しない）', async () => {
      const spy = jest.fn();
      const guarded = new EmergencyApiHandler(fakeTrailDb(), silentLogger, {
        gitRepoRoot: repoRoot,
        runGit: async (...args) => {
          spy(...args);
          return '';
        },
      });
      const captured: CapturedResponse = { status: 0, body: undefined };
      await guarded.handleRollback(
        createPostRequest({ commitHash: 'HEAD; rm -rf /' }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
      expect(recorded).toHaveLength(0);
    });

    it('記録済みでも git から消えた commit（GC 済み）は 404（何も変更しない）', async () => {
      const gone = 'a'.repeat(40);
      // safe_points には残るが git には存在しない、という pre-mortem のシナリオ
      const staleDb = new EmergencyApiHandler(fakeTrailDb([{ commitHash: gone }]), silentLogger, {
        gitRepoRoot: repoRoot,
      });
      const before = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);

      const captured: CapturedResponse = { status: 0, body: undefined };
      await staleDb.handleRollback(createPostRequest({ commitHash: gone }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(404);
      expect(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).toBe(before);
      expect(recorded).toHaveLength(0);
    });
  });

  describe('セーフポイント境界（cross-review 合意指摘）', () => {
    it('記録済みセーフポイント以外の commit へは switch しない', async () => {
      // 別コミットを作る（git 上は実在するが safe_points には無い）
      fs.writeFileSync(path.join(repoRoot, 'b.txt'), 'other\n');
      runGit(['add', '.'], repoRoot);
      runGit(['commit', '-m', 'other'], repoRoot);
      const unrecorded = runGit(['rev-parse', 'HEAD'], repoRoot);
      const before = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);

      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleRollback(createPostRequest({ commitHash: unrecorded }), createResponse(captured));
      await settle();

      // 「セーフポイント復旧」という操作境界は UI だけでなくサーバー側で強制する
      expect(captured.status).toBe(403);
      expect(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).toBe(before);
      expect(recorded).toHaveLength(0);
    });

    it('短縮 hash でも記録済みセーフポイントとして照合できる', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleRollback(
        createPostRequest({ commitHash: headCommit.slice(0, 10) }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(200);
    });

    it('trail.db 未オープンなら 409（照合できないまま switch しない）', async () => {
      const noDb = new EmergencyApiHandler(
        {
          recordEmergencyEvent: () => undefined,
          listSafePoints: () => {
            throw new Error('TrailDatabase not initialized. Call init() first.');
          },
        } as unknown as TrailDatabase,
        silentLogger,
        { gitRepoRoot: repoRoot },
      );
      const before = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);

      const captured: CapturedResponse = { status: 0, body: undefined };
      await noDb.handleRollback(createPostRequest({ commitHash: headCommit }), createResponse(captured));
      await settle();

      expect(captured.status).toBe(409);
      expect(runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).toBe(before);
    });
  });

  describe('body サイズ上限（cross-review 合意指摘）', () => {
    it('content-length が上限超過なら読まずに 413', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      await handler.handleKillSwitch(
        createPostRequest({ reason: 'x' }, { 'content-length': String(1024 * 1024) }),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(413);
      expect(readEmergencyState(airspaceDir)).toBeNull();
    });

    it('content-length を偽ってもストリーム累積で 413 に落ちる', async () => {
      const captured: CapturedResponse = { status: 0, body: undefined };
      // content-length を申告しない chunked 送信を模す
      await handler.handleKillSwitch(
        createPostRequest(JSON.stringify({ reason: 'a'.repeat(100_000) })),
        createResponse(captured),
      );
      await settle();

      expect(captured.status).toBe(413);
      expect(readEmergencyState(airspaceDir)).toBeNull();
    });
  });

  describe('assertGitAllowlist', () => {
    it('cat-file -e と switch -c だけを許可する', () => {
      expect(() => assertGitAllowlist(['cat-file', '-e', 'abc^{commit}'])).not.toThrow();
      expect(() => assertGitAllowlist(['switch', '-c', 'recover-abc', 'abc'])).not.toThrow();
    });

    it('破壊的サブコマンドを拒否する', () => {
      expect(() => assertGitAllowlist(['reset', '--hard', 'abc'])).toThrow(/not allowed/i);
      expect(() => assertGitAllowlist(['clean', '-f'])).toThrow(/not allowed/i);
      expect(() => assertGitAllowlist(['push', '--force'])).toThrow(/not allowed/i);
      expect(() => assertGitAllowlist(['switch', 'main'])).toThrow(/not allowed/i);
    });
  });
});
