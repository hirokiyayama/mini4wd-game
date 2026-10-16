# マグナ eスポーツ大会 LP → STUDIO Embed 版

## 使い方
1. `embed.html` の中身を全てコピー
2. STUDIO で「Embed（埋め込み）」ブロックを置き、コード欄に貼り付け
3. ブロックの幅を100%、高さを十分に（目安：PC 8500px / SP 7800px）に設定

## 文字・画像の編集
`embed.html` の冒頭 `★ ここだけ編集すればOK ★` エリアだけを書き換えます。
- `TEXT` … 全ての文言（`<br>` で改行）
- `IMAGES` / `VIDEOS` … 画像・動画のファイル名またはURL（`https://…` を書けばそのURLを使用）
- `LEGENDS` … 流れるキャラと吹き出し
- `LINKS` … ボタンのリンク先
- `ASSET_BASE` … 画像・動画を置いた場所（STUDIOにアップした画像のURLを個別に書いてもOK）
- `USE_RUBY` … ふりがな自動付与のON/OFF

`build.py` は元のZIPから embed.html を再生成するスクリプトです。
