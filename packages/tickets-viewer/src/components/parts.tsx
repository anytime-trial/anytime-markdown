"use client";

import { useTranslations } from "next-intl";
import { QUESTION_LABEL, countSubtasks, remainingHours } from "@anytime-markdown/tickets-core";
import type { TicketPriority } from "@anytime-markdown/tickets-core";

import type { TicketItem } from "../ticketsClient";

export function PriorityBadge({ priority }: Readonly<{ priority: TicketPriority }>) {
  const t = useTranslations("tickets");
  return <span className={`tk-badge tk-badge--${priority}`}>{t(`priority.${priority}`)}</span>;
}

export function LabelChips({ labels }: Readonly<{ labels?: string[] }>) {
  if (!labels || labels.length === 0) {
    return null;
  }
  return (
    <>
      {labels.map((label) => (
        <span key={label} className={label === QUESTION_LABEL ? "tk-chip tk-chip--question" : "tk-chip"}>
          {label}
        </span>
      ))}
    </>
  );
}

export function TicketProgress({ ticket }: Readonly<{ ticket: TicketItem }>) {
  const t = useTranslations("tickets");
  const subtasks = countSubtasks(ticket.body);
  const progress = ticket.frontmatter.progress ?? 0;
  const remaining = remainingHours(ticket.frontmatter.estimate, ticket.frontmatter.progress);
  return (
    <span className="tk-progress">
      {ticket.frontmatter.progress !== undefined && (
        <>
          <span className="tk-progress-track" aria-hidden="true">
            <span className="tk-progress-fill" style={{ width: `${progress}%` }} />
          </span>
          <span>{progress}%</span>
        </>
      )}
      {subtasks.total > 0 && (
        <span aria-label={t("field.subtasks")}>
          {subtasks.done}/{subtasks.total}
        </span>
      )}
      {remaining !== null && <span>{t("common.hours", { hours: remaining })}</span>}
    </span>
  );
}

/** ISO 8601 UTC をローカル TZ の短い表記へ変換する（Invalid Date は原文のまま返す） */
export function formatLocalDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
