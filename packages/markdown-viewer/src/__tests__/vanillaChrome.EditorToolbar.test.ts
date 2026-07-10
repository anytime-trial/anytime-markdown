/**
 * components-vanilla/EditorToolbar.ts — 脱React メインツールバー（vanilla）のテスト。
 *
 * 生成 / 属性 / イベント発火（editor コマンド・コールバック）/ roving tabindex の
 * キーボードナビゲーション / destroy クリーンアップを検証する。重い editor は
 * mock（chain/can/on/off スタブ）でスタブ化する。
 *
 * jsdom の罠を回避: getComputedStyle で継承 CSS カスタムプロパティを検証せず、
 * el.style.cssText が `var(--am-...)` を含むことを見る。opacity:var() / currentColor は検証しない。
 */
import { createEditorToolbar } from "../components-vanilla/EditorToolbar";
import type {
  ToolbarFileHandlers,
  ToolbarModeHandlers,
  ToolbarModeState,
} from "../types/toolbar";

// --- mock editor（transaction emitter + chain/can スタブ） ---
function makeEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  const ran: string[] = [];
  let canUndo = true;
  let canRedo = false;

  const chain = () => {
    const c: any = {
      focus: () => c,
      undo: () => {
        ran.push("undo");
        return c;
      },
      redo: () => {
        ran.push("redo");
        return c;
      },
      run: () => true,
    };
    return c;
  };

  const editor: any = {
    isEditable: true,
    state: {},
    getAttributes: () => ({}),
    isActive: () => false,
    can: () => ({ undo: () => canUndo, redo: () => canRedo }),
    chain,
    on(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    off(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
  };

  return {
    editor,
    ran,
    emit: (evt: string) => (listeners[evt] ?? []).forEach((f) => f()),
    listenerCount: (evt: string) => (listeners[evt] ?? []).length,
    setCan: (u: boolean, r: boolean) => {
      canUndo = u;
      canRedo = r;
    },
  };
}

function defaultModeState(over: Partial<ToolbarModeState> = {}): ToolbarModeState {
  return {
    sourceMode: false,
    readonlyMode: false,
    reviewMode: false,
    outlineOpen: false,
    inlineMergeOpen: false,
    commentOpen: false,
    explorerOpen: false,
    ...over,
  };
}

function defaultModeHandlers(): ToolbarModeHandlers {
  return {
    onSwitchToSource: jest.fn(),
    onSwitchToWysiwyg: jest.fn(),
    onSwitchToReview: jest.fn(),
    onSwitchToReadonly: jest.fn(),
    onToggleOutline: jest.fn(),
    onToggleComments: jest.fn(),
    onMerge: jest.fn(),
    onToggleExplorer: jest.fn(),
  };
}

function defaultFileHandlers(): ToolbarFileHandlers {
  return {
    onDownload: jest.fn(),
    onImport: jest.fn(),
    onClear: jest.fn(),
    onOpenFile: jest.fn(),
    onSaveFile: jest.fn(),
    onSaveAsFile: jest.fn(),
    onExportPdf: jest.fn(),
    onLoadRightFile: jest.fn(),
  };
}

function mount(over: Partial<Parameters<typeof createEditorToolbar>[0]> = {}) {
  const m = makeEditor();
  const modeHandlers = defaultModeHandlers();
  const fileHandlers = defaultFileHandlers();
  const handle = createEditorToolbar({
    editor: m.editor,
    fileHandlers,
    modeState: defaultModeState(),
    modeHandlers,
    t: (k: string) => k,
    ...over,
  });
  document.body.appendChild(handle.el);
  return { ...m, handle, modeHandlers, fileHandlers };
}

afterEach(() => {
  document.body.replaceChildren();
  document.querySelectorAll("[data-am-tooltip]").forEach((el) => el.remove());
});

describe("createEditorToolbar — 生成と属性", () => {
  it("role=toolbar / aria-label / id を持つ Paper を生成する", () => {
    const { handle } = mount();
    expect(handle.el.getAttribute("role")).toBe("toolbar");
    expect(handle.el.getAttribute("aria-label")).toBe("editorToolbar");
    expect(handle.el.id).toBe("md-editor-toolbar");
    expect(handle.el.getAttribute("data-variant")).toBe("outlined");
    handle.destroy();
  });

  it("sticky / z-index / 背景は CSS 変数（var(--am-...)）で表現する", () => {
    const { handle } = mount();
    const css = handle.el.style.cssText;
    expect(css).toContain("position: sticky");
    expect(css).toContain("var(--am-color-bg-paper)");
    expect(handle.el.style.zIndex).toBe("10");
    handle.destroy();
  });

  it("root は sticky 配置で生成される", () => {
    // 注: border-bottom の有無は jsdom が border shorthand/longhand を round-trip しないため検証不可。
    // 代わりに root レイアウト（position:sticky）が cssText から適用されることを確認する。
    const { handle } = mount();
    expect(handle.el.style.position).toBe("sticky");
    handle.destroy();
  });

  it("Undo / Redo ボタンを生成する", () => {
    const { handle } = mount();
    expect(handle.el.querySelector('button[aria-label="undo"]')).toBeTruthy();
    expect(handle.el.querySelector('button[aria-label="redo"]')).toBeTruthy();
    handle.destroy();
  });

  it("モード切替の 4 ボタン（readonly/review/wysiwyg/source）を生成する", () => {
    const { handle } = mount();
    for (const v of ["readonly", "review", "wysiwyg", "source"]) {
      expect(handle.el.querySelector(`button[aria-label="${v}"]`)).toBeTruthy();
    }
    handle.destroy();
  });

  it("Home ロゴは onHomeClick 指定時のみ生成する", () => {
    const onHomeClick = jest.fn();
    const { handle } = mount({ onHomeClick });
    const homeBtn = handle.el.querySelector('button[aria-label="home"]');
    expect(homeBtn).toBeTruthy();
    handle.destroy();
  });

  it("hide フラグで該当セクションを抑止する", () => {
    const { handle } = mount({
      hide: { undoRedo: true, modeToggle: true, moreMenu: true },
    });
    expect(handle.el.querySelector('button[aria-label="undo"]')).toBeNull();
    expect(handle.el.querySelector('button[aria-label="wysiwyg"]')).toBeNull();
    expect(handle.el.querySelector("[data-more-desktop]")).toBeNull();
    handle.destroy();
  });

  it("sideToolbar 併用時は desktop more（ハンバーガー）を side-coupled で隠す（≥900px でサイドバーと重複）", () => {
    const { handle } = mount({ sideToolbar: true });
    const desktopMore = handle.el.querySelector("[data-more-desktop]");
    expect(desktopMore).toBeTruthy();
    expect(desktopMore?.hasAttribute("data-am-side-coupled")).toBe(true);
    // mobile more（<900px・サイドバー非表示時の唯一の導線）は隠さない。
    const mobileMore = handle.el.querySelector("[data-more-mobile]");
    expect(mobileMore?.hasAttribute("data-am-side-coupled")).toBe(false);
    handle.destroy();
  });

  it("sideToolbar なしでは desktop more に side-coupled を付けない", () => {
    const { handle } = mount();
    const desktopMore = handle.el.querySelector("[data-more-desktop]");
    expect(desktopMore?.hasAttribute("data-am-side-coupled")).toBe(false);
    handle.destroy();
  });

  it("モードボタンのラベルは data-mode-label を持ち inline display を持たない（表示制御をシートに委ねる）", () => {
    const { handle } = mount();
    const reviewBtn = handle.el.querySelector('button[aria-label="review"]') as HTMLElement;
    const label = reviewBtn.querySelector("[data-mode-label]") as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent).toBe("review");
    // 表示制御は注入スタイルシートが所有する（インライン display を置かない）。
    expect(label.style.display).toBe("");
    handle.destroy();
  });

  it("responsive スタイルは狭幅でモードラベルを隠し ≥900px で表示する（ハンバーガー表示時アイコンのみ）", () => {
    const { handle } = mount();
    const style = document.getElementById("am-toolbar-responsive-style");
    expect(style?.textContent).toContain("[data-mode-label] { display: none; }");
    expect(style?.textContent).toContain("[data-mode-label] { display: inline; }");
    handle.destroy();
  });
});

describe("createEditorToolbar — ファイル操作", () => {
  it("supportsDirectAccess で open/save/saveAs を生成し、クリックでハンドラを呼ぶ", () => {
    const { handle, fileHandlers } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      isDirty: true,
    });
    (handle.el.querySelector('button[aria-label="openFile"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="saveAsFile"]') as HTMLButtonElement).click();
    expect(fileHandlers.onOpenFile).toHaveBeenCalled();
    expect(fileHandlers.onSaveFile).toHaveBeenCalled();
    expect(fileHandlers.onSaveAsFile).toHaveBeenCalled();
    handle.destroy();
  });

  it("createNew ボタンが open の直前に置かれ、クリックで onNewFile を呼ぶ", () => {
    const onNewFile = jest.fn();
    const fileHandlers = { ...defaultFileHandlers(), onNewFile };
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers,
    });
    const labels = Array.from(handle.el.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(labels.indexOf("createNew")).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf("createNew")).toBe(labels.indexOf("openFile") - 1);
    (handle.el.querySelector('button[aria-label="createNew"]') as HTMLButtonElement).click();
    expect(onNewFile).toHaveBeenCalled();
    handle.destroy();
  });

  it("非 direct access でも createNew ボタンを出す", () => {
    const { handle } = mount({ fileHandlers: { ...defaultFileHandlers(), onNewFile: jest.fn() } });
    expect(handle.el.querySelector('button[aria-label="createNew"]')).toBeTruthy();
    handle.destroy();
  });

  it("externalSaveOnly では createNew ボタンを出さない", () => {
    const { handle } = mount({
      fileCapabilities: { externalSaveOnly: true, hasSaveTarget: true },
      fileHandlers: { ...defaultFileHandlers(), onNewFile: jest.fn() },
    });
    expect(handle.el.querySelector('button[aria-label="createNew"]')).toBeNull();
    handle.destroy();
  });

  it("readonlyMode では createNew ボタンが無効", () => {
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers: { ...defaultFileHandlers(), onNewFile: jest.fn() },
      modeState: { ...defaultModeState(), readonlyMode: true },
    });
    const btn = handle.el.querySelector('button[aria-label="createNew"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    handle.destroy();
  });

  it("onSetSaveAnchor 注入時は save がメニュー化され saveAs 単独ボタンが消える", () => {
    const onSetSaveAnchor = jest.fn();
    const fileHandlers = defaultFileHandlers();
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers,
      onSetSaveAnchor,
      isDirty: true,
    });
    const saveBtn = handle.el.querySelector('button[aria-label="save"]') as HTMLButtonElement;
    expect(saveBtn.getAttribute("aria-haspopup")).toBe("menu");
    expect(handle.el.querySelector('button[aria-label="saveAsFile"]')).toBeNull();

    saveBtn.click();
    expect(fileHandlers.onSaveFile).not.toHaveBeenCalled();
    expect(onSetSaveAnchor).toHaveBeenCalledTimes(1);
    const [anchorEl, handlers] = onSetSaveAnchor.mock.calls[0];
    expect(anchorEl).toBe(saveBtn);
    handlers.onSaveFile();
    expect(fileHandlers.onSaveFile).toHaveBeenCalled();
    handlers.onSaveAsFile();
    expect(fileHandlers.onSaveAsFile).toHaveBeenCalled();
    handle.destroy();
  });

  it("メニュー化した save は未保存・ファイル未オープンでも押下できる（項目側で無効化する）", () => {
    const onSetSaveAnchor = jest.fn();
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: false },
      fileHandlers: defaultFileHandlers(),
      onSetSaveAnchor,
      isDirty: false,
    });
    const saveBtn = handle.el.querySelector('button[aria-label="save"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();
    expect(onSetSaveAnchor).toHaveBeenCalledTimes(1);
    // 上書き保存の可否は項目側へ渡す。
    expect(onSetSaveAnchor.mock.calls[0][1].overwriteDisabled).toBe(true);
    handle.destroy();
  });

  it("readonlyMode ではメニュー化した save も無効", () => {
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers: defaultFileHandlers(),
      onSetSaveAnchor: jest.fn(),
      modeState: { ...defaultModeState(), readonlyMode: true },
      isDirty: true,
    });
    const saveBtn = handle.el.querySelector('button[aria-label="save"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    handle.destroy();
  });

  it("externalSaveOnly では save をメニュー化せず直接保存する", () => {
    const fileHandlers = defaultFileHandlers();
    const onSetSaveAnchor = jest.fn();
    const { handle } = mount({
      fileCapabilities: { externalSaveOnly: true, hasSaveTarget: true },
      fileHandlers,
      onSetSaveAnchor,
      isDirty: true,
    });
    const saveBtn = handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement;
    expect(saveBtn.getAttribute("aria-haspopup")).toBeNull();
    saveBtn.click();
    expect(fileHandlers.onSaveFile).toHaveBeenCalled();
    expect(onSetSaveAnchor).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("onSaveToDrive 注入時はメニューハンドラに onSaveToDrive が含まれる", () => {
    const onSetSaveAnchor = jest.fn();
    const onSaveToDrive = jest.fn();
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers: { ...defaultFileHandlers(), onSaveToDrive },
      onSetSaveAnchor,
      isDirty: true,
    });
    (handle.el.querySelector('button[aria-label="save"]') as HTMLButtonElement).click();
    onSetSaveAnchor.mock.calls[0][1].onSaveToDrive();
    expect(onSaveToDrive).toHaveBeenCalled();
    handle.destroy();
  });

  it("onOpenFromDrive 未注入なら open は直接ハンドラを呼び aria-haspopup を持たない", () => {
    const { handle, fileHandlers } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      onSetOpenFileAnchor: jest.fn(),
    });
    const btn = handle.el.querySelector('button[aria-label="openFile"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-haspopup")).toBeNull();
    btn.click();
    expect(fileHandlers.onOpenFile).toHaveBeenCalled();
    handle.destroy();
  });

  it("onOpenFromDrive 注入時は open がメニュー化され onSetOpenFileAnchor へ委譲する", () => {
    const onSetOpenFileAnchor = jest.fn();
    const fileHandlers = { ...defaultFileHandlers(), onOpenFromDrive: jest.fn() };
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      fileHandlers,
      onSetOpenFileAnchor,
    });
    const btn = handle.el.querySelector('button[aria-label="openFile"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    btn.click();
    expect(fileHandlers.onOpenFile).not.toHaveBeenCalled();
    expect(onSetOpenFileAnchor).toHaveBeenCalledTimes(1);
    const [anchorEl, handlers] = onSetOpenFileAnchor.mock.calls[0];
    expect(anchorEl).toBe(btn);
    handlers.onOpenLocal();
    expect(fileHandlers.onOpenFile).toHaveBeenCalled();
    handlers.onOpenFromDrive();
    expect(fileHandlers.onOpenFromDrive).toHaveBeenCalled();
    handle.destroy();
  });

  it("非 direct access + onOpenFromDrive 注入でも open はメニュー化される", () => {
    const onSetOpenFileAnchor = jest.fn();
    const fileHandlers = { ...defaultFileHandlers(), onOpenFromDrive: jest.fn() };
    const { handle } = mount({ fileHandlers, onSetOpenFileAnchor });
    const btn = handle.el.querySelector('button[aria-label="openFile"]') as HTMLButtonElement;
    btn.click();
    expect(fileHandlers.onImport).not.toHaveBeenCalled();
    expect(onSetOpenFileAnchor).toHaveBeenCalledTimes(1);
    // メニュー側の onOpenLocal は非 direct access では onImport にフォールバックする。
    onSetOpenFileAnchor.mock.calls[0][1].onOpenLocal();
    expect(fileHandlers.onImport).toHaveBeenCalled();
    handle.destroy();
  });

  it("非 direct access では open=onImport / saveAs=onDownload にフォールバックする", () => {
    const { handle, fileHandlers } = mount();
    (handle.el.querySelector('button[aria-label="openFile"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="saveAsFile"]') as HTMLButtonElement).click();
    expect(fileHandlers.onImport).toHaveBeenCalled();
    expect(fileHandlers.onDownload).toHaveBeenCalled();
    handle.destroy();
  });

  it("externalSaveOnly では save のみ生成し hasSaveTarget 無しで disabled", () => {
    const { handle } = mount({
      fileCapabilities: { externalSaveOnly: true, hasSaveTarget: false },
    });
    expect(handle.el.querySelector('button[aria-label="openFile"]')).toBeNull();
    const save = handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement;
    expect(save).toBeTruthy();
    expect(save.disabled).toBe(true);
    handle.destroy();
  });

  it("dirty ゲート: 未編集では save が disabled、編集ありで enabled、保存後に再び disabled", () => {
    const { handle, fileHandlers } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: true },
      isDirty: false,
    });
    const save = (): HTMLButtonElement =>
      handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement;
    // 初期は未編集 → disabled（クリックしてもハンドラは発火しない）。
    expect(save().disabled).toBe(true);
    save().click();
    expect(fileHandlers.onSaveFile).not.toHaveBeenCalled();
    // 編集あり → enabled。
    handle.update({ isDirty: true });
    expect(save().disabled).toBe(false);
    save().click();
    expect(fileHandlers.onSaveFile).toHaveBeenCalledTimes(1);
    // 保存して未編集に戻る → 再び disabled。
    handle.update({ isDirty: false });
    expect(save().disabled).toBe(true);
    handle.destroy();
  });

  it("dirty ゲート: externalSaveOnly でも dirty のときだけ save を有効化する", () => {
    const { handle } = mount({
      fileCapabilities: { externalSaveOnly: true, hasSaveTarget: true },
      isDirty: false,
    });
    const save = (): HTMLButtonElement =>
      handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    handle.update({ isDirty: true });
    expect(save().disabled).toBe(false);
    handle.destroy();
  });

  it("dirty ゲート: ハンドル無しなら dirty でも save は disabled のまま", () => {
    const { handle } = mount({
      fileCapabilities: { supportsDirectAccess: true, hasSaveTarget: false },
      isDirty: true,
    });
    const save = handle.el.querySelector('button[aria-label="saveFile"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    handle.destroy();
  });

  it("exportPdf は onExportPdf 指定時のみ生成する", () => {
    const fileHandlers = { ...defaultFileHandlers(), onExportPdf: undefined };
    const { handle } = mount({ fileHandlers });
    expect(handle.el.querySelector('button[aria-label="exportPdf"]')).toBeNull();
    handle.destroy();
  });
});

describe("createEditorToolbar — editor コマンド発火", () => {
  it("undo クリックで editor.chain().focus().undo().run() を実行する", () => {
    const { handle, ran } = mount();
    (handle.el.querySelector('button[aria-label="undo"]') as HTMLButtonElement).click();
    expect(ran).toContain("undo");
    handle.destroy();
  });

  it("redo クリックで editor.chain().focus().redo().run() を実行する", () => {
    const { handle, ran, setCan, emit } = mount();
    setCan(true, true);
    emit("transaction"); // redo を有効化
    (handle.el.querySelector('button[aria-label="redo"]') as HTMLButtonElement).click();
    expect(ran).toContain("redo");
    handle.destroy();
  });

  it("mergeUndoRedo 指定時は editor ではなく merge の undo/redo を呼ぶ", () => {
    const mergeUndoRedo = {
      undo: jest.fn(),
      redo: jest.fn(),
      canUndo: true,
      canRedo: true,
    };
    const { handle, ran } = mount({ mergeUndoRedo });
    (handle.el.querySelector('button[aria-label="undo"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="redo"]') as HTMLButtonElement).click();
    expect(mergeUndoRedo.undo).toHaveBeenCalled();
    expect(mergeUndoRedo.redo).toHaveBeenCalled();
    expect(ran).toHaveLength(0); // editor 側は呼ばれない
    handle.destroy();
  });
});

describe("createEditorToolbar — モード / ビュー切替", () => {
  it("モードボタンのクリックで対応ハンドラを呼ぶ", () => {
    const { handle, modeHandlers } = mount();
    (handle.el.querySelector('button[aria-label="source"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="wysiwyg"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="review"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="readonly"]') as HTMLButtonElement).click();
    expect(modeHandlers.onSwitchToSource).toHaveBeenCalled();
    expect(modeHandlers.onSwitchToWysiwyg).toHaveBeenCalled();
    expect(modeHandlers.onSwitchToReview).toHaveBeenCalled();
    expect(modeHandlers.onSwitchToReadonly).toHaveBeenCalled();
    handle.destroy();
  });

  it("outline / comments / explorer のトグルでハンドラを呼ぶ", () => {
    const { handle, modeHandlers } = mount();
    (handle.el.querySelector('button[aria-label="outline"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="commentPanel"]') as HTMLButtonElement).click();
    (handle.el.querySelector('button[aria-label="explorer"]') as HTMLButtonElement).click();
    expect(modeHandlers.onToggleOutline).toHaveBeenCalled();
    expect(modeHandlers.onToggleComments).toHaveBeenCalled();
    expect(modeHandlers.onToggleExplorer).toHaveBeenCalled();
    handle.destroy();
  });

  it("compare トグル: inlineMergeOpen=false で compare クリックすると onMerge を呼ぶ", () => {
    const { handle, modeHandlers } = mount();
    (handle.el.querySelector('button[aria-label="compare"]') as HTMLButtonElement).click();
    expect(modeHandlers.onMerge).toHaveBeenCalled();
    handle.destroy();
  });

  it("compare トグル: inlineMergeOpen=true で edit クリックすると onMerge を呼ぶ", () => {
    const { handle, modeHandlers } = mount({
      modeState: defaultModeState({ inlineMergeOpen: true }),
    });
    (handle.el.querySelector('button[aria-label="normalMode"]') as HTMLButtonElement).click();
    expect(modeHandlers.onMerge).toHaveBeenCalled();
    handle.destroy();
  });
});

describe("createEditorToolbar — more メニュー intent", () => {
  it("desktop more クリックで onSetHelpAnchor を anchor 付きで呼ぶ", () => {
    const onSetHelpAnchor = jest.fn();
    const { handle } = mount({ onSetHelpAnchor });
    const btn = handle.el.querySelector(
      '[data-more-desktop] button[aria-label="more"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(onSetHelpAnchor).toHaveBeenCalledWith(btn);
    handle.destroy();
  });

  it("mobile more クリックで onOpenMobileMenu を anchor 付きで呼ぶ", () => {
    const onOpenMobileMenu = jest.fn();
    const { handle } = mount({ onOpenMobileMenu });
    const btn = handle.el.querySelector(
      '[data-more-mobile] button[aria-label="more"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(onOpenMobileMenu).toHaveBeenCalledWith(btn);
    handle.destroy();
  });
});

describe("createEditorToolbar — roving tabindex キーボードナビ", () => {
  function focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"]:not([disabled]), input:not([disabled])',
      ),
    );
  }

  it("初期は先頭のみ tabindex=0、他は -1", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(items[1].getAttribute("tabindex")).toBe("-1");
    handle.destroy();
  });

  it("ArrowRight で次の要素へ roving が移動する", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    items[0].focus();
    handle.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(items[0].getAttribute("tabindex")).toBe("-1");
    expect(items[1].getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(items[1]);
    handle.destroy();
  });

  it("ArrowRight は末尾で先頭へラップする", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    items.at(-1)!.focus();
    handle.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(items[0]);
    handle.destroy();
  });

  it("ArrowLeft は先頭で末尾へラップする", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    items[0].focus();
    handle.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(items.at(-1)!.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(items.at(-1));
    handle.destroy();
  });

  it("Home / End で先頭・末尾へジャンプする", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    items[2].focus();
    handle.el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(items.at(-1));
    handle.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    handle.destroy();
  });

  it("未対応キーは無視する（focus は移動しない）", () => {
    const { handle } = mount();
    const items = focusables(handle.el);
    items[0].focus();
    handle.el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    handle.destroy();
  });
});

describe("createEditorToolbar — editor 派生 state 購読", () => {
  it("transaction で canUndo=false になると undo が disabled になる", () => {
    const { handle, setCan, emit } = mount();
    const undo = handle.el.querySelector('button[aria-label="undo"]') as HTMLButtonElement;
    expect(undo.disabled).toBe(false); // 初期 canUndo=true
    setCan(false, false);
    emit("transaction");
    expect(undo.disabled).toBe(true);
    handle.destroy();
  });

  it("update({ modeState }) で readonly に切替えると undo が disabled になる", () => {
    const { handle } = mount();
    const undo = handle.el.querySelector('button[aria-label="undo"]') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    handle.update({ modeState: defaultModeState({ readonlyMode: true }) });
    expect(undo.disabled).toBe(true);
    handle.destroy();
  });
});

describe("createEditorToolbar — destroy クリーンアップ", () => {
  it("destroy で editor の transaction listener を解除する", () => {
    const { handle, listenerCount } = mount();
    expect(listenerCount("transaction")).toBe(1);
    handle.destroy();
    expect(listenerCount("transaction")).toBe(0);
  });

  it("destroy 後は transaction を emit してもエラーにならない（listener 解除済み）", () => {
    const { handle, emit, setCan } = mount();
    handle.destroy();
    setCan(false, false);
    expect(() => emit("transaction")).not.toThrow();
  });

  it("update({ editor }) で旧 editor の listener を外し新 editor へ張り替える", () => {
    const a = makeEditor();
    const b = makeEditor();
    const handle = createEditorToolbar({
      editor: a.editor,
      fileHandlers: defaultFileHandlers(),
      modeState: defaultModeState(),
      modeHandlers: defaultModeHandlers(),
      t: (k) => k,
    });
    expect(a.listenerCount("transaction")).toBe(1);
    handle.update({ editor: b.editor });
    expect(a.listenerCount("transaction")).toBe(0);
    expect(b.listenerCount("transaction")).toBe(1);
    handle.destroy();
    expect(b.listenerCount("transaction")).toBe(0);
  });
});

describe("createEditorToolbar — sideToolbar 連動（旧 Page parity）", () => {
  // 旧 React Page は sideToolbar 表示中（md+）にトップツールバーの outline/comments/explorer
  // を隠していた（hide.outline = hideOutline || sideToolbarVisibleEditable）。vanilla では
  // CSS メディアクエリ駆動（data-am-side-coupled + min-width:900px）で同等にする。
  it("sideToolbar:true で outline/comments/explorer に data-am-side-coupled が付く", () => {
    const { handle } = mount({ sideToolbar: true });
    for (const label of ["outline", "commentPanel", "explorer"]) {
      const btn = handle.el.querySelector(`button[aria-label="${label}"]`);
      expect(btn).toBeTruthy();
      expect(btn?.hasAttribute("data-am-side-coupled")).toBe(true);
    }
    handle.destroy();
  });

  it("sideToolbar 未指定では data-am-side-coupled が付かない", () => {
    const { handle } = mount();
    expect(handle.el.querySelector("[data-am-side-coupled]")).toBeNull();
    handle.destroy();
  });

  it("min-width:900px で隠すスタイルが注入される", () => {
    const { handle } = mount({ sideToolbar: true });
    const style = document.getElementById("am-toolbar-side-coupled-style");
    expect(style?.textContent).toContain("min-width: 900px");
    expect(style?.textContent).toContain("data-am-side-coupled");
    handle.destroy();
  });
});

describe("createEditorToolbar — レスポンシブ（旧 EditorToolbar.module.css parity）", () => {
  // 旧 module.css: desktopContents/compareToggle/moreMenuDesktop は md 未満で非表示、
  // moreMenuMobile は md 以上で非表示（=デスクトップで More が 2 個出る退行の防止）。
  it("レスポンシブスタイルが注入され各ラッパは inline display を持たない", () => {
    const { handle } = mount();
    const style = document.getElementById("am-toolbar-responsive-style");
    expect(style?.textContent).toContain("min-width: 900px");
    expect(style?.textContent).toContain("data-more-mobile");
    expect(style?.textContent).toContain("data-desktop-contents");
    for (const sel of ["[data-compare-toggle]", "[data-more-desktop]", "[data-more-mobile]"]) {
      const el = handle.el.querySelector(sel) as HTMLElement | null;
      expect(el).toBeTruthy();
      // display は注入 CSS が所有する（inline にあると media 切替が効かない）。
      expect(el?.style.display).toBe("");
    }
    handle.destroy();
  });
});
