import { render, screen, waitFor } from "@testing-library/react";

import { EmbedNodeView } from "../../components/EmbedNodeView";
import type { EmbedProviders } from "../../types/embedProvider";

const makeProviders = (): EmbedProviders => ({
    fetchOgp: jest.fn().mockResolvedValue({
        url: "https://example.com",
        title: "Example",
        description: null,
        image: null,
        siteName: null,
        favicon: null,
    }),
    fetchOembed: jest.fn(),
});

describe("EmbedNodeView", () => {
    beforeEach(() => localStorage.clear());

    test("URL 無し: プレースホルダー", () => {
        render(<EmbedNodeView language="embed" body="" providers={makeProviders()} />);
        expect(screen.queryByText(/有効な URL/)).not.toBeNull();
    });

    test("YouTube URL で iframe", () => {
        const { container } = render(
            <EmbedNodeView
                language="embed"
                body="https://www.youtube.com/watch?v=abc123"
                providers={makeProviders()}
            />,
        );
        expect(container.querySelector("iframe")).not.toBeNull();
    });

    test("汎用 URL で OGP カード", async () => {
        render(
            <EmbedNodeView
                language="embed"
                body="https://example.com"
                providers={makeProviders()}
            />,
        );
        await waitFor(() => expect(screen.queryByText("Example")).not.toBeNull());
    });

    test("embed compact で compact 表示", async () => {
        render(
            <EmbedNodeView
                language="embed compact"
                body="https://example.com"
                providers={makeProviders()}
            />,
        );
        await waitFor(() => expect(screen.queryByText("Example")).not.toBeNull());
    });

    test("不正スキームでプレースホルダー", () => {
        render(
            <EmbedNodeView
                language="embed"
                body="file:///etc/passwd"
                providers={makeProviders()}
            />,
        );
        expect(screen.queryByText(/埋め込めません/)).not.toBeNull();
    });

    test("widthOverride を渡しても card variant は描画を維持する", () => {
        const { container } = render(
            <EmbedNodeView
                language="embed"
                body="https://www.youtube.com/watch?v=abc123"
                widthOverride="512px"
                providers={makeProviders()}
            />,
        );
        expect(container.querySelector("iframe")).not.toBeNull();
    });

    test("widthOverride は compact variant では無視される (compact 1行表示)", () => {
        const { container } = render(
            <EmbedNodeView
                language="embed compact"
                body="https://www.youtube.com/watch?v=abc123"
                widthOverride="512px"
                providers={makeProviders()}
            />,
        );
        expect(container.querySelector("iframe")).toBeNull();
    });
});
