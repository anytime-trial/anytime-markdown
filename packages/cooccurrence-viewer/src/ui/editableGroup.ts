export type EditableControl =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

export interface EditableGroup {
  /** 書き換え系のコントロールを登録する。返り値は引数そのもの。 */
  register<T extends EditableControl>(control: T): T;
  /** コントロール自身の理由（例: 時間軸ありでは全体値を編集できない）による無効を設定する。 */
  setOwnDisabled(control: EditableControl, disabled: boolean): void;
  /** 編集モードの入／切を反映する。 */
  setEditable(editable: boolean): void;
}

/**
 * 「ファイルを書き換える操作」をまとめて無効にする入れ物。
 *
 * Why not 各パネルで `button.disabled = !editable` と書くか: 書き換え系のコントロールはパネル
 * ごとに 5〜10 個あり、後から足したものへ付け忘れると、閲覧中にそこだけ押せてしまう。同種の
 * 付け忘れはボタンの土台クラスで実際に 3 度起きている（`buttonBaseStyle` の注記）。登録した
 * ものを一括で扱えば、起こりうる漏れは「登録し忘れ」の 1 種類だけになり、検査もそこへ集中できる。
 *
 * 登録したコントロールには `data-edit-control="true"` を付ける。パネルを列挙する側の横断検査が
 * この目印で「書き換え系のコントロール」を集めるため、パネルが増えても検査の側を直さずに済む。
 */
export function createEditableGroup(): EditableGroup {
  const ownDisabled = new Map<EditableControl, boolean>();
  let editable = true;

  function apply(control: EditableControl): void {
    control.disabled = !editable || (ownDisabled.get(control) ?? false);
  }

  return {
    register(control) {
      ownDisabled.set(control, false);
      control.dataset.editControl = 'true';
      apply(control);
      return control;
    },
    setOwnDisabled(control, disabled) {
      ownDisabled.set(control, disabled);
      apply(control);
    },
    setEditable(next) {
      editable = next;
      ownDisabled.forEach((_own, control) => apply(control));
    },
  };
}
