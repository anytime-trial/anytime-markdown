import { expect, test, type Page } from "@playwright/test";

/**
 * /tickets の E2E（GitHub API はサーバールートごと route interception でモック）。
 * シナリオ正本: /Shared/anytime-markdown-docs/spec/10.web-app/tickets/tickets-e2e.ja.md
 */

const TICKETS_DATA = {
  tickets: [
    {
      path: ".tickets/T-1-first.md",
      sha: "s1",
      frontmatter: {
        id: "T-1",
        title: "First ticket",
        status: "up_next",
        priority: "high",
        assignee: "claude-code",
        labels: ["auth"],
        created_at: "2026-07-15T00:00:00.000Z",
        updated_at: "2026-07-16T00:00:00.000Z",
        estimate: 10,
        progress: 40,
      },
      extras: {},
      body: "## 概要 (Description)\n\nfirst body\n\n## 作業タスクリスト (Subtasks)\n\n- [x] a\n- [ ] b\n",
      archived: false,
    },
    {
      path: ".tickets/T-2-second.md",
      sha: "s2",
      frontmatter: {
        id: "T-2",
        title: "Second ticket",
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
  invalid: [{ path: ".tickets/broken.md", sha: "s3", reason: "no frontmatter" }],
};

async function openTicketsPage(page: Page, options?: { putStatus?: number }) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "ticketsRepoSelection",
      JSON.stringify({ repo: "owner/repo", branch: "main" }),
    );
  });
  await page.route("**/api/github/tickets?*", async (route) => {
    await route.fulfill({ json: TICKETS_DATA });
  });
  await page.route("**/api/github/tickets", async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      if (options?.putStatus === 409) {
        await route.fulfill({
          status: 409,
          json: { error: "他の更新が先行しました", conflict: true },
        });
        return;
      }
      await route.fulfill({
        json: { path: ".tickets/T-1-first.md", sha: "s1b", commitSha: "c", updated_at: "2026-07-16T01:00:00.000Z" },
      });
      return;
    }
    if (method === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          path: ".tickets/T-3-new.md",
          sha: "s4",
          frontmatter: {
            id: "T-3",
            title: "New ticket",
            status: "backlog",
            priority: "medium",
            created_at: "2026-07-16T02:00:00.000Z",
            updated_at: "2026-07-16T02:00:00.000Z",
          },
          extras: {},
          body: "## 概要 (Description)\n",
          archived: false,
        },
      });
      return;
    }
    await route.fulfill({ json: TICKETS_DATA });
  });
  await page.goto("/tickets");
  await expect(page.locator(".tk-board")).toBeVisible();
}

test.describe("tickets board", () => {
  test("5 列のボードにカードと要修復ファイルが表示される", async ({ page }) => {
    await openTicketsPage(page);
    await expect(page.locator(".tk-column")).toHaveCount(5);
    const upNext = page.locator('[data-status="up_next"]');
    await expect(upNext).toContainText("T-1");
    await expect(upNext).toContainText("First ticket");
    await expect(upNext).toContainText("1/2");
    await expect(page.locator(".tk-alert--warning")).toContainText(".tickets/broken.md");
  });

  test("リスト表示へ切替え priority でフィルタできる", async ({ page }) => {
    await openTicketsPage(page);
    await page.getByRole("button", { name: /リスト|List/ }).click();
    await expect(page.locator(".tk-table tbody tr")).toHaveCount(2);
    await page.locator("#tk-filter-priority").selectOption("high");
    await expect(page.locator(".tk-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".tk-table tbody tr")).toContainText("T-1");
  });

  test("カードのドラッグでステータス変更の PUT が発行される", async ({ page }) => {
    await openTicketsPage(page);
    const putRequest = page.waitForRequest(
      (req) => req.method() === "PUT" && req.url().includes("/api/github/tickets"),
    );
    const card = page.locator(".tk-card", { hasText: "T-1" });
    const target = page.locator('[data-status="in_progress"]');
    const cardBox = await card.boundingBox();
    const targetBox = await target.boundingBox();
    if (!cardBox || !targetBox) {
      throw new Error("bounding box unavailable");
    }
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 40, { steps: 12 });
    await page.mouse.up();
    const request = await putRequest;
    const payload = request.postDataJSON() as { frontmatter: { status: string } };
    expect(payload.frontmatter.status).toBe("in_progress");
  });

  test("保存競合(409)でエラーと再読込導線が表示される", async ({ page }) => {
    await openTicketsPage(page, { putStatus: 409 });
    await page.locator(".tk-card", { hasText: "T-2" }).click();
    await page.getByRole("button", { name: /GitHub にコミット|Commit to GitHub/ }).click();
    await expect(page.locator(".tk-alert--error")).toContainText(
      /他の更新が先行|Another update happened first/,
    );
  });

  test("詳細からコメントを投稿すると本文末尾へ追記した PUT が発行される", async ({ page }) => {
    await openTicketsPage(page);
    await page.locator(".tk-card", { hasText: "T-1" }).click();
    await page.locator("#tk-detail-comment").fill("looks good");
    const putRequest = page.waitForRequest(
      (req) => req.method() === "PUT" && req.url().includes("/api/github/tickets"),
    );
    await page.getByRole("button", { name: /コメントを投稿|Post comment/ }).click();
    const request = await putRequest;
    const payload = request.postDataJSON() as { body: string };
    expect(payload.body).toContain("looks good");
    expect(payload.body).toContain("## 概要 (Description)");
  });

  test("新規作成はタイトル必須で、空のままでは POST されない", async ({ page }) => {
    await openTicketsPage(page);
    let posted = false;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/github/tickets")) {
        posted = true;
      }
    });
    await page.getByRole("button", { name: /新規チケット|New ticket/ }).click();
    await page.getByRole("button", { name: /^作成$|^Create$/ }).click();
    await expect(page.locator(".tk-alert--error")).toBeVisible();
    expect(posted).toBe(false);
  });
});
