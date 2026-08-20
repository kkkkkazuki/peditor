# CLAUDE.md — 開発引き継ぎメモ

## これは何か
Mac「プレビュー」相当のPDFツール。Windows / Web で使えることが目的。
DrawboardPDFのページ編集が使いづらいので、Acrobat並みの操作感を軽量に実現する。

## ユーザーの前提条件（重要・変更しないこと）
- 日本語の書き込みは必須 → Noto Sans JP をサブセット埋め込みする
- パスワード付きPDFは対応不要（pdf-libの制約を受け入れてよい）
- 保存時の全体再書き出しはOK（差分保存は不要）
- 機能は絞って軽快さ優先。Acrobatの「多機能さ」は目指さない

## 現在の構成
`index.html` 1ファイル完結（依存はCDN経由）。
- 表示: **pdf.js** (`pdfjsLib`)
- 編集・保存: **pdf-lib** (`PDFLib`)

この2本立てはpdf.jsが描画専用・pdf-libが書き込み専用で機能が分かれているため。1本にまとめる `mupdf.js` という代替もあるがAGPLライセンスなので配布時は要検討（自分専用利用ならOK）。

## 状態管理の設計思想（ここが肝）
元PDFのバイト列 (`S.sources[].bytes`) には一切触れない。
画面に出ているページ順は `S.order` という配列だけで表現する：

```js
S.order = [{ s: ソース番号, p: 元ページ番号(0始まり), r: 追加回転角 }, ...]
```

並び替え・削除・回転は全部この配列の操作だけで完結する → 何百ページでも操作が一瞬。
実際にPDFバイトを組み立てるのは「保存」「印刷」「抽出」を押した瞬間だけ（`buildPdf()`）。

これにより:
- Undo/Redoは `S.order` のスナップショットを配列で持つだけ（`S.undo` / `S.redo`）
- サムネイルは `thumbCache`（Map、key = `s:p:r`）でキャッシュし、再描画コストを避ける

**この設計を崩さないこと。** 「編集の都度PDFを再構築する」ようにすると重くなる。

## 次にやる作業（優先順）

### 1. 書き込みレイヤー（文字・図形）
- 別レイヤーのJSONで持つ: `S.annotations = { [orderIndex]: [{type:'text', x, y, size, text}, {type:'rect'|'line', ...}] }`
- 画面表示はcanvas上に別レイヤーで重ねて描く（pdf.js描画結果の上にDOM/canvasオーバーレイ）
- **焼き付けは保存時のみ** `buildPdf()` 内で、コピーしたページに対して `page.drawText()` / `page.drawRectangle()` する
- ツールバーに「テキスト」「四角」「線」ボタン＋簡単なプロパティパネル（色・サイズ）

### 2. 日本語フォント埋め込み
```js
import fontkit from '@pdf-lib/fontkit'; // CDN: https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit
pdfDoc.registerFontkit(fontkit);
const fontBytes = await fetch('/fonts/NotoSansJP-Regular.ttf').then(r => r.arrayBuffer());
const jpFont = await pdfDoc.embedFont(fontBytes, { subset: true }); // subset必須（付けないと数MB膨らむ）
```
- フォントファイルはリポジトリに同梱するか、初回起動時にCDNから取得してキャッシュ
- `drawText` 時は `{ font: jpFont }` を必ず指定

### 3. PWA化
- `manifest.json` に `file_handlers` を追加してPDFの既定アプリ登録を狙う
- Service Workerでオフラインキャッシュ（pdf.js/pdf-lib本体もローカルに同梱した方が安定する）

### 4. Tauri化（デスクトップが欲しくなったら）
- 同じ `index.html` をそのままWebViewに読み込むだけで動くはず
- ネイティブファイルダイアログに差し替えるとFile System Access APIより体験が良くなる

## 既知の制約・注意点
- pdf-libは暗号化PDFを開けない（対応不要の前提なのでエラーメッセージだけ出す実装でよい）
- `showSaveFilePicker` は Chrome/Edge のみ。Safari/Firefoxはダウンロードにフォールバック済み（実装済み）
- 大きいPDF（スキャン系100MB超）は保存時の再構築に数秒かかる。プログレス表示があると親切

## テスト観点
- 複数ファイルを開いて結合できるか（`btnAdd`）
- 選択したページを保持したまま連続でD&D移動しても順序がズレないか
- 回転させたページをUndoで正しく戻せるか
- 印刷プレビューの用紙サイズが元PDFと一致しているか
