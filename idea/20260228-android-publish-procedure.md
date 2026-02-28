# Android (Google Play Store) 公開手順

## 前提条件

- **アプリ構成**: Next.js + Capacitor 7 ハイブリッドアプリ
- **appId**: `com.anytimemarkdown.app`
- **appName**: Anytime Markdown

---

## Phase 1: Google Play Developer アカウント準備

- [ ] 1-1. [Google Play Console](https://play.google.com/console/) で開発者アカウントを登録（登録料 $25、一度きり）
- [ ] 1-2. 開発者プロフィール情報を入力（名前、住所、メール、電話番号）
- [ ] 1-3. 本人確認（個人 or 組織）を完了
- [ ] 1-4. 支払いプロファイルを設定（有料アプリ/アプリ内課金がある場合）

---

## Phase 2: アプリ署名の準備

- [ ] 2-1. リリース用キーストアを生成
  ```bash
  keytool -genkey -v -keystore anytime-markdown-release.keystore \
    -alias anytime-markdown -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] 2-2. `packages/mobile-app/android/keystore.properties` を作成（Git管理外）
  ```properties
  storeFile=../anytime-markdown-release.keystore
  storePassword=<パスワード>
  keyAlias=anytime-markdown
  keyPassword=<パスワード>
  ```
- [ ] 2-3. `android/app/build.gradle` に署名設定を追加
- [ ] 2-4. キーストアファイルとパスワードを安全な場所にバックアップ（紛失するとアプリ更新不可）
- [ ] 2-5. Google Play App Signing を有効化（推奨）

---

## Phase 3: ストア掲載情報の準備

### 3-A. アセット素材

- [ ] 3-1. アプリアイコン（512x512 PNG、32bit、角丸なし）
- [ ] 3-2. フィーチャーグラフィック（1024x500 PNG/JPG）
- [ ] 3-3. スクリーンショット（最低2枚、推奨4-8枚）
  - 電話: 16:9 または 9:16（最小 320px、最大 3840px）
  - 7インチタブレット（任意）
  - 10インチタブレット（任意）

### 3-B. ストア説明文

- [ ] 3-4. アプリ名（30文字以内）
- [ ] 3-5. 短い説明（80文字以内）
- [ ] 3-6. 詳しい説明（4000文字以内）
- [ ] 3-7. カテゴリ選択（仕事効率化 / ツール）
- [ ] 3-8. タグ設定
- [ ] 3-9. プライバシーポリシーURL
- [ ] 3-10. 多言語対応（日本語 + 英語）

### 3-C. コンテンツ評価

- [ ] 3-11. コンテンツ評価質問票に回答（IARC）
- [ ] 3-12. ターゲットユーザー層の設定
- [ ] 3-13. データセーフティセクションの入力

---

## Phase 4: リリースビルドの作成

### 4-A. Web アプリの静的エクスポート

```bash
# packages/web-app で実行
cd packages/web-app
CAPACITOR_BUILD=true npm run build
# out/ ディレクトリに静的ファイルが生成される
```

### 4-B. Capacitor の同期

```bash
# packages/mobile-app で実行
cd packages/mobile-app
npx cap sync android
```

### 4-C. リリース AAB の生成

```bash
cd packages/mobile-app/android
./gradlew bundleRelease
# 出力: app/build/outputs/bundle/release/app-release.aab
```

- [ ] 4-1. Web アプリをビルド（`CAPACITOR_BUILD=true`）
- [ ] 4-2. Capacitor sync 実行
- [ ] 4-3. AAB（Android App Bundle）を生成（APK ではなく AAB が必須）
- [ ] 4-4. ビルドが署名されていることを確認

---

## Phase 5: テスト

- [ ] 5-1. 実機で AAB からインストールして動作確認
- [ ] 5-2. 主要機能の確認
  - マークダウン編集・プレビュー
  - Mermaid ダイアグラム表示
  - オフライン動作
  - キーボード操作
  - ファイル保存/読み込み
- [ ] 5-3. 複数端末/画面サイズでの動作確認
- [ ] 5-4. パフォーマンス確認（起動時間、メモリ使用量）
- [ ] 5-5. クラッシュがないことを確認

---

## Phase 6: Google Play Console でのアプリ登録

- [ ] 6-1. Play Console で「アプリを作成」
- [ ] 6-2. アプリ情報（名前、デフォルト言語、アプリ/ゲーム、有料/無料）を入力
- [ ] 6-3. ストアの掲載情報を入力（Phase 3 の素材）
- [ ] 6-4. コンテンツ評価を完了
- [ ] 6-5. データセーフティを入力
- [ ] 6-6. ターゲットユーザー・コンテンツを設定
- [ ] 6-7. 広告の有無を宣言

---

## Phase 7: テストトラックでの配信

### 推奨順序: 内部テスト → クローズドテスト → オープンテスト → 製品版

- [ ] 7-1. **内部テスト**トラックに AAB をアップロード
- [ ] 7-2. テスターのメールアドレスを追加（最大100人）
- [ ] 7-3. テスターからフィードバックを収集
- [ ] 7-4. 問題があれば修正して再アップロード
- [ ] 7-5. （任意）クローズド/オープンテストを実施

---

## Phase 8: 製品版リリース

- [ ] 8-1. 製品版トラックに AAB をアップロード
- [ ] 8-2. リリースノートを記入（日本語 + 英語）
- [ ] 8-3. 段階的公開の割合を設定（推奨: 最初は 20% から開始）
- [ ] 8-4. 「審査に送信」をクリック
- [ ] 8-5. Google の審査を待つ（初回は数日〜1週間程度）
- [ ] 8-6. 審査通過後、公開を確認

---

## Phase 9: リリース後

- [ ] 9-1. Play Console で公開状況を確認
- [ ] 9-2. クラッシュレポート（Android Vitals）を監視
- [ ] 9-3. ユーザーレビューに返信
- [ ] 9-4. 段階的公開を 100% に拡大
- [ ] 9-5. バージョンコード管理のルールを確立（次回更新に備える）

---

## 重要な注意事項

1. **キーストアの紛失 = アプリ更新不可**。必ずバックアップする
2. **無料→有料への変更は不可**。逆は可能
3. **appId（パッケージ名）は変更不可**。慎重に決める
4. **AAB 形式が必須**（2021年8月以降、新規アプリは APK 不可）
5. **プライバシーポリシー**は必須。ホスティング先を用意する
6. **初回審査**は時間がかかる。余裕を持ったスケジュールにする
7. **データセーフティ**の虚偽申告はアプリ削除リスクあり

---

## 参考リンク

- [Google Play Console ヘルプ](https://support.google.com/googleplay/android-developer/)
- [Android App Bundle ガイド](https://developer.android.com/guide/app-bundle)
- [Capacitor Android デプロイ](https://capacitorjs.com/docs/android)
