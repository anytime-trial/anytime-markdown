import type { ToolbarFileCapabilities } from "../../types/toolbar";
import {
  type ExternalSaveKind,
  type FileOrigin,
  fileOriginFor,
  nextExternalSaveKind,
} from "../../utils/externalSaveKind";
import type { FileOpsController, SaveTargetInfo } from "../fileOpsController";

/**
 * 保存先の状態（ファイル名・dirty・宛先種別）をツールバーとステータスバーへ反映する配線。
 *
 * fileOps は「保存先が変わった」「ファイル状態が変わった」の 2 系統で通知してくるが、どちらの
 * 反映先も toolbar の `fileCapabilities` とステータスバーの所在バッジで重なる。重なる部分を
 * 1 か所へ寄せ、installChrome 側には fileOps の生成だけを残す。
 *
 * 宛先種別（`externalSaveKind`）は保存先の遷移とホストの live prop の双方で変わるため、
 * 本モジュールが唯一の保持者になる。`fileCapabilities` は本モジュールより後に組み立てられる
 * （fileOps を必要とするため）ので getter で受ける。
 */

/** toolbar の update に渡せる最小面。実体は EditorToolbar のハンドル。 */
export interface FileStatusToolbar {
  update: (patch: { isDirty?: boolean; fileCapabilities?: ToolbarFileCapabilities }) => void;
}

/** ステータスバーの update に渡せる最小面。実体は StatusBar のハンドル。 */
export interface FileStatusStatusBar {
  update: (patch: { fileName?: string | null; isDirty?: boolean; fileOrigin?: FileOrigin | null }) => void;
}

export interface FileStatusSyncOptions {
  /** fileOps は本モジュールの生成後に作られるため getter で受ける。 */
  readonly getFileOps: () => FileOpsController | null;
  readonly getToolbar: () => FileStatusToolbar | null;
  readonly getStatusBar: () => FileStatusStatusBar | null;
  /** file handlers 側で組み立てた capabilities（宛先種別を差し替えて再送する土台）。 */
  readonly getFileCapabilities: () => ToolbarFileCapabilities;
  /** ホストが live prop で指定している宛先種別。 */
  readonly getHostExternalSaveKind: () => ExternalSaveKind | undefined;
  /** ホストへの保存先変更通知（元の `current.onSaveTargetChange`）。 */
  readonly notifySaveTarget: (target: SaveTargetInfo | null) => void;
}

export interface FileStatusSync {
  getExternalSaveKind: () => ExternalSaveKind | undefined;
  /** 宛先種別を反映する（値が変わったときのみ）。live update からも呼ぶ。 */
  applyExternalSaveKind: (next: ExternalSaveKind | undefined) => void;
  /** fileOps の `onSaveTargetChange`。 */
  handleSaveTargetChange: (target: SaveTargetInfo | null) => void;
  /** fileOps の `onFileStateChange`。 */
  handleFileStateChange: (state: { fileName: string | null; isDirty: boolean }) => void;
}

export function createFileStatusSync(
  options: FileStatusSyncOptions,
  initialKind: ExternalSaveKind | undefined,
): FileStatusSync {
  const {
    getFileOps,
    getToolbar,
    getStatusBar,
    getFileCapabilities,
    getHostExternalSaveKind,
    notifySaveTarget,
  } = options;

  let externalSaveKind = initialKind;

  /** 宛先種別と保存先の有無を載せた、送信直前の capabilities。 */
  const currentCapabilities = (): ToolbarFileCapabilities => ({
    ...getFileCapabilities(),
    hasSaveTarget: getFileOps()?.hasSaveTarget() ?? false,
    externalSaveKind,
  });

  const applyExternalSaveKind = (next: ExternalSaveKind | undefined): void => {
    if (externalSaveKind === next) return;
    externalSaveKind = next;
    getToolbar()?.update({ fileCapabilities: currentCapabilities() });
    getStatusBar()?.update({
      fileOrigin: fileOriginFor(getFileOps()?.getFileName() ?? null, externalSaveKind),
    });
  };

  return {
    getExternalSaveKind: () => externalSaveKind,
    applyExternalSaveKind,
    handleSaveTargetChange: (target) => {
      // ローカルへ移れば種別は消え、外部保存のままならホストの最新値（GitHub → Drive 等）へ追従する。
      // fileOps は onFileStateChange を先に発火させるため、ここで改めてツールバーへ反映する。
      applyExternalSaveKind(
        nextExternalSaveKind(target?.kind ?? null, getHostExternalSaveKind()),
      );
      notifySaveTarget(target);
    },
    handleFileStateChange: ({ fileName, isDirty }) => {
      // fileOps が文書ファイル名の単一の真実源。`current.fileName`（外部ソース由来）は
      // mount / update で fileOps へ取り込むため、ここでフォールバックしてはならない
      // （フォールバックすると Drive で開いた本文が localStorage の古いローカル名へ戻る）。
      getStatusBar()?.update({
        fileName,
        isDirty,
        fileOrigin: fileOriginFor(fileName, externalSaveKind),
      });
      // save ボタンの dirty ゲート（保存が必要なときのみ有効化）。ファイルを開く/保存で
      // hasSaveTarget も変わるため、最新の保存先状態と合わせてツールバーへ反映する。
      getToolbar()?.update({ isDirty, fileCapabilities: currentCapabilities() });
    },
  };
}
