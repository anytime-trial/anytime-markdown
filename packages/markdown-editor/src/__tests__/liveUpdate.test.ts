/**
 * createLiveUpdate の単体テスト。
 *
 * live update は installChrome のクロージャに埋まっており、`handle.update` を通した
 * 統合テストでしか触れなかった。「どの patch フィールドが何を起こすか」は反映漏れが
 * 静かに起きる箇所なので、切り出しを機に seam 単位で固定する。
 */

import type { EditorSettings } from "../editorSettings";
import { createLiveUpdate, type LiveUpdateSeams } from "../host/chrome/liveUpdate";

function makeSeams(): { [K in keyof LiveUpdateSeams]: jest.Mock } {
  return {
    applyReadOnly: jest.fn(),
    setAutoReload: jest.fn(),
    mergeSettings: jest.fn(),
    applyAllSettings: jest.fn(),
    syncViewerTheme: jest.fn(),
    applyExternalSaveKind: jest.fn(),
    adoptExternalFile: jest.fn(),
    openCompare: jest.fn(),
    closeCompare: jest.fn(),
  };
}

const SETTINGS = { fontSize: 16 } as unknown as EditorSettings;

describe("createLiveUpdate", () => {
  it("applies nothing for an empty patch", () => {
    const seams = makeSeams();
    createLiveUpdate(seams).apply({});

    for (const [name, fn] of Object.entries(seams)) {
      expect([name, fn.mock.calls.length]).toEqual([name, 0]);
    }
  });

  it("routes readOnly / autoReload / fileName to their own seams", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.apply({ readOnly: true, autoReload: false, fileName: "a.md" });

    expect(seams.applyReadOnly).toHaveBeenCalledWith(true);
    expect(seams.setAutoReload).toHaveBeenCalledWith(false);
    expect(seams.adoptExternalFile).toHaveBeenCalledWith("a.md");
  });

  it("treats fileName: null as an explicit reset rather than an absent field", () => {
    const seams = makeSeams();
    createLiveUpdate(seams).apply({ fileName: null });

    expect(seams.adoptExternalFile).toHaveBeenCalledWith(null);
  });

  it("re-applies all settings for either settings or themeMode", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.apply({ settings: SETTINGS });
    expect(seams.mergeSettings).toHaveBeenCalledWith(SETTINGS);
    expect(seams.applyAllSettings).toHaveBeenCalledTimes(1);
    expect(seams.syncViewerTheme).not.toHaveBeenCalled();

    live.apply({ themeMode: "dark" });
    expect(seams.applyAllSettings).toHaveBeenCalledTimes(2);
    expect(seams.syncViewerTheme).toHaveBeenCalledTimes(1);
    // themeMode 単体では settings のマージは起きない。
    expect(seams.mergeSettings).toHaveBeenCalledTimes(1);
  });

  it("applies externalSaveKind by key presence so that undefined clears it", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.apply({ externalSaveKind: undefined });
    expect(seams.applyExternalSaveKind).toHaveBeenCalledWith(undefined);

    live.apply({ readOnly: false });
    // キーが無い patch では触らない（`in` 判定であって undefined 判定ではない）。
    expect(seams.applyExternalSaveKind).toHaveBeenCalledTimes(1);
  });

  it("opens compare only on a value transition", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.apply({ externalCompareContent: "diff" });
    live.apply({ externalCompareContent: "diff" });

    expect(seams.openCompare).toHaveBeenCalledTimes(1);
    expect(seams.openCompare).toHaveBeenCalledWith("diff");
  });

  it("closes compare on a non-null → null transition", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.apply({ externalCompareContent: "diff" });
    live.apply({ externalCompareContent: null });

    expect(seams.closeCompare).toHaveBeenCalledTimes(1);
  });

  it("does not close compare when an unchanged null rides along", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    // Mount ラッパは patch ごとに現値（null 含む）を相乗りさせる。初期値が null のまま
    // 何度 patch が来ても比較モードを閉じてはいけない。
    live.apply({ externalCompareContent: null });
    live.apply({ readOnly: true, externalCompareContent: null });

    expect(seams.closeCompare).not.toHaveBeenCalled();
  });

  it("treats a primed initial value as already applied", () => {
    const seams = makeSeams();
    const live = createLiveUpdate(seams);

    live.primeCompareContent("initial");
    live.apply({ externalCompareContent: "initial" });
    expect(seams.openCompare).not.toHaveBeenCalled();

    live.apply({ externalCompareContent: null });
    expect(seams.closeCompare).toHaveBeenCalledTimes(1);
  });
});
