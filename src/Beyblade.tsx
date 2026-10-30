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
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number }
interface Part { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; size: number; life: number }

function exitKind(x: number, y: number): 'extreme' | 'over' | null {
  const a = Math.abs(Math.atan2(x, y)); // 下方向が0
  if (a < EXIT_HALF) return 'extreme';
  if (Math.abs(a - OVER_PHI) < EXIT_HALF) return 'over';
  return null;
}

function makeBey(type: BeyType, side: 1 | -1, power: number): Bey {
  const spinMax = 3000 * (0.6 + 0.4 * power);
  const speed = 380 + 260 * power;
  const dir = Math.atan2(0.3 * side, side); // お互いに向かって撃ち出す
  return {
    type, x: -190 * side, y: 40 * side,
    vx: Math.cos(dir) * speed * side, vy: Math.sin(dir) * speed * side,
    spin: spinMax, spinMax, burst: 0, angle: 0,
    curl: side * 1.1, dashT: 0, dashCd: 0.5, dashFx: 0, trail: [], out: false, dead: false,
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
  const [phase, setPhase] = useState<'select' | 'launch' | 'battle' | 'result' | 'over'>('select');
  const [myType, setMyType] = useState<BeyType>('balance');
  const [cpuType, setCpuType] = useState<BeyType>('attack');
  const [score, setScore] = useState({ me: 0, cpu: 0 });
  const [message, setMessage] = useState<{ winner: 'me' | 'cpu'; finish: Finish } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beysRef = useRef<[Bey, Bey] | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const partsRef = useRef<Part[]>([]);
  const gaugeRef = useRef(0);
  const phaseRef = useRef(phase);
  const flashRef = useRef(0);
  const endedRef = useRef(false);
  const scoreRef = useRef({ me: 0, cpu: 0 });
  const timerRef = useRef<number | undefined>(undefined);
  phaseRef.current = phase;

  const startMatch = () => {
    window.clearTimeout(timerRef.current);
    scoreRef.current = { me: 0, cpu: 0 };
    setScore({ me: 0, cpu: 0 });
    setMessage(null);
    setCpuType((['attack', 'defense', 'stamina', 'balance'] as BeyType[])[Math.floor(Math.random() * 4)]);
    beysRef.current = null;
    partsRef.current = [];
    setPhase('launch');
  };

  const nextRound = () => {
    beysRef.current = null;
    partsRef.current = [];
    setMessage(null);
    setPhase('launch');
  };

  const shoot = useCallback(() => {
    if (phaseRef.current !== 'launch') return;
    const power = 1 - Math.abs(gaugeRef.current - 0.5) * 2; // 中央で止めるほどハイパワー
    const cpuPower = 0.55 + Math.random() * 0.4;
    beysRef.current = [makeBey(myType, 1, power), makeBey(cpuType, -1, cpuPower)];
    endedRef.current = false;
    setPhase('battle');
  }, [myType, cpuType]);

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
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(timerRef.current); };
  }, [shoot]);

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
      if (!beys || phaseRef.current !== 'battle') return;
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
        // エクストリームダッシュ：リングに乗ると加速して中へ飛び出す
        if (b.dashCd <= 0 && ratio > 0.15 && speed > 180 && dist > R * 0.84) {
          const ux = b.vx / speed, uy = b.vy / speed;
          const nx = -b.x / dist, ny = -b.y / dist;
          let dx = ux * 0.6 + nx * 0.8, dy = uy * 0.6 + ny * 0.8;
          const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          const dashSpeed = (560 + 200 * ratio) * t.dash;
          b.vx = dx * dashSpeed; b.vy = dy * dashSpeed;
          b.dashT = 0.4; b.dashCd = (2 + Math.random() * 1.5) * t.dashCd; b.dashFx = 0.7;
          spark(b.x, b.y, 12);
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
        if (rel > 0) {
          const j = (2.0 * rel) / (1 / ta.mass + 1 / tb.mass);
          a.vx -= (j / ta.mass) * nx; a.vy -= (j / ta.mass) * ny;
          b.vx += (j / tb.mass) * nx; b.vy += (j / tb.mass) * ny;
          const impact = rel * ((a.dashT > 0 || b.dashT > 0) ? 1.5 : 1);
          a.burst += (impact * tb.atk * 0.03) / ta.burstRes;
          b.burst += (impact * ta.atk * 0.03) / tb.burstRes;
          a.spin = Math.max(0, a.spin - (impact * tb.atk * 0.35) / ta.def);
          b.spin = Math.max(0, b.spin - (impact * ta.atk * 0.35) / tb.def);
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40));
          flashRef.current = Math.min(1, impact / 600);
        }
        const overlap = BEY_R * 2 - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
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
      if (beys) {
        beys.forEach((b, i) => {
          if (b.dead) return;
          const t = TYPES[b.type];
          if (b.trail.length > 1) {
            ctx.strokeStyle = b.dashT > 0 ? 'rgba(255,140,0,0.75)' : 'rgba(80,100,140,0.25)';
            ctx.lineWidth = b.dashT > 0 ? 9 : 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
      if (phaseRef.current === 'launch') {
        gaugeRef.current = (Math.sin(now / 280) + 1) / 2;
      }
      while (acc >= DT) { step(); acc -= DT; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endRound, inSelect]);

  // 発射ゲージ（DOM側）
  const [gaugeView, setGaugeView] = useState(0);
  useEffect(() => {
    if (phase !== 'launch') return;
    const id = setInterval(() => setGaugeView(gaugeRef.current), 30);
    return () => clearInterval(id);
  }, [phase]);

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
        <div style={{ position: 'relative', width: 'min(96vw, 900px)', aspectRatio: `${W} / ${H}` }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', height: '100%' }} />
          {phase === 'launch' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 20, textShadow: '0 2px 8px #000' }}>中央でタイミングよくシュート！</div>
              <div style={{ position: 'relative', width: 260, height: 22, background: '#0a1030', border: '2px solid #5aabff', borderRadius: 11 }}>
                <div style={{ position: 'absolute', left: '40%', width: '20%', top: 0, bottom: 0, background: 'rgba(255,215,64,0.5)' }} />
                <div style={{ position: 'absolute', top: -4, bottom: -4, width: 6, left: `calc(${gaugeView * 100}% - 3px)`, background: '#fff', borderRadius: 3 }} />
              </div>
              <button style={btn} onClick={shoot}>3・2・1 シュート！ (Space)</button>
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
    </div>
  );
}
