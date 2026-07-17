import {
  annotateScreenmockHtmlPaths,
  applyElementSizeToScreenHtml,
  createScreenmockDesignModePreview,
  replaceScreenmockScreenHtml,
} from "../vanilla/screenmockDesignMode";
import { sanitizeScreenmockHtml } from "../vanilla/screenmockPreview";

describe("screenmockDesignMode", () => {
  it("annotates element paths deterministically", () => {
    const source = '<div><header>H</header><main><button>OK</button></main></div><footer>F</footer>';

    expect(annotateScreenmockHtmlPaths(source)).toBe(annotateScreenmockHtmlPaths(source));
    expect(annotateScreenmockHtmlPaths(source)).toContain('data-sm-path="0"');
    expect(annotateScreenmockHtmlPaths(source)).toContain('data-sm-path="0/1/0"');
    expect(annotateScreenmockHtmlPaths(source)).toContain('data-sm-path="1"');
  });

  it("merges width and height into the target element style only", () => {
    const source = '<div class="root"><button style="color: red; width: 10px;">OK</button><span>stay</span></div>';

    const out = applyElementSizeToScreenHtml(source, "0/0", { widthPercent: 42.25, heightPx: 31.6 });

    expect(out).toContain('<button style="color: red; width: 42.3%; height: 32px;">OK</button>');
    expect(out).toContain("<span>stay</span>");
    expect(out).not.toContain("data-sm-path");
  });

  it("leaves other elements and structure unchanged when writing size", () => {
    const source = '<section><div class="a">A</div><div class="b"><span>B</span></div></section>';

    const out = applyElementSizeToScreenHtml(source, "0/1/0", { widthPercent: 50, heightPx: 20 });

    expect(out).toContain('<div class="a">A</div>');
    expect(out).toContain('<span style="width: 50.0%; height: 20px;">B</span>');
    expect(out).toContain('<div class="b">');
  });

  it("replaces only the selected screen body in a full fence", () => {
    const source = `---
id: login
title: Login
---
<div>login</div>
---
id: home
title: Home
---
<div>home</div>`;

    const out = replaceScreenmockScreenHtml(source, 1, "<main>changed</main>");

    expect(out).toContain("<div>login</div>");
    expect(out).toContain("<main>changed</main>");
    expect(out).not.toContain("<div>home</div>");
  });

  it("keeps surviving sanitized element paths aligned to original paths", () => {
    const annotated = annotateScreenmockHtmlPaths('<div>first</div><script>bad()</script><button>after</button>');
    const sanitized = sanitizeScreenmockHtml(annotated);

    expect(sanitized).not.toContain("<script");
    expect(sanitized).toContain('<div data-sm-path="0">first</div>');
    expect(sanitized).toContain('<button data-sm-path="2">after</button>');
  });

  it("creates design mode handles inside a shadow preview", () => {
    const root = createScreenmockDesignModePreview({
      source: '<div class="sm-card"><button>OK</button></div>',
      getSource: () => '<div class="sm-card"><button>OK</button></div>',
      setSource: jest.fn(),
      emptyHint: "Empty",
      tabListLabel: "Screens",
    });

    const shadow = root.shadowRoot;
    expect(shadow).not.toBeNull();
    expect(shadow!.querySelector(".sm-screen")).not.toBeNull();

    const button = shadow!.querySelector("button") as HTMLButtonElement;
    button.click();

    expect(shadow!.querySelector(".am-smdm-selection")).not.toBeNull();
    expect(shadow!.querySelectorAll(".am-smdm-handle").length).toBe(3);
  });

  it("defines screenmock variables on :host without relying on :root in design mode styles", () => {
    const root = createScreenmockDesignModePreview({
      source: '<div class="sm-card">OK</div>',
      getSource: () => '<div class="sm-card">OK</div>',
      setSource: jest.fn(),
    });

    const firstStyle = root.shadowRoot!.querySelector("style")!.textContent ?? "";

    expect(firstStyle).toContain(":host{");
    expect(firstStyle).toContain("--sm-gap:12px");
    expect(firstStyle).not.toContain(":root");
  });

  it("uses fallback values for design mode stage, selection, and handle screenmock vars", () => {
    const root = createScreenmockDesignModePreview({
      source: '<div class="sm-card">OK</div>',
      getSource: () => '<div class="sm-card">OK</div>',
      setSource: jest.fn(),
    });

    const styles = Array.from(root.shadowRoot!.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(styles).toContain("background:var(--sm-bg,#f6f8fa)");
    expect(styles).toContain("border:2px solid var(--sm-primary,#0969da) !important");
    expect(styles).toContain("background:var(--sm-on-primary,#fff) !important");
  });

  it("restores an initial selected path with selection handles", () => {
    const root = createScreenmockDesignModePreview({
      source: '<div class="sm-card"><button>OK</button></div>',
      getSource: () => '<div class="sm-card"><button>OK</button></div>',
      setSource: jest.fn(),
      initialSelectedPath: "0/0",
    });

    expect(root.shadowRoot!.querySelector(".am-smdm-selection")).not.toBeNull();
    expect(root.shadowRoot!.querySelectorAll(".am-smdm-handle").length).toBe(3);
  });

  it("notifies selection changes and clears", () => {
    const changes: Array<string | null> = [];
    const root = createScreenmockDesignModePreview({
      source: '<div class="sm-card"><button>OK</button></div>',
      getSource: () => '<div class="sm-card"><button>OK</button></div>',
      setSource: jest.fn(),
      onSelectionChange: (path) => changes.push(path),
    });

    const button = root.shadowRoot!.querySelector(".sm-card button") as HTMLButtonElement;
    button.click();
    const screen = root.shadowRoot!.querySelector(".sm-screen") as HTMLElement;
    screen.click();

    expect(changes).toEqual(["0/0", null]);
  });

  it("injects protection styles after user styles as the last shadow style", () => {
    const root = createScreenmockDesignModePreview({
      source: '<style>.am-smdm-handle{display:none}</style><div class="sm-card">OK</div>',
      getSource: () => '<style>.am-smdm-handle{display:none}</style><div class="sm-card">OK</div>',
      setSource: jest.fn(),
    });

    const styles = Array.from(root.shadowRoot!.querySelectorAll("style"));
    const userStyleIndex = styles.findIndex((style) => style.textContent?.includes("display:none"));
    const lastStyle = styles[styles.length - 1];

    expect(userStyleIndex).toBeGreaterThan(-1);
    expect(styles.indexOf(lastStyle!)).toBeGreaterThan(userStyleIndex);
    expect(lastStyle?.textContent).toContain(".am-smdm-handle");
    expect(lastStyle?.textContent).toContain("!important");
  });
});
