import { act, renderHook, waitFor } from "@testing-library/react";

import { useOgpData } from "../../hooks/useEmbedData";
import type { EmbedProviders, OgpData } from "../../types/embedProvider";

const makeOgp = (url: string, title: string): OgpData => ({
    url,
    title,
    description: null,
    image: null,
    siteName: null,
    favicon: null,
});

describe("useOgpData", () => {
    beforeEach(() => localStorage.clear());

    test("初期状態 loading=true、成功で data セット", async () => {
        const providers: EmbedProviders = {
            fetchOgp: jest.fn().mockResolvedValue(makeOgp("https://a.example", "A")),
            fetchOembed: jest.fn(),
            fetchRss: jest.fn(),
        };
        const { result } = renderHook(() => useOgpData("https://a.example", providers));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.data?.title).toBe("A");
        expect(providers.fetchOgp).toHaveBeenCalledTimes(1);
    });

    test("失敗でエラーセット", async () => {
        const providers: EmbedProviders = {
            fetchOgp: jest.fn().mockRejectedValue(new Error("boom")),
            fetchOembed: jest.fn(),
            fetchRss: jest.fn(),
        };
        const { result } = renderHook(() => useOgpData("https://err.example", providers));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("boom");
        expect(result.current.data).toBeNull();
    });

    test("キャッシュ hit で fetchOgp を呼ばない", async () => {
        const providers: EmbedProviders = {
            fetchOgp: jest.fn().mockResolvedValue(makeOgp("https://cached.example", "C")),
            fetchOembed: jest.fn(),
            fetchRss: jest.fn(),
        };
        const { result: r1, unmount } = renderHook(() =>
            useOgpData("https://cached.example", providers),
        );
        await waitFor(() => expect(r1.current.loading).toBe(false));
        unmount();
        act(() => {
            /* flush */
        });

        const { result: r2 } = renderHook(() => useOgpData("https://cached.example", providers));
        await waitFor(() => expect(r2.current.loading).toBe(false));
        expect(providers.fetchOgp).toHaveBeenCalledTimes(1);
    });
});
