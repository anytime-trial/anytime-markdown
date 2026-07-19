import { act, useState } from "react";
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

import { TicketDetailDialog } from "../components/TicketDetailDialog";
import { ticketsMessagesJa } from "../i18n/ja";
import type { TicketItem } from "../ticketsClient";

const TICKET: TicketItem = {
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
  },
  extras: {},
  body: "本文",
  archived: false,
};

const ARCHIVED: TicketItem = { ...TICKET, archived: true };

/**
 * 本番の renderBody が注入する vanilla ビュー（VanillaMarkdownEditorMount）の **mount-once**
 * 契約を模したモック。生成時の content だけを保持し、以後 props が変わっても中身を更新しない。
 *
 * ここを素の制御コンポーネント（`<div>{markdown}</div>`）にすると、再レンダーのたびに新しい値が
 * 出てしまい「切替後もプレビューが前のチケットのまま」という本番の壊れ方を再現できない
 * （テストが fail-open になる）。
 */
function MountOncePreview({ content }: Readonly<{ content: string }>) {
  const [mountedContent] = useState(content);
  return <div data-testid="preview">{mountedContent}</div>;
}

function previewText(): string {
  return container.querySelector('[data-testid="preview"]')?.textContent ?? "";
}

let container: HTMLDivElement;
let root: Root;

const noop = async () => true;

function findButton(label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find((button) => button.textContent?.trim() === label);
  if (!found) {
    throw new Error(`button not found: ${label} (available: ${buttons.map((b) => b.textContent).join(" / ")})`);
  }
  return found as HTMLButtonElement;
}

function render(overrides: Partial<Parameters<typeof TicketDetailDialog>[0]> = {}) {
  act(() => {
    root.render(
      <TicketDetailDialog
        ticket={TICKET}
        allTickets={[TICKET]}
        currentUser="tester"
        onClose={noop as unknown as () => void}
        onSave={noop}
        onComment={noop}
        onArchive={noop}
        onDelete={noop}
        onOpenTicket={() => undefined}
        {...overrides}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TicketDetailDialog のフォーム初期化", () => {
  // renderBody で注入される vanilla ビューは mount-once（initialContent は生成時オプション）。
  // 状態を mount 後に流し込むと、子は空文字で mount されたまま更新されず白紙になる。
  it("初回レンダーの時点で本文が renderBody へ渡る（空文字で子を mount させない）", () => {
    const seen: string[] = [];
    render({
      renderBody: (markdown) => {
        seen.push(markdown);
        return <div>{markdown}</div>;
      },
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe(TICKET.body);
    expect(seen).not.toContain("");
  });

  it("初回レンダーの時点で各フィールドがチケットの値を持つ", () => {
    render();

    const titleInput = container.querySelector<HTMLInputElement>(".tk-dialog-title input");
    expect(titleInput?.value).toBe(TICKET.frontmatter.title);
  });

  it("別のチケットへ切り替えると値が入れ替わる", () => {
    render();
    const other: TicketItem = {
      ...TICKET,
      path: ".tickets/T-2-second.md",
      version: "s2",
      frontmatter: { ...TICKET.frontmatter, id: "T-2", title: "2件目" },
      body: "別の本文",
    };

    const seen: string[] = [];
    render({
      ticket: other,
      allTickets: [TICKET, other],
      renderBody: (markdown) => {
        seen.push(markdown);
        return <div>{markdown}</div>;
      },
    });

    const titleInput = container.querySelector<HTMLInputElement>(".tk-dialog-title input");
    expect(titleInput?.value).toBe("2件目");
    expect(seen).not.toContain("");
    expect(seen[seen.length - 1]).toBe("別の本文");
  });

  // 依存チケットのリンク（onOpenTicket）はダイアログを開いたまま ticket を差し替えるため、
  // ダイアログのインスタンスは生き残る。mount-once の子はそのままだと前のチケットの本文を
  // 表示し続けるので、resetKey でプレビューを remount させる必要がある。
  it("ダイアログを開いたままチケットを切り替えても mount-once のプレビューが更新される", () => {
    const renderBody = (markdown: string) => <MountOncePreview content={markdown} />;
    render({ renderBody });
    expect(previewText()).toBe(TICKET.body);

    const other: TicketItem = {
      ...TICKET,
      path: ".tickets/T-2-second.md",
      version: "s2",
      frontmatter: { ...TICKET.frontmatter, id: "T-2", title: "2件目" },
      body: "別の本文",
    };
    render({ ticket: other, allTickets: [TICKET, other], renderBody });

    expect(previewText()).toBe("別の本文");
  });
});

describe("TicketDetailDialog の保存後クローズ", () => {
  it("GitHub へのコミットが成功したらダイアログを閉じる", async () => {
    const onClose = jest.fn();
    const onSave = jest.fn(async () => true);
    render({ onClose, onSave });

    await act(async () => {
      findButton(ticketsMessagesJa.detail.save).click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("コミットが失敗したらダイアログを閉じない（入力を失わせない）", async () => {
    const onClose = jest.fn();
    const onSave = jest.fn(async () => false);
    render({ onClose, onSave });

    await act(async () => {
      findButton(ticketsMessagesJa.detail.save).click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TicketDetailDialog の離脱ボタン表記", () => {
  it("編集可能なチケットでは「キャンセル」を出す（編集破棄の意味を持つため）", () => {
    render();

    expect(() => findButton(ticketsMessagesJa.detail.cancel)).not.toThrow();
    expect(() => findButton(ticketsMessagesJa.detail.close)).toThrow();
  });

  it("アーカイブ済み（読み取り専用）では「閉じる」のまま（取り消す編集が無いため）", () => {
    render({ ticket: ARCHIVED, allTickets: [ARCHIVED] });

    expect(() => findButton(ticketsMessagesJa.detail.close)).not.toThrow();
  });

  it("キャンセルは保存せずに閉じる", () => {
    const onClose = jest.fn();
    const onSave = jest.fn(async () => true);
    render({ onClose, onSave });

    act(() => {
      findButton(ticketsMessagesJa.detail.cancel).click();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
