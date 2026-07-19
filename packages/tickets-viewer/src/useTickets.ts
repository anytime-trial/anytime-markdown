"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { appendComment, type TicketStatus } from "@anytime-markdown/tickets-core";

import {
  archiveTicketRemote,
  createTicketRemote,
  deleteTicketRemote,
  fetchTickets,
  saveTicket,
  TicketsClientError,
  type CreateTicketClientInput,
  type SaveTicketInput,
  type TicketItem,
  type TicketsClientConfig,
  type TicketsData,
} from "./ticketsClient";

export interface UseTicketsResult {
  data: TicketsData | null;
  loading: boolean;
  /** 表示用エラーメッセージ（conflict は再読込導線を出す） */
  error: { message: string; conflict: boolean } | null;
  clearError: () => void;
  reload: () => Promise<void>;
  moveStatus: (ticket: TicketItem, status: TicketStatus) => Promise<void>;
  save: (input: SaveTicketInput) => Promise<boolean>;
  create: (input: CreateTicketClientInput) => Promise<boolean>;
  comment: (ticket: TicketItem, author: string, text: string) => Promise<boolean>;
  archive: (ticket: TicketItem) => Promise<boolean>;
  remove: (ticket: TicketItem) => Promise<boolean>;
}

function replaceTicket(data: TicketsData, path: string, next: TicketItem): TicketsData {
  return { ...data, tickets: data.tickets.map((t) => (t.path === path ? next : t)) };
}

/** チケット一覧の取得と CRUD 操作の状態管理。conflict(409) は上書きせずエラー通知に落とす。 */
export function useTickets(config: TicketsClientConfig | null, includeArchive: boolean): UseTicketsResult {
  const [data, setData] = useState<TicketsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  // provider も取得先を決めるキー（含めないと provider 切替時に旧プロバイダの一覧が残る）
  const configKey = config ? `${config.repo} ${config.branch} ${config.provider ?? ""}` : "";

  const reload = useCallback(async () => {
    if (!config) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchTickets(config, includeArchive));
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err), conflict: false });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, includeArchive, config?.basePath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runMutation = useCallback(
    async (mutate: () => Promise<void>): Promise<boolean> => {
      setError(null);
      try {
        await mutate();
        return true;
      } catch (err) {
        const conflict = err instanceof TicketsClientError && err.conflict;
        const detail =
          err instanceof TicketsClientError && err.validationErrors.length > 0
            ? ` (${err.validationErrors.join(" / ")})`
            : "";
        setError({
          message: `${err instanceof Error ? err.message : String(err)}${detail}`,
          conflict,
        });
        return false;
      }
    },
    [],
  );

  const save = useCallback(
    async (input: SaveTicketInput): Promise<boolean> => {
      if (!config) {
        return false;
      }
      return runMutation(async () => {
        const result = await saveTicket(config, input);
        setData((current) =>
          current
            ? replaceTicket(current, input.path, {
                path: input.path,
                version: result.version,
                frontmatter: { ...input.frontmatter, updated_at: result.updated_at },
                extras: input.extras,
                body: input.body,
                archived: input.path.startsWith(".tickets/archive/"),
              })
            : current,
        );
      });
    },
    [config, runMutation],
  );

  const moveStatus = useCallback(
    async (ticket: TicketItem, status: TicketStatus): Promise<void> => {
      if (ticket.frontmatter.status === status) {
        return;
      }
      const ok = await save({
        path: ticket.path,
        version: ticket.version,
        frontmatter: { ...ticket.frontmatter, status },
        extras: ticket.extras,
        body: ticket.body,
        message: `ticket: ${ticket.frontmatter.id} status ${ticket.frontmatter.status} -> ${status}`,
      });
      if (!ok) {
        await reload();
      }
    },
    [save, reload],
  );

  const create = useCallback(
    async (input: CreateTicketClientInput): Promise<boolean> => {
      if (!config) {
        return false;
      }
      return runMutation(async () => {
        const created = await createTicketRemote(config, input);
        setData((current) =>
          current ? { ...current, tickets: [...current.tickets, created] } : current,
        );
      });
    },
    [config, runMutation],
  );

  const comment = useCallback(
    async (ticket: TicketItem, author: string, text: string): Promise<boolean> => {
      const body = appendComment(ticket.body, {
        author,
        timestamp: new Date().toISOString(),
        text,
      });
      return save({
        path: ticket.path,
        version: ticket.version,
        frontmatter: ticket.frontmatter,
        extras: ticket.extras,
        body,
        message: `ticket: ${ticket.frontmatter.id} comment by ${author}`,
      });
    },
    [save],
  );

  const archive = useCallback(
    async (ticket: TicketItem): Promise<boolean> => {
      if (!config) {
        return false;
      }
      return runMutation(async () => {
        await archiveTicketRemote(config, { path: ticket.path, version: ticket.version });
        await reload();
      });
    },
    [config, runMutation, reload],
  );

  const remove = useCallback(
    async (ticket: TicketItem): Promise<boolean> => {
      if (!config) {
        return false;
      }
      return runMutation(async () => {
        await deleteTicketRemote(config, {
          path: ticket.path,
          version: ticket.version,
          message: `ticket: delete ${ticket.frontmatter.id} ${ticket.frontmatter.title}`,
        });
        setData((current) =>
          current
            ? { ...current, tickets: current.tickets.filter((t) => t.path !== ticket.path) }
            : current,
        );
      });
    },
    [config, runMutation],
  );

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({ data, loading, error, clearError, reload, moveStatus, save, create, comment, archive, remove }),
    [data, loading, error, clearError, reload, moveStatus, save, create, comment, archive, remove],
  );
}
