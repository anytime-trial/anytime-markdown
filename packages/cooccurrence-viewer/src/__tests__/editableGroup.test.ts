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

  it('登録を外した要素は以後の切り替えを受け取らない', () => {
    const group = createEditableGroup();
    const kept = group.register(document.createElement('button'));
    const dropped = group.register(document.createElement('button'));
    group.unregister(dropped);
    group.setEditable(false);
    expect(dropped.disabled).toBe(false);
    expect(kept.disabled).toBe(true);
  });

  it('文書へ挿す前の要素にも切り替えが効く（組み立て中の登録を捨てない）', () => {
    const group = createEditableGroup();
    const pending = group.register(document.createElement('button'));
    expect(pending.isConnected).toBe(false);
    group.setEditable(false);
    expect(pending.disabled).toBe(true);
  });

  it('登録した目印を付けて横断検査から見つけられるようにする', () => {
    const group = createEditableGroup();
    const button = group.register(document.createElement('button'));
    expect(button.dataset.editControl).toBe('true');
  });
});
