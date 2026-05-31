import { render, screen } from "@testing-library/react";

import { SpotifyEmbedView } from "../../../components/embed/SpotifyEmbedView";

describe("SpotifyEmbedView", () => {
    test("card variant track: iframe 描画 height 80", () => {
        const { container } = render(
            <SpotifyEmbedView spotifyType="track" spotifyId="abc123" variant="card" />,
        );
        const iframe = container.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute("src")).toContain("open.spotify.com/embed/track/abc123");
    });

    test("card variant artist: 高さ 380", () => {
        const { container } = render(
            <SpotifyEmbedView spotifyType="artist" spotifyId="abc123" variant="card" />,
        );
        const iframe = container.querySelector("iframe") as HTMLIFrameElement;
        expect(iframe).not.toBeNull();
    });

    test("compact variant: 1 行表示", () => {
        render(
            <SpotifyEmbedView spotifyType="track" spotifyId="abc123" variant="compact" />,
        );
        expect(screen.queryByText(/Spotify: abc123/)).not.toBeNull();
    });
});
