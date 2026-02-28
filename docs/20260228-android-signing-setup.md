# Android アプリ署名設定

## 意図

Google Play Store への公開に必要なリリース署名設定を追加する。

## 選択理由

- `keystore.properties` で署名情報を外部化し、Git管理外にする（セキュリティ）
- Google Play App Signing 併用を前提とした標準的な構成

## 変更対象

| ファイル | 変更内容 |
|---|---|
| `android/.gitignore` | キーストア・properties の除外を有効化 |
| `android/app/build.gradle` | `signingConfigs.release` 追加 |
| `android/keystore.properties` | 新規作成（テンプレート） |

## リスク

- キーストアの紛失 → アプリ更新不可（Google Play App Signing で軽減）
- `keystore.properties` の誤コミット → 署名鍵漏洩

## ステータス

- [x] 計画承認
- [x] 実装完了
