import type { MemoryDbConnection } from '../db/connection/types';
import type { OllamaClient } from '../ollama/client';
import type { ChatProvider } from '../providers/types';
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
}

const TS = () => new Date().toISOString();

function log(level: string, message: string, ctx?: Record<string, unknown>): void {
  const ctxStr = ctx ? ` ${JSON.stringify(ctx)}` : '';
  // eslint-disable-next-line no-console
  console.log(`[${TS()}] [${level}] ChatService ${message}${ctxStr}`);
}

export class ChatService {
  constructor(private readonly opts: ChatServiceOptions) {}

  async *streamTurn(input: ChatTurnInput): AsyncGenerator<ChatChunk> {
    const t0 = Date.now();
    const retrieveLimit = this.opts.retrieveLimit ?? 12;

    // 1. Hybrid retrieval
    const search = await hybridSearchMemory({
      db: this.opts.db,
      ollama: this.opts.ollama,
      embedModel: this.opts.embedModel,
      input: {
        query: input.query,
        entity_types: input.filters?.entity_types
          ? [...input.filters.entity_types]
          : undefined,
        final_limit: retrieveLimit,
        hops: 0,
      },
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

    // 2. Prompt build
    const messages = buildPrompt({
      query: input.query,
      history: input.history,
      sources,
    });

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
        parser.feed(ch.delta, emit);
        while (pending.length > 0) {
          const c = pending.shift();
          if (c) yield c;
        }
        if (ch.done) break;
      }
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
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

    yield { type: 'done', payload: { interrupted, totalMs: Date.now() - t0 } };
  }
}
