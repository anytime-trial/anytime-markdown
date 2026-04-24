import { render, waitFor } from "@testing-library/react";

import { TwitterEmbedView } from "../../../components/embed/TwitterEmbedView";
import type { EmbedProviders } from "../../../types/embedProvider";

describe("TwitterEmbedView", () => {
    beforeEach(() => localStorage.clear());

    test("card variant: サニタイズ済み HTML を描画", async () => {
        const providers: EmbedProviders = {
            fetchOgp: jest.fn(),
            fetchOembed: jest.fn().mockResolvedValue({
                url: "https://twitter.com/u/status/1",
                provider: "twitter",
                html: '<blockquote class="twitter-tweet"><p>hi</p></blockquote>',
                authorName: "user",
            }),
        };
        const { container } = render(
            <TwitterEmbedView
                url="https://twitter.com/u/status/1"
                variant="card"
                providers={providers}
            />,
        );
        await waitFor(() =>
            expect(container.querySelector(".twitter-tweet")).not.toBeNull(),
        );
    });

    test("fetchOembed 失敗でフォールバックリンク", async () => {
        const providers: EmbedProviders = {
            fetchOgp: jest.fn(),
            fetchOembed: jest.fn().mockRejectedValue(new Error("boom")),
        };
        const { container } = render(
            <TwitterEmbedView
                url="https://twitter.com/u/status/2"
                variant="card"
                providers={providers}
            />,
        );
        await waitFor(() => {
            const link = container.querySelector("a");
            expect(link?.getAttribute("href")).toBe("https://twitter.com/u/status/2");
        });
    });
});
