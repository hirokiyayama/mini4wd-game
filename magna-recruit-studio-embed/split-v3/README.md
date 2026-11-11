# 採用LP — STUDIO Embed 分割版 v3（8ブロック）

| 順 | ファイル | 中身 | STUDIOで付けるブロックID |
|---|---|---|---|
| 1 | `01-header.txt` | ヘッダーメニュー | なし（STUDIOで「固定」） |
| 2 | `02-first-view.txt` | ファーストビュー | なし |
| 3 | `03-message-to-mission.txt` | 代表メッセージ | なし |
| 4 | `04-mission-to-fun-learning.txt` | MISSION | `mission` |
| 5 | `05-fun-learning-to-work-style.txt` | FUN LEARNING〜WANTED | `concept` |
| 6 | `06-work-style-to-member.txt` | WORK STYLE〜SERVICE | `workstyle` |
| 7 | `07-member-to-footer.txt` | MEMBER VOICES〜OPEN POSITIONS〜CTA | `voices` |
| 8 | `08-footer.txt` | MORE HAPPINESS／フッター | なし |

## メニューの移動先
- MISSION→`mission` / FUN LEARNING→`concept` / WORK STYLE→`workstyle` / MEMBER→`voices` … 各見出しにぴったり移動します。
- **「募集職種」（ヘッダーのボタン、ファーストビューのボタン・早見）は、この分け方だと OPEN POSITIONS に移動できません**
  （OPEN POSITIONS が 07 の途中にあり、IDを付けられないため）。
- 移動させたい場合は、07 の代わりに `alt-07a-member.txt`（ID `voices`）＋ `alt-07b-open-positions-to-footer.txt`（ID `positions`）の2つを使ってください。

## 設定
- `PAGE_URL`：https://mintflag.com/recruit 設定済み。
- 高さは各ファイル冒頭のコメント（ブレイクポイント別）以上に。
- 募集職種は 02 と 07（または alt-07b）の `POSITIONS` を同じ内容に。
