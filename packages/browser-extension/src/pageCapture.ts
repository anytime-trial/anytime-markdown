/**
 * 右クリックメニュー「anytime-markdown で編集」で対象タブへ注入するスクリプト。
 *
 * `chrome.scripting.executeScript({ files: ["pageCapture.js"] })` は
 * InjectionResult.result として「注入したスクリプトの completion value」を返す。
 * esbuild の IIFE バンドル出力は本体を無名関数でラップするため、バンドル内の
 * 最終式（トップレベルに見える行）はそのラップ関数のローカルな completion value に
 * すぎず、注入結果としては拾えない（関数呼び出しの戻り値ではなく `return` が無い限り
 * undefined になる）。
 *
 * そのため、いったん `globalThis` へ結果を退避し、esbuild.mjs の `footer` で
 * IIFE の外側（ファイル末尾＝スクリプト全体の最終式）に「値を読み出して即座に
 * 削除し、その値を最終式として残す」処理を追記する方式を取る。
 * ここでは globalThis への一時代入のみを行う。
 */
import { capturePageMarkdown } from "@anytime-markdown/markdown-viewer/web-import/capture-page";

declare global {
  interface Window {
    __amPageCaptureResult?: unknown;
  }
}

globalThis.__amPageCaptureResult = capturePageMarkdown(
  document,
  globalThis.location.href,
  new Date(),
);
