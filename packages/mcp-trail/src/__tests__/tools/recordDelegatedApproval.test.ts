import { handleRecordDelegatedApproval } from '../../tools/recordDelegatedApproval';

describe('handleRecordDelegatedApproval', () => {
  it('id も (session_id + subject) も無ければ DB を開く前にエラーにする', async () => {
    // ガードが外れると resolveDbPath → openTrailDb まで進み、DB が無い環境では
    // 「どの入力が悪いのか分からない」エラーへ化ける
    await expect(handleRecordDelegatedApproval({ citations: undefined } as never)).rejects.toThrow(
      /requires id or \(session_id \+ subject\)/,
    );
  });

  it('session_id だけ・subject だけの片側指定もエラーにする', async () => {
    await expect(
      handleRecordDelegatedApproval({ session_id: 'session-1' } as never),
    ).rejects.toThrow(/requires id or \(session_id \+ subject\)/);
    await expect(handleRecordDelegatedApproval({ subject: '対象' } as never)).rejects.toThrow(
      /requires id or \(session_id \+ subject\)/,
    );
  });
});
