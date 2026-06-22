/**
 * 脱React の vanilla DOM「GifRecorderDialog」ファクトリ
 * （framework-decoupling Phase 3 / ホスト隔離・追加のみ・本番未配線）。
 *
 * React 原版 `components/GifRecorderDialog.tsx`（MUI/React 依存）の素 DOM 版。
 * `navigator.mediaDevices.getDisplayMedia` で取得した画面共有 stream を closure に保持し、
 * preview → 矩形選択（canvas overlay）→ 録画（setInterval でフレーム取得）→ GIF エンコード
 * （encodeGif）→ 完了プレビュー / 保存 / 撮り直しの各フェーズを素 DOM で構成する。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従するため、原版の
 * `useIsDark` / `getDivider` / `getTextSecondary` 分岐は不要（CSS 変数を直接参照）。`useMarkdownT`
 * は opts.t で受ける。stream / recorder / interval / listener / blob URL / dialog は必ず
 * `destroy()` で解放する。
 *
 * 戻り値は `{ el, destroy() }`。createDialog が portalTarget（既定 document.body）へ自前マウントするため
 * 生成時点で開く（el は参照用）。
 *
 * 変換規約:
 * - React props（open / onClose / onComplete）→ opts のコールバック（onClose / onComplete）。
 *   `open` boolean は createDialog の self-append により不要（生成 = 開く / destroy = 閉じる）。
 * - useState/useRef/useEffect/useCallback → closure 変数 + 明示的 addEventListener/removeEventListener。
 *   elapsed / progress は closure + setInterval / onProgress コールバックで DOM を手続き的に更新する。
 * - React 合成イベント（onMouseDown/Move/Up）→ canvas への native addEventListener。
 */

import {
  createButton,
  createDialog,
  createProgressBar,
  createText,
  createTextField,
  nextDialogTitleId,
  svgIcon,
  type ProgressBarHandle,
  type TextFieldHandle,
} from "@anytime-markdown/ui-core";
import {
  type CropRect,
  encodeGif,
  extractFrameFromCanvas,
  GifRecorderState,
  type GifSettings,
} from "../utils/gifEncoder";

/** 録画フローのフェーズ（React 原版 RecordingPhase と同一）。 */
type RecordingPhase =
  | "idle"
  | "previewing"
  | "selecting"
  | "ready"
  | "recording"
  | "encoding"
  | "done";

// Material アイコン SVG path（24x24・ui/icons.tsx と同一）。
const GIF_PATH =
  "M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1m10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z";
const SCREEN_SHARE_PATH =
  "M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2zm-7-3.53v-2.19c-2.78 0-4.61.85-6 2.72.56-2.67 2.11-5.33 6-5.87V7l4 3.73z";
const CROP_FREE_PATH =
  "M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2m2 10H3v4c0 1.1.9 2 2 2h4v-2H5zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2";
const STOP_PATH = "M6 6h12v12H6z";
const SAVE_PATH =
  "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z";
const REFRESH_PATH =
  "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z";
const CLOSE_PATH =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** 録画上限（ms）。React 原版 MAX_DURATION と同一。 */
const MAX_DURATION = 30000;

/** {@link createGifRecorderDialog} のオプション（React `GifRecorderDialogProps` の vanilla 置換）。 */
export interface CreateGifRecorderDialogOptions {
  /** i18n。React 原版は t をローカルで placeholder にしていたため任意。未指定時は key をそのまま返す。 */
  t?: (key: string) => string;
  /** ダイアログを閉じる要求のコールバック。React 原版 `onClose` 相当。 */
  onClose: () => void;
  /** 録画完了 + 保存確定時のコールバック。React 原版 `onComplete(blob, fileName, settings)` 相当。 */
  onComplete: (blob: Blob, fileName: string, settings: GifSettings) => void;
}

/** {@link createGifRecorderDialog} の戻り値。 */
export interface GifRecorderDialogHandle {
  /** backdrop ルート（createDialog が自前マウント済み・参照用）。 */
  el: HTMLElement;
  /** stream / recorder / interval / listener / blob URL / dialog の解放。閉じる時に必ず呼ぶ。 */
  destroy: () => void;
}

/** mm:ss 形式に整形する（React 原版 formatTime と同一）。 */
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 既定ファイル名（recording-YYYYMMDD-HHmmss.gif）を生成する（React 原版 defaultFileName と同一）。 */
function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `recording-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.gif`;
}

/**
 * vanilla 版 GifRecorderDialog を生成する。
 *
 * - 生成（= open）時点では idle フェーズ。「Select Screen」ボタン押下で getDisplayMedia を呼ぶ
 *   （React 原版 handleSelectScreen 相当）。
 * - 取得した stream は closure（`stream`）に保持し、track ended / retry / destroy で全 track を停止する。
 * - 矩形選択は canvas overlay への native mousedown/mousemove/mouseup で扱う（React 合成イベントの置換）。
 * - 録画は setInterval（1000/fps ms）で video → hidden canvas → extractFrameFromCanvas → recorder.addFrame。
 * - 停止で encodeGif（onProgress で ProgressBar 更新）→ blob URL を done プレビューに表示。
 * - 保存（onComplete）/ 撮り直し（retry）で各 closure をリセットする。
 */
export function createGifRecorderDialog(
  opts: CreateGifRecorderDialogOptions,
): GifRecorderDialogHandle {
  const t = opts.t ?? ((key: string) => key);
  const { onClose, onComplete } = opts;

  // --- closure 状態（React useState/useRef の置換） --------------------------
  let phase: RecordingPhase = "idle";
  let cropRect: CropRect | null = null;
  let elapsed = 0;
  let resultBlob: Blob | null = null;
  let resultUrl: string | null = null;
  let fileName = defaultFileName();

  let stream: MediaStream | null = null;
  let recorder: GifRecorderState | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let destroyed = false;
  /** track ended リスナの解除関数（再生成時に都度差し替え）。 */
  let detachTrackEnded: (() => void) | null = null;

  const titleId = nextDialogTitleId();

  // --- Dialog（fullScreen・素 DOM backdrop + paper） -------------------------
  const dialog = createDialog({
    onClose,
    fullScreen: true,
    labelledBy: titleId,
  });
  dialog.paper.style.padding = "0";

  // --- Header（close + GIF icon + label） ------------------------------------
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 12px;" +
    "border-bottom:1px solid var(--am-color-divider);flex-shrink:0;";

  const closeBtn = createButton({
    variant: "text",
    color: "inherit",
    size: "small",
    ariaLabel: t("close"),
    title: t("close"),
    startIcon: svgIcon(CLOSE_PATH, 20),
    onClick: onClose,
  });

  const headerIcon = document.createElement("span");
  headerIcon.style.cssText = "display:inline-flex;align-items:center;";
  headerIcon.appendChild(svgIcon(GIF_PATH, 18));

  const headerLabel = createText({
    variant: "subtitle2",
    text: "GIF Recorder",
    style: "font-weight:600;",
  });
  headerLabel.el.id = titleId;

  header.append(closeBtn.el, headerIcon, headerLabel.el);

  // --- Body（video + canvas overlay + 下部バー） -----------------------------
  const body = document.createElement("div");
  body.style.cssText = "flex:1;display:flex;flex-direction:column;overflow:hidden;";

  // video / canvas overlay エリア（黒背景・中央寄せ）。
  const previewArea = document.createElement("div");
  previewArea.style.cssText =
    "flex:1;position:relative;overflow:hidden;background-color:black;" +
    "display:flex;align-items:center;justify-content:center;";

  const video = document.createElement("video");
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "max-width:100%;max-height:100%;display:none;";

  // 矩形選択用の canvas overlay（video の上に absolute で重ねる）。
  const canvasOverlay = document.createElement("canvas");
  canvasOverlay.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;display:none;";

  // idle プレースホルダ（アイコン + 案内）。
  const idlePlaceholder = document.createElement("div");
  idlePlaceholder.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--am-color-text-secondary);";
  idlePlaceholder.appendChild(svgIcon(SCREEN_SHARE_PATH, 48));
  const idleText = createText({ variant: "body2", text: "Select a screen to start" });
  idlePlaceholder.appendChild(idleText.el);

  // done プレビュー（生成済み GIF を img で表示）。
  const resultImg = document.createElement("img");
  resultImg.alt = "GIF preview";
  resultImg.style.cssText = "max-width:100%;max-height:100%;display:none;";

  // encoding プレースホルダ（進捗バー + パーセント）。
  const encodingBox = document.createElement("div");
  encodingBox.style.cssText =
    "display:none;flex-direction:column;align-items:center;gap:16px;" +
    "color:var(--am-color-text-secondary);width:60%;";
  const encodingLabel = createText({ variant: "body2", text: "Encoding GIF..." });
  const progressBar: ProgressBarHandle = createProgressBar({
    variant: "determinate",
    value: 0,
    style: { width: "100%" },
  });
  const percentText = createText({ variant: "caption", text: "0%" });
  encodingBox.append(encodingLabel.el, progressBar.el, percentText.el);

  previewArea.append(video, canvasOverlay, idlePlaceholder, resultImg, encodingBox);

  // 下部バー（フェーズ別ボタン群）。
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 16px;" +
    "border-top:1px solid var(--am-color-divider);flex-shrink:0;";

  body.append(previewArea, bottomBar);
  dialog.paper.append(header, body);

  // --- 下部バーのボタン群（フェーズ別に作成・childHandles で destroy 集約） ----
  const handles: Array<{ destroy: () => void }> = [closeBtn, headerLabel, idleText, encodingLabel, percentText];

  const selectScreenBtn = createButton({
    size: "small",
    variant: "outlined",
    label: "Select Screen",
    startIcon: svgIcon(SCREEN_SHARE_PATH, 16),
    onClick: () => void handleSelectScreen(),
  });
  handles.push(selectScreenBtn);

  // previewing / selecting: Select Area（disabled）+ 案内テキスト。
  const selectAreaBtn = createButton({
    size: "small",
    variant: "outlined",
    label: "Select Area",
    startIcon: svgIcon(CROP_FREE_PATH, 16),
    disabled: true,
  });
  handles.push(selectAreaBtn);
  const dragHint = createText({
    variant: "caption",
    text: "Drag on the preview to select recording area",
    style: "color:var(--am-color-text-secondary);",
  });
  handles.push(dragHint);

  // ready: Reselect Area + Record。
  const reselectBtn = createButton({
    size: "small",
    variant: "outlined",
    label: "Reselect Area",
    startIcon: svgIcon(CROP_FREE_PATH, 16),
    onClick: () => {
      phase = "previewing";
      cropRect = null;
      drawOverlay(null);
      renderPhase();
    },
  });
  handles.push(reselectBtn);
  const recordBtn = createButton({
    size: "small",
    variant: "contained",
    color: "error",
    label: "Record",
    startIcon: svgIcon(GIF_PATH, 16), // FiberManualRecord は circle のみ。代替に GIF icon を使う。
    onClick: () => handleStartRecording(),
  });
  handles.push(recordBtn);

  // recording: Stop + 経過時間。
  const stopBtn = createButton({
    size: "small",
    variant: "contained",
    color: "error",
    label: "Stop",
    startIcon: svgIcon(STOP_PATH, 16),
    onClick: () => void handleStopRecording(),
  });
  handles.push(stopBtn);
  const timerText = createText({
    variant: "body2",
    text: `${formatTime(0)} / ${formatTime(MAX_DURATION)}`,
    style: "font-family:monospace;",
  });
  handles.push(timerText);

  // done: ファイル名入力 + Save + Retry。
  const fileField: TextFieldHandle = createTextField({
    size: "small",
    value: fileName,
    style: { flex: "1" },
    inputAttrs: { "aria-label": "File name" },
    onChange: (e) => {
      fileName = (e.target as HTMLInputElement).value;
    },
  });
  handles.push(fileField);
  const saveBtn = createButton({
    size: "small",
    variant: "contained",
    label: "Save",
    startIcon: svgIcon(SAVE_PATH, 16),
    onClick: () => handleSave(),
  });
  handles.push(saveBtn);
  const retryBtn = createButton({
    size: "small",
    variant: "outlined",
    label: "Retry",
    startIcon: svgIcon(REFRESH_PATH, 16),
    onClick: () => handleRetry(),
  });
  handles.push(retryBtn);

  // --- フェーズ反映（DOM 表示の同期） ---------------------------------------
  function renderPhase(): void {
    video.style.display = phase === "idle" ? "none" : "block";
    // canvas overlay は idle / encoding / done 以外で表示（React 原版の条件と同一）。
    const showCanvas = phase !== "idle" && phase !== "encoding" && phase !== "done";
    canvasOverlay.style.display = showCanvas ? "block" : "none";
    canvasOverlay.style.cursor = phase === "recording" ? "default" : "crosshair";
    idlePlaceholder.style.display = phase === "idle" ? "flex" : "none";
    resultImg.style.display = phase === "done" && resultUrl ? "block" : "none";
    encodingBox.style.display = phase === "encoding" ? "flex" : "none";

    // 下部バーのボタン群を作り直す。
    bottomBar.replaceChildren();
    if (phase === "idle") {
      bottomBar.append(selectScreenBtn.el);
    } else if (phase === "previewing" || phase === "selecting") {
      bottomBar.append(selectAreaBtn.el, dragHint.el);
    } else if (phase === "ready") {
      bottomBar.append(reselectBtn.el, recordBtn.el);
    } else if (phase === "recording") {
      timerText.update({ text: `${formatTime(elapsed)} / ${formatTime(MAX_DURATION)}` });
      bottomBar.append(stopBtn.el, timerText.el);
    } else if (phase === "done") {
      bottomBar.append(fileField.el, saveBtn.el, retryBtn.el);
    }
  }

  // --- stream 停止（全 track を stop し closure をクリア） --------------------
  function stopStream(): void {
    if (detachTrackEnded) {
      detachTrackEnded();
      detachTrackEnded = null;
    }
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
  }

  /** interval をクリアする（録画フレーム取得ループの停止）。 */
  function clearRecordInterval(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  /** blob URL を revoke して closure をクリアする。 */
  function revokeResultUrl(): void {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
  }

  // --- canvas overlay 座標変換（React 原版 getCanvasCoords 相当） -------------
  function getCanvasCoords(e: MouseEvent): { x: number; y: number } | null {
    const rect = canvasOverlay.getBoundingClientRect();
    if (!video.videoWidth || !video.videoHeight || !rect.width || !rect.height) {
      return null;
    }
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // --- canvas overlay 描画（React 原版 drawOverlay 相当） --------------------
  function drawOverlay(rect: CropRect | null): void {
    canvasOverlay.width = video.videoWidth;
    canvasOverlay.height = video.videoHeight;
    const ctx = canvasOverlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
    if (!rect) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvasOverlay.width, canvasOverlay.height);
    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  /** start と現在座標から正規化した CropRect を作る。 */
  function rectFrom(start: { x: number; y: number }, coords: { x: number; y: number }): CropRect {
    return {
      x: Math.min(start.x, coords.x),
      y: Math.min(start.y, coords.y),
      width: Math.abs(coords.x - start.x),
      height: Math.abs(coords.y - start.y),
    };
  }

  // --- canvas マウスイベント（React 合成イベント → native addEventListener） --
  function onCanvasMouseDown(e: MouseEvent): void {
    if (phase === "recording") return;
    if (phase !== "previewing" && phase !== "selecting" && phase !== "ready") return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    dragStart = coords;
    phase = "selecting";
    cropRect = null;
    drawOverlay(null);
    renderPhase();
  }

  function onCanvasMouseMove(e: MouseEvent): void {
    if (phase !== "selecting" || !dragStart) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    drawOverlay(rectFrom(dragStart, coords));
  }

  function onCanvasMouseUp(e: MouseEvent): void {
    if (phase !== "selecting" || !dragStart) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const rect = rectFrom(dragStart, coords);
    dragStart = null;
    if (rect.width < 10 || rect.height < 10) {
      // 小さすぎる選択はリセット。
      phase = "previewing";
      drawOverlay(null);
      renderPhase();
      return;
    }
    cropRect = rect;
    drawOverlay(rect);
    phase = "ready";
    renderPhase();
  }

  canvasOverlay.addEventListener("mousedown", onCanvasMouseDown);
  canvasOverlay.addEventListener("mousemove", onCanvasMouseMove);
  canvasOverlay.addEventListener("mouseup", onCanvasMouseUp);

  // --- 画面選択（getDisplayMedia） ------------------------------------------
  async function handleSelectScreen(): Promise<void> {
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (destroyed) {
        for (const track of media.getTracks()) track.stop();
        return;
      }
      stream = media;
      video.srcObject = media;
      await video.play?.().catch(() => {
        /* play() は jsdom / autoplay 制限で reject し得るが致命ではない */
      });
      // ユーザーが共有を止めた（track ended）→ idle に戻す。
      const videoTrack = media.getVideoTracks()[0];
      if (videoTrack) {
        const onEnded = (): void => {
          stopStream();
          phase = "idle";
          renderPhase();
        };
        videoTrack.addEventListener("ended", onEnded);
        detachTrackEnded = () => videoTrack.removeEventListener("ended", onEnded);
      }
      phase = "previewing";
      renderPhase();
    } catch {
      // OS ダイアログをユーザーがキャンセル → 何もしない（React 原版と同一・idle のまま）。
    }
  }

  // --- 録画開始（setInterval でフレーム取得） --------------------------------
  function handleStartRecording(): void {
    if (!cropRect || !video.videoWidth) return;
    const rec = new GifRecorderState({ fps: 10, maxDuration: MAX_DURATION, outputWidth: 800 });
    recorder = rec;
    const rect = cropRect;
    elapsed = 0;
    phase = "recording";
    renderPhase();

    const hiddenCanvas = document.createElement("canvas");
    hiddenCanvas.width = video.videoWidth;
    hiddenCanvas.height = video.videoHeight;
    const hiddenCtx = hiddenCanvas.getContext("2d");
    if (!hiddenCtx) return;

    intervalId = setInterval(() => {
      hiddenCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const frameCanvas = extractFrameFromCanvas(hiddenCanvas, rect, rec.outputWidth);
      const ok = rec.addFrame(frameCanvas);
      elapsed = rec.elapsed;
      timerText.update({ text: `${formatTime(elapsed)} / ${formatTime(MAX_DURATION)}` });
      if (!ok) {
        // 最大フレーム到達 → 自動停止。
        void handleStopRecording();
      }
    }, 1000 / rec.fps);
  }

  // --- 録画停止 + エンコード（encodeGif） ------------------------------------
  async function handleStopRecording(): Promise<void> {
    clearRecordInterval();
    const rec = recorder;
    if (!rec || rec.frames.length === 0) {
      phase = "ready";
      renderPhase();
      return;
    }
    phase = "encoding";
    progressBar.update({ value: 0 });
    percentText.update({ text: "0%" });
    renderPhase();

    const firstFrame = rec.frames[0];
    try {
      const blob = await encodeGif(
        rec.frames,
        firstFrame.width,
        firstFrame.height,
        rec.fps,
        (p) => {
          progressBar.update({ value: p * 100 });
          percentText.update({ text: `${Math.round(p * 100)}%` });
        },
      );
      if (destroyed) return;
      revokeResultUrl();
      resultBlob = blob;
      resultUrl = URL.createObjectURL(blob);
      resultImg.src = resultUrl;
      phase = "done";
      renderPhase();
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] [ERROR] GIF encoding failed: ${
          err instanceof Error ? err.stack ?? err.message : String(err)
        }`,
      );
      phase = "ready";
      renderPhase();
    }
  }

  // --- 保存（onComplete） ----------------------------------------------------
  function handleSave(): void {
    if (!resultBlob) return;
    const settings: GifSettings = {
      fps: recorder?.fps ?? 10,
      width: recorder?.outputWidth ?? 800,
      duration: recorder?.elapsed ?? 0,
    };
    onComplete(resultBlob, fileName, settings);
  }

  // --- 撮り直し（done → previewing / idle） ----------------------------------
  function handleRetry(): void {
    revokeResultUrl();
    resultImg.removeAttribute("src");
    resultBlob = null;
    elapsed = 0;
    progressBar.update({ value: 0 });
    percentText.update({ text: "0%" });
    recorder?.reset();
    phase = stream ? "previewing" : "idle";
    drawOverlay(null);
    renderPhase();
  }

  // 初期描画（idle）。
  renderPhase();

  return {
    el: dialog.el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearRecordInterval();
      stopStream();
      video.srcObject = null;
      revokeResultUrl();
      resultBlob = null;
      recorder = null;
      canvasOverlay.removeEventListener("mousedown", onCanvasMouseDown);
      canvasOverlay.removeEventListener("mousemove", onCanvasMouseMove);
      canvasOverlay.removeEventListener("mouseup", onCanvasMouseUp);
      for (const h of handles) h.destroy();
      dialog.destroy();
    },
  };
}
