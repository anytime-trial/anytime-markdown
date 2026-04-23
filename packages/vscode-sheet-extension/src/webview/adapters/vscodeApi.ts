declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

let _api: ReturnType<typeof acquireVsCodeApi> | null = null;

export function getVscodeApi() {
  if (!_api) {
    _api = acquireVsCodeApi();
  }
  return _api;
}
