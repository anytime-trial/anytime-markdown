import {
  applyElementAbsolutePosition,
  moveScreenmockElement,
} from "../vanilla/screenmockHtmlMutations";

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

describe("applyElementAbsolutePosition", () => {
  it("対象へ absolute と left/top を書き、親へ relative を付ける", () => {
    const source = '<div class="root"><button style="color: red;">OK</button></div>';

    const out = applyElementAbsolutePosition(source, "0/0", { leftPx: 12.4, topPx: 30.6 });

    expect(out).toContain('<div class="root" style="position: relative;">');
    expect(out).toContain('<button style="color: red; position: absolute; left: 12px; top: 31px;">OK</button>');
  });

  it("親が既に配置済みなら親の style を変えない", () => {
    const source = '<div class="root" style="position: relative;"><span>x</span></div>';

    const out = applyElementAbsolutePosition(source, "0/0", { leftPx: 5, topPx: 5 });

    expect(out).toContain('<div class="root" style="position: relative;">');
    expect((out.match(/position: relative/g) ?? []).length).toBe(1);
  });

  it("既存の left/top を上書きする", () => {
    const source = '<div><span style="position: absolute; left: 1px; top: 2px;">x</span></div>';

    const out = applyElementAbsolutePosition(source, "0/0", { leftPx: 40, topPx: 50 });

    expect(out).toContain('style="position: absolute; left: 40px; top: 50px;"');
  });

  it("存在しないパスでは元の HTML を返す", () => {
    const source = "<div><span>a</span></div>";

    expect(applyElementAbsolutePosition(source, "3/3", { leftPx: 1, topPx: 1 })).toBe(source);
  });
});
