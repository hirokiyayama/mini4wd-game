# マグナとふしぎの少女 For School LP → STUDIO Embed 版

## 使い方
1. `embed.html` の中身を全てコピー
2. STUDIO の Embed ブロックのコード欄に貼り付け（幅100%、高さは十分に：PC 約10400px / SP 約9000px）

## 文字・画像の編集
`embed.html` 冒頭の `★ ここだけ編集すればOK ★` エリアのみ編集します。
- `TEXT` … 全文言（キーは「セクション名_番号」。`<br>` やリンクもHTMLで記述可）
- `IMAGES` / `ALT` … 画像ファイル名またはURL、代替テキスト
- `LINKS` … 資料PDF・相談フォームのリンク
- `ASSET_BASE` … 画像を置いた場所（既定は jsDelivr 経由でこのリポジトリを参照）
- `SHOW_INTRO` … オープニング演出のON/OFF

CSSは全て `#magna-lp` 配下に限定しているため、STUDIO側のページには影響しません。
`build/` は元ZIPから再生成するための変換スクリプトです。
