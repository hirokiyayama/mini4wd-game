# 採用LP — STUDIO Embed 分割版（見出しごとに移動できる10ブロック）

ヘッダーメニューが、各見出しの位置にぴったり飛ぶ分け方です。STUDIOのページに「Embed」を10個、順に並べます（幅100%）。

| 順 | ファイル | 中身 | STUDIOで付けるブロックID |
|---|---|---|---|
| 1 | `01-header.txt` | ヘッダーメニュー | なし（STUDIO側で「固定」にする） |
| 2 | `02-first-view.txt` | ファーストビュー〜募集職種の早見 | なし |
| 3 | `03-message.txt` | 代表メッセージ | なし |
| 4 | `04-mission.txt` | MISSION | `mission` |
| 5 | `05-fun-learning.txt` | FUN LEARNING | `concept` |
| 6 | `06-wanted.txt` | WANTED | なし |
| 7 | `07-work-style-service.txt` | WORK STYLE〜SERVICE | `workstyle` |
| 8 | `08-member-voices.txt` | MEMBER VOICES | `voices` |
| 9 | `09-open-positions-cta.txt` | OPEN POSITIONS〜CTA | `positions` |
| 10 | `10-footer.txt` | MORE HAPPINESS／フッター | なし |

- メニュー対応：MISSION→`mission` / FUN LEARNING→`concept` / WORK STYLE→`workstyle` / MEMBER→`voices` / 募集職種→`positions`
- 各ファイル冒頭のコメントの高さ（ブレイクポイント別）以上に設定。
- 募集職種は 02 と 09 の `POSITIONS` を同じ内容にしてください。
