import type { EditorSettings } from "../../editorSettings";
import type { ExternalSaveKind } from "../../utils/externalSaveKind";

/**
 * live update（`handle.update(patch)` → chrome への反映）。
 *
 * 「patch のどのフィールドが何を起こすか」だけをここに持ち、各反映の実体は呼び出し側
 * （installChrome）が組み立てた seam へ委ねる。patch のフィールドが増えたときに、
 * 反映漏れがないかをこのファイルだけで確認できる状態にするのが目的。
 *
 * `externalCompareContent` の遷移判定（前回値との比較）だけは本モジュールが状態を持つ。
 * Mount ラッパが live patch のたびに現値（null 含む）を相乗りさせるため、呼び出し側で
 * 判定すると「無変化の null で比較モードを閉じる」事故が起きるため。
 */

/** live update が反映しうる patch。`handle.update` の引数のうち chrome が見る部分。 */
export interface LiveUpdatePatch {
  readOnly?: boolean;
  autoReload?: boolean;
  settings?: EditorSettings;
  themeMode?: "light" | "dark";
  externalSaveKind?: ExternalSaveKind;
  fileName?: string | null;
  externalCompareContent?: string | null;
}

export interface LiveUpdateSeams {
  /** ホストの readOnly を反映する（editable / bubble / toolbar の再評価を含む）。 */
  readonly applyReadOnly: (next: boolean) => void;
  readonly setAutoReload: (next: boolean) => void;
  /** settings のマージのみ（適用は applyAllSettings が行う）。 */
  readonly mergeSettings: (patch: Partial<EditorSettings>) => void;
  /** settings / themeMode いずれかの変化で呼ぶ、全設定の再適用。 */
  readonly applyAllSettings: () => void;
  /** ViewerToolbar のテーマ同期。 */
  readonly syncViewerTheme: () => void;
  readonly applyExternalSaveKind: (next: ExternalSaveKind | undefined) => void;
  /** ファイル名の採用（localStorage / IndexedDB の副作用を伴う）。 */
  readonly adoptExternalFile: (fileName: string | null) => void;
  /** 比較モードを開く。 */
  readonly openCompare: (content: string) => void;
  /** 比較モードを閉じる。 */
  readonly closeCompare: () => void;
}

export interface LiveUpdateController {
  apply: (patch: LiveUpdatePatch) => void;
  /** mount 直後の初期値を「適用済み」として記録する（遷移判定の基準）。 */
  primeCompareContent: (content: string | null) => void;
}

export function createLiveUpdate(seams: LiveUpdateSeams): LiveUpdateController {
  // 非 null → null の遷移は「compare モードを閉じる」信号として扱うため、
  // 「未適用」と「null を適用済み」を区別する必要がある。
  let lastExternalCompareContent: string | null = null;

  const applyCompare = (next: string | null): void => {
    if (next === lastExternalCompareContent) return;
    lastExternalCompareContent = next;
    if (next === null) {
      seams.closeCompare();
    } else {
      seams.openCompare(next);
    }
  };

  const apply = (patch: LiveUpdatePatch): void => {
    if (patch.readOnly !== undefined) {
      seams.applyReadOnly(patch.readOnly);
    }
    if (patch.autoReload !== undefined) {
      seams.setAutoReload(patch.autoReload);
    }
    if (patch.settings) {
      seams.mergeSettings(patch.settings);
    }
    // themeMode はコンテンツ CSS（ダーク/ライト埋め込み色）と背景・文字色変数に影響する。
    if (patch.settings || patch.themeMode !== undefined) {
      seams.applyAllSettings();
    }
    if (patch.themeMode !== undefined) {
      seams.syncViewerTheme();
    }
    // fileName の採用（adoptExternalFile）は onSaveTargetChange を発火させ、そこで宛先種別を
    // 読み直す。ホストが Drive へ保存先を移した直後の patch を取りこぼさないよう先に反映する。
    if ("externalSaveKind" in patch) {
      seams.applyExternalSaveKind(patch.externalSaveKind);
    }
    if (patch.fileName !== undefined) {
      seams.adoptExternalFile(patch.fileName);
    }
    // externalCompareContent は遷移（値の変化）でのみ反映する。Mount ラッパは live patch の
    // たびに現値（null 含む）を相乗りさせるため、無変化の null で閉じたり同値を再適用しない。
    if (patch.externalCompareContent !== undefined) {
      applyCompare(patch.externalCompareContent);
    }
    // themeMode / presetName は SettingsPanel open 時に current から読むため保持のみ。
  };

  return {
    apply,
    primeCompareContent: (content) => { lastExternalCompareContent = content; },
  };
}
