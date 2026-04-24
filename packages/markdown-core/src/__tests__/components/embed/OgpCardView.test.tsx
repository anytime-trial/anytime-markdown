import { render, screen, waitFor } from "@testing-library/react";

import { OgpCardView } from "../../../components/embed/OgpCardView";
import type { EmbedProviders, OgpData } from "../../../types/embedProvider";

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

describe("OgpCardView", () => {
    beforeEach(() => localStorage.clear());

    test("card variant: タイトル・ドメイン表示", async () => {
        const providers = makeProviders({
            url: "https://card.example/path",
            title: "Card Title",
            description: "desc",
        });
        render(<OgpCardView url="https://card.example/path" variant="card" providers={providers} />);
        await waitFor(() => expect(screen.queryByText("Card Title")).not.toBeNull());
        expect(screen.queryByText("card.example")).not.toBeNull();
        expect(screen.queryByText("desc")).not.toBeNull();
    });

    test("compact variant: 1 行表示", async () => {
        const providers = makeProviders({
            url: "https://compact.example/path",
            title: "Compact Title",
        });
        render(
            <OgpCardView
                url="https://compact.example/path"
                variant="compact"
                providers={providers}
            />,
        );
        await waitFor(() => expect(screen.queryByText("Compact Title")).not.toBeNull());
        expect(screen.queryByText("compact.example")).not.toBeNull();
    });
});
