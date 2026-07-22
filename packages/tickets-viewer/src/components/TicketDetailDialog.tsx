"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  TICKET_ASSIGNEES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  joinCommentsSection,
  parseComments,
  replaceCommentText,
  splitCommentsSection,
  type TicketAssignee,
  type TicketFrontmatter,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import type { SaveTicketInput, TicketItem } from "../ticketsClient";
import { CommentThread } from "./CommentThread";
import { ModalShell } from "./ModalShell";
import { PriorityBadge, formatLocalDate } from "./parts";

/**
 * web-app からの投稿・編集の操作者（FR-6）。担当（assignee）と同じ 2 値モデルの user 固定。
 * ログイン名を使わないのは、セッションごとに可変で「同じ担当者のみ編集可」の判定が
 * 担当モデルと一致しなくなるため。AI エージェント側は `agent` 固定で追記する。
 */
const WEB_ACTOR = "user";

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

/** フォーム各欄の編集値（チケット由来の初期値と、切替時のリセット値の単一の出所）。 */
interface TicketFormState {
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: TicketAssignee | "";
  workspace: TicketWorkspace | "";
  dependencies: string;
  estimate: string;
  actual: string;
  body: string;
}

/** チケット（未選択なら null）からフォームの表示値を導出する。 */
function toFormState(ticket: TicketItem | null): TicketFormState {
  if (!ticket) {
    return {
      title: "",
      status: "backlog",
      priority: "medium",
      assignee: "",
      workspace: "",
      dependencies: "",
      estimate: "",
      actual: "",
      body: "",
    };
  }
  const fm = ticket.frontmatter;
  return {
    title: fm.title,
    status: fm.status,
    priority: fm.priority,
    assignee: fm.assignee ?? "",
    workspace: fm.workspace ?? "",
    dependencies: (fm.dependencies ?? []).join(", "),
    estimate: fm.estimate === undefined ? "" : String(fm.estimate),
    actual: fm.actual === undefined ? "" : String(fm.actual),
    // FR-6: 本文編集は Comments セクションを対象外にする（コメント編集制限を本文編集で
    // 迂回させない）。Comments は保存時に joinCommentsSection で再結合する。
    body: splitCommentsSection(ticket.body).content,
  };
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
  const resetKey = ticket ? `${ticket.path}:${ticket.version}` : "";
  const initial = toFormState(ticket);

  const [formKey, setFormKey] = useState(resetKey);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<TicketStatus>(initial.status);
  const [priority, setPriority] = useState<TicketPriority>(initial.priority);
  const [assignee, setAssignee] = useState<TicketAssignee | "">(initial.assignee);
  const [workspace, setWorkspace] = useState<TicketWorkspace | "">(initial.workspace);
  const [dependencies, setDependencies] = useState(initial.dependencies);
  const [estimate, setEstimate] = useState(initial.estimate);
  const [actual, setActual] = useState(initial.actual);
  const [body, setBody] = useState(initial.body);
  const [editingBody, setEditingBody] = useState(false);
  const [message, setMessage] = useState("");
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Why not: 初期化を useEffect（mount 後）でやると、初回レンダーは全フィールドが空のまま
  // 子へ渡る。renderBody で注入される vanilla ビューは mount-once（initialContent は生成時
  // オプションで、変更は consumer の key remount 契約）なので、空文字で mount されたきり
  // 更新されず本文が白紙になる。React 公式の「prop 変化に合わせてレンダー中に state を
  // 調整する」パターンで、初回から実データを持たせる。
  if (formKey !== resetKey) {
    const next = toFormState(ticket);
    setFormKey(resetKey);
    setTitle(next.title);
    setStatus(next.status);
    setPriority(next.priority);
    setAssignee(next.assignee);
    setWorkspace(next.workspace);
    setDependencies(next.dependencies);
    setEstimate(next.estimate);
    setActual(next.actual);
    setBody(next.body);
    setEditingBody(false);
    setMessage("");
    setCommentText("");
    setConfirmingDelete(false);
  }

  const byId = useMemo(() => {
    const map = new Map<string, TicketItem>();
    for (const item of allTickets) {
      map.set(item.frontmatter.id, item);
    }
    return map;
  }, [allTickets]);

  const comments = useMemo(() => parseComments(ticket?.body ?? ""), [ticket]);

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
      // 本文フォームは Comments 除外済み（toFormState）。最新の ticket.body から
      // Comments セクションを取り直して再結合する（フォームを開いた後に追記された
      // コメントを本文保存で巻き戻さない）。
      body: joinCommentsSection(body, splitCommentsSection(ticket.body).commentsSection),
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
    const ok = await onComment(ticket, WEB_ACTOR, commentText.trim());
    setBusy(false);
    if (ok) {
      setCommentText("");
    }
  };

  const handleCommentEdit = async (index: number, text: string): Promise<boolean> => {
    const nextBody = replaceCommentText(ticket.body, index, text);
    if (nextBody === null) {
      console.warn(
        `[${new Date().toISOString()}] [WARN] tickets: コメント編集対象が見つかりません (${ticket.path} index=${index})`,
      );
      return false;
    }
    setBusy(true);
    const ok = await onSave({
      path: ticket.path,
      version: ticket.version,
      // Why not: フォームの編集中値（buildFrontmatter）を混ぜると、コメント編集の保存が
      // 未確定のフィールド変更まで一緒にコミットしてしまう。コメント編集は投稿と同じく
      // チケットの現在値に対する独立操作にする。
      frontmatter: ticket.frontmatter,
      extras: ticket.extras,
      body: nextBody,
      message: `ticket: ${ticket.frontmatter.id} edit comment`,
    });
    setBusy(false);
    return ok;
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
          /* Why not: renderBody で注入される vanilla ビューは mount-once（initialContent は生成時
             オプション）。依存チケットのリンクはダイアログを開いたまま ticket を差し替えるため、
             key を付けないとプレビューだけ前のチケットの本文を表示し続ける。フォームのリセットと
             同じ resetKey を使い、「状態がリセットされる時は必ずプレビューも作り直す」で揃える。 */
          <div className="tk-body-view" key={`body:${resetKey}`}>
            {renderBody ? renderBody(body) : <pre>{body}</pre>}
          </div>
        )}
      </div>
      <div className="tk-comment">
        <span className="tk-label">{t("detail.commentHeading")}</span>
        {/* 展開状態（最新のみ展開）は mount 時に確定するため、フォームリセットと同じ
            resetKey で remount させる（リセット単位と remount 単位を揃える） */}
        <CommentThread
          key={`comments:${resetKey}`}
          comments={comments}
          editableAuthor={readOnly ? undefined : WEB_ACTOR}
          busy={busy}
          onEditSave={handleCommentEdit}
          renderBody={renderBody}
        />
        {!readOnly && (
          <>
            <textarea
              id="tk-detail-comment"
              className="tk-textarea"
              style={{ minHeight: 72 }}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={t("detail.commentPlaceholder")}
              aria-label={t("detail.postComment")}
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
          </>
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
