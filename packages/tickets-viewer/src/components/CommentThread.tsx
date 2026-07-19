"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TicketComment } from "@anytime-markdown/tickets-core";

import { formatLocalDate } from "./parts";

export interface CommentThreadProps {
  comments: TicketComment[];
  /**
   * この author と一致するコメントのみ編集可（FR-6: 同一担当者のみ編集）。
   * 未指定（アーカイブ済み等）は全件閲覧のみ。
   */
  editableAuthor?: string;
  busy: boolean;
  onEditSave: (index: number, text: string) => Promise<boolean>;
  /** サニタイズ済みリッチ表示のレンダラ（ダイアログから引き継ぐ。未指定時はソース表示） */
  renderBody?: (markdown: string) => ReactNode;
}

/**
 * Comments セクションのコメント単位折りたたみリスト。
 * 既定は全件折りたたみ・最新 1 件のみ展開（FR-6）。
 * 展開状態は mount 時に確定するため、チケット切替時は親が key で remount する契約
 * （フォームリセットと同じ resetKey を使い、リセット単位と remount 単位を揃える）。
 */
export function CommentThread(props: Readonly<CommentThreadProps>) {
  const { comments, editableAuthor, busy, onEditSave, renderBody } = props;
  const t = useTranslations("tickets");
  const locale = useLocale();
  const [expanded, setExpanded] = useState<readonly number[]>(() => (comments.length > 0 ? [comments.length - 1] : []));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const toggle = (index: number) => {
    setExpanded((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  };

  const handleEditSave = async (index: number) => {
    const ok = await onEditSave(index, editText.trim());
    if (ok) {
      setEditingIndex(null);
    }
  };

  if (comments.length === 0) {
    return <p className="tk-comment-empty">{t("detail.commentEmpty")}</p>;
  }

  return (
    <div className="tk-comment-thread">
      {comments.map((comment, index) => {
        const isExpanded = expanded.includes(index);
        const isEditing = editingIndex === index;
        const canEdit = editableAuthor !== undefined && comment.author === editableAuthor;
        const bodyId = `tk-comment-body-${index}`;
        return (
          // Why not: author+timestamp は同時刻投稿で重複し得るため index を key に含める。
          // 並びは本文の記載順で安定しており、追加・編集で ticket.version が変わると
          // 親の key remount で全体が作り直されるため index key の並べ替え問題は生じない。
          <div className="tk-comment-item" key={`${comment.timestamp}:${index}`}>
            <button
              type="button"
              className="tk-comment-item-header"
              aria-expanded={isExpanded}
              aria-controls={bodyId}
              onClick={() => toggle(index)}
            >
              <span className="tk-comment-author" data-author={comment.author}>
                {comment.author}
              </span>
              <span className="tk-comment-date">{formatLocalDate(comment.timestamp, locale)}</span>
              <span className="tk-comment-caret" aria-hidden="true">
                {isExpanded ? "▾" : "▸"}
              </span>
            </button>
            {isExpanded && (
              <div className="tk-comment-item-body" id={bodyId}>
                {isEditing ? (
                  <>
                    <textarea
                      className="tk-textarea"
                      style={{ minHeight: 72 }}
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      aria-label={t("detail.commentEdit")}
                    />
                    <div className="tk-dialog-actions">
                      <button type="button" className="tk-btn" disabled={busy} onClick={() => setEditingIndex(null)}>
                        {t("detail.commentEditCancel")}
                      </button>
                      <button
                        type="button"
                        className="tk-btn tk-btn--primary"
                        disabled={busy || editText.trim() === ""}
                        onClick={() => void handleEditSave(index)}
                      >
                        {t("detail.commentEditSave")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {renderBody ? renderBody(comment.text) : <pre>{comment.text}</pre>}
                    {canEdit && (
                      <div className="tk-dialog-actions">
                        <button
                          type="button"
                          className="tk-btn"
                          disabled={busy}
                          onClick={() => {
                            setEditingIndex(index);
                            setEditText(comment.text);
                          }}
                        >
                          {t("detail.commentEdit")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
