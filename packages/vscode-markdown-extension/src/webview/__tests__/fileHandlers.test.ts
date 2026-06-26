import { buildWebviewFileHandlers, SAVE_MESSAGE_TYPE } from '../fileHandlers';

describe('buildWebviewFileHandlers', () => {
  it('onSaveFile は host へ save メッセージを送る（回帰: 保存ダイアログ誘発を防ぐ）', () => {
    const posted: Array<{ type: string }> = [];
    const handlers = buildWebviewFileHandlers((message) => posted.push(message));

    handlers.onSaveFile();

    expect(posted).toEqual([{ type: SAVE_MESSAGE_TYPE }]);
    expect(SAVE_MESSAGE_TYPE).toBe('save');
  });

  it('onSaveFile を必ず提供する（undefined だと Ctrl+S が onDownload=Save As ダイアログに落ちる）', () => {
    const handlers = buildWebviewFileHandlers(() => {});

    expect(typeof handlers.onSaveFile).toBe('function');
  });
});
