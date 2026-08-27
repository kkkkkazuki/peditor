# PDF ページ編集ツール

Mac の「プレビュー」的な使い勝手を Windows / Web で。
表示・印刷・ページ編集（並び替え／削除／追加／抽出／回転）が動く単一HTMLファイル。

## 今すぐ試す

`index.html` をダブルクリックして Chrome か Edge で開くだけ（ビルド不要）。

ロジックの回帰テストは `node tests/logic.test.mjs`（依存なし・ブラウザ不要）。

## 現状（v0.1）

- [x] 表示（pdf.js）
- [x] サムネイル並び替え（複数選択＋ドラッグ）
- [x] 削除 / 回転 / 別PDF追加 / 抽出
- [x] Undo / Redo
- [x] 保存（File System Access API、非対応環境はダウンロードに自動フォールバック）
- [x] 印刷
- [ ] 文字・図形の書き込み（次段階）
- [ ] 日本語フォント埋め込み（Noto Sans JP, サブセット化）— 埋め込み関数まで実装済み。書き込み実装まで未使用
- [ ] PWA化（PDFの既定アプリとして登録）
- [ ] Tauri化（デスクトップアプリ）

詳細な設計判断は `CLAUDE.md`、現状の不具合と作業順は `PLAN.md` 参照。

## GitHubへの上げ方（初回のみ）

1. https://github.com/new で新規リポジトリを作成（Public/Privateはお好みで、READMEは追加しない）
2. ターミナル（Mac mini）でこのフォルダに移動して：

```bash
cd pdf-editor-project
git init
git add .
git commit -m "v0.1: 表示・ページ編集・保存・印刷"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

以降は `git add . && git commit -m "..." && git push` だけでOK。

## Claude Codeでの続け方

このフォルダで `claude` を起動すれば、`CLAUDE.md` を読んで文脈を引き継げます。
