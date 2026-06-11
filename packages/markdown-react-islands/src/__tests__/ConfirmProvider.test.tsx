/**
 * ConfirmProvider と ConfirmDialog のスモークテスト
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ConfirmProvider, ConfirmContext } from "../providers/ConfirmProvider";


describe("ConfirmProvider", () => {
  it("renders children without crashing", () => {
    const { container } = render(
        <>
        <ConfirmProvider>
          <div data-testid="child">Hello</div>
        </ConfirmProvider>
        </>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("provides confirm function via context", () => {
    let confirmFn: any;
    render(
        <>
        <ConfirmProvider>
          <ConfirmContext.Consumer>
            {(value) => {
              confirmFn = value.confirm;
              return <div />;
            }}
          </ConfirmContext.Consumer>
        </ConfirmProvider>
        </>,
    );
    expect(typeof confirmFn).toBe("function");
  });
});
