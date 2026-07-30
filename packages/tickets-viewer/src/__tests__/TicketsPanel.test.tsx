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
import type { TicketsGateway } from "../ticketsGateway";

const DATA: TicketsData = {
  tickets: [
    {
      path: ".tickets/T-1-first.md",
      version: "s1",
      frontmatter: {
        id: "T-1",
        title: "最初のチケット",
        status: "up_next",
        priority: "high",
        assignee: "agent",
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
      version: "s2",
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
  invalid: [{ path: ".tickets/broken.md", version: "s3", reason: "フロントマターがありません" }],
};

/**
 * Why not: タスク計画では `makeGateway(tickets: TicketItem[] = [])` を示していたが、
 * 「4 列のボードと…要修復ファイルを表示する」テストが `invalid` 配列（DATA.invalid）を
 * 必要とするため、tickets 配列単体ではなく TicketsData 全体を受け取る形へ調整した。
 */
function makeGateway(data: TicketsData = { tickets: [], invalid: [] }): TicketsGateway {
  return {
    list: jest.fn().mockResolvedValue(data),
    save: jest.fn().mockResolvedValue({ version: "v2", updated_at: "2026-07-29T00:00:00Z" }),
    create: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue({ newPath: ".tickets/archive/T-1.md" }),
  };
}

describe("TicketsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRequestRepoSelect = jest.fn();
  const SOURCE = { label: "o/r / main" };

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

  async function renderPanel(gateway: TicketsGateway | null, source: { label: string } | null) {
    await act(async () => {
      root.render(
        <NextIntlClientProvider locale="ja" messages={{ tickets: ticketsMessagesJa }}>
          <TicketsPanel
            gateway={gateway}
            source={source}
            currentUser="kiyotaka"
            onRequestRepoSelect={onRequestRepoSelect}
          />
        </NextIntlClientProvider>,
      );
    });
  }

  it("gateway が null なら空状態とリポジトリ選択ボタンを出す", async () => {
    await renderPanel(null, null);
    expect(container.textContent).toContain(ticketsMessagesJa.repo.empty);
    const selectButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === ticketsMessagesJa.repo.select,
    );
    expect(selectButton).not.toBeUndefined();
  });

  it("ツールバーに source.label を保存先として表示する", async () => {
    await renderPanel(makeGateway(), { label: "owner/repo / main" });
    expect(container.textContent).toContain("owner/repo / main");
  });

  it("4 列のボードとカード・要修復ファイルを表示する", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    const columns = container.querySelectorAll(".tk-column");
    expect(columns).toHaveLength(4);
    expect(container.textContent).toContain("最初のチケット");
    expect(container.textContent).toContain("1/2");
    expect(container.textContent).toContain(".tickets/broken.md");
    const upNext = container.querySelector('[data-status="up_next"]');
    expect(upNext?.textContent).toContain("T-1");
  });

  it("カードにワークスペースと工数（実施/予定・分）を表示する", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    const card = container.querySelector('[data-status="up_next"]');
    expect(card?.textContent).toContain("anytime-markdown");
    expect(card?.textContent).toContain("30/120 分");
  });

  it("工数もサブタスクも無いチケットでは工数要素を描画しない（空要素の余白を残さない）", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    // T-2 は estimate / actual / サブタスクをいずれも持たない
    const backlog = container.querySelector('[data-status="backlog"]');
    expect(backlog?.textContent).toContain("2件目");
    expect(backlog?.querySelector(".tk-effort")).toBeNull();
    // T-1 は工数を持つので描画される
    expect(container.querySelector('[data-status="up_next"]')?.querySelector(".tk-effort")).not.toBeNull();
  });

  it("廃止した進捗バー・ラベルチップを描画しない", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    expect(container.querySelector(".tk-progress-track")).toBeNull();
    expect(container.querySelector(".tk-chip--question")).toBeNull();
    // extras に残る廃止属性が UI へ漏れていないこと
    expect(container.textContent).not.toContain("40%");
    expect(container.querySelector("#tk-filter-label")).toBeNull();
  });

  it("ワークスペースでフィルタできる", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
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
    await renderPanel(makeGateway(DATA), SOURCE);
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

  it("ボード表示でもリストと同じフィルタ欄を表示する", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    for (const id of ["status", "priority", "assignee", "workspace"]) {
      expect(container.querySelector(`#tk-filter-${id}`)).not.toBeNull();
    }
  });

  it("ボードでステータスを選ぶと該当列だけ表示する", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    expect(container.querySelectorAll(".tk-column")).toHaveLength(4);
    const statusSelect = container.querySelector<HTMLSelectElement>("#tk-filter-status");
    await act(async () => {
      if (statusSelect) {
        statusSelect.value = "up_next";
        statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const columns = container.querySelectorAll(".tk-column");
    expect(columns).toHaveLength(1);
    expect(columns[0].getAttribute("data-status")).toBe("up_next");
    expect(columns[0].textContent).toContain("T-1");
  });

  it("ボードで優先度フィルタがカードに効く", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    expect(container.querySelectorAll(".tk-card")).toHaveLength(2);
    const prioritySelect = container.querySelector<HTMLSelectElement>("#tk-filter-priority");
    await act(async () => {
      if (prioritySelect) {
        prioritySelect.value = "high";
        prioritySelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const cards = container.querySelectorAll(".tk-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("T-1");
  });

  it("アーカイブ表示はフィルタ欄のチェックボックスで切り替える（ボタンは廃止）", async () => {
    const gateway = makeGateway(DATA);
    await renderPanel(gateway, SOURCE);
    expect(
      [...container.querySelectorAll("button")].some((b) => b.textContent === "アーカイブを表示"),
    ).toBe(false);
    const checkbox = container.querySelector<HTMLInputElement>("#tk-filter-archived");
    expect(checkbox?.type).toBe("checkbox");
    expect(checkbox?.checked).toBe(false);
    const before = (gateway.list as jest.Mock).mock.calls.length;
    await act(async () => {
      checkbox?.click();
    });
    expect(container.querySelector<HTMLInputElement>("#tk-filter-archived")?.checked).toBe(true);
    // アーカイブ込みの再取得が走る
    expect((gateway.list as jest.Mock).mock.calls.length).toBeGreaterThan(before);
  });

  it("カードクリックで詳細ダイアログが開く", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
    const card = container.querySelector<HTMLButtonElement>(".tk-card");
    await act(async () => {
      card?.click();
    });
    const dialog = document.querySelector(".tk-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("GitHub にコミット");
  });

  it("新規作成の担当は agent / user の選択式になっている", async () => {
    await renderPanel(makeGateway(DATA), SOURCE);
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
    const gateway = makeGateway(DATA);
    await renderPanel(gateway, SOURCE);
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
    expect(gateway.remove).not.toHaveBeenCalled();
    const second = findDelete();
    expect(second?.textContent).toBe("削除を確定");
    await act(async () => {
      second?.click();
    });
    expect(gateway.remove).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".tk-dialog")).toBeNull();
    expect(container.textContent).not.toContain("最初のチケット");
  });

  it("一覧取得失敗時はエラーと再読込導線を表示する", async () => {
    const gateway = makeGateway();
    (gateway.list as jest.Mock).mockRejectedValue(new Error("boom"));
    await renderPanel(gateway, SOURCE);
    expect(container.querySelector(".tk-alert--error")?.textContent).toContain("boom");
  });
});
