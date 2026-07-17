import {
  buildScreenmockSrcdoc,
  createScreenmockPreview,
  parseScreenmock,
  sanitizeScreenmockHtml,
} from "../vanilla/screenmockPreview";

describe("screenmockPreview", () => {
  it("parses multiple frontmatter screens", () => {
    const screens = parseScreenmock(`---
id: login
title: Login
---
<div class="sm-screen">login</div>
---
id: home
title: Home
---
<div class="sm-screen">home</div>`);

    expect(screens).toEqual([
      { id: "login", title: "Login", html: '<div class="sm-screen">login</div>' },
      { id: "home", title: "Home", html: '<div class="sm-screen">home</div>' },
    ]);
  });

  it("accepts a body without frontmatter as one screen", () => {
    expect(parseScreenmock('<div class="sm-screen">only</div>')).toEqual([
      { id: "screen-1", title: "screen-1", html: '<div class="sm-screen">only</div>' },
    ]);
  });

  it("auto-numbers ids and uniquifies duplicates", () => {
    const screens = parseScreenmock(`---
title: First
---
<div>first</div>
---
id: dup
---
<div>one</div>
---
id: dup
title: Two
---
<div>two</div>`);

    expect(screens.map((screen) => screen.id)).toEqual(["screen-1", "dup", "dup-2"]);
    expect(screens.map((screen) => screen.title)).toEqual(["First", "dup", "Two"]);
  });

  it("skips only screens with invalid frontmatter", () => {
    const screens = parseScreenmock(`---
id login
---
<div>bad</div>
---
id: ok
---
<div>ok</div>`);

    expect(screens).toEqual([{ id: "ok", title: "ok", html: "<div>ok</div>" }]);
  });

  it("returns no parsed screens for empty input", () => {
    expect(parseScreenmock(" \n\t ")).toEqual([]);
  });

  it("sanitizes risky HTML while keeping screenmock presentation attributes", () => {
    const html = sanitizeScreenmockHtml(`
<style>.x{color:red}</style>
<div class="sm-card" style="width:10px" onclick="bad()" data-lines="3">
  <script>bad()</script>
  <a href="https://example.com">external</a>
  <a href="#home">home</a>
  <img src="http://example.com/a.png" />
  <img src="https://example.com/a.png" />
  <img src="data:image/png;base64,abc" />
  <iframe srcdoc="x"></iframe>
  <form action="/submit"><input class="sm-input" /></form>
</div>`);

    expect(html).toContain("<style>.x{color:red}</style>");
    expect(html).toContain('class="sm-card"');
    expect(html).toContain('style="width:10px"');
    expect(html).toContain('data-lines="3"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
    expect(html).toContain("<a>external</a>");
    expect(html).toContain('<a href="#home">home</a>');
    expect(html).toContain("<img>");
    expect(html).toContain('<img src="https://example.com/a.png">');
    expect(html).toContain('<img src="data:image/png;base64,abc">');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("action=");
  });

  it("builds srcdoc with styles, sanitized screens, theme vars, and initial screen CSS", () => {
    const srcdoc = buildScreenmockSrcdoc(
      [
        { id: "login", title: "Login", html: '<div class="sm-screen"><a href="#home">go</a></div>' },
        { id: "home", title: "Home", html: '<div class="sm-screen"><script>bad()</script>home</div>' },
      ],
      {
        initialScreenId: "home",
        emptyHint: "Write a screenmock fence.",
        themeVars: { "--am-color-text-primary": "#111", "--am-color-bg-paper": "#fff" },
      },
    );

    expect(srcdoc).toContain("<style>");
    expect(srcdoc).toContain("--sm-gap");
    expect(srcdoc).toContain(':root{--am-color-text-primary:#111;--am-color-bg-paper:#fff;}');
    expect(srcdoc).toContain('id="login"');
    expect(srcdoc).toContain('id="home"');
    expect(srcdoc).toContain(".sm-screen{display:none;");
    expect(srcdoc).toContain("body:not(:has(.sm-screen:target)) #home{display:block;}");
    expect(srcdoc).toContain('<a href="#home">go</a>');
    expect(srcdoc).not.toContain("<script");
  });

  it("builds an empty placeholder srcdoc", () => {
    const srcdoc = buildScreenmockSrcdoc([], { emptyHint: "Empty hint" });

    expect(srcdoc).toContain("Empty hint");
    expect(srcdoc).toContain("sm-empty");
  });

  it("creates a tab bar and sandboxed iframe preview", () => {
    const el = createScreenmockPreview(
      `---
id: login
title: Login
---
<div>login</div>
---
id: home
title: Home
---
<div>home</div>`,
      { emptyHint: "Empty", tabListLabel: "Screens" },
    );

    const tabs = el.querySelectorAll("button");
    const iframe = el.querySelector("iframe");
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toBe("Login");
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(iframe?.getAttribute("srcdoc")).toContain('id="login"');

    (tabs[1] as HTMLButtonElement).click();
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(iframe?.getAttribute("srcdoc")).toContain("body:not(:has(.sm-screen:target)) #home{display:block;}");
  });
});
