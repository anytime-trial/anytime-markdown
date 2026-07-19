/**
 * /api/tickets (GET/POST/PUT/DELETE) と /api/tickets/archive (POST) のユニットテスト。
 * ドメインロジックは tickets-core 側で検証済みのため、ここでは配線
 * （認証 401 / provider・パラメータ 400 / バリデーション 400 / 409 変換 / version 契約）を検証する。
 */

const mockGetGitHubToken = jest.fn();
const mockProviderList = jest.fn();
const mockProviderCreate = jest.fn();
const mockProviderUpdate = jest.fn();
const mockProviderRemove = jest.fn();
const mockProviderArchive = jest.fn();
const mockCreateTicketProvider = jest.fn((..._args: unknown[]) => ({
  kind: "github-contents",
  list: (...args: unknown[]) => mockProviderList(...args),
  create: (...args: unknown[]) => mockProviderCreate(...args),
  update: (...args: unknown[]) => mockProviderUpdate(...args),
  remove: (...args: unknown[]) => mockProviderRemove(...args),
  archive: (...args: unknown[]) => mockProviderArchive(...args),
}));

jest.mock("../lib/githubAuth", () => ({
  getGitHubToken: mockGetGitHubToken,
}));

jest.mock("@anytime-markdown/tickets-core", () => {
  const actual = jest.requireActual("@anytime-markdown/tickets-core");
  return {
    ...actual,
    createTicketProvider: (...args: unknown[]) => mockCreateTicketProvider(...args),
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

import { TicketConflictError } from "@anytime-markdown/tickets-core";
import { DELETE, GET, POST, PUT } from "../app/api/tickets/route";
import { POST as ARCHIVE_POST } from "../app/api/tickets/archive/route";

type MockResp = { _body: Record<string, unknown>; _status: number };
type AnyRequest = import("next/server").NextRequest;

function getRequest(params: Record<string, string>): AnyRequest {
  return { nextUrl: { searchParams: new URLSearchParams(params) } } as unknown as AnyRequest;
}

function bodyRequest(body: Record<string, unknown>): AnyRequest {
  return { json: async () => body } as unknown as AnyRequest;
}

const FM = {
  id: "T-1",
  title: "first",
  status: "backlog",
  priority: "low",
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-19T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGitHubToken.mockResolvedValue("tok");
});

describe("GET /api/tickets", () => {
  it("未認証は 401", async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const res = (await GET(getRequest({ repo: "o/r", branch: "main" }))) as unknown as MockResp;
    expect(res._status).toBe(401);
  });

  it("不正な provider は 400（enum 検証・黙って既定へ倒さない）", async () => {
    const res = (await GET(getRequest({ repo: "o/r", branch: "main", provider: "backlog" }))) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(String(res._body.error)).toContain("provider");
    expect(mockCreateTicketProvider).not.toHaveBeenCalled();
  });

  it("既定は github-contents プロバイダで list を呼ぶ", async () => {
    mockProviderList.mockResolvedValue({ tickets: [], invalid: [] });
    const res = (await GET(getRequest({ repo: "o/r", branch: "main", includeArchive: "1" }))) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(mockCreateTicketProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github-contents", repo: "o/r", branch: "main", token: "tok" }),
    );
    expect(mockProviderList).toHaveBeenCalledWith({ includeArchive: true });
  });

  it("github-issues 指定は branch なしで解決する", async () => {
    mockProviderList.mockResolvedValue({ tickets: [], invalid: [] });
    const res = (await GET(getRequest({ repo: "o/r", provider: "github-issues" }))) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(mockCreateTicketProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github-issues", repo: "o/r", token: "tok" }),
    );
  });

  it("github-contents で branch 欠落は 400", async () => {
    const res = (await GET(getRequest({ repo: "o/r" }))) as unknown as MockResp;
    expect(res._status).toBe(400);
  });
});

describe("PUT /api/tickets（version 契約）", () => {
  const putBody = {
    repo: "o/r",
    branch: "main",
    path: ".tickets/T-1-first.md",
    version: "v1",
    frontmatter: FM,
    extras: {},
    body: "",
  };

  it("version 欠落は 400", async () => {
    const res = (await PUT(bodyRequest({ ...putBody, version: undefined as unknown as string }))) as unknown as MockResp;
    expect(res._status).toBe(400);
    expect(String(res._body.error)).toContain("version");
  });

  it("updated_at を自動設定し、provider.update へ version を渡す", async () => {
    mockProviderUpdate.mockResolvedValue({ path: putBody.path, version: "v2", commitId: "c1" });
    const res = (await PUT(bodyRequest(putBody))) as unknown as MockResp;
    expect(res._status).toBe(200);
    const arg = mockProviderUpdate.mock.calls[0][0] as { version: string; content: string };
    expect(arg.version).toBe("v1");
    expect(res._body.version).toBe("v2");
    expect(String(res._body.updated_at)).not.toBe(FM.updated_at);
  });

  it("競合は 409 + conflict: true", async () => {
    mockProviderUpdate.mockRejectedValue(new TicketConflictError(409, "他の更新が先行しました"));
    const res = (await PUT(bodyRequest(putBody))) as unknown as MockResp;
    expect(res._status).toBe(409);
    expect(res._body.conflict).toBe(true);
  });
});

describe("POST /api/tickets", () => {
  it("作成は 201 で TicketRecord を返す", async () => {
    mockProviderCreate.mockResolvedValue({
      path: ".tickets/T-9-x.md",
      version: "v9",
      frontmatter: { ...FM, id: "T-9" },
      extras: {},
      body: "",
      archived: false,
    });
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "x", status: "backlog", priority: "low" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(201);
    expect(res._body.version).toBe("v9");
  });

  it("assignee の enum 違反は 400", async () => {
    const res = (await POST(
      bodyRequest({ repo: "o/r", branch: "main", title: "x", status: "backlog", priority: "low", assignee: "bot" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
  });
});

describe("DELETE /api/tickets・POST /api/tickets/archive", () => {
  it("削除は provider.remove へ version を渡す", async () => {
    mockProviderRemove.mockResolvedValue(undefined);
    const res = (await DELETE(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-first.md", version: "v1" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(mockProviderRemove).toHaveBeenCalledWith(
      expect.objectContaining({ path: ".tickets/T-1-first.md", version: "v1" }),
    );
  });

  it("アーカイブは newPath を返す", async () => {
    mockProviderArchive.mockResolvedValue({ newPath: ".tickets/archive/T-1-first.md" });
    const res = (await ARCHIVE_POST(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-first.md", version: "v1" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(200);
    expect(res._body.newPath).toBe(".tickets/archive/T-1-first.md");
  });

  it("version 欠落は 400", async () => {
    const res = (await ARCHIVE_POST(
      bodyRequest({ repo: "o/r", branch: "main", path: ".tickets/T-1-first.md" }),
    )) as unknown as MockResp;
    expect(res._status).toBe(400);
  });
});
