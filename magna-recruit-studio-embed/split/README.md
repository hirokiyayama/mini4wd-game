# ミントフラッグ 採用LP（PC）— STUDIO Embed 分割版（7ブロック）

STUDIOのページに「Embed」ブロックを7つ縦に並べ、それぞれにコードを貼ります（幅100%）。

| 順 | ファイル | 中身 | STUDIOで付けるブロックID |
|---|---|---|---|
| 1 | `01-header.txt` | ヘッダーメニュー | なし（STUDIO側で「固定」にする） |
| 2 | `02-first-view.txt` | ファーストビュー〜募集職種の早見 | なし |
| 3 | `03-message-to-fun-learning.txt` | 代表メッセージ〜MISSION | `mission` |
| 4 | `04-fun-learning-to-wanted.txt` | FUN LEARNING | `concept` |
| 5 | `05-wanted-to-open-positions.txt` | WANTED〜WORK STYLE〜SERVICE〜MEMBER VOICES | `workstyle`（※下記） |
| 6 | `06-open-positions-to-footer.txt` | OPEN POSITIONS〜CTA | `positions` |
| 7 | `07-footer.txt` | MORE HAPPINESS／フッターリンク／フッター | なし |

## 設定
1. 各ファイルの設定エリアにある `PAGE_URL`（公開URL：https://mintflag.com/recruit 設定済み）を確認。
2. 高さはブレイクポイント別に、各ファイル冒頭のコメントの値以上に設定（スマホ・タブレット・PCそれぞれ個別に）。
3. ヘッダー（01）はSTUDIO側で「固定」。移動先ブロックの先頭には、固定ヘッダー分の余白（`TOP_SPACE`＝76px）が入っています。
4. 文字・画像・リンクは各ファイル冒頭の `★ ここだけ編集すればOK ★` の `TEXT` / `IMAGES` / `LINKS` を編集。
5. **募集職種は 02 と 06 の `POSITIONS` を同じ内容にしてください**（02＝早見、06＝一覧。件数・職種名は両方に反映）。

## メニューの移動先について
- ヘッダーの MISSION / FUN LEARNING / WORK STYLE / MEMBER / 募集職種 は、STUDIOページ内のブロックID（`ANCHORS`）へ移動します。
- ブロックIDは先頭にしか付けられないため、ご指定の分け方では、MISSION・WORK STYLE・MEMBER は「そのブロックの先頭」までの移動になります。
  - 各見出しの位置まで正確に移動したい場合は、以下に差し替えてください（`alt-` ファイル）。
    - 03 → `alt-03a-message.txt`（ID なし）＋ `alt-03b-mission.txt`（ID `mission`）
    - 05 → `alt-05a-wanted.txt`（ID なし）＋ `alt-05b-workstyle-service.txt`（ID `workstyle`）＋ `alt-05c-voices.txt`（ID `voices`）

## その他
- `jobposting-jsonld-for-head.txt`：元ページの求人の構造化データ（Google しごと検索向け）。EmbedではなくSTUDIOのページ設定の「head内コード」に貼ってください。
- 外部リンクは元ページ同様、同じタブで開きます（`EXTERNAL_TARGET`。開けない場合は `"_blank"`）。
- 画像は jsDelivr 経由でこのリポジトリを参照しています（`ASSET_BASE`）。
