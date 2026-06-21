import { createCheckbox } from "../Checkbox";

describe("createCheckbox", () => {
  it("既定で span を生成する", () => {
    const { el } = createCheckbox();
    expect(el.tagName).toBe("SPAN");
  });

  it("input[type=checkbox] を含む", () => {
    const { el } = createCheckbox();
    const input = el.querySelector("input");
    expect(input?.type).toBe("checkbox");
  });

  it("checked=true で PATH_CHECKED が使われ data-checked=true になる", () => {
    const { el } = createCheckbox({ checked: true });
    const path = el.querySelector("path");
    // checked path contains 14.17 (unique substring)
    expect(path?.getAttribute("d")).toContain("14.17");
    expect(el.getAttribute("data-checked")).toBe("true");
  });

  it("indeterminate=true で indeterminate path が使われる", () => {
    const { el } = createCheckbox({ indeterminate: true });
    const path = el.querySelector("path");
    // indeterminate path contains "10H7v-2h10v2z"
    expect(path?.getAttribute("d")).toContain("10H7v-2h10v2z");
    expect(el.getAttribute("data-indeterminate")).toBe("true");
  });

  it("change イベントで onChange(true) が呼ばれる", () => {
    const onChange = jest.fn();
    const { el } = createCheckbox({ checked: false, onChange });
    const input = el.querySelector("input")!;
    // simulate check
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("change イベントで onChange(false) が呼ばれる", () => {
    const onChange = jest.fn();
    const { el } = createCheckbox({ checked: true, onChange });
    const input = el.querySelector("input")!;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("setChecked で checked=true に更新する", () => {
    const { el, setChecked } = createCheckbox({ checked: false });
    setChecked(true);
    expect(el.getAttribute("data-checked")).toBe("true");
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(true);
    const path = el.querySelector("path");
    expect(path?.getAttribute("d")).toContain("14.17");
  });

  it("setChecked で checked=false に更新する", () => {
    const { el, setChecked } = createCheckbox({ checked: true });
    setChecked(false);
    expect(el.getAttribute("data-checked")).toBe("false");
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.checked).toBe(false);
    // unchecked path contains "M19 5v14"
    const path = el.querySelector("path");
    expect(path?.getAttribute("d")).toContain("M19 5v14");
  });

  it("disabled=true で input が disabled になる", () => {
    const { el } = createCheckbox({ disabled: true });
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("name / value を input に渡す", () => {
    const { el } = createCheckbox({ name: "myCheck", value: "yes" });
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.name).toBe("myCheck");
    expect(input.value).toBe("yes");
  });

  it("style を反映する", () => {
    const { el } = createCheckbox({ style: { opacity: "0.5" } });
    expect(el.style.opacity).toBe("0.5");
  });
});
