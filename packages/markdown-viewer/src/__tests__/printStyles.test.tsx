/**
 * printStyles.ts のスモークテスト
 */
import React from "react";
import { render } from "@testing-library/react";
import { PrintStyles } from "../styles/printStyles";


describe("PrintStyles", () => {
  it("renders without crashing", () => {
    const { container } = render(
        <PrintStyles />,
    );
    expect(container).toBeTruthy();
  });
});
