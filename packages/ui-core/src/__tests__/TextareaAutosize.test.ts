import { createTextareaAutosize } from "../TextareaAutosize";

describe("createTextareaAutosize", () => {
  it("textarea 要素を生成する", () => {
    const { el } = createTextareaAutosize();
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("value オプションを反映する", () => {
    const { el } = createTextareaAutosize({ value: "hello" });
    expect(el.value).toBe("hello");
  });

  it("placeholder を反映する", () => {
    const { el } = createTextareaAutosize({ placeholder: "type here" });
    expect(el.placeholder).toBe("type here");
  });

  it("disabled を反映する", () => {
    const { el } = createTextareaAutosize({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it("className を反映する", () => {
    const { el } = createTextareaAutosize({ className: "my-textarea" });
    expect(el.className).toBe("my-textarea");
  });

  it("ariaLabel を反映する", () => {
    const { el } = createTextareaAutosize({ ariaLabel: "notes" });
    expect(el.getAttribute("aria-label")).toBe("notes");
  });

  it("testId を反映する", () => {
    const { el } = createTextareaAutosize({ testId: "ta-test" });
    expect(el.getAttribute("data-testid")).toBe("ta-test");
  });

  it("style を反映する", () => {
    const { el } = createTextareaAutosize({ style: { padding: "4px" } });
    expect(el.style.padding).toBe("4px");
  });

  it("input イベントで onChange が呼ばれる", () => {
    const onChange = jest.fn();
    const { el } = createTextareaAutosize({ onChange });
    el.value = "changed";
    el.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith("changed");
  });

  it("setValue で値が更新される", () => {
    const { el, setValue } = createTextareaAutosize({ value: "initial" });
    setValue("updated");
    expect(el.value).toBe("updated");
  });

  it("destroy 後は onChange が呼ばれない", () => {
    const onChange = jest.fn();
    const { el, destroy } = createTextareaAutosize({ onChange });
    destroy();
    el.value = "x";
    el.dispatchEvent(new Event("input"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("minRows を rows 属性に反映する", () => {
    const { el } = createTextareaAutosize({ minRows: 3 });
    expect(el.rows).toBe(3);
  });
});
