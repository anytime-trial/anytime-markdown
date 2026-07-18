import {
  annotateScreenmockHtmlPaths,
  applyElementOffset,
  appendScreenmockScreen,
  insertScreenmockElement,
  removeScreenmockElement,
  duplicateScreenmockElement,
  duplicateScreenmockScreen,
  parseScreenRanges,
  removeScreenmockScreen,
  renameScreenmockScreen,
  setScreenmockElementText,
  setScreenmockElementHref,
  setScreenmockElementOffset,
  setScreenmockElementStyleDeclaration,
  toggleScreenmockElementClass,
  removeScreenmockElementWidth,
  removeScreenmockElementHeight,
  moveScreenmockElement,
  moveScreenmockScreen,
  wrapScreenmockElement,
  unwrapScreenmockElement,
  setScreenmockElementAttribute,
  insertScreenmockFragment,
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

  it("インデントされた HTML では移動後も 1 要素 1 行を保つ", () => {
    const source = [
      '<div class="card">',
      "  <p>head</p>",
      "  <input />",
      '  <a href="#x">go</a>',
      "</div>",
    ].join("\n");

    const out = moveScreenmockElement(source, "0/2", "0", 0);

    expect(out).toBe(
      ['<div class="card">', '  <a href="#x">go</a>', "  <p>head</p>", "  <input>", "</div>"].join("\n"),
    );
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

describe("applyElementOffset", () => {
  it("フローを保つ相対オフセットを書き、親には触れない", () => {
    const source = '<div class="root"><button style="color: red;">OK</button></div>';

    const out = applyElementOffset(source, "0/0", { leftPx: 12.4, topPx: 30.6 });

    expect(out).toContain('<div class="root">');
    expect(out).toContain('<button style="color: red; position: relative; left: 12px; top: 31px;">OK</button>');
  });

  it("既存の left/top を上書きする", () => {
    const source = '<div><span style="position: relative; left: 1px; top: 2px;">x</span></div>';

    const out = applyElementOffset(source, "0/0", { leftPx: 40, topPx: 50 });

    expect(out).toContain('style="position: relative; left: 40px; top: 50px;"');
  });

  it("オフセットが 0 なら position / left / top を残さない", () => {
    const source = '<div><span style="position: relative; left: 10px; top: 10px; color: red;">x</span></div>';

    const out = applyElementOffset(source, "0/0", { leftPx: 0, topPx: 0 });

    expect(out).toContain('<span style="color: red;">x</span>');
  });

  it("position: static は relative へ読み替える", () => {
    const source = '<div><span style="position: static;">x</span></div>';

    const out = applyElementOffset(source, "0/0", { leftPx: 5, topPx: 6 });

    expect(out).toContain('style="position: relative; left: 5px; top: 6px;"');
  });

  it("既に absolute 指定の要素では position を上書きしない", () => {
    const source = '<div><span style="position: absolute; left: 1px;">x</span></div>';

    const out = applyElementOffset(source, "0/0", { leftPx: 5, topPx: 6 });

    expect(out).toContain('style="position: absolute; left: 5px; top: 6px;"');
  });

  it("存在しないパスでは元の HTML を返す", () => {
    const source = "<div><span>a</span></div>";

    expect(applyElementOffset(source, "3/3", { leftPx: 1, topPx: 1 })).toBe(source);
  });
});

describe("screenmock panel source mutations", () => {
  const source = [
    "---",
    "id: login",
    "title: Login",
    "---",
    '<div class="sm-screen">',
    '  <div class="sm-card" style="width: 80.0%; height: 240px; color: red;">',
    "    <p>Welcome</p>",
    '    <input class="sm-input" placeholder="Email" />',
    '    <a class="sm-btn" href="#home">Go</a>',
    "  </div>",
    "</div>",
    "---",
    "id: home",
    "title: Home",
    "---",
    '<div class="sm-screen">',
    "  <p>Home</p>",
    "</div>",
  ].join("\n");

  function firstScreenHtml(nextSource: string): string {
    return nextSource.split("---\nid: home")[0].split("---\nid: login\ntitle: Login\n---\n")[1].trimEnd();
  }

  it("コンテナ末尾へ要素を挿入し、既存ノードとインデントを保つ", () => {
    const out = insertScreenmockElement(source, 0, "0/0", '<button class="sm-btn">Cancel</button>');

    expect(out).toContain(
      [
        '  <div class="sm-card" style="width: 80.0%; height: 240px; color: red;">',
        "    <p>Welcome</p>",
        '    <input class="sm-input" placeholder="Email">',
        '    <a class="sm-btn" href="#home">Go</a>',
        '    <button class="sm-btn">Cancel</button>',
        "  </div>",
      ].join("\n"),
    );
    expect(annotateScreenmockHtmlPaths(firstScreenHtml(out))).toContain(
      '<button class="sm-btn" data-sm-path="0/0/3">Cancel</button>',
    );
  });

  it("指定位置へ要素を挿入し、後続要素のパスだけをずらす", () => {
    const out = insertScreenmockElement(source, 0, "0/0", '<span class="sm-badge">New</span>', 1);

    expect(out).toContain(
      [
        "    <p>Welcome</p>",
        '    <span class="sm-badge">New</span>',
        '    <input class="sm-input" placeholder="Email">',
        '    <a class="sm-btn" href="#home">Go</a>',
      ].join("\n"),
    );
    expect(annotateScreenmockHtmlPaths(firstScreenHtml(out))).toContain(
      '<a class="sm-btn" href="#home" data-sm-path="0/0/3">Go</a>',
    );
  });

  it("要素を子孫ごと削除する", () => {
    const out = removeScreenmockElement(source, 0, "0/0");

    expect(out).toContain(['<div class="sm-screen">', "</div>"].join("\n"));
    expect(out).not.toContain("Welcome");
    expect(out).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
  });

  it("要素を直後に複製し、複製先パスを返す", () => {
    const out = duplicateScreenmockElement(source, 0, "0/0/0");

    expect(out.newPath).toBe("0/0/1");
    expect(out.source).toContain(["    <p>Welcome</p>", "    <p>Welcome</p>"].join("\n"));
    expect(annotateScreenmockHtmlPaths(firstScreenHtml(out.source))).toContain(
      '<input class="sm-input" placeholder="Email" data-sm-path="0/0/2">',
    );
  });

  it("frontmatter なしの単一画面へ画面追加すると 2 画面として認識される", () => {
    const out = appendScreenmockScreen('<div class="sm-card">A</div>', {
      id: "b",
      html: '<div class="sm-screen">B</div>',
    });

    expect(parseScreenRanges(out)).toHaveLength(2);
    expect(out).toContain("id: screen-1");
    expect(out).toContain("id: b");
  });

  it("frontmatter なしの単一画面を複製すると 2 画面として認識される", () => {
    const out = duplicateScreenmockScreen('<div class="sm-card">A</div>', 0);

    expect(parseScreenRanges(out)).toHaveLength(2);
  });

  it("オフセットを 0 に戻してもユーザー指定の position: absolute と right は残る", () => {
    const source = '<div><span style="position: absolute; right: 0px; top: 8px;">x</span></div>';

    const out = setScreenmockElementOffset(source, 0, "0/0", { topPx: 0 });

    expect(out).toContain("position: absolute;");
    expect(out).toContain("right: 0px;");
    expect(out).not.toContain("top:");
  });

  it("sm-screen ラッパの無いモックでトップレベル要素を複製できる", () => {
    const bare = '<div class="sm-card">Card</div>';

    const out = duplicateScreenmockElement(bare, 0, "0");

    expect(out.newPath).toBe("1");
    expect(out.source).toContain('<div class="sm-card">Card</div><div class="sm-card">Card</div>');
  });

  it("要素直下のテキストを HTML エスケープして置換する", () => {
    const out = setScreenmockElementText(source, 0, "0/0/0", "<Next & Back>");

    expect(out).toContain("<p>&lt;Next &amp; Back&gt;</p>");
    expect(out).not.toContain("<p><Next & Back></p>");
  });

  it("void 要素では placeholder 属性を置換する", () => {
    const out = setScreenmockElementText(source, 0, "0/0/1", 'Name "required" & email');

    expect(out).toContain('<input class="sm-input" placeholder="Name &quot;required&quot; &amp; email">');
  });

  it("a 要素の href を画面 id へ設定し null で除去する", () => {
    const linked = setScreenmockElementHref(source, 0, "0/0/2", "home");
    const unlinked = setScreenmockElementHref(linked, 0, "0/0/2", null);

    expect(linked).toContain('<a class="sm-btn" href="#home">Go</a>');
    expect(unlinked).toContain('<a class="sm-btn">Go</a>');
  });

  it("不正な画面 id は href を変更しない", () => {
    expect(setScreenmockElementHref(source, 0, "0/0/2", "")).toBe(source);
    expect(setScreenmockElementHref(source, 0, "0/0/2", "bad#id")).toBe(source);
  });

  it("style から width と height を個別に取り除く", () => {
    const withoutWidth = removeScreenmockElementWidth(source, 0, "0/0");
    const withoutHeight = removeScreenmockElementHeight(source, 0, "0/0");

    expect(withoutWidth).toContain('<div class="sm-card" style="height: 240px; color: red;">');
    expect(withoutHeight).toContain('<div class="sm-card" style="width: 80.0%; color: red;">');
  });

  it("class を順序維持で付与・除去し、no-op では本文を変えない", () => {
    const enabled = toggleScreenmockElementClass(source, 0, "0/0/2", "sm-btn-primary", true);
    const enabledAgain = toggleScreenmockElementClass(enabled, 0, "0/0/2", "sm-btn-primary", true);
    const disabled = toggleScreenmockElementClass(enabled, 0, "0/0/2", "sm-btn-primary", false);
    const disabledAgain = toggleScreenmockElementClass(source, 0, "0/0/2", "sm-btn-primary", false);

    expect(enabled).toContain('<a class="sm-btn sm-btn-primary" href="#home">Go</a>');
    expect(enabledAgain).toBe(enabled);
    expect(disabled).toContain('<a class="sm-btn" href="#home">Go</a>');
    expect(disabled).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
    expect(disabledAgain).toBe(source);
  });

  it("style の任意宣言を設定・除去し、空なら style 属性も除去する", () => {
    const colored = setScreenmockElementStyleDeclaration(source, 0, "0/0", "background", "var(--sm-surface)");
    const clearedColor = setScreenmockElementStyleDeclaration(colored, 0, "0/0", "color", null);
    const singleStyle = '<div class="sm-screen"><button style="color: red;">OK</button></div>';
    const emptyStyle = setScreenmockElementStyleDeclaration(singleStyle, 0, "0/0", "color", null);

    expect(colored).toContain(
      'style="width: 80.0%; height: 240px; color: red; background: var(--sm-surface);"',
    );
    expect(clearedColor).toContain(
      'style="width: 80.0%; height: 240px; background: var(--sm-surface);"',
    );
    expect(emptyStyle).toBe('<div class="sm-screen"><button>OK</button></div>');
  });

  it("オフセットを絶対値で片側ずつ設定し、0 で宣言を取り除く", () => {
    const positioned = setScreenmockElementOffset(source, 0, "0/0", { leftPx: 12 });
    const movedTop = setScreenmockElementOffset(positioned, 0, "0/0", { topPx: -4.4 });
    const clearedLeft = setScreenmockElementOffset(movedTop, 0, "0/0", { leftPx: 0 });
    const clearedBoth = setScreenmockElementOffset(clearedLeft, 0, "0/0", { topPx: 0 });

    expect(positioned).toContain(
      'style="width: 80.0%; height: 240px; color: red; position: relative; left: 12px;"',
    );
    expect(movedTop).toContain(
      'style="width: 80.0%; height: 240px; color: red; position: relative; left: 12px; top: -4px;"',
    );
    expect(clearedLeft).toContain(
      'style="width: 80.0%; height: 240px; color: red; position: relative; top: -4px;"',
    );
    expect(clearedBoth).toContain('style="width: 80.0%; height: 240px; color: red;"');
  });

  it("既存の absolute 配置は維持して座標だけを更新する", () => {
    const absolute = [
      '<div class="sm-screen">',
      '  <button style="position: absolute; left: 1px; color: red;">OK</button>',
      "</div>",
    ].join("\n");

    const out = setScreenmockElementOffset(absolute, 0, "0/0", { topPx: 9, leftPx: 2 });

    expect(out).toContain('style="position: absolute; left: 2px; color: red; top: 9px;"');
  });

  it("画面を追加・複製・削除し、対象外画面本文を保つ", () => {
    const appended = appendScreenmockScreen(source, {
      id: "settings",
      title: "Settings",
      html: '<div class="sm-screen"><p>Settings</p></div>',
    });
    const duplicated = duplicateScreenmockScreen(appended, 0);
    const removed = removeScreenmockScreen(duplicated, 1);

    expect(parseScreenRanges(appended)).toHaveLength(3);
    expect(appended).toContain("id: settings\ntitle: Settings\n---\n<div");
    expect(duplicated).toContain("id: login-copy");
    expect(removed).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
    expect(parseScreenRanges(removed)).toHaveLength(3);
    expect(removeScreenmockScreen('<div class="sm-screen"></div>', 0)).toBe("");
  });

  it("画面 id/title を frontmatter に書き戻し、必要なら href 参照も更新する", () => {
    const renamed = renameScreenmockScreen(source, 1, { id: "dashboard", title: "Dashboard" }, { updateRefs: true });
    const bare = renameScreenmockScreen('<div class="sm-screen"><a href="#next">Next</a></div>', 0, {
      id: "first",
      title: "First",
    });

    expect(renamed).toContain("id: dashboard\ntitle: Dashboard\n---\n<div");
    expect(renamed).toContain('<a class="sm-btn" href="#dashboard">Go</a>');
    expect(renamed).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
    expect(bare).toBe(
      ['---', 'id: first', 'title: First', '---', '<div class="sm-screen"><a href="#next">Next</a></div>'].join("\n"),
    );
    expect(parseScreenRanges(bare)).toHaveLength(1);
  });

  it("画面ブロックを並べ替え、各ブロック本文と frontmatter をそのまま保つ", () => {
    const out = moveScreenmockScreen(source, 1, 0);

    expect(out).toBe(
      [
        "---",
        "id: home",
        "title: Home",
        "---",
        '<div class="sm-screen">',
        "  <p>Home</p>",
        "</div>",
        "---",
        "id: login",
        "title: Login",
        "---",
        '<div class="sm-screen">',
        '  <div class="sm-card" style="width: 80.0%; height: 240px; color: red;">',
        "    <p>Welcome</p>",
        '    <input class="sm-input" placeholder="Email" />',
        '    <a class="sm-btn" href="#home">Go</a>',
        "  </div>",
        "</div>",
      ].join("\n"),
    );
  });

  it("frontmatter なし単一画面の並べ替えは no-op にする", () => {
    const bare = '<div class="sm-screen"><p>Only</p></div>';

    expect(moveScreenmockScreen(bare, 0, 0)).toBe(bare);
    expect(moveScreenmockScreen(bare, 0, 1)).toBe(bare);
  });

  it("要素を sm-row で包み、包んだ後の要素パスを返し、対象外画面を保つ", () => {
    const out = wrapScreenmockElement(source, 0, "0/0/1", "sm-row");

    expect(out.newPath).toBe("0/0/1/0");
    expect(out.source).toContain(
      [
        "    <p>Welcome</p>",
        '    <div class="sm-row">',
        '      <input class="sm-input" placeholder="Email">',
        "    </div>",
        '    <a class="sm-btn" href="#home">Go</a>',
      ].join("\n"),
    );
    expect(out.source).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
    expect(out.source).not.toContain("data-sm-path");
  });

  it("sm-screen 自体や不正な wrapper class は包まず no-op にする", () => {
    expect(wrapScreenmockElement(source, 0, "0", "sm-row").source).toBe(source);
    expect(wrapScreenmockElement(source, 0, "0/0/1", "sm-card").source).toBe(source);
  });

  it("包み解除で子要素を親位置へ持ち上げ、対象外の整形を保つ", () => {
    const wrapped = [
      '<div class="sm-screen">',
      '  <div class="sm-card">',
      '    <div class="sm-row">',
      "      <p>One</p>",
      '      <button class="sm-btn">Two</button>',
      "    </div>",
      "    <p>After</p>",
      "  </div>",
      "</div>",
    ].join("\n");

    const out = unwrapScreenmockElement(wrapped, 0, "0/0/0");

    expect(out).toBe(
      [
        '<div class="sm-screen">',
        '  <div class="sm-card">',
        "    <p>One</p>",
        '    <button class="sm-btn">Two</button>',
        "    <p>After</p>",
        "  </div>",
        "</div>",
      ].join("\n"),
    );
  });

  it("トップレベルの包み解除と空コンテナ削除ができる", () => {
    const top = ['<div class="sm-row">', "  <p>A</p>", "  <p>B</p>", "</div>"].join("\n");
    const empty = '<div class="sm-col"></div><p>After</p>';

    expect(unwrapScreenmockElement(top, 0, "0")).toBe("<p>A</p><p>B</p>");
    expect(unwrapScreenmockElement(empty, 0, "0")).toBe("<p>After</p>");
  });

  it("data-lines を正の整数文字列だけ設定し null で除去する", () => {
    const textSource = '<div class="sm-screen"><p class="sm-text">Body</p><p>Other</p></div>';
    const set = setScreenmockElementAttribute(textSource, 0, "0/0", "data-lines", "3");
    const removed = setScreenmockElementAttribute(set, 0, "0/0", "data-lines", null);

    expect(set).toBe('<div class="sm-screen"><p class="sm-text" data-lines="3">Body</p><p>Other</p></div>');
    expect(removed).toBe(textSource);
    expect(setScreenmockElementAttribute(textSource, 0, "0/0", "data-lines", "0")).toBe(textSource);
    expect(setScreenmockElementAttribute(textSource, 0, "0/0", "data-lines", "1.5")).toBe(textSource);
  });

  it("src は data: と https: だけ受理し、大小文字や空白での迂回を拒否する", () => {
    const imageSource = '<div class="sm-screen"><img class="sm-img" src="data:image/png;base64,old"></div>';
    const https = setScreenmockElementAttribute(imageSource, 0, "0/0", "src", "https://example.com/a.png");
    const data = setScreenmockElementAttribute(https, 0, "0/0", "src", "data:image/png;base64,next");
    const removed = setScreenmockElementAttribute(data, 0, "0/0", "src", null);

    expect(https).toBe('<div class="sm-screen"><img class="sm-img" src="https://example.com/a.png"></div>');
    expect(data).toBe('<div class="sm-screen"><img class="sm-img" src="data:image/png;base64,next"></div>');
    expect(removed).toBe('<div class="sm-screen"><img class="sm-img"></div>');
    expect(setScreenmockElementAttribute(imageSource, 0, "0/0", "src", "javascript:alert(1)")).toBe(imageSource);
    expect(setScreenmockElementAttribute(imageSource, 0, "0/0", "src", "JAVASCRIPT:alert(1)")).toBe(imageSource);
    expect(setScreenmockElementAttribute(imageSource, 0, "0/0", "src", " https://example.com/a.png")).toBe(imageSource);
  });

  it("未許可属性名と存在しないパスでは source を変更しない", () => {
    expect(setScreenmockElementAttribute(source, 0, "0/0/2", "href", "https://example.com")).toBe(source);
    expect(setScreenmockElementAttribute(source, 0, "9/9", "src", "https://example.com/a.png")).toBe(source);
  });

  it("複数トップレベル要素の断片を指定位置へ挿入し、挿入後パス配列を返す", () => {
    const out = insertScreenmockFragment(
      source,
      0,
      "0/0",
      '<input class="sm-input" placeholder="Password" /><button class="sm-btn">Login</button>',
      1,
    );

    expect(out.newPaths).toEqual(["0/0/1", "0/0/2"]);
    expect(out.source).toContain(
      [
        "    <p>Welcome</p>",
        '    <input class="sm-input" placeholder="Password">',
        '    <button class="sm-btn">Login</button>',
        '    <input class="sm-input" placeholder="Email">',
        '    <a class="sm-btn" href="#home">Go</a>',
      ].join("\n"),
    );
    expect(out.source).toContain('<div class="sm-screen">\n  <p>Home</p>\n</div>');
    expect(out.source).not.toContain("data-sm-path");
  });

  it("断片挿入は空断片や存在しないコンテナでは no-op にする", () => {
    expect(insertScreenmockFragment(source, 0, "0/0", "text only").source).toBe(source);
    expect(insertScreenmockFragment(source, 0, "9/9", "<p>Bad</p>").source).toBe(source);
  });
});
