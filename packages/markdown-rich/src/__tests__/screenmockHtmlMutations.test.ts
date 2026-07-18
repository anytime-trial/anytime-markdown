import { moveScreenmockElement } from "../vanilla/screenmockHtmlMutations";

describe("moveScreenmockElement", () => {
  it("同じ親の中で要素を前へ移動する", () => {
    const source = '<div class="root"><span>a</span><span>b</span><button>c</button></div>';

    const out = moveScreenmockElement(source, "0/2", "0", 0);

    expect(out).toBe('<div class="root"><button>c</button><span>a</span><span>b</span></div>');
  });

  it("同じ親の中で要素を後ろへ移動する", () => {
    const source = '<div class="root"><span>a</span><span>b</span><button>c</button></div>';

    const out = moveScreenmockElement(source, "0/0", "0", 2);

    expect(out).toBe('<div class="root"><span>b</span><span>a</span><button>c</button></div>');
  });

  it("別のコンテナへ末尾追加できる", () => {
    const source = '<div class="root"><div class="a"><button>go</button></div><div class="b"></div></div>';

    const out = moveScreenmockElement(source, "0/0/0", "0/1", 0);

    expect(out).toBe('<div class="root"><div class="a"></div><div class="b"><button>go</button></div></div>');
  });

  it("data-sm-path 属性を出力に残さない", () => {
    const source = "<div><span>a</span><span>b</span></div>";

    expect(moveScreenmockElement(source, "0/1", "0", 0)).not.toContain("data-sm-path");
  });

  it("自分自身の子孫へは移動せず元の HTML を返す", () => {
    const source = '<div class="root"><div class="box"><span>inner</span></div></div>';

    expect(moveScreenmockElement(source, "0/0", "0/0/0", 0)).toBe(source);
  });

  it("存在しないパスでは元の HTML を返す", () => {
    const source = "<div><span>a</span></div>";

    expect(moveScreenmockElement(source, "9/9", "0", 0)).toBe(source);
    expect(moveScreenmockElement(source, "0/0", "9", 0)).toBe(source);
  });
});
