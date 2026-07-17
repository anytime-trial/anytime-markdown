"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import { injectTicketsStyles } from "./injectStyles";
import { useTickets } from "./useTickets";
import type { TicketItem, TicketsClientConfig } from "./ticketsClient";
import { TicketBoard } from "./components/TicketBoard";
import { TicketList } from "./components/TicketList";
import { TicketDetailDialog } from "./components/TicketDetailDialog";
import { TicketCreateDialog } from "./components/TicketCreateDialog";

export interface TicketsPanelProps {
  /** 未選択（null）の場合は空状態を表示する */
  config: TicketsClientConfig | null;
  currentUser?: string;
  /** リポジトリ選択 UI を開く（web-app の GitHubRepoBrowser 等） */
  onRequestRepoSelect: () => void;
  /** サニタイズ済みリッチ表示のレンダラ（web-app から注入） */
  renderBody?: (markdown: string) => ReactNode;
}

interface Filters {
  status: TicketStatus | "";
  priority: TicketPriority | "";
  assignee: string;
  workspace: TicketWorkspace | "";
}

const EMPTY_FILTERS: Filters = { status: "", priority: "", assignee: "", workspace: "" };

function applyFilters(tickets: TicketItem[], filters: Filters, showArchive: boolean): TicketItem[] {
  return tickets.filter((ticket) => {
    if (!showArchive && ticket.archived) {
      return false;
    }
    if (filters.status !== "" && ticket.frontmatter.status !== filters.status) {
      return false;
    }
    if (filters.priority !== "" && ticket.frontmatter.priority !== filters.priority) {
      return false;
    }
    if (filters.assignee !== "" && ticket.frontmatter.assignee !== filters.assignee) {
      return false;
    }
    if (filters.workspace !== "" && ticket.frontmatter.workspace !== filters.workspace) {
      return false;
    }
    return true;
  });
}

export function TicketsPanel({ config, currentUser, onRequestRepoSelect, renderBody }: Readonly<TicketsPanelProps>) {
  const t = useTranslations("tickets");
  const [view, setView] = useState<"board" | "list">("board");
  const [showArchive, setShowArchive] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const tickets = useTickets(config, showArchive);

  useEffect(() => {
    injectTicketsStyles();
  }, []);

  const allTickets = useMemo(() => tickets.data?.tickets ?? [], [tickets.data]);
  const visible = useMemo(
    () => applyFilters(allTickets, filters, showArchive),
    [allTickets, filters, showArchive],
  );
  const assignees = useMemo(
    () => [...new Set(allTickets.map((item) => item.frontmatter.assignee).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)),
    [allTickets],
  );
  const selected = selectedPath ? (allTickets.find((item) => item.path === selectedPath) ?? null) : null;

  if (!config) {
    return (
      <div className="tk-root">
        <div className="tk-empty">
          <p>{t("repo.empty")}</p>
          <button type="button" className="tk-btn tk-btn--primary" onClick={onRequestRepoSelect}>
            {t("repo.select")}
          </button>
        </div>
      </div>
    );
  }

  const filterSelect = (
    id: string,
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void,
  ) => (
    <div className="tk-fieldset">
      <label className="tk-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="tk-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("filters.all")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="tk-root">
      <div className="tk-toolbar">
        <span className="tk-card-meta">
          {t("repo.location")}: {config.repo} / {config.branch}
        </span>
        <button type="button" className="tk-btn" onClick={onRequestRepoSelect}>
          {t("repo.change")}
        </button>
        <span className="tk-toolbar-spacer" />
        <button
          type="button"
          className={view === "board" ? "tk-btn tk-btn--toggle-on" : "tk-btn"}
          aria-pressed={view === "board"}
          onClick={() => setView("board")}
        >
          {t("view.board")}
        </button>
        <button
          type="button"
          className={view === "list" ? "tk-btn tk-btn--toggle-on" : "tk-btn"}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          {t("view.list")}
        </button>
        <button
          type="button"
          className={showArchive ? "tk-btn tk-btn--toggle-on" : "tk-btn"}
          aria-pressed={showArchive}
          onClick={() => setShowArchive(!showArchive)}
        >
          {t("view.showArchive")}
        </button>
        <button type="button" className="tk-btn" onClick={() => void tickets.reload()}>
          {t("board.reload")}
        </button>
        <button type="button" className="tk-btn tk-btn--primary" onClick={() => setCreateOpen(true)}>
          {t("board.newTicket")}
        </button>
      </div>
      {view === "list" && (
        <div className="tk-toolbar">
          {filterSelect(
            "tk-filter-status",
            t("filters.status"),
            filters.status,
            TICKET_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
            (value) => setFilters({ ...filters, status: value as Filters["status"] }),
          )}
          {filterSelect(
            "tk-filter-priority",
            t("filters.priority"),
            filters.priority,
            TICKET_PRIORITIES.map((value) => ({ value, label: t(`priority.${value}`) })),
            (value) => setFilters({ ...filters, priority: value as Filters["priority"] }),
          )}
          {filterSelect(
            "tk-filter-assignee",
            t("filters.assignee"),
            filters.assignee,
            assignees.map((value) => ({ value, label: value })),
            (value) => setFilters({ ...filters, assignee: value }),
          )}
          {filterSelect(
            "tk-filter-workspace",
            t("filters.workspace"),
            filters.workspace,
            TICKET_WORKSPACES.map((value) => ({ value, label: t(`workspace.${value}`) })),
            (value) => setFilters({ ...filters, workspace: value as Filters["workspace"] }),
          )}
        </div>
      )}
      {tickets.error && (
        <div className="tk-alert tk-alert--error" role="alert">
          <span>{tickets.error.conflict ? t("error.conflict") : tickets.error.message}</span>
          <button
            type="button"
            className="tk-btn"
            onClick={() => {
              tickets.clearError();
              void tickets.reload();
            }}
          >
            {t("board.reload")}
          </button>
        </div>
      )}
      {tickets.data && tickets.data.invalid.length > 0 && (
        <div className="tk-alert tk-alert--warning">
          <span>{t("board.invalidHeading")}:</span>
          {tickets.data.invalid.map((item) => (
            <span key={item.path} className="tk-chip" title={item.reason}>
              {item.path}
            </span>
          ))}
        </div>
      )}
      {tickets.loading && <p className="tk-empty">{t("common.loading")}</p>}
      {!tickets.loading && view === "board" && (
        <TicketBoard
          tickets={visible}
          onOpen={(ticket) => setSelectedPath(ticket.path)}
          onMoveStatus={(ticket, status) => void tickets.moveStatus(ticket, status)}
        />
      )}
      {!tickets.loading && view === "list" && (
        <TicketList tickets={visible} onOpen={(ticket) => setSelectedPath(ticket.path)} />
      )}
      {selected && (
        <TicketDetailDialog
          ticket={selected}
          allTickets={allTickets}
          currentUser={currentUser}
          onClose={() => setSelectedPath(null)}
          onSave={tickets.save}
          onComment={tickets.comment}
          onArchive={async (ticket) => {
            const ok = await tickets.archive(ticket);
            if (ok) {
              setSelectedPath(null);
            }
            return ok;
          }}
          onDelete={async (ticket) => {
            const ok = await tickets.remove(ticket);
            if (ok) {
              setSelectedPath(null);
            }
            return ok;
          }}
          onOpenTicket={(ticket) => setSelectedPath(ticket.path)}
          renderBody={renderBody}
        />
      )}
      <TicketCreateDialog
        open={createOpen}
        currentUser={currentUser}
        onClose={() => setCreateOpen(false)}
        onCreate={tickets.create}
      />
    </div>
  );
}
