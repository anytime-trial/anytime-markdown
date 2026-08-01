import { HTMLElementBase } from "../ssrSafeElement";

describe("HTMLElementBase", () => {
  it("HTMLElement が定義された環境では HTMLElement 自身を返す", () => {
    expect(HTMLElementBase).toBe(HTMLElement);
  });

  it("継承したクラスは customElements に登録できる", () => {
    class ProbeElement extends HTMLElementBase {}
    customElements.define("probe-ssr-safe-element", ProbeElement);
    const el = document.createElement("probe-ssr-safe-element");
    expect(el).toBeInstanceOf(ProbeElement);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it("HTMLElement 未定義環境ではダミー基底へ縮退して評価が落ちない", () => {
    jest.isolateModules(() => {
      const original = Reflect.getOwnPropertyDescriptor(globalThis, "HTMLElement");
      // @ts-expect-error テストのため一時的に未定義環境を再現する。
      delete globalThis.HTMLElement;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { HTMLElementBase: Base } = require("../ssrSafeElement");
        expect(() => {
          class Probe extends Base {}
          return Probe;
        }).not.toThrow();
        expect(Base).not.toBeUndefined();
      } finally {
        if (original) Reflect.defineProperty(globalThis, "HTMLElement", original);
      }
    });
  });
});
