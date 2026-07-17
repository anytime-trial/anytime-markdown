import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// next-intl は ESM のため jest では実体を使わず、ja メッセージから解決するモックを当てる
jest.mock("next-intl", () => {
  const { ticketsMessagesJa } = jest.requireActual("../i18n/ja");
  const resolve = (key: string, values?: Record<string, unknown>): string => {
    let node: unknown = ticketsMessagesJa;
    for (const segment of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[segment];
    }
    let text = typeof node === "string" ? node : key;
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
  return {
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
    useTranslations: () => resolve,
    useLocale: () => "ja",
  };
});

import { NextIntlClientProvider } from "next-intl";

import { TicketsPanel } from "../TicketsPanel";
import { ticketsMessagesJa } from "../i18n/ja";
import type { TicketsData } from "../ticketsClient";

const DATA: TicketsData = {
  tickets: [
    {
      path: ".tickets/T-1-first.md",
      sha: "s1",
      frontmatter: {
        id: "T-1",
        title: "最初のチケット",
        status: "up_next",
        priority: "high",
        assignee: "claude-code",
        workspace: "anytime-markdown",
        created_at: "2026-07-15T00:00:00.000Z",
        updated_at: "2026-07-16T00:00:00.000Z",
        estimate: 120,
        actual: 30,
      },
      // 廃止済み属性を持つ既存チケット（未知キーとして往復保存される）
      extras: { labels: ["question"], progress: 40 },
      body: "## 作業タスクリスト (Subtasks)\n\n- [x] a\n- [ ] b\n",
      archived: false,
    },
    {
      path: ".tickets/T-2-second.md",
      sha: "s2",
      frontmatter: {
        id: "T-2",
        title: "2件目",
        status: "backlog",
        priority: "low",
        created_at: "2026-07-15T00:00:00.000Z",
        updated_at: "2026-07-15T00:00:00.000Z",
      },
      extras: {},
      body: "",
      archived: false,
    },
  ],
  invalid: [{ path: ".tickets/broken.md", sha: "s3", reason: "フロントマターがありません" }],
};

function mockFetchOnce(data: unknown): jest.Mock {
  const fn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
}

describe("TicketsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderPanel(config: { repo: string; branch: string } | null) {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="ja" messages={{ tickets: ticketsMessagesJa }}>
          <TicketsPanel config={config} currentUser="kiyotaka" onRequestRepoSelect={() => {}} />
        </NextIntlClientProvider>,
      );
    });
  }

  it("未選択時は空状態とリポジトリ選択ボタンを表示する", async () => {
    mockFetchOnce(DATA);
    await renderPanel(null);
    expect(container.textContent).toContain("チケットを保存する GitHub リポジトリを選択してください");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("5 列のボードとカード・要修復ファイルを表示する", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const columns = container.querySelectorAll(".tk-column");
    expect(columns).toHaveLength(5);
    expect(container.textContent).toContain("最初のチケット");
    expect(container.textContent).toContain("1/2");
    expect(container.textContent).toContain(".tickets/broken.md");
    const upNext = container.querySelector('[data-status="up_next"]');
    expect(upNext?.textContent).toContain("T-1");
  });

  it("カードにワークスペースと工数（実施/予定・分）を表示する", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const card = container.querySelector('[data-status="up_next"]');
    expect(card?.textContent).toContain("anytime-markdown");
    expect(card?.textContent).toContain("30/120 分");
  });

  it("廃止した進捗バー・ラベルチップを描画しない", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    expect(container.querySelector(".tk-progress-track")).toBeNull();
    expect(container.querySelector(".tk-chip--question")).toBeNull();
    // extras に残る廃止属性が UI へ漏れていないこと
    expect(container.textContent).not.toContain("40%");
    expect(container.querySelector("#tk-filter-label")).toBeNull();
  });

  it("ワークスペースでフィルタできる", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const listButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "リスト");
    await act(async () => {
      listButton?.click();
    });
    expect(container.querySelectorAll(".tk-table tbody tr")).toHaveLength(2);
    const workspaceSelect = container.querySelector<HTMLSelectElement>("#tk-filter-workspace");
    expect(workspaceSelect).not.toBeNull();
    await act(async () => {
      if (workspaceSelect) {
        workspaceSelect.value = "anytime-markdown";
        workspaceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const rows = container.querySelectorAll(".tk-table tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("T-1");
  });

  it("リスト表示へ切り替えて priority でフィルタできる", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const listButton = [...container.querySelectorAll("button")].find((b) => b.textContent === "リスト");
    await act(async () => {
      listButton?.click();
    });
    expect(container.querySelectorAll(".tk-table tbody tr")).toHaveLength(2);
    const prioritySelect = container.querySelector<HTMLSelectElement>("#tk-filter-priority");
    await act(async () => {
      if (prioritySelect) {
        prioritySelect.value = "high";
        prioritySelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const rows = container.querySelectorAll(".tk-table tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("T-1");
  });

  it("カードクリックで詳細ダイアログが開く", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const card = container.querySelector<HTMLButtonElement>(".tk-card");
    await act(async () => {
      card?.click();
    });
    const dialog = document.querySelector(".tk-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("GitHub にコミット");
  });

  it("新規作成の担当は agent / user の選択式になっている", async () => {
    mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const newButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "新規チケット",
    );
    await act(async () => {
      newButton?.click();
    });
    const select = document.querySelector<HTMLSelectElement>("#tk-create-assignee");
    expect(select).not.toBeNull();
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual(["", "agent", "user"]);
  });

  it("詳細の削除は 2 段階確認で DELETE を発行しボードから消える", async () => {
    const fn = mockFetchOnce(DATA);
    await renderPanel({ repo: "o/r", branch: "main" });
    const card = [...container.querySelectorAll<HTMLButtonElement>(".tk-card")].find((c) =>
      c.textContent?.includes("T-1"),
    );
    await act(async () => {
      card?.click();
    });
    const findDelete = () =>
      [...document.querySelectorAll<HTMLButtonElement>(".tk-dialog button")].find((b) =>
        b.textContent === "削除" || b.textContent === "削除を確定",
      );
    const first = findDelete();
    expect(first?.textContent).toBe("削除");
    await act(async () => {
      first?.click();
    });
    expect(fn.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);
    const second = findDelete();
    expect(second?.textContent).toBe("削除を確定");
    await act(async () => {
      second?.click();
    });
    expect(fn.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(true);
    expect(document.querySelector(".tk-dialog")).toBeNull();
    expect(container.textContent).not.toContain("最初のチケット");
  });

  it("一覧取得失敗時はエラーと再読込導線を表示する", async () => {
    const fn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    (globalThis as { fetch: unknown }).fetch = fn;
    await renderPanel({ repo: "o/r", branch: "main" });
    expect(container.querySelector(".tk-alert--error")?.textContent).toContain("boom");
  });
});
