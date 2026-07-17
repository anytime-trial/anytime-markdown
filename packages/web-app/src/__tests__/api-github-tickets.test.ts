/**
 * /api/github/tickets (GET/POST/PUT) と /api/github/tickets/archive (POST) のユニットテスト。
 * ドメインロジックは tickets-core 側で検証済みのため、ここでは配線
 * （認証 401 / パラメータ 400 / バリデーション 400 / 409 変換 / updated_at 自動設定）を検証する。
 */

const mockGetGitHubToken = jest.fn();
const mockListTickets = jest.fn();
const mockCreateTicket = jest.fn();
const mockUpdateTicketContent = jest.fn();
const mockArchiveTicket = jest.fn();
const mockDeleteTicket = jest.fn();

jest.mock("../lib/githubAuth", () => ({
  getGitHubToken: mockGetGitHubToken,
}));

jest.mock("@anytime-markdown/tickets-core", () => {
  const actual = jest.requireActual("@anytime-markdown/tickets-core");
  return {
    ...actual,
    listTickets: mockListTickets,
    createTicket: mockCreateTicket,
    updateTicketContent: mockUpdateTicketContent,
    archiveTicket: mockArchiveTicket,
    deleteTicket: mockDeleteTicket,
  };
});

class MockNextResponse {
  _body: unknown;
  _status: number;
  _headers: Record<string, string> = {};

  static json = (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
    const res = new MockNextResponse();
    res._body = body;
    res._status = init?.status ?? 200;
    res._headers = init?.headers ?? {};
    return res;
  };
}

jest.mock("next/server", () => ({
  NextResponse: MockNextResponse,
}));

import { TicketApiError, TicketConflictError } from "@anytime-markdown/tickets-core";
import { DELETE, GET, POST, PUT } from "../app/api/github/tickets/route";
import { POST as ARCHIVE_POST } from "../app/api/github/tickets/archive/route";

type MockResp = { _body: Record<string, unknown>; _status: number };
type AnyRequest = import("next/server").NextRequest;

function getRequest(params: Record<string, string>): AnyRequest {
  return { nextUrl: { searchParams: new URLSearchParams(params) } } as unknown as AnyRequest;
}

function bodyRequest(body: Record<string, unknown>): AnyRequest {
  return { json: async () => body } as unknown as AnyRequest;
}

const VALID_FM = {
  id: "T-1",
  title: "sample",
  status: "up_next",
  priority: "high",
  created_at: "2026-07-16T00:00:00.000Z",
  updated_at: "2026-07-16T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGitHubToken.mockResolvedValue("tok");
});

describe("GET /api/github/tickets", () => {
  it("未認証は 401", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const res = (await GET(getRequest({ repo: "o/r", branch: "main" }))) as unknown as MockResp;
    expect(res._status).toBe(401);
  });

  it("不正な repo は 400", async () => {
    const res = (await GET(getRequest({ repo: "o/r/evil", branch: "main" }))) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(mockListTickets).not.toHaveBeenCalled();
  });

  it("一覧を返し includeArchive=1 を伝搬する", async () => {
    mockListTickets.mockResolvedValue({ tickets: [], invalid: [] });
    const res = (await GET(
      getRequest({ repo: "o/r", branch: "main", includeArchive: "1" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(mockListTickets).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "o/r", branch: "main", token: "tok", includeArchive: true }),
    );
  });
});

describe("POST /api/github/tickets", () => {
  it("title 空は 400", async () => {
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: " ", status: "backlog", priority: "low" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it("enum 外の status は 400", async () => {
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "t", status: "doing", priority: "low" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
  });

  it("作成成功は 201 と作成結果を返す", async () => {
    mockCreateTicket.mockResolvedValue({ path: ".tickets/T-1-t.md", sha: "s" });
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "t", status: "backlog", priority: "low", creator: "kiyotaka" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(201);
    const input = mockCreateTicket.mock.calls[0][0].input;
    expect(input.creator).toBe("kiyotaka");
    expect(input.now).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("workspace を createTicket へ渡す", async () => {
    mockCreateTicket.mockResolvedValue({ path: ".tickets/T-1-t.md", sha: "s" });
    const res = (await POST(
      bodyRequest({
        repo: "o/r",
        branch: "main",
        title: "t",
        status: "up_next",
        priority: "low",
        assignee: "agent",
        workspace: "anytime-trade",
      }),
    )) as unknown as MockResp;
    expect(res._status).toBe(201);
    const input = mockCreateTicket.mock.calls[0][0].input;
    expect(input.workspace).toBe("anytime-trade");
    expect(input.assignee).toBe("agent");
  });

  it("enum 外の assignee は 400（黙って捨てない）", async () => {
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "t", status: "backlog", priority: "low", assignee: "claude-code" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it("enum 外の workspace は 400（黙って捨てない）", async () => {
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "t", status: "backlog", priority: "low", workspace: "bogus" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it("workspace 未指定は undefined として渡す", async () => {
    mockCreateTicket.mockResolvedValue({ path: ".tickets/T-1-t.md", sha: "s" });
    await POST(bodyRequest({ repo: "o/r", branch: "main", title: "t", status: "backlog", priority: "low" }));
    expect(mockCreateTicket.mock.calls[0][0].input.workspace).toBeUndefined();
  });
});

describe("PUT /api/github/tickets", () => {
  const putBody = {
    repo: "o/r",
    branch: "main",
    path: ".tickets/T-1-sample.md",
    sha: "old-sha",
    frontmatter: VALID_FM,
    body: "## 概要 (Description)\n\nx\n",
  };

  it("フロントマター不正は 400 で errors を返す", async () => {
    const res = (await PUT(
      bodyRequest({ ...putBody, frontmatter: { ...VALID_FM, status: "doing" } }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(res._body.errors).toBeDefined();
    expect(mockUpdateTicketContent).not.toHaveBeenCalled();
  });

  it("updated_at をサーバー側で更新して直列化内容に含める", async () => {
    mockUpdateTicketContent.mockResolvedValue({ path: putBody.path, sha: "new", commitSha: "c" });
    const res = (await PUT(bodyRequest(putBody))) as unknown as MockResp;
    expect(res._status).toBe(200);
    const input = mockUpdateTicketContent.mock.calls[0][0].input;
    expect(input.sha).toBe("old-sha");
    expect(input.content).toContain("id: T-1");
    expect(input.content).not.toContain("updated_at: 2026-07-16T00:00:00.000Z");
  });

  it("競合（TicketConflictError）は 409 + conflict:true", async () => {
    mockUpdateTicketContent.mockRejectedValue(new TicketConflictError(409, "conflict"));
    const res = (await PUT(bodyRequest(putBody))) as unknown as MockResp;
    expect(res._status).toBe(409);
    expect(res._body.conflict).toBe(true);
  });
});

describe("DELETE /api/github/tickets", () => {
  it("sha 欠落は 400 で deleteTicket を呼ばない", async () => {
    const res = (await DELETE(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-a.md" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(mockDeleteTicket).not.toHaveBeenCalled();
  });

  it("成功時は deleted を返す", async () => {
    mockDeleteTicket.mockResolvedValue(undefined);
    const res = (await DELETE(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-a.md", sha: "s1" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(res._body.deleted).toBe(".tickets/T-1-a.md");
    expect(mockDeleteTicket.mock.calls[0][0].input.sha).toBe("s1");
  });

  it("競合は 409 + conflict:true", async () => {
    mockDeleteTicket.mockRejectedValue(new TicketConflictError(409, "conflict"));
    const res = (await DELETE(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-a.md", sha: "old" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(409);
    expect(res._body.conflict).toBe(true);
  });
});

describe("POST /api/github/tickets/archive", () => {
  it("path / sha 欠落は 400", async () => {
    const res = (await ARCHIVE_POST(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-a.md" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
  });

  it("TicketApiError の status を透過する", async () => {
    mockArchiveTicket.mockRejectedValue(new TicketApiError(400, "すでにアーカイブ済みです"));
    const res = (await ARCHIVE_POST(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/archive/T-1-a.md", sha: "s" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
  });

  it("成功時は newPath を返す", async () => {
    mockArchiveTicket.mockResolvedValue({ newPath: ".tickets/archive/T-1-a.md" });
    const res = (await ARCHIVE_POST(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-a.md", sha: "s" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect((res._body as { newPath: string }).newPath).toBe(".tickets/archive/T-1-a.md");
  });
});
