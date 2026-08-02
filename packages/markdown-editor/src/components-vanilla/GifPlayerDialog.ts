/**
 * 脱React の vanilla DOM「GifPlayerDialog」ファクトリ
 * （framework-decoupling Phase 3 / ホスト隔離）。
 *
 * React 原版 `components/GifPlayerDialog.tsx` を素 DOM へ移植したもの。GIF を全画面
 * ダイアログで再生し、再生 / 一時停止トグル・再生速度トグル・GIF メタ情報を表示する。
 *
 * 変換規約:
 * - React props → ファクトリ options（`t` / `src` / `settings` / `onClose` を opts で受ける）。
 * - 戻り値は `{ el, destroy }`。createDialog が portalTarget（既定 document.body）へ自前マウントするため呼び元の append は不要（el は参照用）。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。`useMarkdownT`
 *   → `t` を opts で受ける。
 * - 状態（playing / speed / pausedSrc）は closure 変数。listener / Dialog の cleanup は `destroy()`。
 * - `togglePlayback` の canvas 静止画化ロジックは React 版と同一。
 *
 * 本番未配線（追加のみ）。host（{@link GifDialogHost} 相当）が intent を受けて生成する想定。
 */

import { svgIcon } from "@anytime-markdown/ui-core/dom";
import {
  createDialog,
  createIconButton,
  createText,
  createToggleButton,
  createToggleButtonGroup,
  nextDialogTitleId,
} from "@anytime-markdown/ui-core";
import type { GifSettings } from "../utils/gifEncoder";

// ui/icons.tsx と同一の Material SVG path（GifIcon / PauseIcon / PlayArrowIcon / CloseIcon）。
const ICON_GIF =
  "M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1m10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z";
const ICON_PAUSE = "M6 19h4V5H6zm8-14v14h4V5z";
const ICON_PLAY = "M8 5v14l11-7z";
const ICON_CLOSE =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** {@link createGifPlayerDialog} のオプション（React `GifPlayerDialogProps` の vanilla 置換）。 */
interface CreateGifPlayerDialogOptions {
  /** 再生対象 GIF の src。 */
  src: string;
  /** GIF メタ情報（duration / fps / width）。あれば info 行を表示する。 */
  settings?: GifSettings;
  /** i18n（close ラベル等）。 */
  t: (key: string) => string;
  /** 閉じる要求（背景クリック / ESC / close ボタン）時のコールバック。 */
  onClose: () => void;
}

/** {@link createGifPlayerDialog} の戻り値。 */
interface GifPlayerDialogHandle {
  /** Dialog backdrop ルート（createDialog が自前マウント済み・参照用）。 */
  el: HTMLElement;
  /** listener 解除・Dialog cleanup（背景 overflow 復元・フォーカス復帰・el 取り外し）。 */
  destroy: () => void;
}

/**
 * vanilla GifPlayerDialog を生成する。createDialog が自前マウントするため生成時点で開く。
 *
 * - 再生 / 一時停止トグル: playing 時は canvas で現フレームを静止画化して `img.src` に差し込み、
 *   再開時は cache-bust クエリで GIF を再ロードする（React 版 `togglePlayback` と同一）。
 * - 速度トグル（0.5x / 1x / 2x）は selection を closure で保持する（描画上のラベル切替のみ）。
 * - settings があれば Duration / Frames / fps / Width の caption 行を表示する。
 */
export function createGifPlayerDialog(
  opts: CreateGifPlayerDialogOptions,
): GifPlayerDialogHandle {
  const { src, settings, t, onClose } = opts;

  // --- closure 状態（React useState / useRef 相当） ---
  let playing = true;
  let pausedSrc: string | null = null;
  // 速度選択（描画ラベル切替のみ。React 版 useState<string> 同様、実速度には未適用）。
  // ToggleButtonGroup の value/onChange と closure で連携する。
  let speed = "1";

  // 破棄管理する子ハンドル群。
  const handles: Array<{ destroy: () => void }> = [];

  // --- GIF プレビュー領域 ---
  const preview = document.createElement("div");
  preview.style.cssText =
    "flex:1;display:flex;align-items:center;justify-content:center;" +
    "background-color:black;overflow:hidden;min-height:200px;";

  const img = document.createElement("img");
  img.src = src;
  img.alt = "GIF";
  img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
  preview.appendChild(img);

  // --- 再生 / 一時停止トグルボタン（playPause） ---
  const playPauseBtn = createToggleButton({
    value: "playPause",
    selected: false,
    size: "small",
    ariaLabel: playing ? "Pause" : "Play",
    children: svgIcon(playing ? ICON_PAUSE : ICON_PLAY, 20),
    onClick: () => togglePlayback(),
    style: { border: "1px solid var(--am-color-divider)" },
  });
  handles.push(playPauseBtn);

  /** 再生 / 一時停止の切替（React 版 togglePlayback と同一ロジック）。 */
  function togglePlayback(): void {
    if (!src) return;
    if (playing) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        pausedSrc = canvas.toDataURL("image/png");
        img.src = pausedSrc;
      }
      playing = false;
    } else {
      img.src = src + (src.includes("?") ? "&" : "?") + "_t=" + Date.now();
      pausedSrc = null;
      playing = true;
    }
    // aria-label とアイコンを再生状態へ同期（React 版の再レンダー相当）。
    playPauseBtn.update({
      ariaLabel: playing ? "Pause" : "Play",
      children: svgIcon(playing ? ICON_PAUSE : ICON_PLAY, 20),
    });
  }

  // --- 速度トグルグループ（0.5x / 1x / 2x） ---
  const speedGroup = createToggleButtonGroup({
    value: speed,
    size: "small",
    ariaLabel: "Playback speed",
    onChange: (value) => {
      // React 版 handleSpeedChange: value が null（解除）の場合は無視。
      if (value != null) {
        speed = String(value);
        speedGroup.setValue(speed);
      }
    },
  });
  handles.push(speedGroup);
  for (const v of ["0.5", "1", "2"] as const) {
    const btn = createToggleButton({ value: v, children: `${v}x` });
    speedGroup.register(btn);
  }

  // --- コントロール行 ---
  const controlRow = document.createElement("div");
  controlRow.style.cssText = "display:flex;align-items:center;gap:12px;";
  controlRow.append(playPauseBtn.el, speedGroup.el);

  // --- コントロールパネル（上罫線 + 縦積み） ---
  const controls = document.createElement("div");
  controls.style.cssText =
    "padding:12px 16px;border-top:1px solid var(--am-color-divider);" +
    "display:flex;flex-direction:column;gap:8px;";
  controls.appendChild(controlRow);

  // --- info 行（settings がある場合のみ） ---
  if (settings) {
    const infoRow = document.createElement("div");
    infoRow.style.cssText = "display:flex;gap:16px;flex-wrap:wrap;";

    const frames = Math.round(settings.fps * settings.duration);
    const captions = [
      `Duration: ${settings.duration.toFixed(1)}s`,
      `Frames: ${frames}`,
      `${settings.fps} fps`,
      `Width: ${settings.width}px`,
    ];
    for (const text of captions) {
      const caption = createText({
        variant: "caption",
        text,
        style: "color:var(--am-color-text-secondary);",
      });
      handles.push(caption);
      infoRow.appendChild(caption.el);
    }
    controls.appendChild(infoRow);
  }

  // --- ヘッダー（EditDialogHeader 相当: close ボタン + GIF アイコン + ラベル） ---
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 12px;" +
    "border-bottom:1px solid var(--am-color-divider);";

  const closeBtn = createIconButton({
    size: "small",
    ariaLabel: t("close"),
    title: t("close"),
    children: svgIcon(ICON_CLOSE, 20),
    onClick: () => onClose(),
  });
  handles.push(closeBtn);

  const headerIcon = document.createElement("span");
  headerIcon.style.cssText = "display:inline-flex;color:var(--am-color-text-secondary);";
  headerIcon.appendChild(svgIcon(ICON_GIF, 18));

  const headerLabel = document.createElement("span");
  const titleId = nextDialogTitleId();
  headerLabel.textContent = "GIF Player";
  headerLabel.id = titleId;
  headerLabel.style.cssText = "font-weight:600;";

  header.append(closeBtn.el, headerIcon, headerLabel);

  // --- Dialog（fullScreen / 自前マウント） ---
  const dialog = createDialog({
    onClose,
    fullScreen: true,
    labelledBy: titleId,
    children: [header, preview, controls],
  });

  let destroyed = false;
  return {
    el: dialog.el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const h of handles) h.destroy();
      dialog.destroy();
    },
  };
}
