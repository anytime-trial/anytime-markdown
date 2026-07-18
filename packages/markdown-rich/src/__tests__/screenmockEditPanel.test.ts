import { createScreenmockEditPanel } from "../vanilla/screenmockEditPanel";

const labels: Record<string, string> = {
  screenmockPanelTabParts: "Parts",
  screenmockPanelTabAttributes: "Attributes",
  screenmockPanelTabStructure: "Structure",
  screenmockPanelTabScreens: "Screens",
  screenmockPanelDesignOff: "Design off",
  screenmockPanelCategoryLayout: "Layout",
  screenmockPanelCategoryComponents: "Components",
  screenmockPanelNoSelection: "No selection",
  screenmockPanelElementType: "Type",
  screenmockPanelSize: "Size",
  screenmockPanelWidth: "Width",
  screenmockPanelHeight: "Height",
  screenmockPanelText: "Text",
  screenmockPanelPlaceholder: "Placeholder",
  screenmockPanelHref: "Link target",
  screenmockPanelHrefNone: "None",
  screenmockPanelDelete: "Delete",
  screenmockPanelDuplicate: "Duplicate",
  screenmockPanelTreePlaceholder: "Tree placeholder",
  screenmockPanelScreensPlaceholder: "Screens placeholder",
};

function change(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickByText(root: HTMLElement, text: string): void {
  const button = Array.from(root.querySelectorAll("button")).find((el) => el.textContent === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}

function setup(initial: string, enabled = true) {
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

  it("switches to attributes on selection and back to parts on clear", () => {
    const { panel, setSelection } = setup(`<button class="sm-btn">OK</button>`);

    setSelection("0");
    expect(panel.el.querySelector("[aria-selected='true']")?.textContent).toBe("Attributes");

    setSelection(null);
    expect(panel.el.querySelector("[aria-selected='true']")?.textContent).toBe("Parts");
  });

  it("does not perform operations while design edit is off", () => {
    const { panel, getSource } = setup(`<div class="sm-card"></div>`, false);

    clickByText(panel.el, "sm-card");

    expect(getSource()).toBe(`<div class="sm-card"></div>`);
    expect(panel.el.querySelector(".am-smep-disabled")).not.toBeNull();
  });
});
