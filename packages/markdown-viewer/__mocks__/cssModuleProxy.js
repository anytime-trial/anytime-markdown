/**
 * CSS Modules を jest で扱うためのスタブ。
 * `styles.header` 等のアクセスに対しキー名そのもの（"header"）を返す Proxy。
 * 実 CSS は jsdom で計算しないため、クラス名さえ解決できればよい。
 */
module.exports = new Proxy(
  {},
  {
    get: (_target, key) => (key === "__esModule" ? false : String(key)),
  },
);
