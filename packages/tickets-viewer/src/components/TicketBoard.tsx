"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { TICKET_STATUSES, type TicketStatus } from "@anytime-markdown/tickets-core";

import type { TicketItem } from "../ticketsClient";
import { TicketCard } from "./TicketCard";

export interface TicketBoardProps {
  tickets: TicketItem[];
  onOpen: (ticket: TicketItem) => void;
  onMoveStatus: (ticket: TicketItem, status: TicketStatus) => void;
}

function BoardColumn({
  status,
  tickets,
  onOpen,
}: Readonly<{ status: TicketStatus; tickets: TicketItem[]; onOpen: (ticket: TicketItem) => void }>) {
  const t = useTranslations("tickets");
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={isOver ? "tk-column tk-column--over" : "tk-column"}
      aria-label={t(`status.${status}`)}
      data-status={status}
    >
      <div className="tk-column-header">
        <span>{t(`status.${status}`)}</span>
        <span className="tk-column-count">{tickets.length}</span>
      </div>
      <div className="tk-column-cards">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.path} ticket={ticket} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export function TicketBoard({ tickets, onOpen, onMoveStatus }: Readonly<TicketBoardProps>) {
  const [active, setActive] = useState<TicketItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current as { ticket?: TicketItem } | undefined)?.ticket ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const ticket = (event.active.data.current as { ticket?: TicketItem } | undefined)?.ticket;
    const overId = event.over?.id;
    if (!ticket || typeof overId !== "string") {
      return;
    }
    if (TICKET_STATUSES.includes(overId as TicketStatus)) {
      onMoveStatus(ticket, overId as TicketStatus);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="tk-board">
        {TICKET_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tickets={tickets.filter((ticket) => ticket.frontmatter.status === status)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{active && <TicketCard ticket={active} onOpen={() => {}} overlay />}</DragOverlay>
    </DndContext>
  );
}
