import { render, screen } from "@testing-library/react";

import { DrawioEmbedView } from "../../../components/embed/DrawioEmbedView";

describe("DrawioEmbedView", () => {
    test("card variant: iframe 描画", () => {
        const { container } = render(
            <DrawioEmbedView url="https://viewer.diagrams.net/sample.drawio" variant="card" />,
        );
        const iframe = container.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute("src")).toContain("viewer.diagrams.net/?embed=1");
    });

    test("compact variant: ファイル名表示", () => {
        const { container } = render(
            <DrawioEmbedView url="https://viewer.diagrams.net/sample.drawio" variant="compact" />,
        );
        expect(container.querySelector("iframe")).toBeNull();
        expect(screen.queryByText("sample.drawio")).not.toBeNull();
    });
});
