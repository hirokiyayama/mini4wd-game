// ---- データ・ランキング画面：自分の分（このブラウザ）／全ユーザーの分を、期間ごとに表示する
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { PERIODS, STATS_URL, aggregate, clearLocal, fetchGlobal, loadLocal, since } from './beyStats';
import type { Agg, Period, Row } from './beyStats';

type Kind = 'blade' | 'ratchet' | 'bit';
interface Props {
  nameOf: (kind: Kind, key: string) => string; // パーツのidから表示名
  colorOf: (key: string) => string; // ブレードの色
  sb: (active: boolean, color?: string) => React.CSSProperties;
  onBack: () => void;
}

const FIN: Record<string, string> = { spin: 'スピン', over: 'オーバー', burst: 'バースト', extreme: 'エクストリーム' };

export default function BeyStatsView({ nameOf, colorOf, sb, onBack }: Props) {
  const [scope, setScope] = useState<'me' | 'all'>('me');
  const [period, setPeriod] = useState<Period>('all');
  const [tab, setTab] = useState<'rate' | 'use' | 'combo'>('rate');
  const [global, setGlobal] = useState<Agg | null | 'loading'>(null);
  const [clearStep, setClearStep] = useState(0);
  const [ver, setVer] = useState(0); // 自分のデータを消したら作り直す

  const local = useMemo(() => aggregate(loadLocal(), since(period)), [period, ver]);
  useEffect(() => {
    if (scope !== 'all' || !STATS_URL) return;
    let live = true; setGlobal('loading');
    fetchGlobal(period).then(a => { if (live) setGlobal(a); });
    return () => { live = false; };
  }, [scope, period]);
  const agg: Agg | null = scope === 'me' ? local : global === 'loading' ? null : global;
  const minN = scope === 'me' ? 3 : 20; // 勝率ランキングに入れる、最低の使用回数（少ない回数の勝率は、あてにならないため）

  const pct = (r: Row) => (r.n ? Math.round((100 * r.win) / r.n) : 0);
  const comboName = (k: string) => { const [b, r, t] = k.split('|'); return `${bladeLabel(b)}${r ? ' ' + nameOf('ratchet', r) : ''} ${t}`; };

  const list = (rows: Row[], label: (k: string) => string, color: (k: string) => string, mode: 'rate' | 'use') => {
    const total = rows.reduce((s, r) => s + r.n, 0);
    const shown = mode === 'rate' ? rows.filter(r => r.n >= minN).sort((a, b) => pct(b) - pct(a) || b.n - a.n) : [...rows].sort((a, b) => b.n - a.n);
    if (!shown.length) return <div style={{ fontSize: 11.5, opacity: 0.6, padding: 4 }}>{mode === 'rate' ? `${minN}回以上使われたものがまだありません` : 'まだデータがありません'}</div>;
    return shown.map((r, i) => {
      const v = mode === 'rate' ? pct(r) : total ? Math.round((100 * r.n) / total) : 0;
      return (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '2px 0' }}>
          <span style={{ width: 18, textAlign: 'right', fontWeight: 900, color: i < 3 ? '#ffd740' : '#8fa0d8' }}>{i + 1}</span>
          <span style={{ flex: '1 1 auto', minWidth: '2.2em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: color(r.key) }}>{label(r.key)}</span>
          <div style={{ flex: '0 1 36px', minWidth: 6, height: 5, background: '#1b2551', borderRadius: 3 }}><div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: mode === 'rate' ? '#5aabff' : '#ffd740' }} /></div>
          <span style={{ flex: '0 0 auto', minWidth: 30, textAlign: 'right', fontWeight: 800 }}>{v}%</span>
          <span style={{ flex: '0 0 auto', minWidth: 28, textAlign: 'right', fontSize: 10.5, opacity: 0.7, whiteSpace: 'nowrap' }}>{r.n}回</span>
        </div>
      );
    });
  };
  const comboList = (rows: Row[]) => {
    const total = rows.reduce((t, r) => t + r.n, 0), shown = [...rows].sort((a, b) => b.n - a.n).slice(0, 50);
    if (!shown.length) return <div style={{ fontSize: 11.5, opacity: 0.6, padding: 4 }}>まだデータがありません</div>;
    return shown.map((r, i) => {
      const v = total ? Math.round((100 * r.n) / total) : 0;
      return (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
          <span style={{ width: 18, textAlign: 'right', fontWeight: 900, color: i < 3 ? '#ffd740' : '#8fa0d8' }}>{i + 1}</span>
          <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: colorOf(r.key.split('|')[0].replace(':low', '')) }}>{comboName(r.key)}</span>
          <div style={{ flex: '1 0 30px', height: 5, background: '#1b2551', borderRadius: 3 }}><div style={{ width: `${v}%`, height: '100%', borderRadius: 3, background: '#ffd740' }} /></div>
          <span style={{ width: 34, textAlign: 'right', fontWeight: 800 }}>{v}%</span>
          <span style={{ width: 40, textAlign: 'right', fontSize: 10.5, opacity: 0.7 }}>{r.n}回</span>
          <span style={{ width: 66, textAlign: 'right', fontSize: 11.5 }}>勝率 <b>{pct(r)}%</b></span>
        </div>
      );
    });
  };
  const bladeLabel = (k: string) => nameOf('blade', k.replace(':low', '')) + (k.endsWith(':low') ? '（ロー）' : '');
  const col = (title: string, body: React.ReactNode, grow = 1) => (
    <div style={{ flex: grow, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, background: '#0a1030', border: '1px solid #2a3566', borderRadius: 8, padding: '4px 6px' }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>{title}</div>
      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#5aabff #0a1030' }}>{body}</div>
    </div>
  );
  const small = (on: boolean): React.CSSProperties => ({ ...sb(on), padding: '2px 9px', fontSize: 12.5 });

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={sb(false)}>← トップ</button>
        <span style={{ fontWeight: 900, fontSize: 15, marginRight: 6 }}>データ・ランキング</span>
        {([['me', '自分'], ['all', '全ユーザー']] as const).map(([k, l]) => <button key={k} onClick={() => setScope(k)} style={small(scope === k)}>{l}</button>)}
        <span style={{ width: 6 }} />
        {PERIODS.map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} style={small(period === k)}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {([['rate', '勝率ランキング'], ['use', 'よく使われるパーツ'], ['combo', 'よく使われる組み合わせ']] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={small(tab === k)}>{l}</button>)}
        {agg && (
          <span style={{ fontSize: 11.5, opacity: 0.85 }}>
            {agg.rounds}ラウンド{agg.rounds > 0 && '（' + Object.entries(agg.finish).map(([k, v]) => `${FIN[k] ?? k}${Math.round((100 * v) / agg.rounds)}%`).join('・') + '）'}
          </span>
        )}
      </div>
      {scope === 'all' && !STATS_URL ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>全ユーザーのデータは準備中です。<br />集計が始まると、ここにランキングが出ます。</div>
      ) : !agg ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>{global === 'loading' ? '読み込み中…' : <>全ユーザーのデータは準備中です。<br />集計が始まると、ここにランキングが出ます。</>}</div>
      ) : tab === 'combo' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{col('よく使われる組み合わせ', comboList(agg.combo))}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 6 }}>
          {col('ブレード', list(agg.blade, bladeLabel, k => colorOf(k.replace(':low', '')), tab), 1.6)}
          {col('ラチェット', list(agg.ratchet, k => nameOf('ratchet', k), () => '#fff', tab))}
          {col('ビット', list(agg.bit, k => k, () => '#fff', tab), 0.8)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.8 }}>
        <span style={{ flex: 1 }}>{tab === 'rate' ? `勝率は、${minN}回以上使われたパーツだけ。` : ''}プレイヤーが選んだベイだけを数えます（CPUのベイは入りません）。{scope === 'me' ? '自分のデータは、このブラウザの中だけに保存されます。' : ''}</span>
        {scope === 'me' && (
          <button onClick={() => { if (clearStep) { clearLocal(); setVer(v => v + 1); setClearStep(0); } else setClearStep(1); }} style={{ ...small(false), fontSize: 11, color: clearStep ? '#ff8b8b' : '#cfd8ff' }}>{clearStep ? 'もう一度押すと消えます' : '自分のデータを消す'}</button>
        )}
      </div>
    </div>
  );
}
