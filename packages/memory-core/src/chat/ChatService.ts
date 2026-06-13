import type { MemoryDbConnection } from '../db/connection/types';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { ChatProvider } from '@anytime-markdown/llm-core';
import { hybridSearchMemory } from '../rag/hybridSearchMemory';
import { buildPrompt, type PromptSource } from './promptBuilder';
import { CitationStreamParser } from './citationParser';
import type { ChatTurnInput, ChatChunk } from './types';

export interface ChatServiceOptions {
  readonly db: MemoryDbConnection;
  readonly ollama: OllamaClient;
  readonly chatProvider: ChatProvider;
  readonly embedModel?: string;
  readonly retrieveLimit?: number;
  readonly bm25Limit?: number;
  readonly vecLimit?: number;
  readonly rrfK?: number;
}

const TS = () => new Date().toISOString();

function log(level: string, message: string, ctx?: Record<string, unknown>): void {
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : '';
  // eslint-disable-next-line no-console
  console.log(`[${TS()}] [${level}] ChatService ${message}${ctxStr}`);
}

/** abort 由来のエラー (signal 中断) かを判定する。 */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /aborted/i.test(error.message))
  );
}

export class ChatService {
  constructor(private readonly opts: ChatServiceOptions) {}

  /** hybridSearchMemory に渡す検索入力を構築する。 */
  private buildRetrievalInput(
    input: ChatTurnInput,
    retrieveLimit: number,
  ): Parameters<typeof hybridSearchMemory>[0]['input'] {
    return {
      query: input.query,
      entity_types: input.filters?.entity_types
        ? [...input.filters.entity_types]
        : undefined,
      final_limit: retrieveLimit,
      hops: 0,
      ...(this.opts.bm25Limit !== undefined && { bm25_limit: this.opts.bm25Limit }),
      ...(this.opts.vecLimit !== undefined && { vec_limit: this.opts.vecLimit }),
      ...(this.opts.rrfK !== undefined && { rrf_k: this.opts.rrfK }),
    };
  }

  async *streamTurn(input: ChatTurnInput): AsyncGenerator<ChatChunk> {
    const t0 = Date.now();
    let firstTokenAt: number | null = null;
    const retrieveLimit = this.opts.retrieveLimit ?? 12;

    // 1. Hybrid retrieval
    const search = await hybridSearchMemory({
      db: this.opts.db,
      ollama: this.opts.ollama,
      embedModel: this.opts.embedModel,
      input: this.buildRetrievalInput(input, retrieveLimit),
    });

    const sources: PromptSource[] = search.entities.map((e) => ({
      kind: 'entity',
      id: e.id,
      type: e.type,
      sources: [...e.sources],
      display_name: e.display_name,
      summary: e.summary,
    }));

    yield {
      type: 'sources',
      payload: sources.map((s) => ({
        id: s.id,
        title: s.display_name ?? s.id,
        kind: s.kind,
      })),
    };

    const retrievalMs = Date.now() - t0;

    // 2. Prompt build
    const tPromptStart = Date.now();
    const messages = buildPrompt({
      query: input.query,
      history: input.history,
      sources,
    });
    const promptBuildMs = Date.now() - tPromptStart;

    // 3. Stream + citation parsing
    const parser = new CitationStreamParser();
    const pending: ChatChunk[] = [];
    const emit = (c: ChatChunk): void => {
      pending.push(c);
    };

    let interrupted = false;
    try {
      for await (const ch of this.opts.chatProvider.chat({
        messages,
        signal: input.signal,
      })) {
        if (firstTokenAt === null && ch.delta) firstTokenAt = Date.now();
        parser.feed(ch.delta, emit);
        while (pending.length > 0) {
          const c = pending.shift();
          if (c) yield c;
        }
        if (ch.done) break;
      }
    } catch (error) {
      if (isAbortError(error)) {
        interrupted = true;
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        log('ERROR', 'chat provider error', { error: msg });
        yield { type: 'error', payload: { message: msg } };
        yield { type: 'done', payload: { interrupted: false, totalMs: Date.now() - t0 } };
        return;
      }
    }
    parser.flush(emit);
    while (pending.length > 0) {
      const c = pending.shift();
      if (c) yield c;
    }

    const totalMs = Date.now() - t0;
    const perfLogEnabled = process.env.MEMORY_CHAT_PERF_LOG !== '0';
    if (perfLogEnabled) {
      log('INFO', 'streamTurn perf', {
        retrieval_ms: retrievalMs,
        prompt_build_ms: promptBuildMs,
        first_token_ms: firstTokenAt !== null ? firstTokenAt - t0 : null,
        total_ms: totalMs,
        sources_count: sources.length,
        interrupted,
      });
    }
    yield { type: 'done', payload: { interrupted, totalMs } };
  }
}
