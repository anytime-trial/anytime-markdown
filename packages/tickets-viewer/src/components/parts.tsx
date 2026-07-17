"use client";

import { useTranslations } from "next-intl";
import { countSubtasks } from "@anytime-markdown/tickets-core";
import type { TicketPriority } from "@anytime-markdown/tickets-core";

import type { TicketItem } from "../ticketsClient";

export function PriorityBadge({ priority }: Readonly<{ priority: TicketPriority }>) {
  const t = useTranslations("tickets");
  return <span className={`tk-badge tk-badge--${priority}`}>{t(`priority.${priority}`)}</span>;
}

export function WorkspaceChip({ ticket }: Readonly<{ ticket: TicketItem }>) {
  const t = useTranslations("tickets");
  const { workspace } = ticket.frontmatter;
  if (workspace === undefined) {
    return null;
  }
  return (
    <span className="tk-chip" aria-label={t("field.workspace")}>
      {t(`workspace.${workspace}`)}
    </span>
  );
}

/** 工数（実施/予定・分）とサブタスク完了数。いずれも未設定なら何も描画しない。 */
export function TicketEffort({ ticket }: Readonly<{ ticket: TicketItem }>) {
  const t = useTranslations("tickets");
  const subtasks = countSubtasks(ticket.body);
  const { estimate, actual } = ticket.frontmatter;
  const hasEffort = estimate !== undefined || actual !== undefined;
  if (!hasEffort && subtasks.total === 0) {
    return null;
  }
  const effortLabel = estimate === undefined
    ? t("common.minutes", { minutes: actual ?? 0 })
    : t("common.effortValue", { actual: actual ?? 0, estimate });
  return (
    <span className="tk-effort">
      {hasEffort && <span aria-label={t("field.effort")}>{effortLabel}</span>}
      {subtasks.total > 0 && (
        <span aria-label={t("field.subtasks")}>
          {subtasks.done}/{subtasks.total}
        </span>
      )}
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
