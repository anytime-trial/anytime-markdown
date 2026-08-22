# 実装後テスト設計 — 実装後テストを「変更の出口」から導出する（旧 anytime-impl-test-design）

更新日: 2026-08-22（旧 `anytime-impl-test-design` スキルを `anytime-doc-authoring` へ統合。試験設計（SKILL.md §5）と実装後テスト設計を同じスキルで扱うため。内容は統合時点の本文を維持）

## Overview

実装後テストの内容は、実装者の勘や事後発覚ではなく、**その変更が露出する「出口」（ユーザーから観測できる描画・配線・キー）から導出する**。ユニット/TDD は純粋ロジックの正しさを守るが、**出口がアプリに繋がっているか（配線・mount）は守らない**。本ガイドは出口を列挙し各出口にテスト手段を割り当てる手順を持つ。

理論的背骨は **Testing Trophy**（Kent C. Dodds）の4層 **Static（lint/型）/ Unit / Integration / E2E**。原則「**テストが実利用に似ているほど信頼が高い**」ゆえ、純粋ロジックの Unit だけでは実利用（mount・配線）に似ず信頼が出ない。Static 層（`tsc`）と Integration 層を**意図的に**足すのが本ガイドの眼目。

これは anytime-markdown 固有（ts-jest/testMatch/jsdom・VS Code 拡張の Extension Host reload・脱React vanilla 移行を前提）。

> **REQUIRED BACKGROUND**: 実装前の純粋関数は `superpowers:test-driven-development`（RED-GREEN-REFACTOR）が担う。本ガイドはそれが届かない出口（配線/mount/型/i18n）を**実装後**に補完する相補関係。テスト網羅の監査は段6 で `pr-test-analyzer`（行カバレッジでなく振る舞いカバレッジ・契約をテスト）に委ねられる。

## なぜユニット green ≠ 完了か（検知ギャップ）

過去、純粋関数のユニットは全部 green のまま**出口だけ消えて回帰**した（minimap cb73cc15d / Ctrl+S 5b95c4b50 / Scatter・Graph 976e9f784 / 選択パネル a47863ec2 / i18n 生キー da49cd7ec）。

| 穴 | 守れない理由 | 対策 |
| --- | --- | --- |
| 型不整合（i18n 未定義キー・loose `t()`） | ts-jest は isolatedModules で型エラーを見逃す | `tsc --noEmit` を jest と**別途**実行 |
| 配線・mount 回帰 | ユニットは mount 層・host 配線を見ない | 実 Editor/実 element で mount する**統合テスト** |
| 副作用層（`app.ts` 等で jest 不可） | そもそもユニットの射程外 | 配線を**純粋ヘルパに抽出**し `testMatch` に追加 |
| 最終 mount/見た目 | テストでは到達しない | **実機**（VS Code 拡張は compile→Extension Host Reload） |

## 手順：出口を列挙してテストを割り当てる

1. **変更の出口を列挙する**（データソース側ではなく観測できる出口だけ）。
2. **各出口にテスト手段を割り当てる**（下表）。
3. **書き換え/移行タスクは機能パリティ照合を追加**（下記）。
4. ユニットで到達できない出口は **統合テスト/実機**で裏取りする。

### 出口 → テスト手段マッピング（Testing Trophy 層に対応）

| 出口 | Trophy 層 | grep 起点（リテラル） | テスト手段 |
| --- | --- | --- | --- |
| 型不整合・i18n キー | Static | キー文字列（`c4.matrix.title` 等） | `tsc --noEmit`＋en/ja parity＋当該キー実在 |
| 純粋ロジック | Unit | — | ユニット（TDD・実装前） |
| host 配線（postMessage/コールバック） | Unit→Integration | `onSaveFile`・`postMessage({type})` | 配線を純粋ヘルパ抽出し payload を検証 |
| mount/描画（パネル/ポップアップ/マーカー） | Integration | `data-*`・コンテナ ID・ラベル | 実 element で mount し DOM 出現を検証する統合テスト |
| 装飾 CSS/イベント・最終見た目 | Integration | クラス名（`.tiptap`・`.change-gutter-mark`） | 統合テスト |
| ユーザーフロー（画面遷移・フォーム・i18n 表示・変換取込） | E2E | — | **web-app**=Playwright `npm run e2e -w packages/web-app`／**VS Code 拡張**=実機（compile→Extension Host Reload） |

> **E2E は automated（web-app）と 実機（拡張）で別物**。web-app は Playwright e2e harness があり自動実行する。VS Code 拡張は自動 e2e harness が無いため compile→Reload→観測が E2E 相当（`実機`）。混同しない。

### E2E が必要な改修の判定（要るのはいつか）

以下のいずれかなら E2E を実施する（不要と判断したら理由を残す）:

- web-app の**ユーザーフロー**を変えた（画面遷移・フォーム・i18n 表示・Web→md 変換取り込み等）。
- 型/i18n で **next build（tsc）が実質ゲート**になる変更（`IntlError INVALID_KEY` は ts-jest を通過し e2e で初検出された前例あり）。
- 複数ページ/コンポーネントをまたぐ統合フロー。

## 機能パリティ照合（書き換え/移行タスク必須）

移行は「データは生きているのに出口だけ消える」壊れ方をする。**before/after を出口単位で突き合わせる**。

1. **移行ベース commit を記録**（着手時）。旧実装は `git show <base>~1:path/Old.tsx` で復元する。
2. 旧実装の**出口インベントリ**を 5 観点（描画・host 配線・mount/デッドコード・i18n・装飾CSS）で作る。
3. 旧コードの**文字列リテラル**（ラベル・`data-*`・i18n キー・ハンドラ名）で新コードを**横断 grep**し、各出口が**配線まで**到達しているか照合する。
4. **「定義あり」と「配線あり」を区別**する（`mountCodeGraphPanel` が定義済みでも呼ばれてなければ未配線＝漏れ）。

> symbol/参照追跡は**使わない**。データソース側しか出さず「データ生存＝OK」の誤判定で全件漏れた。発見はリテラル grep。

**自動化版（Characterization / Golden Master test）**: これは Michael Feathers『Working Effectively with Legacy Code』の characterization test（＝旧い振る舞いをスナップショットし意図せぬ改変を検出）の適用。出口が**スナップショット可能**（レンダリング HTML・シリアライズ出力・DOM 構造）なら、リテラル grep の手動照合に加え、**旧実装から golden master を採取 → 新実装に当てて一致を assert** すれば回帰を自動で固定できる。grep は「配線が在るか」、golden master は「出力が一致するか」を担い相補。

## 検証器を先に検証する（verifier-first）

出口に割り当てた検証器（テストコード・golden master・parity チェック・grep 照合）自体が壊れていれば green は無意味。過去の回帰はテスト不足だけでなく**検証器が検証していなかった**形でも出た（モックシームが抽象移行で素通り・否定形アサーションの fail-open・スイートが起動不能で総数が減るだけで気づけない）。下の Red Flags のリトマスを思考実験で終えず、**実測に格上げする**（langchain-ai/langchain-skills `eval-engineering/verifier-design` の翻案）。

1. **Pass iff を 1 行で書く**: 各検証器の意図を「Pass iff <独立に観測可能な成功>」で明文化する。書けないなら成功条件が曖昧＝出口の定義に戻る。
2. **fixture 2 点で検証器を実測してから信じる**:

   | ケース | 期待 |
   | --- | --- |
   | 正しい実装（等価な別解・リファクタ後の形を含む） | pass |
   | この出口に固有の現実的な退行（1 件を意図的に注入） | fail |

   誤答が pass／正解が fail なら、被験コードではなく**検証器側**（アサーション・fixture・モックシーム）を直して再実測する。fixture の追加は具体的リスク（もっともらしい否定・境界値等）1 件につき 1 個にとどめ、既定で広い行列は作らない。
3. **実在した壊れ方は否定 fixture として固定する**: 過去バグやログで観測した失敗の形を controlled negative として再現する（「修正前に fail するリグレッションテスト」の一般化）。期待値は当時の記録から独立に決める。
4. **判定手段を客観/意味で切り分ける**: 客観事実（ファイル実在・テスト通過・状態変化・配線の存在）は決定的なコード判定で決める。**意味的正しさをキーワード・部分文字列一致で近似しない** — リテラル grep は「配線が在るか」の検知専用で、「出力が正しいか」は golden master／実行アサーションが担う。
5. **基盤失敗と被験失敗を区別する**: スイートが起動しない・環境欠落は「fail 0 件」でも合格でもない。`Tests: N passed, N total` の**総数 N を前回と突合**し、減少を回帰として扱う。

## Red Flags（見たら停止）

> **リトマス**: 「この変更にバグが入ったら、これらのテストは落ちるか？ 落ちたらどこを直せばいいか分かるか？」— No なら出口にテストが足りていない。

| 兆候 | 正す |
| --- | --- |
| ユニット green を根拠に「完了」とした | 出口（配線・mount・型・i18n）は別。出口マッピングで裏取り |
| 移行タスクで旧実装を読まず新コードだけ書いた | ベース commit から出口インベントリを作りパリティ照合 |
| symbol 追跡で「データ生存」を確認し配線確認を省いた | リテラル grep で**配線まで**到達を確認 |
| ts-jest green で型 OK と判断 | `tsc --noEmit` を別途実行 |
| 「実機未確認」のまま完了報告 | VS Code 拡張は compile→Extension Host Reload→実機 |
| 新設した検証器が fail するのを一度も見ずに green を信じた | 現実的な退行を 1 件注入して落ちることを実測（verifier-first） |

## Common Mistakes

- 出口を「データソース」と取り違える（matrix・aggregate は生きていても描画は別）。
- 副作用層を「テスト不可」で諦める → 配線を純粋ヘルパへ抽出すればテスト可能。
- i18n を ja/en 片方だけ追加 → parity テストで両方固定。

## エビデンスの残し方

テスト結果は**主張（pass/fail の語）ではなく、実行した検証コマンドの実出力**（コマンド＋結果行＋exit code）で残す（`superpowers:verification-before-completion`「evidence before claims」）。「テスト通過」は不十分で `Tests: 34 passed, 34 total`（実出力）が要る。

| 層 | 残すエビデンス（実出力） |
| --- | --- |
| Static（`tsc --noEmit`） | コマンド＋`Found 0 errors`／exit 0 |
| Unit/Integration（jest） | コマンド＋サマリ行 `Tests: N passed, N total`（pass/fail の語でなく数字） |
| E2E（web-app・Playwright） | `npm run e2e -w packages/web-app` のサマリ行＋exit 0。不要と判断したら理由を残す |
| Golden Master / Characterization | **スナップショットファイル自体がエビデンス**。コミット済み golden master と新出力の diff が空＝パリティ証明 |
| 実機（VS Code 拡張） | compile→Extension Host Reload した事実＋**スクショ or 観測記述**。「実機未確認」で終えるなら**理由を必須**で残す |

**永続化（揮発させない）**:

- セッション内: 完了通知に**実出力行**を貼る（bare pass/fail にしない）。
- コミット: golden master スナップショットはファイルとしてコミット（回帰の自動証拠）。検証要約はコミット本文に1行。
- 計画ファイル進捗（dev-cycle 段3 plan）: 各タスク完了時に検証出力行を追記。
- review/ ドキュメント（dev-cycle 段6）: `code-reviewer` subagent の findings は Trail `caravan_reviews` に取込まれ記録に残る。
- 実機エビデンス: スクショは `anytime-note` 経由 or review/ ドキュメントへ添付し「実機未確認」を構造的に潰す。

## References

- Testing Trophy（Static/Unit/Integration/E2E・「実利用に似ているほど信頼が高い」）: [Kent C. Dodds](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- Characterization / Golden Master test（旧振る舞いのスナップショットで回帰検出）: Michael Feathers『Working Effectively with Legacy Code』／[Wikipedia](https://en.wikipedia.org/wiki/Characterization_test)
- 振る舞いカバレッジ監査（行カバレッジでなく契約をテスト）: `pr-test-analyzer`（pr-review-toolkit）
- 実装前の純粋関数 TDD: `superpowers:test-driven-development`
- 検証器の事前テスト（pass/fail fixture・客観/意味の判定切り分け・基盤失敗の区別）: [langchain-ai/langchain-skills eval-engineering/verifier-design](https://github.com/langchain-ai/langchain-skills/blob/main/config/skills/eval-engineering/references/verifier-design.md)
