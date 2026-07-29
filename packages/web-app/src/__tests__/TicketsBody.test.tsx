import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

// tickets-viewer は index.ts 経由の実 import ではなく、gateway 生成呼び出しと
// TicketsPanel への渡し props を検証したいので、TicketsPanel/createHttpTicketsGateway をモックする。
const createGatewaySpy = jest.fn((config: unknown) => ({ __marker: "mock-gateway", config }));
const panelRenderSpy = jest.fn();

jest.mock("@anytime-markdown/tickets-viewer", () => ({
  __esModule: true,
  createHttpTicketsGateway: (config: unknown) => createGatewaySpy(config),
  TicketsPanel: (props: any) => {
    panelRenderSpy(props);
    return (
      <div data-testid="tickets-panel">
        <button type="button" onClick={props.onRequestRepoSelect}>
          open-dialog
        </button>
      </div>
    );
  },
}));

// TicketsRepoDialog は onSelect を叩けるだけのボタンに差し替え、リポジトリ選択の変更を模擬する。
jest.mock("../app/tickets/TicketsRepoDialog", () => ({
  __esModule: true,
  default: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ repo: "other/repo", branch: "develop" })}>
      select-other-repo
    </button>
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "ja", setLocale: jest.fn() }),
}));

jest.mock("../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "light", setThemeMode: jest.fn() }),
}));

jest.mock("../app/components/LandingHeader", () => ({
  __esModule: true,
  default: () => <div data-testid="landing-header" />,
}));

// @mui/material はこの worktree の node_modules に未インストール（環境要因・Task 5 と無関係）。
// TicketsBody.tsx が直接 import する Box/Container/Typography だけを virtual mock で差し替え、
// 環境の欠落に左右されずに gateway 配線のロジックを検証する。
jest.mock(
  "@mui/material",
  () => ({
    __esModule: true,
    Box: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Container: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Typography: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  }),
  { virtual: true },
);

import TicketsBody from "../app/tickets/TicketsBody";

const STORAGE_KEY = "ticketsRepoSelection";

describe("TicketsBody gateway wiring", () => {
  beforeEach(() => {
    createGatewaySpy.mockClear();
    panelRenderSpy.mockClear();
    window.localStorage.clear();
  });

  it("gateway が null の状態（未選択）で TicketsPanel へ渡る", async () => {
    render(<TicketsBody />);

    expect(await screen.findByTestId("tickets-panel")).toBeTruthy();
    const props = panelRenderSpy.mock.calls.at(-1)?.[0];
    expect(props.gateway).toBeNull();
    expect(props.source).toBeNull();
    expect(createGatewaySpy).not.toHaveBeenCalled();
  });

  it("永続化済みのリポジトリ選択から gateway と source を生成する", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ repo: "octo/repo", branch: "main" }));

    render(<TicketsBody />);

    expect(await screen.findByTestId("tickets-panel")).toBeTruthy();
    expect(createGatewaySpy).toHaveBeenCalledTimes(1);
    expect(createGatewaySpy).toHaveBeenCalledWith({ repo: "octo/repo", branch: "main" });

    const props = panelRenderSpy.mock.calls.at(-1)?.[0];
    expect(props.source).toEqual({ label: "octo/repo / main" });
  });

  // Task 3 レビューの warn: gateway のメモ化が効いていないと selection 不変の再レンダーでも
  // gateway が再生成され、useTickets 側の依存（インスタンス同一性）を通じて無限再取得になる。
  it("selection と無関係な再レンダーでは gateway インスタンスを再生成しない（メモ化の検証）", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ repo: "octo/repo", branch: "main" }));

    render(<TicketsBody />);
    await screen.findByTestId("tickets-panel");

    expect(createGatewaySpy).toHaveBeenCalledTimes(1);
    const firstGateway = panelRenderSpy.mock.calls.at(-1)?.[0].gateway;

    // dialogOpen state だけを変える再レンダーを誘発する（selection は不変）。
    fireEvent.click(screen.getByText("open-dialog"));

    expect(createGatewaySpy).toHaveBeenCalledTimes(1); // 再生成されていない
    const lastGateway = panelRenderSpy.mock.calls.at(-1)?.[0].gateway;
    expect(lastGateway).toBe(firstGateway); // インスタンス同一性が保たれている
  });

  it("selection が変わると新しい gateway を生成する", async () => {
    render(<TicketsBody />);
    await screen.findByTestId("tickets-panel");
    expect(createGatewaySpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("select-other-repo"));

    expect(createGatewaySpy).toHaveBeenCalledTimes(1);
    expect(createGatewaySpy).toHaveBeenCalledWith({ repo: "other/repo", branch: "develop" });
    const props = panelRenderSpy.mock.calls.at(-1)?.[0];
    expect(props.source).toEqual({ label: "other/repo / develop" });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ repo: "other/repo", branch: "develop" }),
    );
  });
});
