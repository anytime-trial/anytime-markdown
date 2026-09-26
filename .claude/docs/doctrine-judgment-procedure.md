# ドクトリン接地判断と What 承認の代行（D2）— 手順書

更新日: 2026-09-26（`CLAUDE.md` から移設。What 承認に入る時点で Read する。常時ロードしない）

中間承認（What 承認）をドクトリンへ接地した判断へ段階移行する。2026-08-05 に人の承認で D2（低重大度・高可逆な What 承認の代行）へ昇格した（昇格時の実測: 母数 27 件・一致率 93.3%・引用解決率 97.1%・代行可能率 41.7%）。正本は `<docsRoot>/spec/31.trail/16.doctrine-judgment/doctrine-judgment.ja.md` と `<docsRoot>/spec/31.trail/18.coverage-gate/coverage-gate.ja.md`。

## 手順

1. What 承認が要る場面で、AskUserQuestion を出す**前**に mcp-trail `record_doctrine_judgment` で自分の接地判断を記録する（判断 approve/reject/escalate・カバレッジ covered/silent/conflict/odd_out・承認済みドクトリン（`<docsRoot>/spec/92.doctrine/` ほか）への引用: 絶対パス + 節 + 逐語引用）。**`severity` / `target_paths` / `operation_kind` / `underspecified_points` の 4 つを必ず申告する**（前 3 つはいずれかが未申告ならカバレッジゲートは fail-closed で `escalate` に倒し、代行は成立しない）。
    - **`underspecified_points`（DCT-14・2026-08-07 追加）は「指示から一意に定まらない論点」の事前申告**。ユーザーの代わりに自分で決めようとしている点（指示に無い設計の分岐・扱いが書かれていないケース・指示が沈黙しているスコープ境界）をここへ書く。**空配列で出すことは「この指示だけで結論は一意に定まる」という積極的な宣言**であり、省略はできない（未指定は `underspecified_unknown` で `escalate`）。非空ならゲートは `underspecified_instruction` で `escalate` する。再記録はラチェットで、論点の追記は通るが**非空 → 空へは戻せず、部分削除も既存申告との和集合へ矯正される**（追記のみ・DCT-19）。
    - **`severity` の申告基準（DCT-19 附記・2026-08-15）**: 次の 6 トリガーに 1 つでも該当したら `high` を申告する（片方向。非該当時の low/medium は従来判断）— セキュリティ境界（認証・認可・サニタイズ）/ 個人情報フロー / 外部契約（外部 API・公開スキーマ）/ 新規パターン導入 / 高リスク値計算 / 実行時ハザード（重いクエリ・ジョブ）。正本は coverage-gate 仕様 §10。
2. 戻り値の `gate.verdict` で分岐する。
    - **`delegable` かつ自分の判断が `approve`** → **人に聞かずに進める**。直後に `record_delegated_approval` で代行を記録し、応答に「何を代行したか」と接地した条項を 1 行残す（無言で進めない）。
    - **それ以外**（`escalate` / 自分の判断が `reject` / `escalate`）→ AskUserQuestion で人へ聞き、回答の**直後**に `record_human_decision` で実際の判断（approve/reject/modified）を記録する。
    - **`escalate` の理由が `underspecified_instruction` のとき（DCT-19・2026-08-15）**: **AskUserQuestion の質問を、申告した論点と 1 対 1 に対応させる**（論点 1 つ = 質問 1 つ。4 問上限に収まらない場合だけ論点を束ねる）。What 全体を 1 問で聞くと回答が論点へ紐づかず、`resolve_underspecified_points` を呼べないまま代行が永久に成立しない（2026-08-19 実測: `underspecified` 28 件に対し解消は 2 件のみ・DCT-14 以降の代行は 0 件）。回答を得たら `resolve_underspecified_points` で論点ごとに記録 →（回答で確定した内容で）同一 subject の判断を**再記録**する、までを 1 セットとして必ず実行する。解消済み論点は規則 2.5 を通過するため、他規則も通れば `delegable` になり代行できる。回答の無い解消は記録できない（空回答拒否）。正本は coverage-gate 仕様 §9。
3. **常に人へ聞く操作は `operation_kind` でゲートに申告する**（global `~/.claude/CLAUDE.md`「承認の対象」の例外項目）。`code_change` 以外（`dependency_change` / `destructive_git` / `remote_push` / `production_release` / `persistent_data_write`）はゲートが `always_human_operation` で必ず `escalate` する。これらを散文の遵守に頼らないのは、パッケージ追加・push・リリース・破壊的 git がパスに現れず `target_paths` では原理的に表現できないためである。ワークスペース内の設定・依存マニフェスト（`package.json` / `package-lock.json` / `.mcp.json` / `.claude/settings*` / `.git/` / `.github/`）はパスで表現できるので制限領域として `restricted_area` で escalate する。
4. 記録失敗（TrailDataServer 未起動・DB 不在等）は承認フローを止めず、失敗した事実を応答に 1 行残す（silent skip 禁止）。**ただし代行の記録に失敗した場合は代行しない**（記録の無い代行は監査できないため、人へ聞く側へ倒す）。
5. session_id は airspace クレームファイル（`.git/anytime/claims/`）の自セッション ID を使う。

## 監視と差し戻し

- 指標の確認は `get_doctrine_agreement`（`agreementRate` / `instructionGapRate` / `delegableRate` / `delegated` / `delegatedAudited` / `pending`）。`pending` は「人へ聞いたが未記録」だけを数え、代行済みは `delegated` へ分かれる。
- **`agreementRate` が 0.9 を下回ったら D2 を止めて D1（全件を人へ聞く）へ戻す**。判断材料と差し戻しの可否はユーザーへ提示する。
- **差し戻しの対象は「較正の失敗」に限る**。未確定論点を申告した判断は `agreementRate` の分母に入らず `instructionGapRate` が数える。指示不足は D1 差し戻しでは減らない（全件人へ聞いても指示に無い情報は補われない）ので、是正は「What 承認を出す前に不足論点を洗い出す」運用側に置く。分母が薄い局面（20 件未満は 1 件で 5 ポイント以上動く）で閾値を機械適用しない。`instructionGapRate` を生きた信号として読むときは `since='2026-08-07'` を渡す（DCT-14 以前のレコードは空の申告として分母に入るため低く出る）。`unreadableDeclarations` が 0 でない間は両方の率の解釈を保留する。
- 代行した判断は人が後から `record_human_decision` で判断でき（抜き取り監査）、その結果は一致率へ入る。`delegatedAudited` が監査の実施件数。
