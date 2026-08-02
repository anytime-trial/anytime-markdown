const STYLE_ID = 'cooccurrence-button-base-style';

/**
 * ボタン要素の UA 既定（白背景 `buttonface`・`2px outset` の枠・中央寄せ・内容幅）を打ち消す土台。
 *
 * Why not 各クラスで個別に打ち消すか: 打ち消しは網羅が要るぶん漏らしやすい。実際、語一覧の行
 * （`.cooc-words__row`）だけ `background` と `border` の打ち消しが抜けており、暗いテーマで
 * 白地に白文字となって読めなくなっていた。土台を 1 つにすれば、新しいボタンは
 * `cooc-btn` を付けるだけで既定に引きずられない。
 *
 * 各パネルの `ensureStyles()` の冒頭で呼ぶこと。土台は個別クラスと詳細度が同じであり、
 * 同詳細度では後に挿入されたシートが勝つため、土台が先に入っている必要がある。
 * この順序が崩れると個別の面や枠が土台に潰され、ボタンに見えなくなる。
 */
export function ensureButtonBaseStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-btn{appearance:none;-webkit-appearance:none;box-sizing:border-box;margin:0;background:transparent;border-width:0;border-style:none;border-radius:0;color:inherit;font:inherit;text-align:center;cursor:pointer}
.cooc-btn--block{width:100%;text-align:left}
`;
  document.head.appendChild(style);
}

/**
 * パネルのボタンを組み立てる。土台クラス `cooc-btn` と `type="button"` を必ず付ける。
 *
 * Why not 各パネルで `document.createElement('button')` を書くか: 土台クラスの付与が呼び出し側の
 * 記憶に頼りになり、実際に 3 度落とした。直近は時間軸パネルの並べ替え・削除・追加のボタンで、
 * 暗いテーマの白面（UA 既定の `buttonface`）に明色の図柄が乗って読めなくなっていた。生成を
 * ここへ集めれば落としようがない。`className` には土台の上に重ねる個別クラスだけを渡す。
 */
export function createPanelButton(className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className === '' ? 'cooc-btn' : `cooc-btn ${className}`;
  return button;
}
