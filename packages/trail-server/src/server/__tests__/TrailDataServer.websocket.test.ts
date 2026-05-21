/**
 * TrailDataServer — WebSocket 統合テスト
 *
 * このファイルは ws をモックしない。実 WebSocketServer（server.start 内部で生成）に
 * 実 ws クライアントで接続してメッセージ受信・副作用を検証する。
 */

// ws はモックしない（実 WebSocketServer を使う）

import WebSocket from 'ws';
import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer, isClientMessage, decodePathParam } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { PersistedLogEntry } from '../../services/LogService';

// ---------------------------------------------------------------------------
//  ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ws クライアントを作成し、open イベント待ちで接続を確立する。
 * timeout ms 以内に接続できなければ reject する。
 */
function connectWs(port: number, origin?: string, timeout = 3000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WebSocket connect timed out after ${timeout}ms`));
    }, timeout);

    const headers: Record<string, string> = {};
    if (origin !== undefined) {
      headers.origin = origin;
    }

    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });

    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * ws クライアントが閉じられるまで待つ。
 */
function waitForClose(ws: WebSocket, timeout = 3000): Promise<{ code: number; reason: Buffer }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`waitForClose timed out after ${timeout}ms`));
    }, timeout);

    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason });
    });
  });
}

/**
 * ws クライアントから次の message イベントを受け取り、JSON パースして返す。
 */
function nextMessage(ws: WebSocket, timeout = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`nextMessage timed out after ${timeout}ms`));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(String(data)));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * ws クライアントから N 件のメッセージをまとめて受け取る。
 */
function collectMessages(ws: WebSocket, count: number, timeout = 3000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const msgs: unknown[] = [];
    const timer = setTimeout(() => {
      reject(new Error(`collectMessages(${count}) timed out after ${timeout}ms (received ${msgs.length})`));
    }, timeout);

    const onMessage = (data: unknown): void => {
      try {
        msgs.push(JSON.parse(String(data)));
      } catch {
        msgs.push(data);
      }
      if (msgs.length >= count) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msgs);
      }
    };
    ws.on('message', onMessage);
  });
}

/**
 * ws クライアントをきれいに閉じる。既に CLOSED なら何もしない。
 */
function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

// ---------------------------------------------------------------------------
//  テストスイート
// ---------------------------------------------------------------------------

describe('TrailDataServer — WebSocket 接続ライフサイクル', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('origin なし（WebSocket ネイティブ接続）で接続が成立する', async () => {
    const ws = await connectWs(port);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('許可 origin (http://localhost:3000) で接続が成立する', async () => {
    const ws = await connectWs(port, 'http://localhost:3000');
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('許可 origin (http://127.0.0.1:5000) で接続が成立する', async () => {
    const ws = await connectWs(port, 'http://127.0.0.1:5000');
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('不正 origin で接続が close(4003) で拒否される', async () => {
    // 不正 origin では close が来るため open を待たずに close を待つ
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: 'http://evil.example.com' } });
    const { code } = await waitForClose(ws);
    expect(code).toBe(4003);
  });

  it('接続時に clientCount が増加し、切断後に減少する', async () => {
    expect(server.clientCount).toBe(0);

    const ws = await connectWs(port);
    // サーバーがクライアントを登録するまで少し待つ
    await new Promise((r) => setTimeout(r, 50));
    expect(server.clientCount).toBe(1);

    await closeWs(ws);
    // サーバーが close イベントを処理するまで少し待つ
    await new Promise((r) => setTimeout(r, 50));
    expect(server.clientCount).toBe(0);
  });

  it('複数クライアント接続で clientCount が正しく追跡される', async () => {
    const ws1 = await connectWs(port);
    const ws2 = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.clientCount).toBe(2);

    await closeWs(ws1);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.clientCount).toBe(1);

    await closeWs(ws2);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.clientCount).toBe(0);
  });
});

describe('TrailDataServer — sendC4CurrentState: 接続時の初期メッセージ', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('provider なし・docLinks なし・activity なし の場合はメッセージが届かない（タイムアウト）', async () => {
    const ws = await connectWs(port);
    // 150ms 以内にメッセージが来ないことを確認する
    let received = false;
    const msgPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 150);
      ws.once('message', () => { clearTimeout(timer); received = true; resolve(); });
    });
    await msgPromise;
    expect(received).toBe(false);
    await closeWs(ws);
  });

  it('lastClaudeActivity が設定されている場合、接続時に claude-activity-updated が届く', async () => {
    // notifyClaudeActivity は clients.size === 0 の場合も lastClaudeActivity を更新する
    // 接続前に lastClaudeActivity を設定しておく
    server.notifyClaudeActivity(['el-1'], ['el-2'], ['el-3']);

    // 接続する前にメッセージ受信リスナーをセットアップする
    const wsIncoming = new WebSocket(`ws://127.0.0.1:${port}`);

    const msg = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('claude-activity-updated timed out')), 3000);
      wsIncoming.once('open', () => {
        // open 直後にサーバーが sendC4CurrentState を呼ぶのでメッセージを待つ
        wsIncoming.once('message', (data) => {
          clearTimeout(timer);
          try { resolve(JSON.parse(String(data))); } catch (e) { reject(e); }
        });
      });
      wsIncoming.once('error', (err) => { clearTimeout(timer); reject(err); });
    }) as Record<string, unknown>;

    expect(msg.type).toBe('claude-activity-updated');
    expect(msg.activeElementIds).toEqual(['el-1']);
    expect(msg.touchedElementIds).toEqual(['el-2']);
    expect(msg.plannedElementIds).toEqual(['el-3']);

    await closeWs(wsIncoming);
  });
});

describe('TrailDataServer — broadcast メソッド', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('notifySessionsUpdated() が接続クライアントに {type:"sessions-updated"} を送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const msgPromise = nextMessage(ws, 2000);
    server.notifySessionsUpdated();
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('sessions-updated');
    await closeWs(ws);
  });

  it('notifySessionsUpdated() はクライアント 0 件の場合は早期 return（エラーなし）', () => {
    expect(server.clientCount).toBe(0);
    expect(() => server.notifySessionsUpdated()).not.toThrow();
  });

  it('notifyLog(entries) が接続クライアントに {type:"log-batch",logs} を送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const entries: PersistedLogEntry[] = [
      {
        id: 1,
        timestamp: '2026-05-21T00:00:00.000Z',
        level: 'info',
        component: 'test',
        message: 'hello log',
        source: 'extension',
      },
    ];

    const msgPromise = nextMessage(ws, 2000);
    server.notifyLog(entries);
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('log-batch');
    expect(msg.logs).toEqual(entries);
    await closeWs(ws);
  });

  it('notifyLog([]) は空配列のため早期 return（クライアントに届かない）', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    server.notifyLog([]);

    let received = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 150);
      ws.once('message', () => { clearTimeout(timer); received = true; resolve(); });
    });
    expect(received).toBe(false);
    await closeWs(ws);
  });

  it('notifyLog() はクライアント 0 件の場合は早期 return（エラーなし）', () => {
    expect(server.clientCount).toBe(0);
    const entries: PersistedLogEntry[] = [
      {
        id: 1,
        timestamp: '2026-05-21T00:00:00.000Z',
        level: 'info',
        component: 'test',
        message: 'no client',
        source: 'extension',
      },
    ];
    expect(() => server.notifyLog(entries)).not.toThrow();
  });

  it('notify("model-updated") が接続クライアントに {type:"model-updated"} を送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const msgPromise = nextMessage(ws, 2000);
    server.notify('model-updated');
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('model-updated');
    await closeWs(ws);
  });

  it('notify("model-updated") はクライアント 0 件の場合は早期 return（エラーなし）', () => {
    expect(server.clientCount).toBe(0);
    expect(() => server.notify('model-updated')).not.toThrow();
  });

  it('notifyProgress() が接続クライアントに {type:"analysis-progress"} を送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const msgPromise = nextMessage(ws, 2000);
    server.notifyProgress('building', 50);
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('analysis-progress');
    expect(msg.phase).toBe('building');
    expect(msg.percent).toBe(50);
    await closeWs(ws);
  });

  it('notifyClaudeActivity() が接続クライアントに claude-activity-updated を送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const msgPromise = nextMessage(ws, 2000);
    server.notifyClaudeActivity(['a'], ['b'], ['c']);
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('claude-activity-updated');
    expect(msg.activeElementIds).toEqual(['a']);
    await closeWs(ws);
  });

  it('notifyMultiAgentActivity() は agents 0 件では clients.size===0 チェックのみ（broadcast しない）', () => {
    expect(() => server.notifyMultiAgentActivity([], [])).not.toThrow();
  });

  it('notifyMultiAgentActivity() は clients が存在する場合にメッセージを送る', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    const msgPromise = nextMessage(ws, 2000);
    server.notifyMultiAgentActivity(
      [{
        sessionId: 's1',
        label: 'agent-1',
        branch: 'feature/test',
        currentFile: 'foo.ts',
        activeElementIds: [],
        touchedElementIds: [],
        plannedElementIds: [],
      }],
      [],
    );
    const msg = await msgPromise as Record<string, unknown>;

    expect(msg.type).toBe('multi-agent-activity-updated');
    await closeWs(ws);
  });
});

describe('TrailDataServer — handleWsMessage: provider 不要のコマンド', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('不正 JSON は無視される（エラーなし）', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send('not-json-at-all');

    let received = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 150);
      ws.once('message', () => { clearTimeout(timer); received = true; resolve(); });
    });
    expect(received).toBe(false);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('type が不正なメッセージは無視される（エラーなし）', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'unknown-invalid-type', data: 'foo' }));

    let received = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 150);
      ws.once('message', () => { clearTimeout(timer); received = true; resolve(); });
    });
    expect(received).toBe(false);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('perf-report は logger.debug を呼びクライアントへの応答なし', async () => {
    const logger = makeMockLogger();
    const s = new TrailDataServer('/tmp', db, logger);
    await s.start(0);
    const p = s.port;

    const ws = await connectWs(p);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'perf-report', metric: 'render', ms: 42 }));
    await new Promise((r) => setTimeout(r, 100));

    expect(logger.debug).toHaveBeenCalledWith('[perf-report]', { metric: 'render', ms: 42 });

    let received = false;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 150);
      ws.once('message', () => { clearTimeout(timer); received = true; resolve(); });
    });
    expect(received).toBe(false);

    await closeWs(ws);
    await s.stop();
  });

  it('open-doc-link は onOpenDocLink コールバックを呼ぶ', async () => {
    const onOpenDocLink = jest.fn();
    server.onOpenDocLink = onOpenDocLink;

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'open-doc-link', path: '/docs/foo.md' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(onOpenDocLink).toHaveBeenCalledWith('/docs/foo.md');
    await closeWs(ws);
  });

  it('open-file は onOpenFile コールバックを呼ぶ', async () => {
    const onOpenFile = jest.fn();
    server.onOpenFile = onOpenFile;

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'open-file', filePath: '/src/foo.ts' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(onOpenFile).toHaveBeenCalledWith('/src/foo.ts');
    await closeWs(ws);
  });

  it('generate-code-graph は codeGraphService.generate を呼ぶ', async () => {
    const fakeCodeGraphService = {
      generate: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
      loadFromDb: jest.fn().mockResolvedValue(null),
      setCodeGraphService: jest.fn(),
    };
    // CodeGraphApiHandler の setCodeGraphService も呼ばれるが、ここではスタブとして扱う
    server.setCodeGraphService(fakeCodeGraphService as never);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'generate-code-graph' }));
    // generate は async なので完了を待つ
    await new Promise((r) => setTimeout(r, 200));

    expect(fakeCodeGraphService.generate).toHaveBeenCalledTimes(1);
    await closeWs(ws);
  });

  it('generate-code-graph は codeGraphService が未設定の場合は何もしない（エラーなし）', async () => {
    // codeGraphService を設定しない
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'generate-code-graph' }));
    await new Promise((r) => setTimeout(r, 100));

    // エラーにならないことのみ確認
    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('chat.send は chatBridge.handleSend を呼ぶ', async () => {
    const fakeChatBridge = {
      handleSend: jest.fn().mockResolvedValue(undefined),
      handleAbort: jest.fn(),
      recheck: jest.fn().mockResolvedValue(undefined),
      sendStatus: jest.fn().mockResolvedValue(undefined),
    };
    server.setChatBridge(fakeChatBridge as never);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'chat.send', query: 'hello AI' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeChatBridge.handleSend).toHaveBeenCalledWith('hello AI', expect.any(Object));
    await closeWs(ws);
  });

  it('chat.abort は chatBridge.handleAbort を呼ぶ', async () => {
    const fakeChatBridge = {
      handleSend: jest.fn().mockResolvedValue(undefined),
      handleAbort: jest.fn(),
      recheck: jest.fn().mockResolvedValue(undefined),
      sendStatus: jest.fn().mockResolvedValue(undefined),
    };
    server.setChatBridge(fakeChatBridge as never);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'chat.abort' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeChatBridge.handleAbort).toHaveBeenCalledTimes(1);
    await closeWs(ws);
  });

  it('provider.recheck は chatBridge.recheck を呼ぶ', async () => {
    const fakeChatBridge = {
      handleSend: jest.fn().mockResolvedValue(undefined),
      handleAbort: jest.fn(),
      recheck: jest.fn().mockResolvedValue(undefined),
      sendStatus: jest.fn().mockResolvedValue(undefined),
    };
    server.setChatBridge(fakeChatBridge as never);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'provider.recheck' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeChatBridge.recheck).toHaveBeenCalledTimes(1);
    await closeWs(ws);
  });
});

describe('TrailDataServer — handleWsMessage: provider 必須コマンド', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('set-level は provider 未設定の場合に drop される（エラーなし）', async () => {
    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'set-level', level: 'package' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(ws.readyState).toBe(WebSocket.OPEN);
    await closeWs(ws);
  });

  it('set-level は provider が設定されていれば handleSetDsmLevel を呼ぶ', async () => {
    const fakeProvider = {
      featureMatrix: undefined,
      sourceMatrix: undefined,
      currentDsmLevel: 'package' as const,
      trailGraph: undefined,
      projectRoot: undefined,
      handleSetDsmLevel: jest.fn(),
      handleCluster: jest.fn(),
      handleRefresh: jest.fn(),
      handleResetClaudeActivity: jest.fn(),
      getManualElements: jest.fn().mockReturnValue([]),
      getManualRelationships: jest.fn().mockReturnValue([]),
    };
    server.setC4Provider(() => fakeProvider);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'set-level', level: 'component' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeProvider.handleSetDsmLevel).toHaveBeenCalledWith('component');
    await closeWs(ws);
  });

  it('cluster は provider が設定されていれば handleCluster を呼ぶ', async () => {
    const fakeProvider = {
      featureMatrix: undefined,
      sourceMatrix: undefined,
      currentDsmLevel: 'package' as const,
      trailGraph: undefined,
      projectRoot: undefined,
      handleSetDsmLevel: jest.fn(),
      handleCluster: jest.fn(),
      handleRefresh: jest.fn(),
      handleResetClaudeActivity: jest.fn(),
      getManualElements: jest.fn().mockReturnValue([]),
      getManualRelationships: jest.fn().mockReturnValue([]),
    };
    server.setC4Provider(() => fakeProvider);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'cluster', enabled: true }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeProvider.handleCluster).toHaveBeenCalledWith(true);
    await closeWs(ws);
  });

  it('refresh は provider が設定されていれば handleRefresh を呼ぶ', async () => {
    const fakeProvider = {
      featureMatrix: undefined,
      sourceMatrix: undefined,
      currentDsmLevel: 'package' as const,
      trailGraph: undefined,
      projectRoot: undefined,
      handleSetDsmLevel: jest.fn(),
      handleCluster: jest.fn(),
      handleRefresh: jest.fn(),
      handleResetClaudeActivity: jest.fn(),
      getManualElements: jest.fn().mockReturnValue([]),
      getManualRelationships: jest.fn().mockReturnValue([]),
    };
    server.setC4Provider(() => fakeProvider);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'refresh' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeProvider.handleRefresh).toHaveBeenCalledTimes(1);
    await closeWs(ws);
  });

  it('reset-claude-activity は provider が設定されていれば handleResetClaudeActivity を呼ぶ', async () => {
    const fakeProvider = {
      featureMatrix: undefined,
      sourceMatrix: undefined,
      currentDsmLevel: 'package' as const,
      trailGraph: undefined,
      projectRoot: undefined,
      handleSetDsmLevel: jest.fn(),
      handleCluster: jest.fn(),
      handleRefresh: jest.fn(),
      handleResetClaudeActivity: jest.fn(),
      getManualElements: jest.fn().mockReturnValue([]),
      getManualRelationships: jest.fn().mockReturnValue([]),
    };
    server.setC4Provider(() => fakeProvider);

    const ws = await connectWs(port);
    await new Promise((r) => setTimeout(r, 50));

    ws.send(JSON.stringify({ type: 'reset-claude-activity' }));
    await new Promise((r) => setTimeout(r, 100));

    expect(fakeProvider.handleResetClaudeActivity).toHaveBeenCalledTimes(1);
    await closeWs(ws);
  });
});

describe('TrailDataServer — isClientMessage 型ガード', () => {
  it('type が有効値のオブジェクトを受け入れる', () => {
    expect(isClientMessage({ type: 'refresh' })).toBe(true);
    expect(isClientMessage({ type: 'set-level', level: 'package' })).toBe(true);
    expect(isClientMessage({ type: 'cluster', enabled: true })).toBe(true);
    expect(isClientMessage({ type: 'open-doc-link', path: '/foo' })).toBe(true);
    expect(isClientMessage({ type: 'open-file', filePath: '/bar.ts' })).toBe(true);
    expect(isClientMessage({ type: 'generate-code-graph' })).toBe(true);
    expect(isClientMessage({ type: 'perf-report', metric: 'x', ms: 1 })).toBe(true);
    expect(isClientMessage({ type: 'chat.send', query: 'q' })).toBe(true);
    expect(isClientMessage({ type: 'chat.abort' })).toBe(true);
    expect(isClientMessage({ type: 'provider.recheck' })).toBe(true);
    expect(isClientMessage({ type: 'reset-claude-activity' })).toBe(true);
  });

  it('type が無効な値は拒否する', () => {
    expect(isClientMessage({ type: 'unknown-type' })).toBe(false);
    expect(isClientMessage({ type: '' })).toBe(false);
    expect(isClientMessage({ type: 123 })).toBe(false);
  });

  it('オブジェクトでない値は拒否する', () => {
    expect(isClientMessage(null)).toBe(false);
    expect(isClientMessage(undefined)).toBe(false);
    expect(isClientMessage('string')).toBe(false);
    expect(isClientMessage(42)).toBe(false);
    expect(isClientMessage([])).toBe(false);
  });

  it('type プロパティがないオブジェクトは拒否する', () => {
    expect(isClientMessage({})).toBe(false);
    expect(isClientMessage({ foo: 'bar' })).toBe(false);
  });
});

describe('TrailDataServer — decodePathParam', () => {
  it('prefix 以降の文字列を返す（特殊文字なし）', () => {
    expect(decodePathParam('/api/foo/bar', '/api/foo/')).toBe('bar');
  });

  it('パーセントエンコードされたコロンをデコードする', () => {
    const id = 'drift:entity:pkg:foo';
    expect(decodePathParam(`/api/foo/${encodeURIComponent(id)}`, '/api/foo/')).toBe(id);
  });

  it('suffix を除去してからデコードする', () => {
    const id = 'drift:entity:foo';
    expect(decodePathParam(`/api/foo/${encodeURIComponent(id)}/resolve`, '/api/foo/', '/resolve')).toBe(id);
  });

  it('prefix と同一パスは空文字を返す', () => {
    expect(decodePathParam('/api/foo/', '/api/foo/')).toBe('');
  });

  it('パーセントエンコードされたスラッシュをデコードする', () => {
    const id = 'drift:entity:pkg:foo/bar.ts';
    expect(decodePathParam(`/api/foo/${encodeURIComponent(id)}`, '/api/foo/')).toBe(id);
  });
});

describe('TrailDataServer — /api/analyze/current: handler 未登録で 503', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('onAnalyzeCurrentCode 未設定では POST /api/analyze/current が 503 を返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/not registered/i);
  });

  it('onAnalyzeCurrentCode 設定後は 200 を返し result を返す', async () => {
    server.onAnalyzeCurrentCode = jest.fn().mockResolvedValue({ elements: [], edges: [] });
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(server.onAnalyzeCurrentCode).toHaveBeenCalledTimes(1);
  });

  it('解析中に再度 POST すると 409 を返す', async () => {
    let resolveAnalysis!: () => void;
    const slowAnalysis = new Promise<{ elements: []; edges: [] }>((resolve) => {
      resolveAnalysis = () => resolve({ elements: [], edges: [] });
    });
    server.onAnalyzeCurrentCode = jest.fn().mockReturnValue(slowAnalysis);

    const first = fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    // 最初のリクエストが処理中になるまで待つ
    await new Promise((r) => setTimeout(r, 50));

    const second = await fetch(`http://127.0.0.1:${port}/api/analyze/current`, { method: 'POST' });
    expect(second.status).toBe(409);
    const body = await second.json() as Record<string, unknown>;
    expect(body.error).toMatch(/in progress/i);

    resolveAnalysis();
    await first;
  });

  it('GET /api/analyze/status は inProgress が null の場合に返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.inProgress).toBeNull();
  });
});

describe('TrailDataServer — /api/analyze-all: runner 未登録で 503', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('runner 未設定: GET /api/analyze-all/status → 503', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/status`);
    expect(res.status).toBe(503);
  });

  it('runner 未設定: POST /api/analyze-all/pause → 503', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('runner 未設定: POST /api/analyze-all/resume → 503', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/resume`, { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('runner 設定後: GET /api/analyze-all/status → 200', async () => {
    const fakeStatus = {
      schemaVersion: 1,
      paused: false,
      pausedAt: null,
      pausedBy: null,
      lastRunAt: null,
      lastDurationMs: null,
      lastReason: null,
      lastError: null,
      ticksRun: 0,
      ticksSkipped: 0,
      running: false,
    };
    const fakeRunner = {
      pause: jest.fn().mockResolvedValue(fakeStatus),
      resume: jest.fn().mockResolvedValue(fakeStatus),
      getStatus: jest.fn().mockReturnValue(fakeStatus),
    };
    server.setAnalyzeAllRunner(fakeRunner as never);

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.running).toBe(false);
  });

  it('runner 設定後: POST /api/analyze-all/pause → 200 で runner.pause を呼ぶ', async () => {
    const fakeStatus = {
      schemaVersion: 1,
      paused: true,
      pausedAt: '2026-05-21T00:00:00.000Z',
      pausedBy: 'test',
      lastRunAt: null,
      lastDurationMs: null,
      lastReason: null,
      lastError: null,
      ticksRun: 0,
      ticksSkipped: 0,
      running: false,
    };
    const fakeRunner = {
      pause: jest.fn().mockResolvedValue(fakeStatus),
      resume: jest.fn().mockResolvedValue(fakeStatus),
      getStatus: jest.fn().mockReturnValue(fakeStatus),
    };
    server.setAnalyzeAllRunner(fakeRunner as never);

    const res = await fetch(`http://127.0.0.1:${port}/api/analyze-all/pause`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ by: 'test' }),
    });
    expect(res.status).toBe(200);
    expect(fakeRunner.pause).toHaveBeenCalledWith('test');
  });
});
