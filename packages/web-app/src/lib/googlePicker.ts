/**
 * Google Picker API ローダ（web-app 専用・ブラウザ実行前提）。
 *
 * https://apis.google.com/js/api.js を動的 script 挿入し、`gapi.load("picker")` 完了後に
 * `google.picker.PickerBuilder` で Drive 上の Markdown / テキストファイルのみを選択させる。
 * OAuth トークンは呼び出し側が `GET /api/auth/google-token` 等で取得して渡す（本ファイルは知らない）。
 *
 * `any` 禁止のため gapi / google.picker の必要最小限の型のみをこのファイル内に宣言する
 * （@types/gapi.picker 相当のパッケージ追加は新規依存となるため行わない）。
 */

export interface PickedDriveFile {
  fileId: string;
  name: string;
}

interface GapiPickerDoc {
  id: string;
  name: string;
}

interface GapiPickerCallbackData {
  action: string;
  docs?: GapiPickerDoc[];
}

interface GapiDocsView {
  setMimeTypes(mimeTypes: string): GapiDocsView;
}

interface GapiPicker {
  setVisible(visible: boolean): void;
}

interface GapiPickerBuilder {
  setOAuthToken(token: string): GapiPickerBuilder;
  setDeveloperKey(key: string): GapiPickerBuilder;
  addView(view: GapiDocsView): GapiPickerBuilder;
  setCallback(callback: (data: GapiPickerCallbackData) => void): GapiPickerBuilder;
  build(): GapiPicker;
}

interface GapiPickerNamespace {
  PickerBuilder: new () => GapiPickerBuilder;
  DocsView: new () => GapiDocsView;
}

interface GapiClient {
  load(apiName: string, callback: () => void): void;
}

declare global {
  interface Window {
    gapi?: GapiClient;
    google?: { picker: GapiPickerNamespace };
  }
}

const PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
const DRIVE_MARKDOWN_MIME_TYPES = "text/markdown,text/plain";
const PICKED_ACTION = "picked";
const CANCEL_ACTION = "cancel";

/** 多重ロード防止用（同一ページ内で複数回呼ばれても script 挿入・ロード待機は 1 回だけ行う） */
let gapiScriptLoadPromise: Promise<void> | undefined;

function loadGapiScript(): Promise<void> {
  if (window.gapi) {
    return Promise.resolve();
  }
  if (gapiScriptLoadPromise) {
    return gapiScriptLoadPromise;
  }

  gapiScriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PICKER_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("googlePicker: failed to load Google API script")),
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PICKER_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("googlePicker: failed to load Google API script")),
    );
    document.head.appendChild(script);
  });

  return gapiScriptLoadPromise;
}

function loadPickerModule(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("googlePicker: gapi is not available after script load"));
      return;
    }
    window.gapi.load("picker", () => resolve());
  });
}

function resolvePickerCallback(
  data: GapiPickerCallbackData,
  resolve: (value: PickedDriveFile | null) => void,
): void {
  if (data.action === PICKED_ACTION) {
    const doc = data.docs?.[0];
    if (doc) {
      resolve({ fileId: doc.id, name: doc.name });
      return;
    }
  }
  if (data.action === CANCEL_ACTION) {
    resolve(null);
  }
}

/**
 * Google Picker を表示し、選択された Drive 上の Markdown / テキストファイルを返す。
 * キャンセル時は null。ブラウザ実行前提（SSR からの呼び出しは例外を投げる）。
 */
export async function pickDriveMarkdownFile(
  oauthToken: string,
  apiKey: string,
): Promise<PickedDriveFile | null> {
  if (typeof window === "undefined") {
    throw new Error("pickDriveMarkdownFile: browser environment required");
  }

  await loadGapiScript();
  await loadPickerModule();

  const google = window.google;
  if (!google) {
    throw new Error("pickDriveMarkdownFile: google.picker failed to load");
  }
  const { picker } = google;

  return new Promise<PickedDriveFile | null>((resolve) => {
    const view = new picker.DocsView().setMimeTypes(DRIVE_MARKDOWN_MIME_TYPES);
    const instance = new picker.PickerBuilder()
      .setOAuthToken(oauthToken)
      .setDeveloperKey(apiKey)
      .addView(view)
      .setCallback((data) => resolvePickerCallback(data, resolve))
      .build();
    instance.setVisible(true);
  });
}
