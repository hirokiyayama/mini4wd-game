// ---- 対戦データ：1ラウンドごとの結果を記録して、勝率・よく使われる組み合わせのランキングを作る
// 自分の分：このブラウザの中（localStorage）だけに保存する
// 全ユーザーの分：STATS_URL に送って貯める（貯める場所が決まるまでは空にしておく。空のときは送らない）
// 個人用の画像つき版（window.__BEY_IMGS がある）は、全ユーザーの集計には送らない

export const STATS_URL: string = 'https://beylog.com/wp-json/beylog-sim/v1/rounds'; // 全ユーザーの結果を貯める場所（ベイろぐのWordPressに入れたプラグイン）

export interface Side { b: string; r: string; t: string; low?: 1; h: 0 | 1 } // ブレード・ラチェット（一体型は''）・ビット・ローモード・人が選んだベイか
export interface Rec { at: number; gm: 'v' | 't' | 'o'; f: 1 | 3; fin: string; w: 0 | 1; s: [Side, Side] } // 日時・モード（対戦/トーナメント/プライベート）・形式・決まり手・勝った側・両者

const KEY = 'beyStats.v1';
const MAX = 20000; // 保存しておくのは新しいほうからこの件数まで

export function loadLocal(): Rec[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

const isPersonal = () => !!(window as unknown as { __BEY_IMGS?: unknown }).__BEY_IMGS;
// 公開しているサイトで遊んだときだけ送る（自分のPCで開いたファイル・プレビュー・動作確認では送らない）
const isPublicSite = () => { try { const h = location.hostname; return /^https?:$/.test(location.protocol) && !!h && h !== 'localhost' && !/^127\.|claude|anthropic/.test(h); } catch { return false; } };

// 1ラウンドの結果を記録する（send=false のときは、全ユーザーの集計には送らない）
export function recordRound(r: Rec, send: boolean) {
  if (!r.s[0].h && !r.s[1].h) return; // 人が1人もいない試合（CPU同士）は数えない
  try {
    const all = loadLocal(); all.push(r);
    localStorage.setItem(KEY, JSON.stringify(all.length > MAX ? all.slice(all.length - MAX) : all));
  } catch { /* 保存できなくても遊べるように */ }
  if (send && STATS_URL && !isPersonal() && isPublicSite()) {
    try { fetch(STATS_URL, { method: 'POST', body: JSON.stringify(r), keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {}); } catch { /* 送れなくても遊べるように */ }
  }
}

export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* なにもしない */ } }

export type Period = 'day' | 'week' | 'month' | 'all';
export const PERIODS: [Period, string][] = [['day', '今日'], ['week', '7日間'], ['month', '30日間'], ['all', '全期間']];
export const since = (p: Period) => {
  if (p === 'all') return 0;
  if (p === 'day') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return Date.now() - (p === 'week' ? 7 : 30) * 86400000;
};

export interface Row { key: string; n: number; win: number }
export interface Agg { rounds: number; blade: Row[]; ratchet: Row[]; bit: Row[]; combo: Row[]; finish: Record<string, number> }

// 集計：人が選んだベイだけを数える（CPUのベイは、ランダムに選ばれていることが多いので入れない）
export function aggregate(recs: Rec[], from: number): Agg {
  const m = { blade: new Map<string, Row>(), ratchet: new Map<string, Row>(), bit: new Map<string, Row>(), combo: new Map<string, Row>() };
  const add = (mp: Map<string, Row>, key: string, won: boolean) => { const r = mp.get(key) ?? { key, n: 0, win: 0 }; r.n++; if (won) r.win++; mp.set(key, r); };
  const finish: Record<string, number> = {};
  let rounds = 0;
  for (const r of recs) {
    if (r.at < from) continue;
    rounds++;
    finish[r.fin] = (finish[r.fin] ?? 0) + 1;
    r.s.forEach((s, i) => {
      if (!s.h) return;
      const won = r.w === i;
      const bk = s.low ? `${s.b}:low` : s.b;
      add(m.blade, bk, won);
      if (s.r) add(m.ratchet, s.r, won);
      add(m.bit, s.t, won);
      add(m.combo, `${bk}|${s.r}|${s.t}`, won);
    });
  }
  const list = (mp: Map<string, Row>) => [...mp.values()];
  return { rounds, blade: list(m.blade), ratchet: list(m.ratchet), bit: list(m.bit), combo: list(m.combo), finish };
}

// 全ユーザーの集計を取ってくる（貯める場所ができるまでは null）
export async function fetchGlobal(p: Period): Promise<Agg | null> {
  if (!STATS_URL) return null;
  try {
    const res = await fetch(`${STATS_URL}${STATS_URL.includes('?') ? '&' : '?'}period=${p}`);
    if (!res.ok) return null;
    return (await res.json()) as Agg;
  } catch { return null; }
}
