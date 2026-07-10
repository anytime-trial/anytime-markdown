import { consumeGitHubPickerIntent, markGitHubPickerIntent } from "../lib/githubPickerIntent";

describe("githubPickerIntent", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("記録していなければ false を返す", () => {
    expect(consumeGitHubPickerIntent()).toBe(false);
  });

  it("記録した intent は一度だけ true を返す（consume で消える）", () => {
    markGitHubPickerIntent();
    expect(consumeGitHubPickerIntent()).toBe(true);
    expect(consumeGitHubPickerIntent()).toBe(false);
  });

  it("sessionStorage が例外を投げても false を返し落ちない", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(consumeGitHubPickerIntent()).toBe(false);
    expect(warn).toHaveBeenCalled();

    getItem.mockRestore();
    warn.mockRestore();
  });
});
