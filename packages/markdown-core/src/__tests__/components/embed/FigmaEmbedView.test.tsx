import { render, screen } from "@testing-library/react";

import { FigmaEmbedView } from "../../../components/embed/FigmaEmbedView";

describe("FigmaEmbedView", () => {
    test("card variant: iframe 描画", () => {
        const { container } = render(
            <FigmaEmbedView path="/file/XXX/my-design" variant="card" />,
        );
        const iframe = container.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute("src")).toContain("figma.com/embed");
    });

    test("compact variant: 1 行表示", () => {
        const { container } = render(
            <FigmaEmbedView path="/file/XXX/my-design" variant="compact" />,
        );
        expect(container.querySelector("iframe")).toBeNull();
        expect(screen.queryByText("my-design")).not.toBeNull();
    });
});
