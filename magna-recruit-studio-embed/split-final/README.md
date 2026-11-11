# 採用LP — STUDIO Embed 分割版（9ブロック／メニュー全項目が飛べる）

STUDIOのページに「Embed」を9個、順に並べます（幅100%）。

| 順 | ファイル | 中身 | STUDIOで付けるブロックID |
|---|---|---|---|
| 1 | `01-header.txt` | ヘッダーメニュー | なし（STUDIOで「固定」） |
| 2 | `02-first-view.txt` | ファーストビュー | なし |
| 3 | `03-message-to-mission.txt` | 代表メッセージ | なし |
| 4 | `04-mission-to-fun-learning.txt` | MISSION | `mission` |
| 5 | `05-fun-learning-to-work-style.txt` | FUN LEARNING〜WANTED | `concept` |
| 6 | `06-work-style-to-member.txt` | WORK STYLE〜SERVICE | `workstyle` |
| 7 | `07-member-to-open-positions.txt` | MEMBER VOICES | `voices` |
| 8 | `08-open-positions-to-footer.txt` | OPEN POSITIONS〜CTA | `positions` |
| 9 | `09-footer.txt` | MORE HAPPINESS／フッター | なし |

- メニュー対応：MISSION→`mission` / FUN LEARNING→`concept` / WORK STYLE→`workstyle` / MEMBER→`voices` / 募集職種→`positions`
- ファーストビューの「募集職種を見る」「Fun Learningとは？」と募集職種の早見も、同じIDへ移動します。
- 高さは各ファイル冒頭のコメント（ブレイクポイント別）以上に。
- 募集職種は 02 と 08 の `POSITIONS` を同じ内容に。
- 移動先ページの設定（各ファイル冒頭）：プレビュー（preview.studio.site）では `PREVIEW_PATH`（設定済み：/live/…/Recruit）、本番では `PAGE_PATH`（初期値 /recruit。公開URLが違う場合は変更）へ移動します。
