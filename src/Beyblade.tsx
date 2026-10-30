import { useEffect, useRef, useState, useCallback } from 'react';

// ベイブレードX風バトル（4ポイント先取）
// スタジアムは参考動画（真上視点）に合わせる：八角形の枠 + 円形のすり鉢 + オレンジのXライン(円形リング)
// 出口は下側の3か所のみ：中央=エクストリーム(3pt)、左右ポケット=オーバー(2pt)。それ以外の壁は弾き返す。
const WIN_POINTS = 4;
const R = 265; // すり鉢の半径
const BEY_R = 32;
const W = 900, H = 700, CX = W / 2, CY = 335;
const EXIT_HALF = 0.24; // 出口の幅（rad）
const OVER_PHI = 0.6; // 下方向から左右ポケットまでの角度（rad）

// 'me' = 自分のベイ, 'cpu' = 相手のベイ（ブレード・ラチェット・ビットの組み合わせから作る）
type BeyType = 'me' | 'cpu';
type Finish = 'spin' | 'over' | 'burst' | 'extreme';

// ステータスは100が標準
interface Stats { atk: number; def: number; sta: number; dash: number; burst: number }
const STAT_LABELS: [keyof Stats, string, string][] = [
  ['atk', '攻撃', '攻'], ['def', '防御', '防'], ['sta', '持久', '持'], ['dash', 'ダッシュ', 'ダ'], ['burst', 'バースト耐性', '耐'],
];

// パーツ：ブレード（見た目・性格）/ ラチェット / ビット。ステータスは「100 + パーツごとの増減」の合計
interface PartDef { id: string; name: string; desc: string; d: Partial<Stats>; color?: string; blades?: number }
const BLADES: PartDef[] = [
  { id: 'dran', name: 'ドランソード', desc: '攻撃型。鋭い羽根で弾き飛ばす', d: { atk: 25, def: -10, sta: -15, dash: 10, burst: -10 }, color: '#ef4444', blades: 3 },
  { id: 'hells', name: 'ヘルズサイズ', desc: '攻撃と防御のバランス型', d: { atk: 15, def: 10, sta: -10 }, color: '#a855f7', blades: 3 },
  { id: 'wizard', name: 'ウィザードロッド', desc: '持久型。長く回り続ける', d: { atk: -15, sta: 30, dash: -10, burst: -5 }, color: '#22c55e', blades: 4 },
  { id: 'knight', name: 'ナイトシールド', desc: '防御型。バーストしにくい', d: { atk: -15, def: 25, dash: -15, burst: 20 }, color: '#3b82f6', blades: 6 },
  { id: 'aero', name: 'エアロペガサス', desc: 'スピード型。ダッシュが得意', d: { atk: 5, def: -10, sta: 5, dash: 25, burst: -5 }, color: '#38bdf8', blades: 5 },
];
const RATCHETS: PartDef[] = [
  { id: 'r360', name: '3-60', desc: '軽く攻撃寄り。バーストしやすい', d: { atk: 10, def: -5, dash: 5, burst: -10 } },
  { id: 'r460', name: '4-60', desc: '標準的なバランス', d: {} },
  { id: 'r560', name: '5-60', desc: '防御寄り。バースト耐性が高い', d: { atk: -5, def: 10, dash: -5, burst: 10 } },
  { id: 'r960', name: '9-60', desc: '重くて頑丈。動きは鈍い', d: { def: 15, sta: -10, dash: -10, burst: 20 } },
];
const BITS: PartDef[] = [
  { id: 'F', name: 'F（フラット）', desc: '攻撃的で素早い。持久は短め', d: { atk: 15, def: -5, sta: -20, dash: 20 } },
  { id: 'B', name: 'B（ボール）', desc: '安定。持久と防御がやや上がる', d: { atk: -5, def: 5, sta: 10, dash: -5 } },
  { id: 'N', name: 'N（ニードル）', desc: '持久特化。ダッシュは弱い', d: { atk: -10, sta: 25, dash: -20, burst: 5 } },
  { id: 'R', name: 'R（ラッシュ）', desc: 'ダッシュ特化。回転は落ちやすい', d: { atk: 5, def: -5, sta: -15, dash: 30, burst: -5 } },
  { id: 'GF', name: 'GF（ギアフラット）', desc: '攻撃とダッシュに強い', d: { atk: 20, def: -10, sta: -25, dash: 25, burst: -10 } },
];

interface Custom { blade: string; ratchet: string; bit: string }
const DEFAULT_CUSTOM: Custom = { blade: 'hells', ratchet: 'r460', bit: 'B' };
const pick = (list: PartDef[], id: string) => list.find(p => p.id === id) ?? list[0];
const randomCustom = (): Custom => ({
  blade: BLADES[Math.floor(Math.random() * BLADES.length)].id,
  ratchet: RATCHETS[Math.floor(Math.random() * RATCHETS.length)].id,
  bit: BITS[Math.floor(Math.random() * BITS.length)].id,
});

function calcStats(c: Custom): Stats {
  const st: Stats = { atk: 100, def: 100, sta: 100, dash: 100, burst: 100 };
  for (const part of [pick(BLADES, c.blade), pick(RATCHETS, c.ratchet), pick(BITS, c.bit)]) {
    for (const [k, v] of Object.entries(part.d)) st[k as keyof Stats] += v as number;
  }
  for (const k of Object.keys(st) as (keyof Stats)[]) st[k] = Math.max(40, Math.min(200, st[k]));
  return st;
}

function buildBey(c: Custom) {
  const bl = pick(BLADES, c.blade), st = calcStats(c);
  return {
    name: `${bl.name} ${pick(RATCHETS, c.ratchet).name} ${c.bit}`,
    color: bl.color ?? '#f59e0b', blades: bl.blades ?? 3, stats: st,
    atk: st.atk / 100, // 与ダメージ
    def: st.def / 100, // 被スピンダメージ軽減
    decay: 0.85 * (100 / st.sta), // 持久が高いほど回転が減りにくい
    mass: 0.5 + 0.5 * (st.def / 100),
    burstRes: st.burst / 100,
    dash: st.dash / 100, // ダッシュの速さ
    dashCd: (100 / st.dash) ** 2, // ダッシュが高いほど何度も仕掛けられる
  };
}

// バトルで使うベイ（スタート時に、カスタマイズ内容から作り直す）
const TYPES: Record<BeyType, ReturnType<typeof buildBey>> = { me: buildBey(DEFAULT_CUSTOM), cpu: buildBey(DEFAULT_CUSTOM) };

const FINISH_INFO: Record<Finish, { label: string; points: number }> = {
  spin: { label: 'スピンフィニッシュ', points: 1 },
  over: { label: 'オーバーフィニッシュ', points: 2 },
  burst: { label: 'バーストフィニッシュ', points: 2 },
  extreme: { label: 'エクストリームフィニッシュ', points: 3 },
};

interface Bey {
  type: BeyType;
  x: number; y: number; vx: number; vy: number;
  spin: number; spinMax: number; burst: number; angle: number;
  curl: number; dashT: number; dashCd: number; dashFx: number;
  trail: { x: number; y: number }[];
  out: boolean; dead: boolean;
  holdT: number; // 斜めシュート：その場にとどまる残り時間
  riding: boolean; rideT: number; // Xライン（リング）に乗って走行中
  ax: number; ay: number; push: number; // 走らせる向きと、斜めシュートで動き出すときの勢い
  hit: boolean; // 動き出す前に当てられたか（当てられたら矢印の向きではなく、弾かれた向きに進む）
  rideChance: number; onRing: boolean; // 斜めシュートはリングに乗りにくい
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number }
interface Part { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; size: number; life: number }

function exitKind(x: number, y: number): 'extreme' | 'over' | null {
  const a = Math.abs(Math.atan2(x, y)); // 下方向が0
  if (a < EXIT_HALF) return 'extreme';
  if (Math.abs(a - OVER_PHI) < EXIT_HALF) return 'over';
  return null;
}

// 向きを指定しなかった場合：リングへ向かって反時計回りに走る向き
function defaultAim(x: number, y: number) {
  const d = Math.hypot(x, y) || 1;
  const ux = (y / d) * 0.9 + (x / d) * 0.45, uy = (-x / d) * 0.9 + (y / d) * 0.45;
  const l = Math.hypot(ux, uy) || 1;
  return { x: ux / l, y: uy / l };
}

// 水平シュート：すぐにリングへ向かいエクストリームダッシュ / 斜めシュート：その場でほんの少し動きながらとどまり、それから動き出す（その間は飛ばされにくい）
// power(0〜1)：発射時のゲージで決まる。回転数と飛び出しの勢いに効く
function makeBey(type: BeyType, x: number, y: number, diag: boolean, aim: { x: number; y: number } | null, power: number): Bey {
  const spinMax = 3000 * (0.6 + 0.4 * power);
  const a = aim ?? defaultAim(x, y);
  const sp = 380 + 330 * power;
  return {
    type, x, y, vx: diag ? 0 : a.x * sp, vy: diag ? 0 : a.y * sp,
    spin: spinMax, spinMax, burst: 0, angle: 0,
    curl: 1.1, dashT: 0, dashCd: 0, dashFx: 0, trail: [], out: false, dead: false,
    holdT: diag ? 1.4 : 0, riding: false, rideT: 0,
    ax: a.x, ay: a.y, push: 130 + 140 * power,
    hit: false, rideChance: diag ? 0.4 : 1, onRing: false,
  };
}

// 高速回転のベイは止まって見えるほど速く回っているので、残像（ブラー）で描く。回転が落ちると羽根がはっきり見えてくる
function drawBey(ctx: CanvasRenderingContext2D, color: string, ring: string, angle: number, ratio: number, cap: string, nBlades = 3) {
  // 回転が落ちてくるとふらつく
  if (ratio > 0.001 && ratio < 0.3) {
    const t = performance.now(), A = (0.3 - ratio) * 14;
    ctx.translate(Math.cos(t * 0.03) * A, Math.sin(t * 0.04) * A);
  }
  ctx.strokeStyle = ring; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, BEY_R + 4, 0, Math.PI * 2); ctx.stroke();
  const blades = () => {
    const hw = 30 / nBlades; // 羽根が多いほど細い
    for (let k = 0; k < nBlades; k++) {
      ctx.rotate((Math.PI * 2) / nBlades);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(BEY_R, -hw * 0.9); ctx.lineTo(BEY_R + 3, hw * 1.1); ctx.closePath();
      ctx.fill();
    }
  };
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.4;
  ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.95, 0, Math.PI * 2); ctx.fill(); // ぼやけた円盤
  ctx.restore();
  const sweep = 2.4 * Math.pow(ratio, 1.5); // 回転が速いほど残像が長い。落ちてくると羽根がはっきり見える
  ctx.save();
  ctx.rotate(angle);
  ctx.fillStyle = color;
  const baseAlpha = ctx.globalAlpha;
  for (let k = 0; k < 8 && sweep > 0.05; k++) {
    ctx.save(); ctx.rotate(-(k / 8) * sweep); ctx.globalAlpha = baseAlpha * (0.38 - k * 0.04); blades(); ctx.restore();
  }
  ctx.globalAlpha = baseAlpha * (0.5 + 0.45 * (1 - Math.min(1, ratio / 0.5)));
  blades();
  ctx.restore();
  ctx.fillStyle = '#10183a';
  ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = cap;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
}

function drawStadium(ctx: CanvasRenderingContext2D) {
  // 八角形の透明な枠
  const half = 330, cut = 100;
  ctx.beginPath();
  ctx.moveTo(-half + cut, -half); ctx.lineTo(half - cut, -half); ctx.lineTo(half, -half + cut);
  ctx.lineTo(half, half - cut); ctx.lineTo(half - cut, half); ctx.lineTo(-half + cut, half);
  ctx.lineTo(-half, half - cut); ctx.lineTo(-half, -half + cut); ctx.closePath();
  const fg = ctx.createLinearGradient(0, -half, 0, half);
  fg.addColorStop(0, '#f3f6fb'); fg.addColorStop(1, '#dfe6f0');
  ctx.fillStyle = fg; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#aab6c9'; ctx.stroke();
  // 下側の凹みパネル
  ctx.fillStyle = '#c9d2e0';
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(sx * 215 - 55, 195, 110, 80, 16); ctx.fill();
  }
  // 角の赤い留め具
  ctx.fillStyle = '#c0392b';
  for (const [x, y] of [[-290, -290], [290, -290], [-175, 292], [175, 292]]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(y, x) + Math.PI / 2);
    ctx.fillRect(-7, -14, 14, 28); ctx.restore();
  }

  // 出口（下側3か所）
  const drawExit = (phi: number, color: string) => {
    ctx.save();
    ctx.rotate(-phi); // 下方向を基準に回す
    ctx.beginPath();
    ctx.moveTo(-Math.sin(EXIT_HALF) * R, Math.cos(EXIT_HALF) * R);
    ctx.lineTo(-Math.sin(EXIT_HALF) * (R + 38), Math.cos(EXIT_HALF) * (R + 38));
    ctx.lineTo(Math.sin(EXIT_HALF) * (R + 38), Math.cos(EXIT_HALF) * (R + 38));
    ctx.lineTo(Math.sin(EXIT_HALF) * R, Math.cos(EXIT_HALF) * R);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  };
  drawExit(0, '#f5b800');
  drawExit(OVER_PHI, '#d63a2f');
  drawExit(-OVER_PHI, '#d63a2f');
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7a5a00';
  ctx.fillText('EXTREME 3pt', 0, R + 60);
  ctx.fillStyle = '#9b2a20';
  for (const sx of [-1, 1]) ctx.fillText('OVER 2pt', Math.sin(OVER_PHI) * (R + 40) * sx, Math.cos(OVER_PHI) * (R + 40) + 26);
  ctx.textAlign = 'start';

  // すり鉢
  ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, Math.PI * 2);
  ctx.fillStyle = '#b8c3d4'; ctx.fill();
  const bowl = ctx.createRadialGradient(-30, -40, 20, 0, 0, R);
  bowl.addColorStop(0, '#ffffff'); bowl.addColorStop(1, '#d8e0ec');
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = bowl; ctx.fill();
  // 出口部分は壁を開ける
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(120,135,160,0.55)';
  for (const f of [0.8, 0.54]) { ctx.beginPath(); ctx.arc(0, 0, R * f, 0, Math.PI * 2); ctx.stroke(); }
  // Xライン（オレンジの円形リング）
  ctx.lineWidth = 20; ctx.strokeStyle = '#e9955a';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(120,60,20,0.45)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.9 + 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.9 - 10, 0, Math.PI * 2); ctx.stroke();
  // 上部のオレンジの切り欠き
  ctx.fillStyle = '#f0a43a';
  ctx.beginPath();
  ctx.moveTo(-30, -R * 0.78); ctx.lineTo(30, -R * 0.78); ctx.lineTo(24, -R * 0.78 + 26); ctx.lineTo(-24, -R * 0.78 + 26);
  ctx.closePath(); ctx.fill();
  // エクストリーム／オーバーゾーンの手前の段
  for (const phi of [0, OVER_PHI, -OVER_PHI]) {
    ctx.save(); ctx.rotate(-phi);
    ctx.strokeStyle = '#8693ab'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(0, 0, R + 5, Math.PI / 2 - EXIT_HALF, Math.PI / 2 + EXIT_HALF); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R + 1, Math.PI / 2 - EXIT_HALF, Math.PI / 2 + EXIT_HALF); ctx.stroke();
    ctx.restore();
  }
}

export function Beyblade() {
  const [phase, setPhase] = useState<'select' | 'launch' | 'count' | 'battle' | 'result' | 'over'>('select');
  const [shotMode, setShotMode] = useState<'flat' | 'diag'>('flat');
  const [hasDrop, setHasDrop] = useState(false);
  const [mySide, setMySide] = useState<'left' | 'right'>('left'); // 自分が立つ側（左の人は左半分、右の人は右半分にしか落とせない）
  const [count, setCount] = useState<number | null>(null);
  const [custom, setCustom] = useState<Custom>(DEFAULT_CUSTOM);
  const [, setCpuCustom] = useState<Custom>(DEFAULT_CUSTOM); // 再描画用（中身は TYPES.cpu に入る）
  const [score, setScore] = useState({ me: 0, cpu: 0 });
  const [message, setMessage] = useState<{ winner: 'me' | 'cpu'; finish: Finish } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beysRef = useRef<[Bey, Bey] | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const partsRef = useRef<Part[]>([]);
  const dropRef = useRef<{ x: number; y: number } | null>(null);
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const gaugeEls = useRef<(HTMLDivElement | null)[]>([]); // [自分SPIN, 自分BURST, CPU SPIN, CPU BURST]
  const modeRef = useRef<'flat' | 'diag'>('flat');
  const sideRef = useRef<'left' | 'right'>('left');
  const cpuLastMode = useRef<'flat' | 'diag'>('flat');
  const cpuPlanRef = useRef<{ x: number; y: number; diag: boolean; aim: { x: number; y: number } } | null>(null);
  const countTimers = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  const flashRef = useRef(0);
  const endedRef = useRef(false);
  const scoreRef = useRef({ me: 0, cpu: 0 });
  const timerRef = useRef<number | undefined>(undefined);
  phaseRef.current = phase;
  modeRef.current = shotMode;
  sideRef.current = mySide;

  // CPUは自分の半分の中で、毎回ちがう場所・シュートの仕方・向きで落とす（ラウンド開始時に決まり、向きを決めるときから見える）
  const planCpu = () => {
    const cpuSx = sideRef.current === 'left' ? 1 : -1; // 自分と反対側
    const diag = Math.random() < (cpuLastMode.current === 'diag' ? 0.3 : 0.7); // 前回と違うほうを選びやすい
    cpuLastMode.current = diag ? 'diag' : 'flat';
    const lim = R - BEY_R - 8, m = BEY_R + 8;
    const rr = (diag ? 0.12 + 0.6 * Math.random() : 0.55 + 0.35 * Math.random()) * lim;
    const phi = (Math.random() - 0.5) * Math.PI * 0.92; // 自陣の半分の中の角度
    let x = cpuSx * Math.max(m, Math.cos(phi) * rr);
    const y = Math.sin(phi) * rr;
    x = cpuSx * Math.min(Math.abs(x), Math.sqrt(Math.max(m * m, lim * lim - y * y)));
    // 向き：リングをたどる向き / 相手側へ / ランダム、のどれか
    const roll = Math.random();
    let aim: { x: number; y: number };
    if (roll < 0.35) {
      const a0 = defaultAim(x, y), rot = (Math.random() - 0.5) * 1.2;
      aim = { x: a0.x * Math.cos(rot) - a0.y * Math.sin(rot), y: a0.x * Math.sin(rot) + a0.y * Math.cos(rot) };
    } else if (roll < 0.65) {
      const tx = -cpuSx * R * 0.45, dx = tx - x, dy = -y, l = Math.hypot(dx, dy) || 1; // 相手側の半分の中央へ
      aim = { x: dx / l, y: dy / l };
    } else {
      const a = Math.random() * Math.PI * 2;
      aim = { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x, y, diag, aim };
  };

  const startMatch = () => {
    window.clearTimeout(timerRef.current);
    scoreRef.current = { me: 0, cpu: 0 };
    setScore({ me: 0, cpu: 0 });
    setMessage(null);
    // カスタマイズした自分のベイと、ランダムなCPUのベイをここで作る
    const cc = randomCustom();
    TYPES.me = buildBey(custom);
    TYPES.cpu = buildBey(cc);
    setCpuCustom(cc);
    beysRef.current = null;
    partsRef.current = [];
    dropRef.current = null;
    aimRef.current = null;
    cpuPlanRef.current = planCpu();
    setHasDrop(false);
    setPhase('launch');
  };

  const nextRound = () => {
    beysRef.current = null;
    partsRef.current = [];
    setMessage(null);
    dropRef.current = null;
    aimRef.current = null;
    cpuPlanRef.current = planCpu();
    setHasDrop(false);
    setPhase('launch');
  };

  // 「GO!シュート!」の表示が消えたら、ベイを落とす
  const fireNow = useCallback(() => {
    const my = dropRef.current, cpu = cpuPlanRef.current;
    if (phaseRef.current !== 'count' || !my || !cpu) return;
    countTimers.current.forEach(window.clearTimeout);
    beysRef.current = [
      makeBey('me', my.x, my.y, modeRef.current === 'diag', aimRef.current, 0.85),
      makeBey('cpu', cpu.x, cpu.y, cpu.diag, cpu.aim, 0.7 + Math.random() * 0.3),
    ];
    endedRef.current = false;
    setPhase('battle');
  }, []);

  // スタート：3・2・1・GO!シュート! → 表示が消えたらベイが落ちる
  const shoot = useCallback(() => {
    if (phaseRef.current !== 'launch' || !dropRef.current) return;
    beysRef.current = null;
    partsRef.current = [];
    setPhase('count');
    setCount(3);
    countTimers.current.forEach(window.clearTimeout);
    countTimers.current = [
      window.setTimeout(() => setCount(2), 800),
      window.setTimeout(() => setCount(1), 1600),
      window.setTimeout(() => setCount(0), 2400),
      window.setTimeout(() => { setCount(null); fireNow(); }, 3200),
    ];
  }, [fireNow]);

  const toStadium = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width) - CX,
      y: (e.clientY - rect.top) * (H / rect.height) - CY,
    };
  };
  // タップで落とす場所を決め、ドラッグで走らせる向きを決める
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'launch') return;
    const p = toStadium(e);
    const lim = R - BEY_R - 8, m = BEY_R + 8;
    const sx = sideRef.current === 'left' ? -1 : 1;
    // 左側の人は左半分、右側の人は右半分にしか落とせない
    const ax = Math.min(Math.max(p.x * sx, m), lim);
    const maxY = Math.sqrt(Math.max(0, lim * lim - ax * ax));
    const x = ax * sx, y = Math.max(-maxY, Math.min(maxY, p.y));
    dropRef.current = { x, y };
    aimRef.current = null;
    setHasDrop(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.buttons || phaseRef.current !== 'launch' || !dropRef.current) return;
    const p = toStadium(e);
    const dx = p.x - dropRef.current.x, dy = p.y - dropRef.current.y;
    const l = Math.hypot(dx, dy);
    aimRef.current = l > 24 ? { x: dx / l, y: dy / l } : null;
  };

  const endRound = useCallback((winner: 'me' | 'cpu', finish: Finish) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const beys = beysRef.current;
    if (beys) {
      const loser = beys[winner === 'me' ? 1 : 0];
      if (finish === 'over' || finish === 'extreme') loser.out = true;
      if (finish === 'burst') {
        loser.dead = true;
        const t = TYPES[loser.type];
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 300;
          partsRef.current.push({
            x: loser.x, y: loser.y, vx: loser.vx * 0.4 + Math.cos(a) * sp, vy: loser.vy * 0.4 + Math.sin(a) * sp,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 24, color: i % 2 ? t.color : '#444', size: 8 + Math.random() * 10, life: 3,
          });
        }
        flashRef.current = 1;
      }
    }
    setMessage({ winner, finish });
    // 決着の動きを見せてから結果表示
    timerRef.current = window.setTimeout(() => {
      const next = { ...scoreRef.current, [winner]: scoreRef.current[winner] + FINISH_INFO[finish].points };
      scoreRef.current = next;
      setScore(next);
      setPhase(next[winner] >= WIN_POINTS ? 'over' : 'result');
    }, 1300);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); shoot(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(timerRef.current); countTimers.current.forEach(window.clearTimeout); };
  }, [shoot]);

  // メインループ（固定タイムステップ物理 + 描画）
  const inSelect = phase === 'select';
  // カスタマイズ画面のベイのプレビュー（回転している）
  useEffect(() => {
    if (!inSelect) return;
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const bey = buildBey(custom);
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, 170, 170);
      ctx.save(); ctx.translate(85, 85); ctx.scale(1.9, 1.9);
      drawBey(ctx, bey.color, '#5aabff', performance.now() / 14, 0.4, '#fff', bey.blades);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inSelect, custom]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (inSelect || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    const timeScale = Number(new URLSearchParams(window.location.search).get('speed')) || 1;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const DT = 1 / 120;

    const spark = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 220;
        sparksRef.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3 });
      }
    };

    const step = () => {
      const beys = beysRef.current;
      if (!beys) return;
      if (phaseRef.current === 'count') { for (const b of beys) b.angle += 0.6; return; }
      if (phaseRef.current !== 'battle') return;
      for (const b of beys) {
        if (b.dead) continue;
        // 回転の速さは回転数に応じて落ちていく。0になったら止まる
        { const rt = Math.max(0, b.spin / b.spinMax); b.angle += b.spin > 0 ? (1.5 + 38 * rt * rt) * DT : 0; }
        if (b.out) {
          // 出口から場外ポケットへ滑り込む
          b.vx *= 1 - 5 * DT; b.vy *= 1 - 5 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          const d = Math.hypot(b.x, b.y);
          if (d > R + 40) { b.x *= (R + 40) / d; b.y *= (R + 40) / d; }
          continue;
        }
        const t = TYPES[b.type];
        const ratio = Math.max(0, b.spin / b.spinMax);
        b.dashT = Math.max(0, b.dashT - DT);
        b.dashCd = Math.max(0, b.dashCd - DT);
        b.dashFx = Math.max(0, b.dashFx - DT);

        // 回転が止まったら、その場で止まる
        if (b.spin <= 0) {
          b.riding = false; b.holdT = 0;
          b.vx *= 1 - 7 * DT; b.vy *= 1 - 7 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          continue;
        }

        // 斜めシュート：落とした場所でしばらく回り続け、それから動き出す
        if (b.holdT > 0) {
          b.holdT -= DT;
          // とどまっていても、狙った向きへほんの少しずつ動く（当てられたら、その場で解除される）
          const drift = 24 + 0.06 * b.push;
          b.vx += (b.ax * drift + (Math.random() - 0.5) * 20 - b.vx) * 6 * DT;
          b.vy += (b.ay * drift + (Math.random() - 0.5) * 20 - b.vy) * 6 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 14) b.trail.shift();
          b.spin = Math.max(0, b.spin - 9 * t.decay * DT * 6);
          if (b.holdT <= 0) {
            b.vx = b.ax * b.push; b.vy = b.ay * b.push;
            b.dashCd = 0.8;
          }
          continue;
        }

        // すり鉢の傾斜（中央へ引く）
        b.vx += -b.x * 1.5 * DT;
        b.vy += -b.y * 1.5 * DT;
        // ジャイロ効果で軌道が緩やかにカーブする
        const c = b.curl * (0.3 + ratio) * DT;
        const cs = Math.cos(c), sn = Math.sin(c);
        const nvx = b.vx * cs - b.vy * sn, nvy = b.vx * sn + b.vy * cs;
        b.vx = nvx; b.vy = nvy;
        let speed = Math.hypot(b.vx, b.vy);
        // 回転が残っている間は動き回る
        const minSp = 240 * Math.max(0, ratio - 0.25);
        if (speed < minSp) {
          const a = speed > 1 ? Math.atan2(b.vy, b.vx) : Math.random() * Math.PI * 2;
          b.vx += Math.cos(a) * 500 * DT; b.vy += Math.sin(a) * 500 * DT;
        }
        // 回転が弱るとふらつき、失速する
        if (ratio < 0.25) {
          b.vx += (Math.random() - 0.5) * 2400 * (0.25 - ratio) * DT;
          b.vy += (Math.random() - 0.5) * 2400 * (0.25 - ratio) * DT;
        }
        const dist = Math.hypot(b.x, b.y);
        // エクストリームライン：右回転のベイはリングに乗ると反時計回りに走り、
        // スタジアムの右側を駆け上がって、上側から中央に向かって発射される（下から上へのダッシュはない）
        if (!b.riding && b.dashCd <= 0 && ratio > 0.15 && speed > 120 && dist > R * 0.8) {
          if (b.rideChance >= 1) { b.riding = true; b.rideT = 0; }
          else if (!b.onRing) {
            // 斜めシュートはリングに乗りにくい（乗れないぶん、自爆しにくい）
            b.onRing = true;
            if (Math.random() < b.rideChance) { b.riding = true; b.rideT = 0; }
            else b.rideChance = Math.min(1, b.rideChance + 0.2);
          }
        }
        if (dist < R * 0.7) b.onRing = false;
        if (b.riding) {
          b.rideT += DT;
          const d = Math.hypot(b.x, b.y) || 1;
          const tx = b.y / d, ty = -b.x / d; // 反時計回りの接線
          const rs = 560 * t.dash;
          const fix = (R * 0.9 - d) * 8; // リングの上に保つ
          b.vx = tx * rs + (b.x / d) * fix; b.vy = ty * rs + (b.y / d) * fix;
          b.x += b.vx * DT; b.y += b.vy * DT;
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 14) b.trail.shift();
          b.spin = Math.max(0, b.spin - (6 + rs * 0.02) * t.decay * DT * 6);
          const atTop = Math.abs(Math.atan2(b.y, b.x) + Math.PI / 2) < 0.2;
          if (atTop && b.rideT > 0.05) {
            // 上側から中央へ発射
            const nx = -b.x / d, ny = -b.y / d;
            let dx = nx * 0.85 + tx * 0.35, dy = ny * 0.85 + ty * 0.35;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const dashSpeed = (560 + 200 * ratio) * t.dash;
            b.vx = dx * dashSpeed; b.vy = dy * dashSpeed;
            b.riding = false;
            b.dashT = 0.4; b.dashCd = (2 + Math.random() * 1.5) * t.dashCd; b.dashFx = 0.7;
            spark(b.x, b.y, 14);
          } else if (b.rideT > 3.2) {
            b.riding = false; b.dashCd = 0.6;
          }
          continue;
        }
        const damp = 1 - (0.08 + (1 - ratio) * 0.7 + (b.dashT > 0 ? 1.3 : 0)) * DT; // ダッシュ中は失速し、反対側のライン付近まで届く
        b.vx *= damp; b.vy *= damp;
        speed = Math.hypot(b.vx, b.vy);
        b.x += b.vx * DT; b.y += b.vy * DT;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 14) b.trail.shift();
        b.spin = Math.max(0, b.spin - (6 + speed * 0.02) * t.decay * DT * 6);

        // 外周の壁：出口以外は弾き返す
        const d2 = Math.hypot(b.x, b.y);
        const lim = R - BEY_R * 0.3;
        const outSpeed = (b.vx * b.x + b.vy * b.y) / (d2 || 1);
        const ek = exitKind(b.x, b.y);
        // 出口の手前には段があり、それを越える勢いがないと入れない（エクストリームは特に高い）
        const needOut = ek === 'extreme' ? 340 : ek === 'over' ? 200 : 0;
        if (d2 > lim && (!ek || outSpeed < needOut)) {
          const nx = b.x / d2, ny = b.y / d2;
          const outv = b.vx * nx + b.vy * ny;
          if (outv > 0) { b.vx -= 1.55 * outv * nx; b.vy -= 1.55 * outv * ny; }
          b.x = nx * lim; b.y = ny * lim;
        }
      }

      if (endedRef.current) return;

      // ベイ同士の衝突
      const [a, b] = beys;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < BEY_R * 2) {
        const nx = dx / d, ny = dy / d;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        const ta = TYPES[a.type], tb = TYPES[b.type];
        // 斜めシュートで固定されている間は飛ばされにくい
        const ma = ta.mass * (a.holdT > 0 ? 2.2 : 1), mb = tb.mass * (b.holdT > 0 ? 2.2 : 1);
        if (rel > 0) {
          for (const x of [a, b]) if (x.riding) { x.riding = false; x.dashCd = Math.max(x.dashCd, 0.6); }
          // 回転しているベイは、ダッシュしていなくても当たれば相手を弾き飛ばせる
          const spinKick = 150 * ((a.spin / a.spinMax) * ta.atk + (b.spin / b.spinMax) * tb.atk) / 2;
          const j = (2.4 * (rel + spinKick)) / (1 / ma + 1 / mb);
          a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
          b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
          const impact = rel * ((a.dashT > 0 || b.dashT > 0) ? 1.5 : 1);
          a.burst += (impact * tb.atk * 0.052) / ta.burstRes;
          b.burst += (impact * ta.atk * 0.052) / tb.burstRes;
          a.spin = Math.max(0, a.spin - (impact * tb.atk * 0.35) / ta.def);
          b.spin = Math.max(0, b.spin - (impact * ta.atk * 0.35) / tb.def);
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40));
          flashRef.current = Math.min(1, impact / 600);
          // 動き出す前に当てられたら、弾かれて進行方向が変わる（矢印の向きには戻らない）
          for (const x of [a, b]) {
            x.hit = true;
            if (x.holdT > 0) { x.holdT = 0; x.dashCd = Math.max(x.dashCd, 0.8); }
          }
        }
        const overlap = BEY_R * 2 - d;
        const shareA = (1 / ma) / (1 / ma + 1 / mb);
        a.x -= nx * overlap * shareA; a.y -= ny * overlap * shareA;
        b.x += nx * overlap * (1 - shareA); b.y += ny * overlap * (1 - shareA);
      }

      // 決着判定
      const names = ['me', 'cpu'] as const;
      for (let i = 0; i < 2; i++) {
        const bey = beys[i];
        const other = names[1 - i];
        if (bey.burst >= 100) { endRound(other, 'burst'); return; }
        if (Math.hypot(bey.x, bey.y) > R) {
          const k = exitKind(bey.x, bey.y);
          if (k) { endRound(other, k); return; }
        }
        if (bey.spin <= 0) { endRound(other, 'spin'); return; }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#04071a'; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(CX, CY);
      drawStadium(ctx);
      if (phaseRef.current === 'launch' || phaseRef.current === 'count') {
        // 自分が落とせる半分をハイライト
        const sx = sideRef.current === 'left' ? -1 : 1;
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = 'rgba(90,171,255,0.16)';
        ctx.fillRect(sx < 0 ? -R : 0, -R, R, R * 2);
        ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(40,90,170,0.55)';
        ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      const beys = beysRef.current;
      if (beys && phaseRef.current !== 'count') {
        beys.forEach((b, i) => {
          if (b.dead) return;
          const t = TYPES[b.type];
          if (b.trail.length > 1) {
            ctx.strokeStyle = b.dashT > 0 || b.riding ? 'rgba(255,140,0,0.75)' : 'rgba(80,100,140,0.25)';
            ctx.lineWidth = b.dashT > 0 || b.riding ? 9 : 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(b.trail[0].x, b.trail[0].y);
            for (const q of b.trail) ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(3, 5, BEY_R, BEY_R * 0.85, 0, 0, Math.PI * 2); ctx.fill();
          drawBey(ctx, t.color, i === 0 ? '#5aabff' : '#ef4444', b.angle, Math.max(0, b.spin / b.spinMax), i === 0 ? '#fff' : '#ffb4b4', t.blades);
          ctx.restore();
          if (b.dashFx > 0) {
            ctx.fillStyle = `rgba(230,110,0,${Math.min(1, b.dashFx * 1.5)})`;
            ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('XTREME DASH!', b.x, b.y - 46);
            ctx.textAlign = 'start';
          }
        });
      }
      // 落とす場所・向き・シュート方法のプレビュー（スタート時は相手のものも見える）
      const drawGhost = (g: { x: number; y: number }, aim: { x: number; y: number }, diag: boolean, color: string, ring: string, arrow: string, label: string, nb: number) => {
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.globalAlpha = 0.85;
        drawBey(ctx, color, ring, performance.now() / 18, 1, '#fff', nb);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = arrow; ctx.fillStyle = arrow; ctx.lineWidth = 4;
        const len = diag ? 46 : 84;
        if (diag) {
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.arc(0, 0, BEY_R + 12, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        const ex = aim.x * (BEY_R + len), ey = aim.y * (BEY_R + len);
        ctx.beginPath(); ctx.moveTo(aim.x * BEY_R, aim.y * BEY_R); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(aim.y, aim.x));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -9); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(label, 0, -BEY_R - 18);
        ctx.fillStyle = arrow; ctx.fillText(label, 0, -BEY_R - 18);
        ctx.textAlign = 'start';
        ctx.restore();
      };
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && dropRef.current) {
        const g = dropRef.current;
        const diag = modeRef.current === 'diag';
        drawGhost(g, aimRef.current ?? defaultAim(g.x, g.y), diag, TYPES.me.color, '#5aabff', '#e8590c', `あなた：${diag ? '斜めシュート' : '水平シュート'}`, TYPES.me.blades);
      }
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && cpuPlanRef.current) {
        const c = cpuPlanRef.current;
        drawGhost(c, c.aim, c.diag, TYPES.cpu.color, '#ef4444', '#d62828', `CPU：${c.diag ? '斜めシュート' : '水平シュート'}`, TYPES.cpu.blades);
      }
      // バースト：パーツが飛び散る
      const parts = partsRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vx *= 0.985; p.vy *= 0.985; p.rot += p.vr / 60;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      // 火花
      const sp = sparksRef.current;
      for (let i = sp.length - 1; i >= 0; i--) {
        const s = sp[i];
        s.life -= 1 / 60; s.x += s.vx / 60; s.y += s.vy / 60;
        if (s.life <= 0) { sp.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,170,40,${Math.min(1, s.life * 2)})`;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      ctx.restore();

      if (flashRef.current > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${flashRef.current * 0.3})`;
        ctx.fillRect(0, 0, W, H);
        flashRef.current *= 0.85;
      }

      // HUD：回転数・バーストゲージ（画面上部のDOMに反映）
      const bs = beysRef.current;
      const vals = bs
        ? [bs[0].spin / bs[0].spinMax, bs[0].burst / 100, bs[1].spin / bs[1].spinMax, bs[1].burst / 100]
        : [1, 0, 1, 0];
      vals.forEach((v, k) => {
        const el = gaugeEls.current[k];
        if (el) el.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
      });
    };

    const loop = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000) * timeScale;
      last = now;
      while (acc >= DT) { step(); acc -= DT; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endRound, inSelect]);

  // ベイのカスタマイズ画面：ブレード / ラチェット / ビットを組み合わせる
  const myBey = buildBey(custom);
  const partPicker = (title: string, list: PartDef[], value: string, onPick: (id: string) => void) => (
    <div style={{ flex: '1 1 200px', minWidth: 190 }}>
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>{title}</div>
      {list.map(pt => (
        <button
          key={pt.id}
          onClick={() => onPick(pt.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: 6, borderRadius: 8, cursor: 'pointer', color: '#fff',
            border: `3px solid ${value === pt.id ? (pt.color ?? '#ffd740') : '#2a3566'}`,
            background: value === pt.id ? '#14204f' : '#0a1030',
          }}
        >
          <div style={{ fontWeight: 700, color: pt.color ?? '#fff' }}>{pt.name}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{pt.desc}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>
            {STAT_LABELS.filter(([k]) => pt.d[k]).map(([k, , short]) => (
              <span key={k} style={{ marginRight: 8, color: (pt.d[k] as number) > 0 ? '#7ee787' : '#ff8b8b' }}>
                {short}{(pt.d[k] as number) > 0 ? '+' : ''}{pt.d[k]}
              </span>
            ))}
            {Object.keys(pt.d).length === 0 && <span style={{ opacity: 0.6 }}>増減なし</span>}
          </div>
        </button>
      ))}
    </div>
  );
  const customizer = (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', width: 'min(96vw, 1000px)' }}>
      <div style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 12, borderRadius: 12, background: '#0a1030', border: '2px solid #2a3566' }}>
        <canvas ref={previewRef} width={170} height={170} />
        <div style={{ fontWeight: 900, fontSize: 17, color: myBey.color, textAlign: 'center' }}>{myBey.name}</div>
        <div style={{ width: '100%' }}>
          {STAT_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4 }}>
              <span style={{ width: 74 }}>{label}</span>
              <div style={{ flex: 1, height: 6, background: '#1b2551', borderRadius: 3 }}>
                <div style={{ width: `${Math.min(100, (myBey.stats[key] / 160) * 100)}%`, height: '100%', borderRadius: 3, background: myBey.stats[key] >= 100 ? myBey.color : '#6b7bb0' }} />
              </div>
              <span style={{ width: 28, textAlign: 'right' }}>{myBey.stats[key]}</span>
            </div>
          ))}
        </div>
      </div>
      {partPicker('ブレード', BLADES, custom.blade, id => setCustom(c => ({ ...c, blade: id })))}
      {partPicker('ラチェット', RATCHETS, custom.ratchet, id => setCustom(c => ({ ...c, ratchet: id })))}
      {partPicker('ビット', BITS, custom.bit, id => setCustom(c => ({ ...c, bit: id })))}
    </div>
  );

  const btn: React.CSSProperties = {
    padding: '12px 32px', fontSize: 18, fontWeight: 800, borderRadius: 10, cursor: 'pointer',
    border: 'none', background: '#ffd740', color: '#04071a',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16, color: '#fff', background: '#04071a' }}>
      {phase === 'select' ? (
        <h2 style={{ margin: 0, letterSpacing: 2 }}>BEYBLADE X BATTLE</h2>
      ) : (
        // 上部：名前 + スピン / バーストゲージ（自分が選んだ側に自分を表示）
        <div style={{ display: 'flex', width: `min(96vw, 900px)`, gap: 24 }}>
          {(mySide === 'left'
            ? [['あなた', '#5aabff', 0, 'left'], ['CPU', '#ef4444', 2, 'right']]
            : [['CPU', '#ef4444', 2, 'left'], ['あなた', '#5aabff', 0, 'right']]
          ).map(([name, color, k, align]) => (
            <div key={name as string} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: color as string, textAlign: align as 'left' | 'right' }}>{name}</div>
              {([['SPIN', '#5aabff', k as number], ['BURST', '#ef4444', (k as number) + 1]] as const).map(([label, c, idx]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexDirection: align === 'left' ? 'row' : 'row-reverse' }}>
                  <span style={{ width: 40, fontSize: 10, fontWeight: 700, opacity: 0.85, textAlign: align as 'left' | 'right' }}>{label}</span>
                  <div style={{ flex: 1, height: 7, background: '#1b2551', borderRadius: 4, overflow: 'hidden', transform: align === 'right' ? 'scaleX(-1)' : undefined }}>
                    <div ref={el => { gaugeEls.current[idx] = el; }} style={{ width: idx % 2 ? '0%' : '100%', height: '100%', background: c }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {phase === 'select' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 40 }}>
          <div style={{ fontSize: 18 }}>ベイをカスタマイズしよう（{WIN_POINTS}ポイント先取）</div>
          {customizer}
          <div style={{ fontSize: 13, opacity: 0.8, textAlign: 'center', lineHeight: 1.7 }}>
            スピン 1pt / オーバー 2pt / バースト 2pt / エクストリーム 3pt<br />
            下の中央（金色）から場外に出すとエクストリーム、左右の赤いポケットはオーバー！<br />ステータスは100が標準。パーツの組み合わせで強みと弱みが変わります。
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 15 }}>あなたの立ち位置：</span>
            {([['left', '左側（左半分に落とす）'], ['right', '右側（右半分に落とす）']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMySide(k)}
                style={{
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 700,
                  border: `3px solid ${mySide === k ? '#ffd740' : '#2a3566'}`,
                  background: mySide === k ? '#14204f' : '#0a1030',
                }}
              >{label}</button>
            ))}
          </div>
          <button style={btn} onClick={startMatch}>バトル開始</button>
        </div>
      ) : (
        <div style={{ position: 'relative', width: `min(96vw, 900px, calc((100vh - 330px) * ${W / H}))`, aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef} width={W} height={H}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            style={{ width: '100%', height: '100%', cursor: phase === 'launch' ? 'crosshair' : 'default', touchAction: 'none' }}
          />
          {count !== null && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: count === 0 ? 110 : 150, fontWeight: 900, color: count === 0 ? '#ffd740' : '#fff', textShadow: '0 6px 24px #000, 0 0 40px rgba(90,171,255,0.8)' }}>
              {count === 0 ? (
                <div style={{ textAlign: 'center', lineHeight: 1.1 }}>GO!<div style={{ fontSize: 64 }}>シュート！</div></div>
              ) : count}
            </div>
          )}
          {phase === 'battle' && message && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: 26, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 12px #000' }}>
              {FINISH_INFO[message.finish].label}!
            </div>
          )}
          {(phase === 'result' || phase === 'over') && message && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(4,7,26,0.6)' }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 12px #000', textAlign: 'center' }}>
                {FINISH_INFO[message.finish].label}!
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {message.winner === 'me' ? 'あなた' : 'CPU'} +{FINISH_INFO[message.finish].points}pt
              </div>
              {phase === 'over' ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 900, color: message.winner === 'me' ? '#5aabff' : '#ef4444' }}>
                    {message.winner === 'me' ? 'YOU WIN!' : 'YOU LOSE...'}
                  </div>
                  <button style={btn} onClick={() => setPhase('select')}>もう一度</button>
                </>
              ) : (
                <button style={btn} onClick={nextRound}>次のラウンド</button>
              )}
            </div>
          )}
        </div>
      )}
      {phase !== 'select' && (
        // 下中央：ポイントと、それぞれが使っているベイの名前（自分が選んだ側に合わせて左右を入れ替え）
        (() => {
          const me = { label: 'あなたのベイ', bey: TYPES.me, pt: score.me, color: '#5aabff' };
          const cpu = { label: 'CPUのベイ', bey: TYPES.cpu, pt: score.cpu, color: '#ef4444' };
          const [L, Rr] = mySide === 'left' ? [me, cpu] : [cpu, me];
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, width: 'min(96vw, 900px)' }}>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{L.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: L.bey.color }}>{L.bey.name}</div>
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, textAlign: 'center' }}>
                <span style={{ color: L.color }}>{L.pt}</span>
                <span style={{ opacity: 0.6 }}> - </span>
                <span style={{ color: Rr.color }}>{Rr.pt}</span>
                <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{WIN_POINTS}ポイント先取</div>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{Rr.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: Rr.bey.color }}>{Rr.bey.name}</div>
              </div>
            </div>
          );
        })()
      )}
      {phase === 'launch' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {hasDrop ? '② ドラッグで走らせる向きを決めて、スタート！' : `① 青い${mySide === 'left' ? '左' : '右'}半分をタップして、落とす場所を決めよう`}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            {([['flat', '水平シュート', 'すぐリングに乗ってダッシュ'], ['diag', '斜めシュート', 'その場にとどまり、最初は飛ばされにくい']] as const).map(([k, label, sub]) => (
              <button
                key={k}
                onClick={() => setShotMode(k)}
                style={{
                  padding: '6px 14px', borderRadius: 10, cursor: 'pointer', color: '#fff',
                  border: `3px solid ${shotMode === k ? '#ffd740' : '#2a3566'}`,
                  background: shotMode === k ? '#14204f' : '#0a1030',
                }}
              >
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{sub}</div>
              </button>
            ))}
            <button style={{ ...btn, padding: '6px 22px', opacity: hasDrop ? 1 : 0.4 }} disabled={!hasDrop} onClick={shoot}>スタート！ (Space)</button>
          </div>
        </div>
      )}
    </div>
  );
}
