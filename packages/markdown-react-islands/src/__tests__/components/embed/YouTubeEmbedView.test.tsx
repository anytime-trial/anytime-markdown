import { render, screen } from "@testing-library/react";

import { YouTubeEmbedView } from "../../../components/embed/YouTubeEmbedView";

describe("YouTubeEmbedView", () => {
    test("card variant: iframe 描画", () => {
        const { container } = render(<YouTubeEmbedView videoId="abc123" variant="card" />);
        const iframe = container.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abc123");
    });

    test("compact variant: 1 行表示、iframe なし", () => {
        const { container } = render(<YouTubeEmbedView videoId="abc123" variant="compact" />);
        expect(container.querySelector("iframe")).toBeNull();
        expect(screen.queryByText(/abc123/)).not.toBeNull();
    });
});
