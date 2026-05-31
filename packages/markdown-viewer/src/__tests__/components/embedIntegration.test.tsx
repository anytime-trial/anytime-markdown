import { render, screen, waitFor } from "@testing-library/react";

import { EmbedProvidersProvider } from "../../contexts/EmbedProvidersContext";
import { EmbedNodeView } from "../../components/EmbedNodeView";
import type { EmbedProviders, OgpData } from "../../types/embedProvider";

const makeProviders = (data: Partial<OgpData>): EmbedProviders => ({
    fetchOgp: jest.fn().mockResolvedValue({
        url: data.url ?? "https://example.com",
        title: data.title ?? null,
        description: data.description ?? null,
        image: data.image ?? null,
        siteName: data.siteName ?? null,
        favicon: data.favicon ?? null,
    }),
    fetchOembed: jest.fn(),
    fetchRss: jest.fn(),
});

describe("embed integration", () => {
    beforeEach(() => localStorage.clear());

    test("Context 経由で OgpCardView に provider が渡る", async () => {
        const providers = makeProviders({
            url: "https://ctx.example",
            title: "Via Context",
        });
        render(
            <EmbedProvidersProvider value={providers}>
                <EmbedNodeView language="embed" body="https://ctx.example" />
            </EmbedProvidersProvider>,
        );
        await waitFor(() => expect(screen.queryByText("Via Context")).not.toBeNull());
    });

    test("compact variant が context 経由でも効く", async () => {
        const providers = makeProviders({
            url: "https://c.example",
            title: "CompactTitle",
        });
        render(
            <EmbedProvidersProvider value={providers}>
                <EmbedNodeView language="embed compact" body="https://c.example" />
            </EmbedProvidersProvider>,
        );
        await waitFor(() => expect(screen.queryByText("CompactTitle")).not.toBeNull());
    });

    test("YouTube は providers なしでも描画される", () => {
        const { container } = render(
            <EmbedNodeView language="embed" body="https://www.youtube.com/watch?v=xyz789" />,
        );
        expect(container.querySelector("iframe")).not.toBeNull();
    });

    test("providers なしで OGP は埋め込めません表示", () => {
        render(<EmbedNodeView language="embed" body="https://missing-provider.example" />);
        expect(screen.queryByText(/未設定/)).not.toBeNull();
    });
});
