import type { CooccurrenceSlice } from '@anytime-markdown/graph-core';
import type { EditableGroup } from './editableGroup';

/**
 * スライス別の値の入力欄（設計書 §3.5）。
 *
 * 語と共起で同じ形の面になるため、両方のタブが共有する。ある語・共起がどのスライスにどの値で
 * 存在するかは対象の属性であり、時間タブではなく対象のタブが持つ。
 *
 * 空欄は「そのスライスに存在しない」を表す。0 を書けるようにしないのは、不在をエントリが
 * 現れないことで表す規則（設計書 §2.2）と表現を 1 つに保つためである。
 */
export interface SliceValueEditorOptions {
  /**
   * 書き換え系コントロールの入れ物。スライス別の入力欄を登録する。
   *
   * 欄はスライスの枚数が変わるたびに作り直すため、作り直した直後に登録の解放を呼ぶ。
   */
  edit: EditableGroup;
  /** 値を入れた・変えた。 */
  onSet(sliceIndex: number, value: number): void;
  /** 欄を空にした（そのスライスから外す）。 */
  onRemove(sliceIndex: number): void;
}

export interface SliceValueEditorHandle {
  element: HTMLElement;
  /**
   * 見出しを差し替える。
   *
   * Why not キーを受け取って中で翻訳関数を引くか: i18n の検査は翻訳関数の呼び出しに書かれた
   * 文字列リテラルを走査して未参照のキーを見つける。変数越しに引くと走査から外れ、使っている
   * キーが「参照ゼロ」と判定される。呼び出し側にリテラルで引かせる。
   */
  setTitle(text: string): void;
  /** スライス定義と現在値を流し込む。値が `undefined` の欄は空になる。 */
  update(slices: readonly CooccurrenceSlice[], values: readonly (number | undefined)[]): void;
  /**
   * 今の入力値を読む。語・共起の**追加**は、時間軸を持つファイルではスライス別の値を
   * 要求されるため（`slice-values-required`）、追加の経路がここから値を取る。
   */
  readValues(): (number | undefined)[];
}

const STYLE_ID = 'cooccurrence-slice-value-editor-style';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-slice-values{display:flex;flex-direction:column;gap:4px}
.cooc-slice-values[hidden]{display:none}
.cooc-slice-values__title{font:600 12px system-ui,sans-serif;color:var(--cooc-text)}
.cooc-slice-values__row{display:grid;grid-template-columns:minmax(0,1fr) 84px;gap:6px;align-items:center;font:12px system-ui,sans-serif;color:var(--cooc-text-secondary)}
.cooc-slice-values__row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cooc-slice-values__row input{box-sizing:border-box;width:100%;border:1px solid var(--cooc-divider);border-radius:6px;background:var(--cooc-surface);color:var(--cooc-text);padding:4px 6px;font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

export function createSliceValueEditor(options: SliceValueEditorOptions): SliceValueEditorHandle {
  ensureStyles();
  let titleText = '';
  let inputs: HTMLInputElement[] = [];
  let inputSlices: readonly CooccurrenceSlice[] = [];

  const element = document.createElement('div');
  element.className = 'cooc-slice-values';
  const title = document.createElement('div');
  title.className = 'cooc-slice-values__title';
  element.appendChild(title);

  /**
   * 入力欄の読み上げ名。見出し（頻度か強度か）とスライス名を連結する。
   *
   * この欄は語タブ（スライス別の頻度）と共起タブ（スライス別の強度）が共有するため、スライス名
   * だけを名前にすると、支援技術にはどちらの欄も「1月」としか読まれず、何の値を入力しているのか
   * 分からない。見出しは素の div であり、入力欄と関連付いていない。
   */
  function inputLabel(slice: CooccurrenceSlice): string {
    return titleText === '' ? slice.label : `${titleText} ${slice.label}`;
  }

  function render(slices: readonly CooccurrenceSlice[], values: readonly (number | undefined)[]): void {
    title.textContent = titleText;
    element.hidden = slices.length === 0;
    // 入力中の欄を作り直すと、打っている途中の値とフォーカスが消える。欄の数が変わらない
    // 限り作り直さず、値だけを流し込む。
    const focused = document.activeElement;
    if (inputs.length !== slices.length) {
      // 作り直す前に前回の欄の登録を外す。捨てた欄を持ち続けると、スライスを増減するたびに
      // 登録が積もる。
      inputs.forEach((input) => options.edit.unregister(input));
      element.replaceChildren(title);
      inputs = slices.map((slice, index) => {
        const row = document.createElement('div');
        row.className = 'cooc-slice-values__row';
        const name = document.createElement('span');
        name.textContent = slice.at === undefined ? slice.label : `${slice.label}（${slice.at}）`;
        const input = options.edit.register(document.createElement('input'));
        input.type = 'number';
        input.setAttribute('aria-label', inputLabel(slice));
        input.addEventListener('change', () => {
          const raw = input.value.trim();
          if (raw === '') {
            options.onRemove(index);
            return;
          }
          const value = Number(raw);
          if (Number.isFinite(value)) options.onSet(index, value);
        });
        row.append(name, input);
        element.appendChild(row);
        return input;
      });
    } else {
      slices.forEach((slice, index) => {
        const name = element.children[index + 1]?.firstElementChild;
        if (name !== null && name !== undefined) {
          name.textContent = slice.at === undefined ? slice.label : `${slice.label}（${slice.at}）`;
        }
        inputs[index].setAttribute('aria-label', inputLabel(slice));
      });
    }
    inputSlices = slices;
    inputs.forEach((input, index) => {
      if (input === focused) return;
      const value = values[index];
      input.value = value === undefined ? '' : String(value);
    });
  }

  render([], []);

  return {
    element,
    setTitle(text: string): void {
      titleText = text;
      title.textContent = text;
      // 既に組んである欄の読み上げ名も貼り直す。見出しだけ差し替えると、ロケールを切り替えた
      // 後の読み上げ名が前の言語のまま残る。
      inputSlices.forEach((slice, index) => inputs[index]?.setAttribute('aria-label', inputLabel(slice)));
    },
    update(slices, values): void {
      render(slices, values);
    },
    readValues(): (number | undefined)[] {
      return inputs.map((input) => {
        const raw = input.value.trim();
        if (raw === '') return undefined;
        const value = Number(raw);
        return Number.isFinite(value) ? value : undefined;
      });
    },
  };
}
