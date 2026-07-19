import { type NextRequest, NextResponse } from "next/server";

import {
  TICKET_ASSIGNEES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  serializeTicket,
  validateTicketFrontmatter,
  type TicketAssignee,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import {
  resolveTicketProvider,
  resolveTicketProviderFromBody,
  sanitizeExtras,
  ticketErrorResponse,
} from "./helpers";

/**
 * `/api/tickets` — プロバイダ抽象経由のチケット CRUD（採択 RFC の新契約）。
 * 楽観ロックトークンは不透明な `version`（旧 `/api/github/tickets` の `sha` 契約は互換期間中併存）。
 */

/** チケット一覧の一括取得（N+1 をクライアントへ露出しない） */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const provider = await resolveTicketProvider(
    searchParams.get("repo"),
    searchParams.get("branch"),
    searchParams.get("provider"),
  );
  if (provider instanceof NextResponse) {
    return provider;
  }
  try {
    const result = await provider.list({ includeArchive: searchParams.get("includeArchive") === "1" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** 新規チケット作成（自動採番・テンプレート本文） */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const provider = await resolveTicketProviderFromBody(body);
  if (provider instanceof NextResponse) {
    return provider;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const status = body.status as TicketStatus;
  const priority = body.priority as TicketPriority;
  if (title === "" || !TICKET_STATUSES.includes(status) || !TICKET_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "title / status / priority が不正です" }, { status: 400 });
  }
  // assignee / workspace は任意だが、指定されたら enum を厳密検証する（黙って捨てず 400 で拒否する）。
  const assignee = body.assignee === undefined || body.assignee === "" ? undefined : (body.assignee as TicketAssignee);
  if (assignee !== undefined && !TICKET_ASSIGNEES.includes(assignee)) {
    return NextResponse.json({ error: "assignee が不正です" }, { status: 400 });
  }
  const workspace = body.workspace === undefined || body.workspace === "" ? undefined : (body.workspace as TicketWorkspace);
  if (workspace !== undefined && !TICKET_WORKSPACES.includes(workspace)) {
    return NextResponse.json({ error: "workspace が不正です" }, { status: 400 });
  }
  try {
    const created = await provider.create({
      title,
      status,
      priority,
      assignee,
      workspace,
      creator: typeof body.creator === "string" && body.creator !== "" ? body.creator : undefined,
      estimate: typeof body.estimate === "number" ? body.estimate : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      now: new Date().toISOString(),
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** チケット更新（サーバー側バリデーション + updated_at 自動設定 + version 楽観ロック） */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const provider = await resolveTicketProviderFromBody(body);
  if (provider instanceof NextResponse) {
    return provider;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const version = typeof body.version === "string" ? body.version : "";
  const ticketBody = typeof body.body === "string" ? body.body : "";
  if (path === "" || version === "" || typeof body.frontmatter !== "object" || body.frontmatter === null) {
    return NextResponse.json({ error: "path / version / frontmatter が不正です" }, { status: 400 });
  }
  const raw = { ...(body.frontmatter as Record<string, unknown>), updated_at: new Date().toISOString() };
  const validated = validateTicketFrontmatter(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: "バリデーションエラー", errors: validated.errors }, { status: 400 });
  }
  try {
    const result = await provider.update({
      path,
      version,
      content: serializeTicket(validated.value, ticketBody, sanitizeExtras(body.extras)),
      message:
        typeof body.message === "string" && body.message !== ""
          ? body.message
          : `ticket: update ${validated.value.id} ${validated.value.title}`,
    });
    return NextResponse.json({ ...result, updated_at: validated.value.updated_at });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** チケット削除（version 楽観ロック。既定プロバイダでは git 履歴に残る） */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const provider = await resolveTicketProviderFromBody(body);
  if (provider instanceof NextResponse) {
    return provider;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const version = typeof body.version === "string" ? body.version : "";
  if (path === "" || version === "") {
    return NextResponse.json({ error: "path / version が不正です" }, { status: 400 });
  }
  try {
    await provider.remove({
      path,
      version,
      message: typeof body.message === "string" && body.message !== "" ? body.message : undefined,
    });
    return NextResponse.json({ deleted: path });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}
