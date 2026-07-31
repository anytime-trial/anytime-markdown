/**
 * @jest-environment jsdom
 */
import { createEditableGroup } from '../ui/editableGroup';

describe('createEditableGroup', () => {
  it('編集不可にすると登録したコントロールをすべて無効にする', () => {
    const group = createEditableGroup();
    const button = group.register(document.createElement('button'));
    const input = group.register(document.createElement('input'));
    group.setEditable(false);
    expect(button.disabled).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('編集可へ戻すと有効にする', () => {
    const group = createEditableGroup();
    const button = group.register(document.createElement('button'));
    group.setEditable(false);
    group.setEditable(true);
    expect(button.disabled).toBe(false);
  });

  it('コントロール自身の理由による無効は編集可へ戻しても残る', () => {
    const group = createEditableGroup();
    const input = group.register(document.createElement('input'));
    group.setOwnDisabled(input, true);
    group.setEditable(false);
    group.setEditable(true);
    expect(input.disabled).toBe(true);
  });

  it('自身の理由が解けたら編集可のとき有効へ戻る', () => {
    const group = createEditableGroup();
    const input = group.register(document.createElement('input'));
    group.setOwnDisabled(input, true);
    group.setOwnDisabled(input, false);
    expect(input.disabled).toBe(false);
  });

  it('編集不可のときは自身の理由が解けても無効のまま', () => {
    const group = createEditableGroup();
    const input = group.register(document.createElement('input'));
    group.setEditable(false);
    group.setOwnDisabled(input, false);
    expect(input.disabled).toBe(true);
  });

  it('編集不可へ切り替えた後に登録したものにも効く', () => {
    const group = createEditableGroup();
    group.setEditable(false);
    const button = group.register(document.createElement('button'));
    expect(button.disabled).toBe(true);
  });

  it('作り直しの後の解放で、外れた要素だけ登録から捨てる', () => {
    const group = createEditableGroup();
    const attached = document.createElement('button');
    document.body.append(attached);
    group.register(attached);
    const detached = group.register(document.createElement('button'));
    group.releaseDetached();
    group.setEditable(false);
    // 捨てられた要素は以後の切り替えを受け取らない。生きている要素は受け取る。
    expect(detached.disabled).toBe(false);
    expect(attached.disabled).toBe(true);
    attached.remove();
  });

  it('解放を呼ばなければ未接続の要素にも切り替えが効く（生成直後の適用を壊さない）', () => {
    const group = createEditableGroup();
    const pending = group.register(document.createElement('button'));
    group.setEditable(false);
    expect(pending.disabled).toBe(true);
  });

  it('登録した目印を付けて横断検査から見つけられるようにする', () => {
    const group = createEditableGroup();
    const button = group.register(document.createElement('button'));
    expect(button.dataset.editControl).toBe('true');
  });
});
