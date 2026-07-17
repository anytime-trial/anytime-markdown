"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  TICKET_ASSIGNEES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import type { CreateTicketClientInput } from "../ticketsClient";
import { ModalShell } from "./ModalShell";

export interface TicketCreateDialogProps {
  open: boolean;
  currentUser?: string;
  onClose: () => void;
  onCreate: (input: CreateTicketClientInput) => Promise<boolean>;
}

export function TicketCreateDialog({
  open,
  currentUser,
  onClose,
  onCreate,
}: Readonly<TicketCreateDialogProps>) {
  const t = useTranslations("tickets");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TicketStatus>("backlog");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [workspace, setWorkspace] = useState<TicketWorkspace | "">("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") {
      setTitleError(true);
      return;
    }
    setSubmitting(true);
    const ok = await onCreate({
      title: title.trim(),
      status,
      priority,
      assignee: assignee.trim() === "" ? undefined : assignee.trim(),
      workspace: workspace === "" ? undefined : workspace,
      creator: currentUser,
      description: description.trim() === "" ? undefined : description.trim(),
    });
    setSubmitting(false);
    if (ok) {
      setTitle("");
      setAssignee("");
      setWorkspace("");
      setDescription("");
      onClose();
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} labelId="tk-create-title">
      <h2 className="tk-dialog-title" id="tk-create-title">
        {t("create.heading")}
      </h2>
      <form onSubmit={handleSubmit}>
        <div className="tk-fieldset" style={{ marginBottom: 12 }}>
          <label className="tk-label" htmlFor="tk-create-title-input">
            {t("field.title")}
          </label>
          <input
            id="tk-create-title-input"
            className="tk-input"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(false);
            }}
            aria-invalid={titleError}
          />
          {titleError && (
            <span className="tk-alert tk-alert--error" role="alert">
              {t("create.titleRequired")}
            </span>
          )}
        </div>
        <div className="tk-form-grid">
          <div className="tk-fieldset">
            <label className="tk-label" htmlFor="tk-create-status">
              {t("field.status")}
            </label>
            <select
              id="tk-create-status"
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
            <label className="tk-label" htmlFor="tk-create-priority">
              {t("field.priority")}
            </label>
            <select
              id="tk-create-priority"
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
            <label className="tk-label" htmlFor="tk-create-assignee">
              {t("field.assignee")}
            </label>
            <select
              id="tk-create-assignee"
              className="tk-select"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
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
            <label className="tk-label" htmlFor="tk-create-workspace">
              {t("field.workspace")}
            </label>
            <select
              id="tk-create-workspace"
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
        </div>
        <div className="tk-fieldset">
          <label className="tk-label" htmlFor="tk-create-description">
            {t("create.description")}
          </label>
          <textarea
            id="tk-create-description"
            className="tk-textarea"
            style={{ minHeight: 100 }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="tk-dialog-actions">
          <button type="button" className="tk-btn" onClick={onClose}>
            {t("create.cancel")}
          </button>
          <button type="submit" className="tk-btn tk-btn--primary" disabled={submitting}>
            {t("create.submit")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
