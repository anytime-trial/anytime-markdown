/**
 * 脱React の vanilla DOM「ScreenCaptureDialog」ファクトリ
 * （framework-decoupling Phase 3 / ホスト隔離・追加のみ・本番未配線）。
 *
 * React 原版 `components/ScreenCaptureDialog.tsx`（MUI/React 依存）の素 DOM 版。
 * `navigator.mediaDevices.getDisplayMedia` で取得した画面共有 stream を closure に保持し、
 * preview → capture（canvas.toDataURL）→ 確定（onCapture）の各フェーズを素 DOM で構成する。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従するため、原版の
 * `useIsDark` / `getDivider` 分岐は不要（CSS 変数 `--am-color-divider` を直接参照）。`useMarkdownT`
 * は opts.t で受ける。stream / video / listener / dialog は必ず `destroy()` で解放する。
 *
 * 戻り値は `{ el, destroy() }`。createDialog が portalTarget（既定 document.body）へ自前マウントするため生成時点で開く（el は参照用）。
 */

import {
  createButton,
  createDialog,
  createText,
  nextDialogTitleId,
  svgIcon,
} from "../ui-vanilla";

/** capture フローのフェーズ（React 原版 CapturePhase と同一）。 */
type CapturePhase = "idle" | "previewing" | "captured";

/** Material アイコン SVG path（24x24・ui/icons と同一）。 */
const SCREENSHOT_MONITOR_PATHS = [
  "M20 3H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h4v2h8v-2h4c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2m0 14H4V5h16z",
  "M6.5 7.5H9V6H5v4h1.5zM19 12h-1.5v2.5H15V16h4z",
] as const;
const CAMERA_ALT_PATH =
  "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5";
const REFRESH_PATH =
  "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z";
const CLOSE_PATH =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const CHECK_PATH = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";

/**
 * CameraAlt は `<circle>` + `<path>` の複合アイコンのため svgIcon（path のみ）では再現できない。
 * 専用ファクトリで circle を含む inline SVG を生成する。
 */
function cameraAltIcon(size = 16): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "3.2");
  svg.appendChild(circle);
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", CAMERA_ALT_PATH);
  svg.appendChild(p);
  return svg;
}

/** {@link createScreenCaptureDialog} のオプション（React props のファクトリ化）。 */
export interface CreateScreenCaptureDialogOptions {
  /** i18n。React 原版の `t` prop 相当（useMarkdownT を opts 引数化）。 */
  t: (key: string) => string;
  /** 撮影確定時のコールバック（PNG dataUrl を渡す）。React 原版 `onCapture` 相当。 */
  onCapture: (dataUrl: string) => void;
  /** ダイアログを閉じる要求のコールバック。React 原版 `onClose` 相当。 */
  onClose: () => void;
}

/** {@link createScreenCaptureDialog} の戻り値。 */
export interface ScreenCaptureDialogHandle {
  /** backdrop ルート（createDialog が自前マウント済み・参照用）。 */
  el: HTMLElement;
  /** stream / video / listener / dialog の解放。閉じる時に必ず呼ぶ。 */
  destroy: () => void;
}

/**
 * vanilla 版 ScreenCaptureDialog を生成する。
 *
 * - 生成（= open）と同時に idle フェーズで `getDisplayMedia` を自動呼び出し（React 原版の
 *   open && phase==="idle" useEffect 相当）。ユーザーが OS ダイアログをキャンセルしたら onClose。
 * - 取得した stream は closure（`stream` 変数）に保持し、capture / retry / destroy / track ended
 *   のいずれでも `stopStream()` で全 track を停止する。
 * - 撮影は video から canvas へ drawImage → `toDataURL("image/png")`。確定（apply）で onCapture +
 *   onClose、retry で idle に戻し再度 getDisplayMedia。
 */
export function createScreenCaptureDialog(
  opts: CreateScreenCaptureDialogOptions,
): ScreenCaptureDialogHandle {
  const { t, onCapture, onClose } = opts;

  let phase: CapturePhase = "idle";
  let stream: MediaStream | null = null;
  let capturedDataUrl: string | null = null;
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
  // paper 自体を flex column にして header / body を縦積みする。
  dialog.paper.style.padding = "0";

  // --- Header（close + icon + label） ---------------------------------------
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
  headerIcon.appendChild(svgIcon(SCREENSHOT_MONITOR_PATHS, 18));

  const headerLabel = createText({
    variant: "subtitle2",
    text: t("screenCapture"),
    style: "font-weight:600;",
  });
  headerLabel.el.id = titleId;

  header.append(closeBtn.el, headerIcon, headerLabel.el);

  // --- Body（preview / captured + 下部バー） ---------------------------------
  const body = document.createElement("div");
  body.style.cssText =
    "flex:1;display:flex;flex-direction:column;overflow:hidden;";

  // preview / capture エリア（黒背景・中央寄せ）。
  const previewArea = document.createElement("div");
  previewArea.style.cssText =
    "flex:1;position:relative;overflow:hidden;background-color:black;" +
    "display:flex;align-items:center;justify-content:center;";

  const video = document.createElement("video");
  video.muted = true;
  (video as HTMLVideoElement).setAttribute("playsinline", "");
  video.style.cssText = "max-width:100%;max-height:100%;display:none;";

  // idle プレースホルダ（アイコン + 案内テキスト）。
  const idlePlaceholder = document.createElement("div");
  idlePlaceholder.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--am-color-text-secondary);";
  idlePlaceholder.appendChild(svgIcon(SCREENSHOT_MONITOR_PATHS, 48));
  const idleText = createText({ variant: "body2", text: t("screenCaptureSelect") });
  idlePlaceholder.appendChild(idleText.el);

  previewArea.append(video, idlePlaceholder);

  // captured 表示エリア（撮影画像のプレビュー）。
  const capturedArea = document.createElement("div");
  capturedArea.style.cssText =
    "flex:1;display:none;align-items:center;justify-content:center;" +
    "overflow:auto;padding:16px;background-color:black;";
  const capturedImg = document.createElement("img");
  capturedImg.alt = "";
  capturedImg.draggable = false;
  capturedImg.style.cssText =
    "display:block;max-width:100%;max-height:calc(100vh - 150px);object-fit:contain;user-select:none;";
  capturedArea.appendChild(capturedImg);

  // 下部バー（フェーズ別ボタン群）。
  const bottomBar = document.createElement("div");
  bottomBar.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 16px;" +
    "border-top:1px solid var(--am-color-divider);flex-shrink:0;";

  // --- ボタン（previewing: 撮影 + 撮り直し / captured: 適用 + 撮り直し） -----
  const shootBtn = createButton({
    size: "small",
    variant: "contained",
    label: t("screenCaptureShoot"),
    startIcon: cameraAltIcon(16),
    onClick: () => handleCapture(),
  });
  const retryBtnPreview = createButton({
    size: "small",
    variant: "outlined",
    label: t("screenCaptureRetry"),
    startIcon: svgIcon(REFRESH_PATH, 16),
    onClick: () => handleRetry(),
  });
  const applyBtn = createButton({
    size: "small",
    variant: "contained",
    label: t("imageCropApply"),
    startIcon: svgIcon(CHECK_PATH, 14),
    onClick: () => handleApply(),
  });
  const retryBtnCaptured = createButton({
    size: "small",
    variant: "outlined",
    label: t("screenCaptureRetry"),
    startIcon: svgIcon(REFRESH_PATH, 16),
    onClick: () => handleRetry(),
  });

  body.append(previewArea, capturedArea, bottomBar);
  dialog.paper.append(header, body);

  // --- フェーズ反映（DOM 表示の同期） ---------------------------------------
  function renderPhase(): void {
    // preview / captured エリアの出し分け。
    previewArea.style.display = phase === "captured" ? "none" : "flex";
    capturedArea.style.display = phase === "captured" ? "flex" : "none";
    video.style.display = phase === "previewing" ? "block" : "none";
    idlePlaceholder.style.display = phase === "idle" ? "flex" : "none";

    // 下部バーのボタン群を作り直す。
    bottomBar.replaceChildren();
    if (phase === "previewing") {
      bottomBar.append(shootBtn.el, retryBtnPreview.el);
    } else if (phase === "captured") {
      bottomBar.append(applyBtn.el, retryBtnCaptured.el);
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

  // --- 画面選択（getDisplayMedia） ------------------------------------------
  async function handleSelectScreen(): Promise<void> {
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (destroyed) {
        // 取得完了前に destroy された場合は即停止して破棄。
        for (const track of media.getTracks()) track.stop();
        return;
      }
      stream = media;
      video.srcObject = media;
      await video.play().catch(() => {
        /* play() は jsdom や autoplay 制限で reject し得るが致命ではない */
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
      // OS ダイアログをユーザーがキャンセル → 閉じる。
      onClose();
    }
  }

  // --- 撮影（video → canvas → dataUrl） -------------------------------------
  function handleCapture(): void {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    const dataUrl = canvas.toDataURL("image/png");
    stopStream();
    capturedDataUrl = dataUrl;
    capturedImg.src = dataUrl;
    phase = "captured";
    renderPhase();
  }

  // --- 適用（onCapture + onClose） ------------------------------------------
  function handleApply(): void {
    if (capturedDataUrl) onCapture(capturedDataUrl);
    onClose();
  }

  // --- 撮り直し（idle に戻し再度 getDisplayMedia） --------------------------
  function handleRetry(): void {
    stopStream();
    capturedDataUrl = null;
    capturedImg.removeAttribute("src");
    phase = "idle";
    renderPhase();
    void handleSelectScreen();
  }

  // 初期描画 + open 時の自動 getDisplayMedia（React 原版 idle useEffect 相当）。
  renderPhase();
  void handleSelectScreen();

  return {
    el: dialog.el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopStream();
      video.srcObject = null;
      // 大きな PNG dataURL を保持し続けないよう参照を切る（呼び元が handle を保持しても早期 GC 可）。
      capturedDataUrl = null;
      closeBtn.destroy();
      shootBtn.destroy();
      retryBtnPreview.destroy();
      applyBtn.destroy();
      retryBtnCaptured.destroy();
      headerLabel.destroy();
      idleText.destroy();
      dialog.destroy();
    },
  };
}
