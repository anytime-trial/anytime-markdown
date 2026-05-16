import {
  ChatService,
  openMemoryCoreDb,
  type ChatChunk,
  type ChatTurnInput,
  type MemoryCoreDb,
} from '@anytime-markdown/memory-core';
import type { ChatProvider, HealthCheckResult } from '@anytime-markdown/llm-core';
import {
  OllamaChatProvider,
  createOllamaClient,
  type OllamaClient,
} from '@anytime-markdown/ollama-core';
import type { WebSocket } from 'ws';
import type {
  ChatChunkMessage,
  ProviderStatusMessage,
} from '../server/types';
import type { MemoryChatLogger } from './types';

/**
 * @deprecated Use MemoryChatLogger directly. Retained for backwards compat with external callers.
 */
export type ChatBridgeLogger = MemoryChatLogger;

export interface ChatBridgeConfig {
  readonly baseUrl: string;
  readonly chatModel: string;
  readonly embedModel: string;
  readonly bm25Limit?: number;
  readonly vecLimit?: number;
  readonly finalLimit?: number;
  readonly rrfK?: number;
}

export interface ChatBridgeDeps {
  readonly memoryDbPath: string;
  readonly memoryNativeBinding?: string;
  readonly getConfig: () => ChatBridgeConfig;
  readonly logger: MemoryChatLogger;
}

const TS = () => new Date().toISOString();

function logPrefix(level: string, msg: string): string {
  return `[${TS()}] [${level}] chatBridge ${msg}`;
}

/**
 * Memory chat の extension ホスト側エントリポイント。
 * TrailDataServer の WebSocket メッセージ (chat.send / chat.abort /
 * provider.recheck) を受けて memory-core の ChatService をストリーミング呼び出し、
 * 結果を `chat.chunk` / `provider.status` で送り返す。
 */
export class ChatBridge {
  private memoryDb: MemoryCoreDb | undefined;
  private ollama: OllamaClient | undefined;
  private chatProvider: ChatProvider | undefined;
  private chatService: ChatService | undefined;
  private currentAbort: AbortController | undefined;
  private lastStatus: HealthCheckResult | undefined;

  constructor(private readonly deps: ChatBridgeDeps) {}

  async dispose(): Promise<void> {
    this.currentAbort?.abort();
    try {
      this.memoryDb?.close();
    } catch (error) {
      this.deps.logger.error(
        logPrefix('ERROR', 'memoryDb close failed'),
        error,
      );
    }
    this.memoryDb = undefined;
    this.chatService = undefined;
  }

  /** 接続したクライアントに最新のステータスを送る (キャッシュがあれば即時、無ければ healthCheck 起動)。 */
  async sendStatus(ws: WebSocket | ReadonlyArray<WebSocket>): Promise<void> {
    if (!this.lastStatus) {
      this.lastStatus = await this.runHealthCheck();
    }
    this.broadcast(this.statusMessage(this.lastStatus), ws);
  }

  /** 設定変更や手動 recheck で呼ぶ。最新ステータスを再評価して全クライアントへ送る。 */
  async recheck(clients: ReadonlyArray<WebSocket>): Promise<void> {
    this.lastStatus = await this.runHealthCheck();
    this.broadcast(this.statusMessage(this.lastStatus), clients);
  }

  async handleSend(query: string, ws: WebSocket): Promise<void> {
    const service = await this.ensureService();
    if (!service) {
      // service が組めない (Ollama 未接続等) → status を再送して終わる
      await this.sendStatus(ws);
      return;
    }

    // 前リクエストの abort
    this.currentAbort?.abort();
    const abort = new AbortController();
    this.currentAbort = abort;

    const turn: ChatTurnInput = { query, history: [], signal: abort.signal };
    try {
      for await (const chunk of service.streamTurn(turn)) {
        this.sendChunk(chunk, ws);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.deps.logger.error(logPrefix('ERROR', 'streamTurn crashed'), error);
      this.sendChunk(
        { type: 'error', payload: { message: msg } } satisfies ChatChunk,
        ws,
      );
      this.sendChunk(
        { type: 'done', payload: { interrupted: false, totalMs: 0 } } satisfies ChatChunk,
        ws,
      );
    } finally {
      if (this.currentAbort === abort) this.currentAbort = undefined;
    }
  }

  handleAbort(): void {
    this.currentAbort?.abort();
  }

  // ---- internals ----------------------------------------------------------

  private async ensureService(): Promise<ChatService | undefined> {
    if (this.chatService) return this.chatService;

    const cfg = this.deps.getConfig();
    try {
      if (!this.memoryDb) {
        this.memoryDb = await openMemoryCoreDb(this.deps.memoryDbPath, {
          nativeBinding: this.deps.memoryNativeBinding,
        });
      }
      if (!this.ollama) {
        this.ollama = createOllamaClient({ baseUrl: cfg.baseUrl });
      }
      if (!this.chatProvider) {
        this.chatProvider = new OllamaChatProvider({
          baseUrl: cfg.baseUrl,
          model: cfg.chatModel,
        });
      }
      // チャット開始前に health 確認 (失敗時は status を返して service を組まない)
      const status = await this.chatProvider.healthCheck();
      this.lastStatus = status;
      if (!status.ok) return undefined;

      this.chatService = new ChatService({
        db: this.memoryDb.db,
        ollama: this.ollama,
        chatProvider: this.chatProvider,
        embedModel: cfg.embedModel,
        bm25Limit: cfg.bm25Limit,
        vecLimit: cfg.vecLimit,
        // ChatBridgeConfig.finalLimit aligns with VS Code/config.json naming; ChatService keeps existing retrieveLimit name to limit Task 5 scope
        retrieveLimit: cfg.finalLimit,
        rrfK: cfg.rrfK,
      });
      return this.chatService;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.lastStatus = { ok: false, detail };
      this.deps.logger.error(logPrefix('ERROR', 'ensureService failed'), error);
      return undefined;
    }
  }

  private async runHealthCheck(): Promise<HealthCheckResult> {
    const cfg = this.deps.getConfig();
    if (!this.chatProvider) {
      this.chatProvider = new OllamaChatProvider({
        baseUrl: cfg.baseUrl,
        model: cfg.chatModel,
      });
    }
    try {
      return await this.chatProvider.healthCheck();
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private statusMessage(r: HealthCheckResult): ProviderStatusMessage {
    return {
      type: 'provider.status',
      status: r.ok ? 'ready' : 'unavailable',
      detail: r.detail,
    };
  }

  private sendChunk(chunk: ChatChunk, ws: WebSocket): void {
    const msg: ChatChunkMessage = { type: 'chat.chunk', chunk };
    this.send(msg, ws);
  }

  private send(payload: ProviderStatusMessage | ChatChunkMessage, ws: WebSocket): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      this.deps.logger.error(logPrefix('ERROR', 'WebSocket send failed'), error);
    }
  }

  private broadcast(
    payload: ProviderStatusMessage | ChatChunkMessage,
    target: WebSocket | ReadonlyArray<WebSocket>,
  ): void {
    const list = Array.isArray(target) ? target : [target as WebSocket];
    for (const ws of list) this.send(payload, ws);
  }
}
