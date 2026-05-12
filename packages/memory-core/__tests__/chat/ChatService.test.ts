import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryDbConnection } from '../../src/db/connection/types';
import { upsertEntityFts } from '../../src/rag/ftsSync';
import { ChatService } from '../../src/chat/ChatService';
import { encodeEmbedding } from '../../src/embedding/codec';
import { createMockOllamaClient } from '../helpers/MockOllamaClient';
import type {
  ChatProvider,
  ChatProviderChatOptions,
  ChatStreamChunk,
  HealthCheckResult,
} from '../../src/providers/types';
import type { ChatChunk } from '../../src/chat/types';

function makeTmpDb(): string {
  return path.join(
    os.tmpdir(),
    `memory-chatservice-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
}

const TS = '2026-01-01T00:00:00.000Z';

function insertEntity(
  db: MemoryDbConnection,
  id: string,
  display: string,
  summary: string,
  embedding: Float32Array,
): void {
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, summary, aliases_json,
        embedding, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Function', ?, ?, ?, '[]', ?, ?, ?, ?)`,
    [id, display, display, summary, encodeEmbedding(embedding), TS, TS, TS],
  );
}

class ScriptedChatProvider implements ChatProvider {
  readonly name = 'scripted';
  readonly model = 'scripted';
  constructor(private readonly deltas: ReadonlyArray<string>) {}
  async *chat(_opts: ChatProviderChatOptions): AsyncGenerator<ChatStreamChunk> {
    for (let i = 0; i < this.deltas.length; i++) {
      const isLast = i === this.deltas.length - 1;
      yield { delta: this.deltas[i], done: isLast };
    }
  }
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true };
  }
}

class ErrorChatProvider implements ChatProvider {
  readonly name = 'error';
  readonly model = 'error';
  // eslint-disable-next-line require-yield
  async *chat(): AsyncGenerator<ChatStreamChunk> {
    throw new Error('provider boom');
  }
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: false, detail: 'boom' };
  }
}

describe('ChatService.streamTurn', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const opened = await openMemoryCoreDb();
    db = opened.db;
    close = opened.close;
  });

  afterEach(() => close());
  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  test('sources → token+citation → done を yield', async () => {
    insertEntity(db, 'e1', 'searchMemory', 'BM25+vec', Float32Array.from([1, 0, 0]));
    upsertEntityFts(db, 'e1');

    const service = new ChatService({
      db,
      ollama: createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) }),
      chatProvider: new ScriptedChatProvider([
        'Hello ',
        '[^entity:e1]',
        ' World',
      ]),
    });

    const chunks: ChatChunk[] = [];
    for await (const c of service.streamTurn({ query: 'searchMemory', history: [] })) {
      chunks.push(c);
    }

    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe('sources');
    expect(types).toContain('citation');
    expect(types).toContain('token');
    expect(types.at(-1)).toBe('done');

    const tokenText = chunks
      .filter((c) => c.type === 'token')
      .map((c) => c.payload.delta)
      .join('');
    expect(tokenText).toBe('Hello  World');

    const citations = chunks.filter((c) => c.type === 'citation');
    expect(citations[0]?.payload.tag).toBe('entity:e1');

    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk?.payload.interrupted).toBe(false);
  });

  test('AbortSignal で中断したら done.interrupted=true', async () => {
    insertEntity(db, 'e1', 'foo', 'foo', Float32Array.from([1, 0, 0]));
    upsertEntityFts(db, 'e1');

    class AbortableProvider implements ChatProvider {
      readonly name = 'abortable';
      readonly model = 'abortable';
      async *chat(opts: ChatProviderChatOptions): AsyncGenerator<ChatStreamChunk> {
        yield { delta: 'first ', done: false };
        if (opts.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        yield { delta: 'second', done: true };
      }
      async healthCheck(): Promise<HealthCheckResult> {
        return { ok: true };
      }
    }

    const controller = new AbortController();
    const service = new ChatService({
      db,
      ollama: createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) }),
      chatProvider: new AbortableProvider(),
    });

    controller.abort();
    const chunks: ChatChunk[] = [];
    for await (const c of service.streamTurn({
      query: 'foo',
      history: [],
      signal: controller.signal,
    })) {
      chunks.push(c);
    }
    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk?.payload.interrupted).toBe(true);
  });

  test('provider が例外を throw したら error チャンクと done を emit', async () => {
    insertEntity(db, 'e1', 'foo', 'foo', Float32Array.from([1, 0, 0]));
    upsertEntityFts(db, 'e1');

    const service = new ChatService({
      db,
      ollama: createMockOllamaClient({ fixedEmbedding: Float32Array.from([1, 0, 0]) }),
      chatProvider: new ErrorChatProvider(),
    });

    const chunks: ChatChunk[] = [];
    for await (const c of service.streamTurn({ query: 'foo', history: [] })) {
      chunks.push(c);
    }
    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk?.payload.message).toContain('provider boom');
    expect(chunks.at(-1)?.type).toBe('done');
  });
});
