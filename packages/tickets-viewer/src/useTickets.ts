"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { appendComment, type TicketStatus } from "@anytime-markdown/tickets-core";

import { TicketsClientError } from "./ticketsClient";
import type {
  CreateTicketClientInput,
  SaveTicketInput,
  TicketItem,
  TicketsData,
} from "./ticketsClient";
import type { TicketsGateway } from "./ticketsGateway";

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

/**
 * チケット一覧の取得と CRUD 操作の状態管理。conflict(409) は上書きせずエラー通知に落とす。
 *
 * `gateway` はインスタンス同一性が再取得のトリガになる。呼び出し側で必ずメモ化すること
 * （毎レンダー生成すると無限に再取得する）。
 */
export function useTickets(
  gateway: TicketsGateway | null,
  includeArchive: boolean,
): UseTicketsResult {
  const [data, setData] = useState<TicketsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!gateway) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await gateway.list(includeArchive));
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err), conflict: false });
    } finally {
      setLoading(false);
    }
  }, [gateway, includeArchive]);

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
      if (!gateway) {
        return false;
      }
      return runMutation(async () => {
        const result = await gateway.save(input);
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
    [gateway, runMutation],
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
      if (!gateway) {
        return false;
      }
      return runMutation(async () => {
        const created = await gateway.create(input);
        setData((current) =>
          current ? { ...current, tickets: [...current.tickets, created] } : current,
        );
      });
    },
    [gateway, runMutation],
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
      if (!gateway) {
        return false;
      }
      return runMutation(async () => {
        await gateway.archive({ path: ticket.path, version: ticket.version });
        await reload();
      });
    },
    [gateway, runMutation, reload],
  );

  const remove = useCallback(
    async (ticket: TicketItem): Promise<boolean> => {
      if (!gateway) {
        return false;
      }
      return runMutation(async () => {
        await gateway.remove({
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
    [gateway, runMutation],
  );

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({ data, loading, error, clearError, reload, moveStatus, save, create, comment, archive, remove }),
    [data, loading, error, clearError, reload, moveStatus, save, create, comment, archive, remove],
  );
}
