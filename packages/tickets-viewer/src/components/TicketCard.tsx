"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";

import type { TicketItem } from "../ticketsClient";
import { PriorityBadge, TicketEffort, WorkspaceChip } from "./parts";

export interface TicketCardProps {
  ticket: TicketItem;
  onOpen: (ticket: TicketItem) => void;
  /** DragOverlay 内の表示用（ドラッグ配線を持たない） */
  overlay?: boolean;
}

function CardContent({ ticket }: Readonly<{ ticket: TicketItem }>) {
  return (
    <>
      <span className="tk-card-id">{ticket.frontmatter.id}</span>
      <div className="tk-card-title">{ticket.frontmatter.title}</div>
      <div className="tk-card-meta">
        <PriorityBadge priority={ticket.frontmatter.priority} />
        {ticket.frontmatter.assignee && <span>{ticket.frontmatter.assignee}</span>}
        <WorkspaceChip ticket={ticket} />
        <TicketEffort ticket={ticket} />
      </div>
    </>
  );
}

export function TicketCard({ ticket, onOpen, overlay = false }: Readonly<TicketCardProps>) {
  const t = useTranslations("tickets");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.path,
    data: { ticket },
    disabled: overlay || ticket.archived,
  });
  if (overlay) {
    return (
      <div className="tk-card">
        <CardContent ticket={ticket} />
      </div>
    );
  }
  const className = isDragging ? "tk-card tk-card--dragging" : "tk-card";
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Translate.toString(transform) }}
      aria-label={t("board.cardAriaLabel", {
        id: ticket.frontmatter.id,
        title: ticket.frontmatter.title,
      })}
      onClick={() => onOpen(ticket)}
      {...listeners}
      {...attributes}
    >
      <CardContent ticket={ticket} />
    </button>
  );
}
