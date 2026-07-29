import { createHttpTicketsGateway } from "../ticketsGateway";
import { TicketsClientError } from "../ticketsClient";
import type { TicketFrontmatter } from "@anytime-markdown/tickets-core";

const config = { repo: "owner/repo", branch: "main" };

const MINIMAL_FRONTMATTER: TicketFrontmatter = {
  id: "T-1",
  title: "テストチケット",
  status: "backlog",
  priority: "low",
  created_at: "2026-07-29T00:00:00Z",
  updated_at: "2026-07-29T00:00:00Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("createHttpTicketsGateway", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("list は includeArchive をクエリへ載せて GET する", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tickets: [], invalid: [] }));
    const gateway = createHttpTicketsGateway(config);

    const result = await gateway.list(true);

    expect(result).toEqual({ tickets: [], invalid: [] });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("repo=owner%2Frepo");
    expect(url).toContain("includeArchive=1");
  });

  it("save は PUT で version を往復させる", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ version: "v2", updated_at: "2026-07-29T00:00:00Z" }));
    const gateway = createHttpTicketsGateway(config);

    const result = await gateway.save({
      path: ".tickets/T-1.md",
      version: "v1",
      frontmatter: MINIMAL_FRONTMATTER,
      extras: {},
      body: "body",
    });

    expect(result.version).toBe("v2");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });

  it("archive は newPath を返す", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ newPath: ".tickets/archive/T-1.md" }));
    const gateway = createHttpTicketsGateway(config);

    await expect(gateway.archive({ path: ".tickets/T-1.md", version: "v1" })).resolves.toEqual({
      newPath: ".tickets/archive/T-1.md",
    });
  });

  it("409 は conflict フラグの立った TicketsClientError になる", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "conflict" }, 409));
    const gateway = createHttpTicketsGateway(config);

    await expect(gateway.list(false)).rejects.toMatchObject({
      name: "TicketsClientError",
      conflict: true,
      status: 409,
    });
  });

  it("400 は validationErrors を保持する", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid", errors: ["title は必須"] }, 400));
    const gateway = createHttpTicketsGateway(config);

    await expect(gateway.create({ title: "", status: "backlog", priority: "low" })).rejects.toEqual(
      expect.objectContaining({ validationErrors: ["title は必須"] }),
    );
  });

  it("remove は DELETE を投げ、成功時に undefined を返す", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 204));
    const gateway = createHttpTicketsGateway(config);

    await expect(gateway.remove({ path: ".tickets/T-1.md", version: "v1" })).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

it("TicketsClientError は gateway 実装をまたいだ共通エラー契約である", () => {
  const error = new TicketsClientError(409, "conflict", { conflict: true });
  expect(error.conflict).toBe(true);
  expect(error.validationErrors).toEqual([]);
});
