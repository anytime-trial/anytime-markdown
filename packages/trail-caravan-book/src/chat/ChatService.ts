import type { CaravanDbConnection } from '../db/connection/types';
import type { OllamaClient } from '@anytime-markdown/agent-core';
import type { ChatProvider, ChatStreamChunk } from '@anytime-markdown/llm-core';
import { hybridSearchCaravanBook } from '../rag/hybridSearchCaravanBook';
import { buildPrompt, type PromptSource } from './promptBuilder';
import { CitationStreamParser } from './citationParser';
import type { ChatTurnInput, ChatChunk } from './types';

export interface ChatServiceOptions {
  readonly db: CaravanDbConnection;
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

/** パーサが吐き出したチャンクをバッファから順に流し切る。 */
function* drainPending(pending: ChatChunk[]): Generator<ChatChunk> {
  while (pending.length > 0) {
    const c = pending.shift();
    if (c) yield c;
  }
}

/**
 * provider ストリームの終わり方。
 * `error` が非 null のときだけ呼び出し側は早期打ち切り（flush も perf ログもしない）。
 */
type ProviderStreamOutcome = {
  firstTokenAt: number | null;
  interrupted: boolean;
  error: string | null;
};

/**
 * chat provider の応答を引用パースしながら流す。
 *
 * abort（signal 中断）とそれ以外のエラーは戻り値で区別する。ストリーム取得自体が
 * 同期的に throw する場合も拾えるよう、`openStream` は try の中で呼ぶ。
 */
async function* streamParsedChunks(args: {
  openStream: () => AsyncGenerator<ChatStreamChunk>;
  parser: CitationStreamParser;
  pending: ChatChunk[];
  emit: (c: ChatChunk) => void;
}): AsyncGenerator<ChatChunk, ProviderStreamOutcome> {
  const { openStream, parser, pending, emit } = args;
  let firstTokenAt: number | null = null;

  try {
    for await (const ch of openStream()) {
      if (firstTokenAt === null && ch.delta) firstTokenAt = Date.now();
      parser.feed(ch.delta, emit);
      yield* drainPending(pending);
      if (ch.done) break;
    }
  } catch (error) {
    if (isAbortError(error)) {
      return { firstTokenAt, interrupted: true, error: null };
    }
    return {
      firstTokenAt,
      interrupted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { firstTokenAt, interrupted: false, error: null };
}

/** streamTurn の実行時間内訳を 1 行へ出す（MEMORY_CHAT_PERF_LOG=0 で抑止）。 */
function logStreamTurnPerf(args: {
  enabled: boolean;
  timings: {
    retrievalMs: number;
    promptBuildMs: number;
    firstTokenMs: number | null;
    totalMs: number;
  };
  sourcesCount: number;
  interrupted: boolean;
}): void {
  if (!args.enabled) return;
  log('INFO', 'streamTurn perf', {
    retrieval_ms: args.timings.retrievalMs,
    prompt_build_ms: args.timings.promptBuildMs,
    first_token_ms: args.timings.firstTokenMs,
    total_ms: args.timings.totalMs,
    sources_count: args.sourcesCount,
    interrupted: args.interrupted,
  });
}

export class ChatService {
  constructor(private readonly opts: ChatServiceOptions) {}

  /** hybridSearchCaravanBook に渡す検索入力を構築する。 */
  private buildRetrievalInput(
    input: ChatTurnInput,
    retrieveLimit: number,
  ): Parameters<typeof hybridSearchCaravanBook>[0]['input'] {
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
    const retrieveLimit = this.opts.retrieveLimit ?? 12;

    // 1. Hybrid retrieval
    const search = await hybridSearchCaravanBook({
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

    const outcome = yield* streamParsedChunks({
      openStream: () => this.opts.chatProvider.chat({ messages, signal: input.signal }),
      parser,
      pending,
      emit,
    });

    if (outcome.error !== null) {
      log('ERROR', 'chat provider error', { error: outcome.error });
      yield { type: 'error', payload: { message: outcome.error } };
      yield { type: 'done', payload: { interrupted: false, totalMs: Date.now() - t0 } };
      return;
    }

    const interrupted = outcome.interrupted;
    parser.flush(emit);
    yield* drainPending(pending);

    const totalMs = Date.now() - t0;
    logStreamTurnPerf({
      enabled: process.env.MEMORY_CHAT_PERF_LOG !== '0',
      timings: {
        retrievalMs,
        promptBuildMs,
        firstTokenMs: outcome.firstTokenAt !== null ? outcome.firstTokenAt - t0 : null,
        totalMs,
      },
      sourcesCount: sources.length,
      interrupted,
    });
    yield { type: 'done', payload: { interrupted, totalMs } };
  }
}
