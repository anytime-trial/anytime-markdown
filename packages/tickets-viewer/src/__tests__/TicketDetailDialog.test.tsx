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
