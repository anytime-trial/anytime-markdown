"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TICKET_PRIORITIES } from "@anytime-markdown/tickets-core";

import type { TicketItem } from "../ticketsClient";
import { LabelChips, PriorityBadge, TicketProgress, formatLocalDate } from "./parts";

export interface TicketListProps {
  tickets: TicketItem[];
  onOpen: (ticket: TicketItem) => void;
}

type SortKey = "id" | "priority" | "updatedAt";

function compareTickets(a: TicketItem, b: TicketItem, key: SortKey): number {
  if (key === "priority") {
    return (
      TICKET_PRIORITIES.indexOf(b.frontmatter.priority) - TICKET_PRIORITIES.indexOf(a.frontmatter.priority)
    );
  }
  if (key === "updatedAt") {
    return b.frontmatter.updated_at.localeCompare(a.frontmatter.updated_at);
  }
  const numA = Number.parseInt(a.frontmatter.id.replace("T-", ""), 10);
  const numB = Number.parseInt(b.frontmatter.id.replace("T-", ""), 10);
  return numA - numB;
}

export function TicketList({ tickets, onOpen }: Readonly<TicketListProps>) {
  const t = useTranslations("tickets");
  const locale = useLocale();
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const sorted = useMemo(
    () => [...tickets].sort((a, b) => compareTickets(a, b, sortKey)),
    [tickets, sortKey],
  );

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sortKey === key ? "descending" : "none"}>
      <button type="button" onClick={() => setSortKey(key)}>
        {label}
        {sortKey === key ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <div className="tk-table-wrap">
      <table className="tk-table">
        <thead>
          <tr>
            {header("id", "ID")}
            <th scope="col">{t("field.title")}</th>
            <th scope="col">{t("field.status")}</th>
            {header("priority", t("field.priority"))}
            <th scope="col">{t("field.assignee")}</th>
            <th scope="col">{t("field.labels")}</th>
            <th scope="col">{t("field.progress")}</th>
            {header("updatedAt", t("field.updatedAt"))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((ticket) => (
            <tr key={ticket.path} onClick={() => onOpen(ticket)}>
              <td>{ticket.frontmatter.id}</td>
              <td className="tk-cell-title">{ticket.frontmatter.title}</td>
              <td>{t(`status.${ticket.frontmatter.status}`)}</td>
              <td>
                <PriorityBadge priority={ticket.frontmatter.priority} />
              </td>
              <td>{ticket.frontmatter.assignee ?? ""}</td>
              <td>
                <LabelChips labels={ticket.frontmatter.labels} />
              </td>
              <td>
                <TicketProgress ticket={ticket} />
              </td>
              <td>{formatLocalDate(ticket.frontmatter.updated_at, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
