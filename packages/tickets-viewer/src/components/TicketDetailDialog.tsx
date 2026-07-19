"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  TICKET_ASSIGNEES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  type TicketAssignee,
  type TicketFrontmatter,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import type { SaveTicketInput, TicketItem } from "../ticketsClient";
import { ModalShell } from "./ModalShell";
import { PriorityBadge, formatLocalDate } from "./parts";

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
  const [assignee, setAssignee] = useState<TicketAssignee | "">("");
  const [workspace, setWorkspace] = useState<TicketWorkspace | "">("");
  const [dependencies, setDependencies] = useState("");
  const [estimate, setEstimate] = useState("");
  const [actual, setActual] = useState("");
  const [body, setBody] = useState("");
  const [editingBody, setEditingBody] = useState(false);
  const [message, setMessage] = useState("");
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const resetKey = ticket ? `${ticket.path}:${ticket.version}` : "";
  useEffect(() => {
    if (!ticket) {
      return;
    }
    const fm = ticket.frontmatter;
    setTitle(fm.title);
    setStatus(fm.status);
    setPriority(fm.priority);
    setAssignee(fm.assignee ?? "");
    setWorkspace(fm.workspace ?? "");
    setDependencies((fm.dependencies ?? []).join(", "));
    setEstimate(fm.estimate === undefined ? "" : String(fm.estimate));
    setActual(fm.actual === undefined ? "" : String(fm.actual));
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
    fm.assignee = assignee === "" ? undefined : assignee;
    fm.workspace = workspace === "" ? undefined : workspace;
    fm.dependencies = splitList(dependencies);
    fm.estimate = parseOptionalNumber(estimate);
    fm.actual = parseOptionalNumber(actual);
    return fm;
  };

  const handleSave = async () => {
    setBusy(true);
    const fm = buildFrontmatter();
    const ok = await onSave({
      path: ticket.path,
      version: ticket.version,
      frontmatter: fm,
      extras: ticket.extras,
      body,
      message: message.trim() === "" ? `ticket: update ${fm.id} ${fm.title}` : message.trim(),
    });
    setBusy(false);
    // Why not: 失敗時も閉じると入力中の編集内容が失われ再入力を強いるため、成功時のみ閉じる
    if (ok) {
      onClose();
    }
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
            <select
              id="tk-detail-assignee"
              className="tk-select"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value as TicketAssignee | "")}
            >
              <option value="">{t("assignee.none")}</option>
              {TICKET_ASSIGNEES.map((value) => (
                <option key={value} value={value}>
                  {t(`assignee.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-detail-workspace">
              {t("field.workspace")}
            </label>
            <select
              id="tk-detail-workspace"
              className="tk-select"
              value={workspace}
              onChange={(event) => setWorkspace(event.target.value as TicketWorkspace | "")}
            >
              <option value="">{t("workspace.none")}</option>
              {TICKET_WORKSPACES.map((value) => (
                <option key={value} value={value}>
                  {t(`workspace.${value}`)}
                </option>
              ))}
            </select>
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
            <label className="tk-label" htmlFor="tk-detail-actual">
              {t("field.actual")}
            </label>
            <input
              id="tk-detail-actual"
              className="tk-input"
              inputMode="numeric"
              value={actual}
              onChange={(event) => setActual(event.target.value)}
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
            {/* Why not: 編集可能なチケットでは離脱＝編集の破棄なので「閉じる」ではなく「キャンセル」。
                読み取り専用（アーカイブ済み）側は取り消す編集が無いため「閉じる」のまま */}
            <button type="button" className="tk-btn" onClick={onClose}>
              {t("detail.cancel")}
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
