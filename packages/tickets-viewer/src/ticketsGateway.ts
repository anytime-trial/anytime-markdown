import {
  archiveTicketRemote,
  createTicketRemote,
  deleteTicketRemote,
  fetchTickets,
  saveTicket,
  type CreateTicketClientInput,
  type SaveTicketInput,
  type TicketItem,
  type TicketsClientConfig,
  type TicketsData,
} from "./ticketsClient";

/**
 * チケット正本ストアへのデータ経路。
 *
 * 実装は 2 つある。web-app は HTTP（`createHttpTicketsGateway`）、VS Code 拡張は
 * webview から拡張ホストへの postMessage RPC。エラーは実装によらず
 * `TicketsClientError`（`status` / `conflict` / `validationErrors`）へ揃える。
 */
export interface TicketsGateway {
  list(includeArchive: boolean): Promise<TicketsData>;
  save(input: SaveTicketInput): Promise<{ version: string; updated_at: string }>;
  create(input: CreateTicketClientInput): Promise<TicketItem>;
  remove(input: { path: string; version: string; message?: string }): Promise<void>;
  archive(input: { path: string; version: string }): Promise<{ newPath: string }>;
}

/**
 * web-app の `/api/tickets` 系ルートを叩く gateway 実装。
 *
 * Why not: 呼び出しごとに生成するとインスタンス同一性が毎レンダー変わり、
 * `useTickets` が無限に再取得する。呼び出し側で必ずメモ化すること。
 */
export function createHttpTicketsGateway(config: TicketsClientConfig): TicketsGateway {
  return {
    list: (includeArchive) => fetchTickets(config, includeArchive),
    save: (input) => saveTicket(config, input),
    create: (input) => createTicketRemote(config, input),
    remove: (input) => deleteTicketRemote(config, input),
    archive: (input) => archiveTicketRemote(config, input),
  };
}
