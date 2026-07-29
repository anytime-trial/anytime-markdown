import {
  TicketsClientError,
  type CreateTicketClientInput,
  type SaveTicketInput,
  type TicketItem,
  type TicketsData,
  type TicketsGateway,
} from '@anytime-markdown/tickets-viewer';

/** webview から拡張ホストへの postMessage 経路を抽象化する（実体は VS Code webview API）。 */
export interface RpcTransport {
  postMessage(message: { type: 'rpc'; id: string; method: string; params: unknown }): void;
  /** 戻り値は購読解除関数。 */
  onMessage(listener: (message: unknown) => void): () => void;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

/**
 * 拡張ホストからの postMessage はプロセス境界を越えた外部入力であり信頼できない
 * （webview は任意のメッセージを受け取りうる）。型アサーションでなく型ガードで
 * 判別してから読む（`ticketsRpcHandler.ts` の `isRecord` 等のパターンに倣う）。
 */
function isRpcResultEnvelope(
  value: unknown,
): value is { type: 'rpcResult'; id: string; result?: unknown; error?: unknown } {
  return isRecord(value) && value.type === 'rpcResult' && typeof value.id === 'string';
}

function isRpcErrorPayload(
  value: unknown,
): value is { message: string; status: number; conflict: boolean; validationErrors: string[] } {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.status === 'number' &&
    typeof value.conflict === 'boolean' &&
    isStringArray(value.validationErrors)
  );
}

/**
 * webview 側の `TicketsGateway` 実装。postMessage RPC で拡張ホストへ委譲し、
 * `ticketsRpcHandler.ts` の `handleTicketsRpc` が返す応答を `id` で対応付けて
 * resolve/reject する。エラーは HTTP 実装（`createHttpTicketsGateway`）と同じ
 * `TicketsClientError` へ揃えるため、呼び出し側（TicketsPanel/useTickets）は
 * gateway の実装を意識しない。
 */
export function createRpcTicketsGateway(transport: RpcTransport): TicketsGateway {
  const pending = new Map<string, PendingEntry>();
  let sequence = 0;

  transport.onMessage((message) => {
    if (!isRpcResultEnvelope(message)) {
      // rpcResult 以外（他機能からの postMessage 等）は関与しないため無視する。
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) {
      // 未知の id（タイムアウト後の遅延応答等）は待機中の Promise が既に無いため無視する。
      return;
    }
    pending.delete(message.id);

    if (message.error !== undefined) {
      if (isRpcErrorPayload(message.error)) {
        entry.reject(
          new TicketsClientError(message.error.status, message.error.message, {
            conflict: message.error.conflict,
            validationErrors: message.error.validationErrors,
          }),
        );
      } else {
        // 拡張ホスト（ticketsRpcHandler.ts）の契約違反。原因不明の型エラーに
        // 化けるより、ここで明示的に落として診断可能にする。
        entry.reject(new TicketsClientError(0, 'RPC エラー応答の形式が不正です'));
      }
      return;
    }

    if ('result' in message) {
      // remove は result: null（値あり）で解決する契約のため、存在チェックは
      // `!== undefined` でなく `in` で行う。
      entry.resolve(message.result);
      return;
    }

    // error も result も無い応答は拡張ホスト側の契約違反。undefined を静かに
    // resolve すると呼び出し側（useTickets 等）で原因不明の実行時エラーになる。
    entry.reject(new TicketsClientError(0, 'RPC 応答に result も error も含まれていません'));
  });

  // SHORTCUT: pending の応答待ちにタイムアウトを設けていない。ceiling: webview パネルが
  // 破棄されれば realm ごと GC されるため実害は無く、リークが顕在化するのは「パネルを開いた
  // まま拡張ホストだけがクラッシュ/リロードする」稀なケースに限る。upgrade: ユーザー報告で
  // 「読み込み中のまま固まる」事象が観測された場合、または Task 12 で拡張ホストの生存確認
  // （heartbeat/ping）を導入する場合に、タイムアウト reject を追加する。
  const call = <T>(method: string, params: unknown): Promise<T> => {
    sequence += 1;
    const id = `rpc-${sequence}`;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        // Why not: T は実行時に消去されるため、汎用 RPC 呼び出しでは境界で 1 箇所だけ
        // アサーションが避けられない（ticketsClient.ts の `as TicketsData` 等と同様、
        // 拡張ホスト側の応答形状は ticketsRpcHandler.ts が保証する契約として信頼する）。
        resolve: (value: unknown) => resolve(value as T),
        reject,
      });
      transport.postMessage({ type: 'rpc', id, method, params });
    });
  };

  return {
    list: (includeArchive) => call<TicketsData>('list', { includeArchive }),
    save: (input: SaveTicketInput) => call<{ version: string; updated_at: string }>('save', input),
    create: (input: CreateTicketClientInput) => call<TicketItem>('create', input),
    remove: async (input) => {
      await call<null>('remove', input);
    },
    archive: (input) => call<{ newPath: string }>('archive', input),
  };
}
