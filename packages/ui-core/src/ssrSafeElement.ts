/**
 * Web Component 定義用の SSR/Node 安全な `HTMLElement` 基底。
 *
 * `HTMLElement` が未定義の環境（Next の SSR・Node ビルド・barrel 経由のサーバ評価）でも
 * `class X extends HTMLElementBase` の評価時に ReferenceError を投げないよう、ダミー基底へ
 * フォールバックする。実際の登録（`customElements.define`）と動作はブラウザでのみ行う。
 *
 * 各パッケージの `AnytimeXxxElement` が同じ 4 行を個別に持っていたため 1 箇所へ集約した。
 */
export const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement);
