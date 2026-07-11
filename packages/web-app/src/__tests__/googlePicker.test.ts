/**
 * googlePicker のユニットテスト
 *
 * drive.file スコープでは Picker に appId（Cloud プロジェクト番号）を渡さないと
 * 選択したファイルがアプリへ許可されず、後続の Drive API が 404 になる。
 */

import { pickDriveMarkdownFile } from "../lib/googlePicker";

interface BuilderCalls {
  oauthToken?: string;
  developerKey?: string;
  appId?: string;
  mimeTypes?: string;
  visible: boolean;
}

function installGapiMock(action: string, docs?: { id: string; name: string }[]): BuilderCalls {
  const calls: BuilderCalls = { visible: false };
  let callback: ((data: unknown) => void) | undefined;

  const view = {
    setMimeTypes(mimeTypes: string) {
      calls.mimeTypes = mimeTypes;
      return view;
    },
  };
  const builder = {
    setOAuthToken(token: string) {
      calls.oauthToken = token;
      return builder;
    },
    setDeveloperKey(key: string) {
      calls.developerKey = key;
      return builder;
    },
    setAppId(appId: string) {
      calls.appId = appId;
      return builder;
    },
    addView() {
      return builder;
    },
    setCallback(cb: (data: unknown) => void) {
      callback = cb;
      return builder;
    },
    build() {
      return {
        setVisible(visible: boolean) {
          calls.visible = visible;
          callback?.({ action, docs });
        },
      };
    },
  };

  Object.assign(window, {
    gapi: { load: (_name: string, cb: () => void) => cb() },
    google: {
      picker: {
        PickerBuilder: function PickerBuilder() {
          return builder;
        },
        DocsView: function DocsView() {
          return view;
        },
      },
    },
  });
  return calls;
}

describe("pickDriveMarkdownFile", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "gapi");
    Reflect.deleteProperty(window, "google");
  });

  it("appId を Picker に渡す（drive.file スコープでの許可付与に必須）", async () => {
    const calls = installGapiMock("picked", [{ id: "file-1", name: "note.md" }]);

    const picked = await pickDriveMarkdownFile("token-1", "api-key-1", "319387139351");

    expect(calls.appId).toBe("319387139351");
    expect(calls.oauthToken).toBe("token-1");
    expect(calls.developerKey).toBe("api-key-1");
    expect(calls.mimeTypes).toBe("text/markdown,text/plain");
    expect(picked).toEqual({ fileId: "file-1", name: "note.md" });
  });

  it("キャンセル時は null を返す", async () => {
    installGapiMock("cancel");

    await expect(pickDriveMarkdownFile("token-1", "api-key-1", "319387139351")).resolves.toBeNull();
  });
});
