"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketFrontmatter,
  type TicketPriority,
  type TicketStatus,
} from "@anytime-markdown/tickets-core";

import type { SaveTicketInput, TicketItem } from "../ticketsClient";
import { ModalShell } from "./ModalShell";
import { LabelChips, PriorityBadge, formatLocalDate } from "./parts";

export interface TicketDetailDialogProps {
  ticket: TicketItem | null;
  allTickets: TicketItem[];
  currentUser?: string;
  onClose: () => void;
  onSave: (input: SaveTicketInput) => Promise<boolean>;
  onComment: (ticket: TicketItem, author: string, text: string) => Promise<boolean>;
  onArchive: (ticket: TicketItem) => Promise<boolean>;
  onDelete: (ticket: TicketItem) => Promise<boolean>;
  onOpenTicket: (ticket: TicketItem) => void;
  /** サニタイズ済みリッチ表示のレンダラ（web-app から注入。未指定時はソース表示） */
  renderBody?: (markdown: string) => ReactNode;
}

function splitList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  return items.length > 0 ? items : undefined;
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

export function TicketDetailDialog(props: Readonly<TicketDetailDialogProps>) {
  const { ticket, allTickets, currentUser, onClose, onSave, onComment, onArchive, onDelete, onOpenTicket, renderBody } = props;
  const t = useTranslations("tickets");
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TicketStatus>("backlog");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [labels, setLabels] = useState("");
  const [dependencies, setDependencies] = useState("");
  const [estimate, setEstimate] = useState("");
  const [progress, setProgress] = useState("");
  const [body, setBody] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [message, setMessage] = useState("");
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const resetKey = ticket ? `${ticket.path}:${ticket.sha}` : "";
  useEffect(() => {
    if (!ticket) {
      return;
    }
    const fm = ticket.frontmatter;
    setTitle(fm.title);
    setStatus(fm.status);
    setPriority(fm.priority);
    setAssignee(fm.assignee ?? "");
    setLabels((fm.labels ?? []).join(", "));
    setDependencies((fm.dependencies ?? []).join(", "));
    setEstimate(fm.estimate === undefined ? "" : String(fm.estimate));
    setProgress(fm.progress === undefined ? "" : String(fm.progress));
    setBody(ticket.body);
    setEditingBody(false);
    setMessage("");
    setCommentText("");
    setConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const byId = useMemo(() => {
    const map = new Map<string, TicketItem>();
    for (const item of allTickets) {
      map.set(item.frontmatter.id, item);
    }
    return map;
  }, [allTickets]);

  if (!ticket) {
    return null;
  }
  const readOnly = ticket.archived;

  const buildFrontmatter = (): TicketFrontmatter => {
    const fm: TicketFrontmatter = {
      ...ticket.frontmatter,
      title: title.trim() === "" ? ticket.frontmatter.title : title.trim(),
      status,
      priority,
    };
    fm.assignee = assignee.trim() === "" ? undefined : assignee.trim();
    fm.labels = splitList(labels);
    fm.dependencies = splitList(dependencies);
    fm.estimate = parseOptionalNumber(estimate);
    fm.progress = parseOptionalNumber(progress);
    return fm;
  };

  const handleSave = async () => {
    setBusy(true);
    const fm = buildFrontmatter();
    await onSave({
      path: ticket.path,
      sha: ticket.sha,
      frontmatter: fm,
      extras: ticket.extras,
      body,
      message: message.trim() === "" ? `ticket: update ${fm.id} ${fm.title}` : message.trim(),
    });
    setBusy(false);
  };

  const handleComment = async () => {
    if (commentText.trim() === "") {
      return;
    }
    setBusy(true);
    const ok = await onComment(ticket, currentUser ?? "anonymous", commentText.trim());
    setBusy(false);
    if (ok) {
      setCommentText("");
    }
  };

  const dependencyIds = ticket.frontmatter.dependencies ?? [];

  const deleteButton = (
    <button
      type="button"
      className="tk-btn tk-btn--danger"
      disabled={busy}
      aria-label={confirmingDelete ? t("detail.deleteConfirm") : t("detail.delete")}
      onClick={() => {
        if (confirmingDelete) {
          setBusy(true);
          void onDelete(ticket).finally(() => setBusy(false));
        } else {
          setConfirmingDelete(true);
        }
      }}
    >
      {confirmingDelete ? t("detail.deleteConfirm") : t("detail.delete")}
    </button>
  );

  return (
    <ModalShell open onClose={onClose} labelId="tk-detail-title">
      <h2 className="tk-dialog-title" id="tk-detail-title">
        <span className="tk-card-id">{ticket.frontmatter.id}</span>
        {readOnly ? (
          <span>{ticket.frontmatter.title}</span>
        ) : (
          <input
            className="tk-input"
            style={{ flex: "1 1 240px" }}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label={t("field.title")}
          />
        )}
        <PriorityBadge priority={ticket.frontmatter.priority} />
      </h2>
      {readOnly && <p className="tk-alert tk-alert--warning">{t("detail.archivedNotice")}</p>}
      <div className="tk-card-meta" style={{ marginBottom: 12 }}>
        <span>
          {t("field.createdAt")}: {formatLocalDate(ticket.frontmatter.created_at, locale)}
        </span>
        <span>
          {t("field.updatedAt")}: {formatLocalDate(ticket.frontmatter.updated_at, locale)}
        </span>
        {ticket.frontmatter.creator && (
          <span>
            {t("field.creator")}: {ticket.frontmatter.creator}
          </span>
        )}
        {ticket.frontmatter.ai_confidence !== undefined && (
          <span>
            {t("field.aiConfidence")}: {ticket.frontmatter.ai_confidence}
          </span>
        )}
        <LabelChips labels={ticket.frontmatter.labels} />
      </div>
      {!readOnly && (
        <div className="tk-form-grid">
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-status">
              {t("field.status")}
            </label>
            <select
              id="tk-detail-status"
              className="tk-select"
              value={status}
              onChange={(event) => setStatus(event.target.value as TicketStatus)}
            >
              {TICKET_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-priority">
              {t("field.priority")}
            </label>
            <select
              id="tk-detail-priority"
              className="tk-select"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TicketPriority)}
            >
              {TICKET_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`priority.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-assignee">
              {t("field.assignee")}
            </label>
            <input
              id="tk-detail-assignee"
              className="tk-input"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            />
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-labels">
              {t("field.labels")}
            </label>
            <input
              id="tk-detail-labels"
              className="tk-input"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
            />
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-deps">
              {t("field.dependencies")}
            </label>
            <input
              id="tk-detail-deps"
              className="tk-input"
              value={dependencies}
              onChange={(event) => setDependencies(event.target.value)}
              placeholder="T-1, T-2"
            />
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-estimate">
              {t("field.estimate")}
            </label>
            <input
              id="tk-detail-estimate"
              className="tk-input"
              inputMode="decimal"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-progress">
              {t("field.progress")}
            </label>
            <input
              id="tk-detail-progress"
              className="tk-input"
              inputMode="numeric"
              value={progress}
              onChange={(event) => setProgress(event.target.value)}
            />
          </div>
        </div>
      )}
      {dependencyIds.length > 0 && (
        <div className="tk-deps" style={{ marginBottom: 12 }}>
          <span className="tk-label">{t("field.dependencies")}:</span>
          {dependencyIds.map((id) => {
            const dep = byId.get(id);
            return dep ? (
              <button key={id} type="button" className="tk-link-btn" onClick={() => onOpenTicket(dep)}>
                {id}
              </button>
            ) : (
              <span key={id} className="tk-chip">
                {id} {t("detail.dependencyMissing", { id })}
              </span>
            );
          })}
        </div>
      )}
      <div className="tk-fieldset">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="tk-label">{t("detail.bodyLabel")}</span>
          {!readOnly && (
            <button type="button" className="tk-btn" onClick={() => setEditingBody(!editingBody)}>
              {editingBody ? t("detail.preview") : t("detail.editBody")}
            </button>
          )}
        </div>
        {editingBody && !readOnly ? (
          <textarea
            className="tk-textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label={t("detail.bodyLabel")}
          />
        ) : (
          <div className="tk-body-view">{renderBody ? renderBody(body) : <pre>{body}</pre>}</div>
        )}
      </div>
      {!readOnly && (
        <>
          <div className="tk-fieldset" style={{ marginTop: 12 }}>
            <label className="tk-label" htmlFor="tk-detail-message">
              {t("detail.commitMessage")}
            </label>
            <input
              id="tk-detail-message"
              className="tk-input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={`ticket: update ${ticket.frontmatter.id}`}
            />
          </div>
          <div className="tk-dialog-actions">
            {deleteButton}
            {ticket.frontmatter.status === "completed" && (
              <button
                type="button"
                className="tk-btn tk-btn--danger"
                disabled={busy}
                onClick={() => void onArchive(ticket)}
              >
                {t("detail.archive")}
              </button>
            )}
            <button type="button" className="tk-btn" onClick={onClose}>
              {t("detail.close")}
            </button>
            <button type="button" className="tk-btn tk-btn--primary" disabled={busy} onClick={() => void handleSave()}>
              {t("detail.save")}
            </button>
          </div>
          <div className="tk-comment">
            <label className="tk-label" htmlFor="tk-detail-comment">
              {t("detail.commentHeading")}
            </label>
            <textarea
              id="tk-detail-comment"
              className="tk-textarea"
              style={{ minHeight: 72 }}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={t("detail.commentPlaceholder")}
            />
            <div className="tk-dialog-actions">
              <button
                type="button"
                className="tk-btn"
                disabled={busy || commentText.trim() === ""}
                onClick={() => void handleComment()}
              >
                {t("detail.postComment")}
              </button>
            </div>
          </div>
        </>
      )}
      {readOnly && (
        <div className="tk-dialog-actions">
          {deleteButton}
          <button type="button" className="tk-btn" onClick={onClose}>
            {t("detail.close")}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
