import { createScreenmockEditPanel } from "../vanilla/screenmockEditPanel";

const labels: Record<string, string> = {
  screenmockPanelTabParts: "Parts",
  screenmockPanelTabAttributes: "Attributes",
  screenmockPanelTabStructure: "Structure",
  screenmockPanelTabScreens: "Screens",
  screenmockPanelDesignOff: "Design off",
  screenmockPanelCategoryLayout: "Layout",
  screenmockPanelCategoryComponents: "Components",
  screenmockPanelCategorySnippets: "Snippets",
  screenmockPanelCategoryScreenTemplates: "Screen templates",
  screenmockPanelSnippetForm: "Form",
  screenmockPanelSnippetHeader: "Header set",
  screenmockPanelTemplateLogin: "Login",
  screenmockPanelTemplateList: "List",
  screenmockPanelTemplateDetail: "Detail",
  screenmockPanelTemplateLoginTitle: "Login",
  screenmockPanelTemplateListTitle: "List",
  screenmockPanelTemplateDetailTitle: "Detail",
  screenmockPanelNoSelection: "No selection",
  screenmockPanelElementType: "Type",
  screenmockPanelVariant: "Variant",
  screenmockPanelVariantStandard: "Standard",
  screenmockPanelVariantPrimary: "Primary",
  screenmockPanelVariantLeft: "Left",
  screenmockPanelVariantRight: "Right",
  screenmockPanelSize: "Size",
  screenmockPanelWidth: "Width",
  screenmockPanelHeight: "Height",
  screenmockPanelColors: "Colors",
  screenmockPanelBackgroundColor: "Background color",
  screenmockPanelTextColor: "Text color",
  screenmockPanelDefault: "Default",
  screenmockPanelSpacing: "Spacing",
  screenmockPanelPadding: "Padding",
  screenmockPanelGap: "Gap",
  screenmockPanelBorderRadius: "Corner radius",
  screenmockPanelPresetNone: "None",
  screenmockPanelPresetSmall: "Small",
  screenmockPanelPresetMedium: "Medium",
  screenmockPanelPresetLarge: "Large",
  screenmockPanelPresetCustom: "Custom",
  screenmockPanelOffset: "Offset",
  screenmockPanelOffsetLeft: "Left (px)",
  screenmockPanelOffsetTop: "Top (px)",
  screenmockPanelText: "Text",
  screenmockPanelPlaceholder: "Placeholder",
  screenmockPanelHref: "Link target",
  screenmockPanelHrefNone: "None",
  screenmockPanelDataLines: "Lines",
  screenmockPanelSrc: "Image src",
  screenmockPanelAlignment: "Alignment",
  screenmockPanelJustifyContent: "Main axis",
  screenmockPanelAlignItems: "Cross axis",
  screenmockPanelAlignDefault: "Default",
  screenmockPanelAlignStart: "Start",
  screenmockPanelAlignCenter: "Center",
  screenmockPanelAlignEnd: "End",
  screenmockPanelAlignStretch: "Stretch",
  screenmockPanelDelete: "Delete",
  screenmockPanelDuplicate: "Duplicate",
  screenmockPanelTreePlaceholder: "Tree placeholder",
  screenmockPanelScreensPlaceholder: "Screens placeholder",
  screenmockPanelStructureTree: "Hierarchy tree",
  screenmockPanelTreeEmpty: "No elements",
  screenmockPanelAddScreen: "Add screen",
  screenmockPanelMoveScreenUp: "Move up",
  screenmockPanelMoveScreenDown: "Move down",
  screenmockPanelDeleteScreenConfirm: "Delete screen?",
  screenmockPanelUpdateRefsConfirm: "Update refs?",
  screenmockPanelScreenMetadata: "Screen details",
  screenmockPanelScreenId: "id",
  screenmockPanelScreenTitle: "title",
  screenmockPanelUntitledScreen: "Screen",
  screenmockPanelNoScreens: "No screens",
  screenmockPanelWrap: "Wrap",
  screenmockPanelWrapRow: "Wrap row",
  screenmockPanelWrapCol: "Wrap column",
  screenmockPanelUnwrap: "Unwrap",
};

if (typeof PointerEvent === "undefined") {
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

function change(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickByText(root: HTMLElement, text: string): void {
  const button = Array.from(root.querySelectorAll("button")).find((el) => el.textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}

function pointer(type: string): PointerEvent {
  return new PointerEvent(type, { bubbles: true, composed: true } as PointerEventInit);
}

function screenBlockCount(source: string): number {
  return (source.match(/^---$/gm) ?? []).length / 2;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
}

function setup(initial: string, enabled = true, confirm?: (message: string) => Promise<boolean> | boolean) {
  let source = initial;
  let designMode = enabled;
  let selectedPath: string | null = null;
  let activeScreenIndex = 0;
  // 実ホスト（installCodeBlockOverlay）は setSource 後に source 購読経由で render() を
  // 呼ぶため、ハーネスでも同じ契約を模す（パネル自身は書き戻し時に再描画しない）。
  let panelRef: ReturnType<typeof createScreenmockEditPanel> | null = null;
  const panel = createScreenmockEditPanel({
    getSource: () => source,
    setSource: (next) => {
      source = next;
      panelRef?.render();
    },
    t: (key) => labels[key] ?? key,
    getDesignMode: () => designMode,
    getSelectedPath: () => selectedPath,
    setSelectedPath: (path) => {
      selectedPath = path;
    },
    getActiveScreenIndex: () => activeScreenIndex,
    setActiveScreenIndex: (index) => {
      activeScreenIndex = index;
    },
    confirm,
    isDark: false,
  });
  panelRef = panel;
  document.body.appendChild(panel.el);
  return {
    panel,
    getSource: () => source,
    setDesignMode: (next: boolean) => {
      designMode = next;
      panel.setDesignMode(next);
    },
    getSelectedPath: () => selectedPath,
    getActiveScreenIndex: () => activeScreenIndex,
    setSelection: (path: string | null) => {
      selectedPath = path;
      panel.setSelection(path);
    },
    setActiveScreenIndex: (index: number) => {
      activeScreenIndex = index;
      panel.setActiveScreenIndex(index);
    },
  };
}

describe("screenmockEditPanel", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("inserts a clicked part into the current screen and selects it", () => {
    const { panel, getSource, getSelectedPath } = setup(`<div class="sm-card"></div>`);

    clickByText(panel.el, "sm-card");

    expect(getSource()).toContain('<div class="sm-card"></div><div class="sm-card">Card</div>');
    expect(getSelectedPath()).toBe("1");
  });

  it("inserts into the selected element as the last child", () => {
    const { panel, getSource, getSelectedPath, setSelection } = setup(`<div class="sm-card"><span>before</span></div>`);
    setSelection("0");
    clickByText(panel.el, "Parts");

    clickByText(panel.el, "sm-btn");

    expect(getSource()).toContain('<div class="sm-card"><span>before</span><button class="sm-btn">Button</button></div>');
    expect(getSelectedPath()).toBe("0/1");
  });

  it("writes width and removes it when the field is emptied", () => {
    const { panel, getSource, setSelection } = setup(`<div class="sm-card">Card</div>`);
    setSelection("0");
    const width = panel.el.querySelector("input[type='number']") as HTMLInputElement;

    change(width, "50");
    expect(getSource()).toContain('style="width: 50.0%;"');
    expect(getSource()).not.toContain("height:");

    const widthAfterRender = panel.el.querySelector("input[type='number']") as HTMLInputElement;
    change(widthAfterRender, "");
    expect(getSource()).not.toContain("width:");
  });

  it("writes height independently without adding a width declaration", () => {
    const { panel, getSource, setSelection } = setup(`<div class="sm-card">Card</div>`);
    setSelection("0");
    const height = panel.el.querySelectorAll("input[type='number']")[1] as HTMLInputElement;

    change(height, "120");
    expect(getSource()).toContain('style="height: 120px;"');
    expect(getSource()).not.toContain("width:");
  });

  it("edits direct text and input placeholder text", () => {
    const { panel, getSource, setSelection } = setup(`<button class="sm-btn">OK</button><input class="sm-input" placeholder="Name">`);
    setSelection("0");
    const textInput = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;

    change(textInput, "Submit");
    expect(getSource()).toContain('<button class="sm-btn">Submit</button>');

    setSelection("1");
    const placeholderInput = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;
    change(placeholderInput, "Email");
    expect(getSource()).toContain('<input class="sm-input" placeholder="Email">');
  });

  it("sets and clears anchor transition targets", () => {
    const source = `---
id: a
title: A
---
<a class="sm-btn">Go</a>
---
id: b
title: B
---
<div>B</div>`;
    const { panel, getSource, setSelection } = setup(source);
    setSelection("0");
    const select = panel.el.querySelector("select") as HTMLSelectElement;

    change(select, "b");
    expect(getSource()).toContain('<a class="sm-btn" href="#b">Go</a>');

    const selectAfterRender = panel.el.querySelector("select") as HTMLSelectElement;
    change(selectAfterRender, "");
    expect(getSource()).toContain('<a class="sm-btn">Go</a>');
  });

  it("switches supported variants by rewriting classes", () => {
    const { panel, getSource, setSelection } = setup(`<button class="sm-btn">OK</button><aside class="sm-sidebar">Nav</aside>`);
    setSelection("0");
    const buttonVariant = panel.el.querySelector("select") as HTMLSelectElement;

    change(buttonVariant, "primary");
    expect(getSource()).toContain('<button class="sm-btn sm-btn-primary">OK</button>');

    const buttonVariantAfterRender = panel.el.querySelector("select") as HTMLSelectElement;
    change(buttonVariantAfterRender, "standard");
    expect(getSource()).toContain('<button class="sm-btn">OK</button>');

    setSelection("1");
    const sidebarVariant = panel.el.querySelector("select") as HTMLSelectElement;
    change(sidebarVariant, "right");
    expect(getSource()).toContain('<aside class="sm-sidebar sm-sidebar-right">Nav</aside>');
  });

  it("writes color token declarations and clears them with the default option", () => {
    const { panel, getSource, setSelection } = setup(`<div class="sm-card">Card</div>`);
    setSelection("0");

    clickByText(panel.el, "--sm-primary");
    expect(getSource()).toContain('style="background: var(--sm-primary);"');

    clickByText(panel.el, "Default");
    expect(getSource()).not.toContain("background:");

    const colorToken = Array.from(panel.el.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("--sm-on-primary"),
    )[1];
    if (!colorToken) throw new Error("Text color token not found");
    colorToken.click();
    expect(getSource()).toContain('style="color: var(--sm-on-primary);"');
  });

  it("writes integer offsets and removes declarations when set to zero", () => {
    const { panel, getSource, setSelection } = setup(
      `<button class="sm-btn" style="position: relative; left: 12px; top: 4px;">OK</button>`,
    );
    setSelection("0");
    const numbers = panel.el.querySelectorAll("input[type='number']");
    const left = numbers[2] as HTMLInputElement;
    const top = numbers[3] as HTMLInputElement;

    expect(left.value).toBe("12");
    expect(top.value).toBe("4");

    change(left, "8");
    expect(getSource()).toContain("left: 8px;");

    const leftAfterRender = panel.el.querySelectorAll("input[type='number']")[2] as HTMLInputElement;
    change(leftAfterRender, "0");
    expect(getSource()).not.toContain("left:");
    expect(getSource()).toContain("top: 4px;");

    const topAfterRender = panel.el.querySelectorAll("input[type='number']")[3] as HTMLInputElement;
    change(topAfterRender, "0");
    expect(getSource()).not.toContain("position:");
    expect(getSource()).not.toContain("top:");
  });

  it("deletes and duplicates the selected element", () => {
    const { panel, getSource, getSelectedPath, setSelection } = setup(`<div><button>One</button></div><span>Two</span>`);
    setSelection("0/0");

    clickByText(panel.el, "Duplicate");
    expect(getSource()).toContain("<button>One</button><button>One</button>");
    expect(getSelectedPath()).toBe("0/1");

    clickByText(panel.el, "Delete");
    expect(getSource()).toContain("<div><button>One</button></div><span>Two</span>");
    expect(getSelectedPath()).toBeNull();
  });

  it("shows a nested hierarchy tree and syncs selection from node clicks", () => {
    const { panel, getSelectedPath, setSelection } = setup(
      `<div class="sm-card"><button class="sm-btn">One</button><span>Two</span></div>`,
    );

    clickByText(panel.el, "Structure");
    clickByText(panel.el, "sm-btn");

    expect(getSelectedPath()).toBe("0/0");
    expect(panel.el.querySelector(".am-smep-tree-node[aria-selected='true']")?.textContent).toBe("sm-btn");

    setSelection("0");
    expect(panel.el.querySelector(".am-smep-tree-node[aria-selected='true']")?.textContent).toBe("sm-card");
    expect(panel.el.querySelector("[aria-selected='true']")?.textContent).toBe("Structure");
  });

  it("adds, duplicates, and deletes screens by changing source screen block count", async () => {
    const source = `---
id: a
title: A
---
<div>A</div>
---
id: b
title: B
---
<div>B</div>`;
    const { panel, getSource } = setup(source, true, () => true);

    clickByText(panel.el, "Screens");
    clickByText(panel.el, "Add screen");
    expect(screenBlockCount(getSource())).toBe(3);

    clickByText(panel.el, "Duplicate");
    expect(screenBlockCount(getSource())).toBe(4);

    clickByText(panel.el, "Delete");
    await flushPromises();
    expect(screenBlockCount(getSource())).toBe(3);
  });

  it("renames a screen id and updates href references when confirmed", async () => {
    const source = `---
id: a
title: A
---
<a class="sm-btn" href="#b">Go</a>
---
id: b
title: B
---
<div>B</div>`;
    const confirm = jest.fn(() => true);
    const { panel, getSource, setActiveScreenIndex } = setup(source, true, confirm);
    setActiveScreenIndex(1);
    clickByText(panel.el, "Screens");

    const idInput = panel.el.querySelector("input") as HTMLInputElement;
    change(idInput, "c");
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith("Update refs?");
    expect(getSource()).toContain("id: c");
    expect(getSource()).toContain('href="#c"');
    expect(getSource()).not.toContain('href="#b"');
  });

  it("rejects renaming a screen id to one used by another screen", async () => {
    const source = `---
id: a
title: A
---
<div>A</div>
---
id: b
title: B
---
<div>B</div>`;
    const { panel, getSource, setActiveScreenIndex } = setup(source);
    setActiveScreenIndex(1);
    clickByText(panel.el, "Screens");

    const idInput = panel.el.querySelector("input") as HTMLInputElement;
    change(idInput, "a");
    await flushPromises();

    expect(getSource()).toBe(source);
  });

  it("does not delete the current screen when deletion is canceled", async () => {
    const source = `---
id: a
title: A
---
<div>A</div>
---
id: b
title: B
---
<div>B</div>`;
    const confirm = jest.fn(() => false);
    const { panel, getSource } = setup(source, true, confirm);

    clickByText(panel.el, "Screens");
    clickByText(panel.el, "Delete");
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith("Delete screen?");
    expect(getSource()).toBe(source);
  });

  it("switches to attributes on selection and back to parts on clear", () => {
    const { panel, setSelection } = setup(`<button class="sm-btn">OK</button>`);

    setSelection("0");
    expect(panel.el.querySelector("[aria-selected='true']")?.textContent).toBe("Attributes");

    setSelection(null);
    expect(panel.el.querySelector("[aria-selected='true']")?.textContent).toBe("Parts");
  });

  it("inserts a multi-element snippet and selects the first inserted element", () => {
    const { panel, getSource, getSelectedPath } = setup(`<div class="sm-screen"></div>`);

    clickByText(panel.el, "Form");

    expect(getSource()).toContain('<input class="sm-input" placeholder="Email"><button class="sm-btn sm-btn-primary">Submit</button>');
    expect(getSelectedPath()).toBe("0/0");
  });

  it("adds a screen template and switches to the appended screen", () => {
    const source = `---
id: a
title: A
---
<div class="sm-screen"></div>`;
    const { panel, getSource, getActiveScreenIndex } = setup(source);

    clickByText(panel.el, "Login");

    expect(screenBlockCount(getSource())).toBe(2);
    expect(getSource()).toContain("title: Login");
    expect(getSource()).toContain('<button class="sm-btn sm-btn-primary">Sign in</button>');
    expect(getActiveScreenIndex()).toBe(1);
  });

  it("writes and clears spacing presets", () => {
    const { panel, getSource, setSelection } = setup(`<div class="sm-card">Card</div>`);
    setSelection("0");
    const selects = panel.el.querySelectorAll("select");
    const padding = selects[0] as HTMLSelectElement;
    const gap = selects[1] as HTMLSelectElement;

    change(padding, "md");
    expect(getSource()).toContain('style="padding: 16px;"');

    const gapAfterRender = panel.el.querySelectorAll("select")[1] as HTMLSelectElement;
    change(gapAfterRender, "sm");
    expect(getSource()).toContain("gap: 8px;");

    const paddingAfterRender = panel.el.querySelectorAll("select")[0] as HTMLSelectElement;
    change(paddingAfterRender, "none");
    expect(getSource()).not.toContain("padding:");
    expect(getSource()).toContain("gap: 8px;");
    expect(gap.value).toBe("none");
  });

  it("writes text lines and rejects invalid image src values", () => {
    const { panel, getSource, setSelection } = setup(`<span class="sm-text"></span><div class="sm-img"></div>`);
    setSelection("0");
    const lines = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;

    change(lines, "4");
    expect(getSource()).toContain('data-lines="4"');

    const linesAfterRender = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;
    change(linesAfterRender, "0");
    expect(getSource()).toContain('data-lines="4"');

    setSelection("1");
    const src = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;
    change(src, "javascript:alert(1)");
    expect(getSource()).not.toContain("javascript:");

    const srcAfterRender = Array.from(panel.el.querySelectorAll("input")).at(-1) as HTMLInputElement;
    change(srcAfterRender, "https://example.com/a.png");
    expect(getSource()).toContain('src="https://example.com/a.png"');
  });

  it("wraps and unwraps the selected element", () => {
    const { panel, getSource, getSelectedPath, setSelection } = setup(`<div class="sm-screen"><button class="sm-btn">OK</button></div>`);
    setSelection("0/0");
    clickByText(panel.el, "Structure");

    clickByText(panel.el, "Wrap row");
    expect(getSource()).toContain('<div class="sm-row">');
    expect(getSelectedPath()).toBe("0/0/0");

    setSelection("0/0");
    clickByText(panel.el, "Structure");
    clickByText(panel.el, "Unwrap");
    expect(getSource()).not.toContain("sm-row");
  });

  it("moves screens up and down", () => {
    const source = `---
id: a
title: A
---
<div>A</div>
---
id: b
title: B
---
<div>B</div>
---
id: c
title: C
---
<div>C</div>`;
    const { panel, getSource, setActiveScreenIndex, getActiveScreenIndex } = setup(source);
    setActiveScreenIndex(2);
    clickByText(panel.el, "Screens");

    clickByText(panel.el, "Move up");
    expect(getSource().indexOf("id: c")).toBeLessThan(getSource().indexOf("id: b"));
    expect(getActiveScreenIndex()).toBe(1);

    clickByText(panel.el, "Move down");
    expect(getSource().indexOf("id: c")).toBeGreaterThan(getSource().indexOf("id: b"));
    expect(getActiveScreenIndex()).toBe(2);
  });

  it("writes and clears flex alignment controls", () => {
    const { panel, getSource, setSelection } = setup(`<div class="sm-row"><button>A</button><button>B</button></div>`);
    setSelection("0");

    const centerButtons = Array.from(panel.el.querySelectorAll("button")).filter((button) => button.textContent === "Center");
    centerButtons[0]?.click();
    expect(getSource()).toContain("justify-content: center;");

    const stretchButton = Array.from(panel.el.querySelectorAll("button")).find((button) => button.textContent === "Stretch");
    stretchButton?.click();
    expect(getSource()).toContain("align-items: stretch;");

    const defaultButtons = Array.from(panel.el.querySelectorAll("button")).filter((button) => button.textContent === "Default");
    defaultButtons.at(-2)?.click();
    expect(getSource()).not.toContain("justify-content:");
    expect(getSource()).toContain("align-items: stretch;");
  });

  it("moves a tree node with pointer drag events", () => {
    const { panel, getSource } = setup(`<div class="sm-screen"><button class="sm-btn">A</button><span class="sm-badge">B</span></div>`);
    clickByText(panel.el, "Structure");
    const nodes = Array.from(panel.el.querySelectorAll(".am-smep-tree-node")) as HTMLButtonElement[];
    const buttonNode = nodes.find((node) => node.textContent === "sm-btn");
    const badgeNode = nodes.find((node) => node.textContent === "sm-badge");
    if (!buttonNode || !badgeNode) throw new Error("tree nodes not found");

    badgeNode.dispatchEvent(pointer("pointerdown"));
    buttonNode.dispatchEvent(pointer("pointerover"));
    buttonNode.dispatchEvent(pointer("pointerup"));

    expect(getSource().indexOf("sm-badge")).toBeLessThan(getSource().indexOf("sm-btn"));
  });

  it("does not perform operations while design edit is off", () => {
    const { panel, getSource } = setup(`<div class="sm-card"></div>`, false);

    clickByText(panel.el, "sm-card");

    expect(getSource()).toBe(`<div class="sm-card"></div>`);
    expect(panel.el.querySelector(".am-smep-disabled")).not.toBeNull();
  });
});
