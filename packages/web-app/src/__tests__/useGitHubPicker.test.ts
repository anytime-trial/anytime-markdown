import { act, renderHook } from "@testing-library/react";

jest.mock("next-auth/react", () => ({ signIn: jest.fn() }));

import { useGitHubPicker } from "../app/markdown/useGitHubPicker";

describe("useGitHubPicker", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("GitHub 未接続で押すと、ピッカーを開かず OAuth へ誘導する", () => {
    const signInFn = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useGitHubPicker({ isGitHubConnected: false, signInFn }),
    );

    act(() => {
      result.current.handleOpenFromGitHub();
    });

    expect(signInFn).toHaveBeenCalledWith("github", { callbackUrl: window.location.href });
    expect(result.current.gitHubPickerOpen).toBe(false);
  });

  it("GitHub 接続済みで押すと、OAuth せずピッカーを開く", () => {
    const signInFn = jest.fn();
    const { result } = renderHook(() =>
      useGitHubPicker({ isGitHubConnected: true, signInFn }),
    );

    act(() => {
      result.current.handleOpenFromGitHub();
    });

    expect(signInFn).not.toHaveBeenCalled();
    expect(result.current.gitHubPickerOpen).toBe(true);
  });

  it("OAuth 往復から戻るとピッカーが自動で開く", () => {
    const signInFn = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ isGitHubConnected }) => useGitHubPicker({ isGitHubConnected, signInFn }),
      { initialProps: { isGitHubConnected: false as boolean | undefined } },
    );

    act(() => {
      result.current.handleOpenFromGitHub();
    });
    // 同意画面から戻ってきたページで GitHub 接続済みが判明する。
    rerender({ isGitHubConnected: true });

    expect(result.current.gitHubPickerOpen).toBe(true);
  });

  it("押していないのに接続が判明しただけならピッカーは開かない（リロード時）", () => {
    const signInFn = jest.fn();
    const { result, rerender } = renderHook(
      ({ isGitHubConnected }) => useGitHubPicker({ isGitHubConnected, signInFn }),
      { initialProps: { isGitHubConnected: undefined as boolean | undefined } },
    );

    rerender({ isGitHubConnected: true });

    expect(result.current.gitHubPickerOpen).toBe(false);
  });

  it("OAuth を中断して戻っても、次の接続判明で勝手に開かない（intent は一度きり）", () => {
    const signInFn = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ isGitHubConnected }) => useGitHubPicker({ isGitHubConnected, signInFn }),
      { initialProps: { isGitHubConnected: false as boolean | undefined } },
    );

    act(() => {
      result.current.handleOpenFromGitHub();
    });
    rerender({ isGitHubConnected: true });
    act(() => {
      result.current.closeGitHubPicker();
    });
    // 一度消費した intent は残らないので、再接続の遷移で再び開くことはない。
    rerender({ isGitHubConnected: false });
    rerender({ isGitHubConnected: true });

    expect(result.current.gitHubPickerOpen).toBe(false);
  });
});
