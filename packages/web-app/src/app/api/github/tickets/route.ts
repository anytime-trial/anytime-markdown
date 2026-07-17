import { type NextRequest, NextResponse } from "next/server";

import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_WORKSPACES,
  createTicket,
  deleteTicket,
  listTickets,
  serializeTicket,
  updateTicketContent,
  validateTicketFrontmatter,
  type TicketPriority,
  type TicketStatus,
  type TicketWorkspace,
} from "@anytime-markdown/tickets-core";

import { fetchWithRetry } from "../../../../lib/fetchWithRetry";
import { resolveRepoParams, sanitizeExtras, ticketErrorResponse } from "./helpers";

/** `.tickets/`（+archive）の一覧を一括取得して返す（N+1 をクライアントへ露出しない） */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const params = await resolveRepoParams(searchParams.get("repo"), searchParams.get("branch"));
  if (params instanceof NextResponse) {
    return params;
  }
  try {
    const result = await listTickets({
      ...params,
      fetchFn: fetchWithRetry,
      includeArchive: searchParams.get("includeArchive") === "1",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** 新規チケット作成（自動採番・テンプレート本文） */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const params = await resolveRepoParams(
    typeof body.repo === "string" ? body.repo : null,
    typeof body.branch === "string" ? body.branch : null,
  );
  if (params instanceof NextResponse) {
    return params;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const status = body.status as TicketStatus;
  const priority = body.priority as TicketPriority;
  if (title === "" || !TICKET_STATUSES.includes(status) || !TICKET_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: "title / status / priority が不正です" }, { status: 400 });
  }
  // workspace は任意だが、指定されたら enum を厳密検証する（黙って捨てず 400 で拒否する）。
  const workspace = body.workspace === undefined || body.workspace === "" ? undefined : (body.workspace as TicketWorkspace);
  if (workspace !== undefined && !TICKET_WORKSPACES.includes(workspace)) {
    return NextResponse.json({ error: "workspace が不正です" }, { status: 400 });
  }
  try {
    const created = await createTicket({
      ...params,
      fetchFn: fetchWithRetry,
      input: {
        title,
        status,
        priority,
        assignee: typeof body.assignee === "string" && body.assignee !== "" ? body.assignee : undefined,
        workspace,
        creator: typeof body.creator === "string" && body.creator !== "" ? body.creator : undefined,
        estimate: typeof body.estimate === "number" ? body.estimate : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        now: new Date().toISOString(),
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** チケット更新（サーバー側バリデーション + updated_at 自動設定 + sha 楽観ロック） */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const params = await resolveRepoParams(
    typeof body.repo === "string" ? body.repo : null,
    typeof body.branch === "string" ? body.branch : null,
  );
  if (params instanceof NextResponse) {
    return params;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const sha = typeof body.sha === "string" ? body.sha : "";
  const ticketBody = typeof body.body === "string" ? body.body : "";
  if (path === "" || sha === "" || typeof body.frontmatter !== "object" || body.frontmatter === null) {
    return NextResponse.json({ error: "path / sha / frontmatter が不正です" }, { status: 400 });
  }
  const raw = { ...(body.frontmatter as Record<string, unknown>), updated_at: new Date().toISOString() };
  const validated = validateTicketFrontmatter(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: "バリデーションエラー", errors: validated.errors }, { status: 400 });
  }
  try {
    const result = await updateTicketContent({
      ...params,
      fetchFn: fetchWithRetry,
      input: {
        path,
        sha,
        content: serializeTicket(validated.value, ticketBody, sanitizeExtras(body.extras)),
        message:
          typeof body.message === "string" && body.message !== ""
            ? body.message
            : `ticket: update ${validated.value.id} ${validated.value.title}`,
      },
    });
    return NextResponse.json({ ...result, updated_at: validated.value.updated_at });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

/** チケット削除（sha 楽観ロック。git 履歴には残る） */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const params = await resolveRepoParams(
    typeof body.repo === "string" ? body.repo : null,
    typeof body.branch === "string" ? body.branch : null,
  );
  if (params instanceof NextResponse) {
    return params;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const sha = typeof body.sha === "string" ? body.sha : "";
  if (path === "" || sha === "") {
    return NextResponse.json({ error: "path / sha が不正です" }, { status: 400 });
  }
  try {
    await deleteTicket({
      ...params,
      fetchFn: fetchWithRetry,
      input: {
        path,
        sha,
        message: typeof body.message === "string" && body.message !== "" ? body.message : undefined,
      },
    });
    return NextResponse.json({ deleted: path });
  } catch (error) {
    return ticketErrorResponse(error);
  }
}
