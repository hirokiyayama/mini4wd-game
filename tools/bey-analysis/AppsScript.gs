// ベイブレードX シミュレーター：対戦結果の記録用（Googleスプレッドシートの Apps Script）
// 1. 新しいスプレッドシートを作る → 拡張機能 → Apps Script → このコードを全部貼り付けて保存
// 2. 下の KEY を、自分だけが知っている好きな文字に変える（分析ページで使うパスワード）
// 3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行ユーザー「自分」、アクセスできるユーザー「全員」→ デプロイ
// 4. 出てきた「ウェブアプリのURL」（https://script.google.com/macros/s/…/exec）を Claude に送る
const KEY = 'ここを好きな文字に変える';
const COLS = ['time', 'pid', 'sid', 'mode', 'vs', 'fmt', 'diff', 'p1', 'p1name', 'p2', 'p2name', 'win', 'finish',
  'p1side', 'p1x', 'p1y', 'p1shot', 'p1aim', 'p1rpm', 'p1dash', 'p2side', 'p2x', 'p2y', 'p2shot', 'p2aim', 'p2rpm', 'p2dash', 'hits', 'firstHit', 'sec', 'build'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('log');
  if (!sh) { sh = ss.insertSheet('log'); sh.appendRow(COLS); sh.setFrozenRows(1); }
  return sh;
}

// シミュレーターから1ラウンドの結果を受け取って、1行追加する
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(e.postData.contents);
    d.time = new Date();
    sheet_().appendRow(COLS.map(k => (d[k] === undefined ? '' : d[k])));
  } catch (err) { /* 壊れたデータは無視 */ } finally { lock.releaseLock(); }
  return ContentService.createTextOutput('ok');
}

// 分析ページ用：KEY が合っているときだけ、全部の行を返す
function doGet(e) {
  if (!e.parameter || e.parameter.key !== KEY) return ContentService.createTextOutput(JSON.stringify({ error: 'key' })).setMimeType(ContentService.MimeType.JSON);
  const v = sheet_().getDataRange().getValues();
  const head = v.shift();
  const rows = v.map(r => { const o = {}; head.forEach((k, i) => { o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; });
  return ContentService.createTextOutput(JSON.stringify({ rows })).setMimeType(ContentService.MimeType.JSON);
}
