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

type BeyType = 'attack' | 'defense' | 'stamina' | 'balance';
type Finish = 'spin' | 'over' | 'burst' | 'extreme';

// ステータスは100が標準
interface Stats { atk: number; def: number; sta: number; dash: number; burst: number }
const STAT_LABELS: [keyof Stats, string][] = [
  ['atk', '攻撃'], ['def', '防御'], ['sta', '持久'], ['dash', 'ダッシュ'], ['burst', 'バースト耐性'],
];

function mkType(name: string, color: string, desc: string, st: Stats) {
  return {
    name, color, desc, stats: st,
    atk: st.atk / 100, // 与ダメージ
    def: st.def / 100, // 被スピンダメージ軽減
    decay: 0.85 * (100 / st.sta), // 持久が高いほど回転が減りにくい
    mass: 0.5 + 0.5 * (st.def / 100),
    burstRes: st.burst / 100,
    dash: st.dash / 100, // ダッシュの速さ
    dashCd: (100 / st.dash) ** 2, // ダッシュが高いほど何度も仕掛けられる
  };
}

const TYPES: Record<BeyType, ReturnType<typeof mkType>> = {
  attack: mkType('アタック', '#ef4444', '高火力でダッシュ連発。でも失速しやすい', { atk: 130, def: 80, sta: 70, dash: 130, burst: 80 }),
  defense: mkType('ディフェンス', '#3b82f6', '重くて頑丈。バーストしにくい', { atk: 80, def: 130, sta: 100, dash: 80, burst: 130 }),
  stamina: mkType('スタミナ', '#22c55e', '長く回る。スピン勝ち狙い', { atk: 80, def: 100, sta: 140, dash: 80, burst: 100 }),
  balance: mkType('バランス', '#f59e0b', 'クセがない万能型', { atk: 100, def: 100, sta: 100, dash: 100, burst: 100 }),
};

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
  };
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
}

export function Beyblade() {
  const [phase, setPhase] = useState<'select' | 'launch' | 'count' | 'fire' | 'battle' | 'result' | 'over'>('select');
  const [shotMode, setShotMode] = useState<'flat' | 'diag'>('flat');
  const [hasDrop, setHasDrop] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [myType, setMyType] = useState<BeyType>('balance');
  const [cpuType, setCpuType] = useState<BeyType>('attack');
  const [score, setScore] = useState({ me: 0, cpu: 0 });
  const [message, setMessage] = useState<{ winner: 'me' | 'cpu'; finish: Finish } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beysRef = useRef<[Bey, Bey] | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const partsRef = useRef<Part[]>([]);
  const dropRef = useRef<{ x: number; y: number } | null>(null);
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const gaugeRef = useRef(0);
  const fireStartRef = useRef(0);
  const modeRef = useRef<'flat' | 'diag'>('flat');
  const typeRef = useRef<BeyType>('balance');
  const countTimers = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  const flashRef = useRef(0);
  const endedRef = useRef(false);
  const scoreRef = useRef({ me: 0, cpu: 0 });
  const timerRef = useRef<number | undefined>(undefined);
  phaseRef.current = phase;
  modeRef.current = shotMode;
  typeRef.current = myType;

  const startMatch = () => {
    window.clearTimeout(timerRef.current);
    scoreRef.current = { me: 0, cpu: 0 };
    setScore({ me: 0, cpu: 0 });
    setMessage(null);
    setCpuType((['attack', 'defense', 'stamina', 'balance'] as BeyType[])[Math.floor(Math.random() * 4)]);
    beysRef.current = null;
    partsRef.current = [];
    dropRef.current = null;
    aimRef.current = null;
    setHasDrop(false);
    setPhase('launch');
  };

  const nextRound = () => {
    beysRef.current = null;
    partsRef.current = [];
    setMessage(null);
    dropRef.current = null;
    aimRef.current = null;
    setHasDrop(false);
    setPhase('launch');
  };

  // 発射の瞬間：ゲージで決まったパワーでベイを落とす
  const fireNow = useCallback(() => {
    const my = dropRef.current;
    if (phaseRef.current !== 'fire' || !my) return;
    countTimers.current.forEach(window.clearTimeout);
    const power = gaugeRef.current;
    // CPUは毎回ランダムな場所・角度・パワーから落とす
    const cpuDiag = Math.random() < 0.5;
    let cx = 0, cy = 0;
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = (cpuDiag ? 0.2 + 0.5 * Math.random() : 0.6 + 0.25 * Math.random()) * R;
      cx = Math.cos(ang) * rr; cy = Math.sin(ang) * rr;
      if (Math.hypot(cx - my.x, cy - my.y) > BEY_R * 4) break;
    }
    beysRef.current = [
      makeBey(myType, my.x, my.y, modeRef.current === 'diag', aimRef.current, power),
      makeBey(cpuType, cx, cy, cpuDiag, null, 0.55 + Math.random() * 0.45),
    ];
    endedRef.current = false;
    setPhase('battle');
    countTimers.current = [window.setTimeout(() => setCount(null), 800)];
  }, [myType, cpuType]);

  // スタート：3・2・1・GO!シュート! → ゲージが動くので、タップ / Space で止めて発射
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
      window.setTimeout(() => {
        fireStartRef.current = performance.now();
        setCount(0);
        setPhase('fire');
      }, 2400),
      window.setTimeout(() => fireNow(), 4600), // 押さなくても自動で発射
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
    if (phaseRef.current === 'fire') { fireNow(); return; }
    if (phaseRef.current !== 'launch') return;
    let { x, y } = toStadium(e);
    const d = Math.hypot(x, y), lim = R - BEY_R - 8;
    if (d > lim) { x *= lim / d; y *= lim / d; }
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
      if (e.code === 'Space') { e.preventDefault(); if (phaseRef.current === 'fire') fireNow(); else shoot(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(timerRef.current); countTimers.current.forEach(window.clearTimeout); };
  }, [shoot, fireNow]);

  // メインループ（固定タイムステップ物理 + 描画）
  const inSelect = phase === 'select';
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
        b.angle += (b.spin / b.spinMax) * 0.6 + 0.05;
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

        // 斜めシュート：落とした場所でしばらく回り続け、それから動き出す
        if (b.holdT > 0) {
          b.holdT -= DT;
          // とどまっていても、狙った向きへほんの少しずつ動く
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
          b.riding = true; b.rideT = 0;
        }
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
        const damp = 1 - (0.08 + (1 - ratio) * 0.7) * DT;
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
        if (d2 > lim && (!exitKind(b.x, b.y) || outSpeed < 170)) {
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
        const ma = ta.mass * (a.holdT > 0 ? 3 : 1), mb = tb.mass * (b.holdT > 0 ? 3 : 1);
        if (rel > 0) {
          for (const x of [a, b]) if (x.riding) { x.riding = false; x.dashCd = Math.max(x.dashCd, 0.6); }
          const j = (2.0 * rel) / (1 / ma + 1 / mb);
          a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
          b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
          const impact = rel * ((a.dashT > 0 || b.dashT > 0) ? 1.5 : 1);
          a.burst += (impact * tb.atk * 0.04) / ta.burstRes;
          b.burst += (impact * ta.atk * 0.04) / tb.burstRes;
          a.spin = Math.max(0, a.spin - (impact * tb.atk * 0.35) / ta.def);
          b.spin = Math.max(0, b.spin - (impact * ta.atk * 0.35) / tb.def);
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40));
          flashRef.current = Math.min(1, impact / 600);
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
          ctx.rotate(b.angle);
          ctx.fillStyle = t.color;
          for (let k = 0; k < 3; k++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(BEY_R, -9); ctx.lineTo(BEY_R + 3, 11); ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = '#10183a';
          ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.62, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = t.color; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = i === 0 ? '#fff' : '#ffb4b4';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (b.dashFx > 0) {
            ctx.fillStyle = `rgba(230,110,0,${Math.min(1, b.dashFx * 1.5)})`;
            ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('XTREME DASH!', b.x, b.y - 46);
            ctx.textAlign = 'start';
          }
        });
      }
      // 落とす場所のプレビュー
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count' || phaseRef.current === 'fire') && dropRef.current) {
        const g = dropRef.current;
        const diag = modeRef.current === 'diag';
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = TYPES[typeRef.current].color;
        ctx.beginPath(); ctx.arc(0, 0, BEY_R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#10183a';
        ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#e8590c'; ctx.fillStyle = '#e8590c'; ctx.lineWidth = 4;
        const aim = aimRef.current ?? defaultAim(g.x, g.y);
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
        ctx.restore();
      }
      // パワーゲージ（発射の瞬間にタップ / Space で止める）
      if (phaseRef.current === 'fire') {
        const gx = -170, gy = 188, gw = 340, gh = 28, g = gaugeRef.current;
        ctx.fillStyle = 'rgba(4,7,26,0.85)'; ctx.fillRect(gx - 8, gy - 30, gw + 16, gh + 62);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('POWER  ― タップ / Space で発射！', 0, gy - 10);
        ctx.fillStyle = '#1b2551'; ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = '#ffd740'; ctx.fillRect(gx + gw * 0.85, gy, gw * 0.15, gh);
        const gg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
        gg.addColorStop(0, '#5aabff'); gg.addColorStop(1, '#ef4444');
        ctx.fillStyle = gg; ctx.fillRect(gx, gy, gw * g, gh);
        ctx.fillStyle = '#fff'; ctx.fillRect(gx + gw * g - 3, gy - 5, 6, gh + 10);
        ctx.font = '12px sans-serif'; ctx.fillText(`${Math.round(g * 100)}%`, 0, gy + gh + 18);
        ctx.textAlign = 'start';
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

      // HUD：回転数・バーストゲージ（左=あなた、右=CPU）
      if (beys) {
        beys.forEach((b, i) => {
          const x = i === 0 ? 14 : W - 214;
          const y = 14;
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, 200, 62);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
          ctx.fillText(i === 0 ? 'YOU' : 'CPU', x + 8, y + 16);
          ctx.fillStyle = '#5aabff'; ctx.fillRect(x + 8, y + 24, 184 * Math.max(0, b.spin / b.spinMax), 12);
          ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 8, y + 42, 184 * Math.min(1, b.burst / 100), 10);
          ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif';
          ctx.fillText('SPIN', x + 12, y + 34); ctx.fillText('BURST', x + 12, y + 51);
        });
      }
    };

    const loop = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000) * timeScale;
      last = now;
      if (phaseRef.current === 'fire') {
        const ph = ((now - fireStartRef.current) / 1100) % 2; // 0→1→0 と往復するパワーゲージ
        gaugeRef.current = ph < 1 ? ph : 2 - ph;
      }
      while (acc >= DT) { step(); acc -= DT; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endRound, inSelect]);

  const typeButtons = (selected: BeyType, onPick: (t: BeyType) => void) => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
      {(Object.keys(TYPES) as BeyType[]).map(k => (
        <button
          key={k}
          onClick={() => onPick(k)}
          style={{
            padding: '12px 16px', minWidth: 200, borderRadius: 10, cursor: 'pointer',
            border: `3px solid ${selected === k ? TYPES[k].color : '#2a3566'}`,
            background: selected === k ? '#14204f' : '#0a1030', color: '#fff',
          }}
        >
          <div style={{ fontWeight: 700, color: TYPES[k].color }}>{TYPES[k].name}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8, maxWidth: 170 }}>{TYPES[k].desc}</div>
          {STAT_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 3 }}>
              <span style={{ width: 70, textAlign: 'left' }}>{label}</span>
              <div style={{ flex: 1, height: 6, background: '#1b2551', borderRadius: 3 }}>
                <div style={{ width: `${Math.min(100, (TYPES[k].stats[key] / 150) * 100)}%`, height: '100%', borderRadius: 3, background: TYPES[k].stats[key] >= 100 ? TYPES[k].color : '#6b7bb0' }} />
              </div>
              <span style={{ width: 26, textAlign: 'right' }}>{TYPES[k].stats[key]}</span>
            </div>
          ))}
        </button>
      ))}
    </div>
  );

  const btn: React.CSSProperties = {
    padding: '12px 32px', fontSize: 18, fontWeight: 800, borderRadius: 10, cursor: 'pointer',
    border: 'none', background: '#ffd740', color: '#04071a',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16, color: '#fff', background: '#04071a' }}>
      <div style={{ display: 'flex', width: '100%', maxWidth: 900, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: 90 }} />
        <h2 style={{ margin: 0, letterSpacing: 2 }}>BEYBLADE X BATTLE</h2>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          <span style={{ color: '#5aabff' }}>{score.me}</span> - <span style={{ color: '#ef4444' }}>{score.cpu}</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}> / {WIN_POINTS}pt</span>
        </div>
      </div>

      {phase === 'select' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 40 }}>
          <div style={{ fontSize: 18 }}>あなたのベイを選ぼう（{WIN_POINTS}ポイント先取）</div>
          {typeButtons(myType, setMyType)}
          <div style={{ fontSize: 13, opacity: 0.8, textAlign: 'center', lineHeight: 1.7 }}>
            スピン 1pt / オーバー 2pt / バースト 2pt / エクストリーム 3pt<br />
            下の中央（金色）から場外に出すとエクストリーム、左右の赤いポケットはオーバー！<br />ステータスは100が標準です。
          </div>
          <button style={btn} onClick={startMatch}>バトル開始</button>
        </div>
      ) : (
        <div style={{ position: 'relative', width: `min(96vw, 900px, calc((100vh - 250px) * ${W / H}))`, aspectRatio: `${W} / ${H}` }}>
          <canvas
            ref={canvasRef} width={W} height={H}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            style={{ width: '100%', height: '100%', cursor: phase === 'launch' ? 'crosshair' : phase === 'fire' ? 'pointer' : 'default', touchAction: 'none' }}
          />
          {count !== null && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: count === 0 ? 110 : 150, fontWeight: 900, color: count === 0 ? '#ffd740' : '#fff', textShadow: '0 6px 24px #000, 0 0 40px rgba(90,171,255,0.8)' }}>
              {count === 0 ? (
                <div style={{ textAlign: 'center', lineHeight: 1.1 }}>GO!<div style={{ fontSize: 64 }}>シュート！</div></div>
              ) : count}
            </div>
          )}
          {phase === 'battle' && message && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: 34, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 12px #000' }}>
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
      {phase === 'launch' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {hasDrop ? '② ドラッグで走らせる向きを決めて、スタート！' : '① スタジアムをタップして、落とす場所を決めよう'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([['flat', '水平シュート', 'すぐリングに乗ってダッシュ'], ['diag', '斜めシュート', 'その場にとどまり、最初は飛ばされにくい']] as const).map(([k, label, sub]) => (
              <button
                key={k}
                onClick={() => setShotMode(k)}
                style={{
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer', color: '#fff',
                  border: `3px solid ${shotMode === k ? '#ffd740' : '#2a3566'}`,
                  background: shotMode === k ? '#14204f' : '#0a1030',
                }}
              >
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{sub}</div>
              </button>
            ))}
          </div>
          <button style={{ ...btn, opacity: hasDrop ? 1 : 0.4 }} disabled={!hasDrop} onClick={shoot}>スタート！ (Space)</button>
          <div style={{ fontSize: 12, opacity: 0.75 }}>3・2・1・GO!シュート! の合図でパワーゲージが動く → タップ / Space で止めて発射</div>
        </div>
      )}
    </div>
  );
}
