import { useEffect, useRef, useState, useCallback } from 'react';

// ベイブレードX風バトル（4ポイント先取）
const WIN_POINTS = 4;
const R = 300; // スタジアム半径
const BEY_R = 26;
const SIZE = R * 2 + 60;

type BeyType = 'attack' | 'defense' | 'stamina' | 'balance';
type Finish = 'spin' | 'over' | 'burst' | 'extreme';

const TYPES: Record<BeyType, { name: string; color: string; atk: number; def: number; decay: number; mass: number; burstRes: number; desc: string }> = {
  attack: { name: 'アタック', color: '#ef4444', atk: 1.4, def: 0.8, decay: 1.2, mass: 1.0, burstRes: 0.8, desc: '高火力。バースト狙い' },
  defense: { name: 'ディフェンス', color: '#3b82f6', atk: 0.8, def: 1.4, decay: 1.0, mass: 1.3, burstRes: 1.4, desc: '重くて頑丈' },
  stamina: { name: 'スタミナ', color: '#22c55e', atk: 0.8, def: 1.0, decay: 0.5, mass: 0.9, burstRes: 1.0, desc: '長く回る。スピン勝ち狙い' },
  balance: { name: 'バランス', color: '#ffd740', atk: 1.0, def: 1.0, decay: 0.85, mass: 1.0, burstRes: 1.0, desc: 'クセがない万能型' },
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
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number }

const EXTREME_HALF_ARC = 0.24; // 左右の縁にあるエクストリームゾーン

function makeBey(type: BeyType, x: number, y: number, dir: number, power: number): Bey {
  const spinMax = 3000 * (0.6 + 0.4 * power);
  return { type, x, y, vx: dir * (260 + 260 * power), vy: 0, spin: spinMax, spinMax, burst: 0, angle: 0 };
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
  const gaugeRef = useRef(0);
  const phaseRef = useRef(phase);
  const flashRef = useRef(0);
  const goRef = useRef(0);
  const endedRef = useRef(false);
  phaseRef.current = phase;

  const startMatch = () => {
    setScore({ me: 0, cpu: 0 });
    setCpuType((['attack', 'defense', 'stamina', 'balance'] as BeyType[])[Math.floor(Math.random() * 4)]);
    beysRef.current = null;
    setPhase('launch');
  };

  const nextRound = () => {
    beysRef.current = null;
    setMessage(null);
    setPhase('launch');
  };

  const shoot = useCallback(() => {
    if (phaseRef.current !== 'launch') return;
    const g = gaugeRef.current;
    const power = 1 - Math.abs(g - 0.5) * 2; // 中央で止めるほどハイパワー
    const cpuPower = 0.55 + Math.random() * 0.4;
    beysRef.current = [
      makeBey(myType, 0, 200, 1, power),
      makeBey(cpuType, 0, -200, -1, cpuPower),
    ];
    endedRef.current = false;
    goRef.current = 1;
    setPhase('battle');
  }, [myType, cpuType]);

  const endRound = useCallback((winner: 'me' | 'cpu', finish: Finish) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const pts = FINISH_INFO[finish].points;
    setMessage({ winner, finish });
    setScore(prev => {
      const next = { ...prev, [winner]: prev[winner] + pts };
      setPhase(next[winner] >= WIN_POINTS ? 'over' : 'result');
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); shoot(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shoot]);

  // メインループ（固定タイムステップ物理 + 描画）
  const inSelect = phase === 'select';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (inSelect || !canvas) return;
    const ctx = canvas.getContext('2d')!;
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
      const live = phaseRef.current === 'battle' && !endedRef.current;
      for (const b of beys) {
        b.angle += (b.spin / b.spinMax) * 0.5 + 0.05;
        if (!live) continue;
        const t = TYPES[b.type];
        const ratio = b.spin / b.spinMax;
        const dist = Math.hypot(b.x, b.y);
        // すり鉢の傾斜（中央へ引く）
        b.vx += -b.x * 0.8 * DT;
        b.vy += -b.y * 0.8 * DT;
        // Xラインのダッシュ：外周リング付近で加速
        const speed = Math.hypot(b.vx, b.vy);
        if (dist > R * 0.68 && dist < R * 0.92 && speed < 640 && speed > 1) {
          const boost = 380 * ratio * DT;
          b.vx += (b.vx / speed) * boost;
          b.vy += (b.vy / speed) * boost;
        }
        // 回転が弱るとふらつく
        if (ratio < 0.3) {
          b.vx += (Math.random() - 0.5) * 900 * (0.3 - ratio) * DT * 10;
          b.vy += (Math.random() - 0.5) * 900 * (0.3 - ratio) * DT * 10;
        }
        const damp = 1 - (0.12 + (1 - ratio) * 0.5) * DT;
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * DT; b.y += b.vy * DT;
        b.spin -= (14 + speed * 0.05) * t.decay * DT * 10;
      }
      if (!live) return;

      // マシン同士の衝突
      const [a, b] = beys;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d < BEY_R * 2) {
        const nx = dx / d, ny = dy / d;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        const ta = TYPES[a.type], tb = TYPES[b.type];
        if (rel > 0) {
          const j = (1.9 * rel) / (1 / ta.mass + 1 / tb.mass);
          a.vx -= (j / ta.mass) * nx; a.vy -= (j / ta.mass) * ny;
          b.vx += (j / tb.mass) * nx; b.vy += (j / tb.mass) * ny;
          const impact = rel;
          a.burst += (impact * tb.atk * 0.07) / ta.burstRes;
          b.burst += (impact * ta.atk * 0.07) / tb.burstRes;
          a.spin -= (impact * tb.atk * 1.2) / ta.def;
          b.spin -= (impact * ta.atk * 1.2) / tb.def;
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40));
          flashRef.current = Math.min(1, impact / 500);
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
          const ang = Math.atan2(bey.y, bey.x);
          const nearSide = Math.min(Math.abs(ang), Math.PI - Math.abs(ang));
          endRound(other, nearSide < EXTREME_HALF_ARC ? 'extreme' : 'over');
          return;
        }
        if (bey.spin <= 0) { endRound(other, 'spin'); return; }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      // 背景
      const bg = ctx.createRadialGradient(0, 0, 20, 0, 0, R + 30);
      bg.addColorStop(0, '#16224d'); bg.addColorStop(1, '#070b22');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      // 外周リング
      ctx.lineWidth = 14; ctx.strokeStyle = '#9aa7c7';
      ctx.beginPath(); ctx.arc(0, 0, R + 7, 0, Math.PI * 2); ctx.stroke();
      // エクストリームゾーン（左右）
      ctx.lineWidth = 14; ctx.strokeStyle = '#ffd740';
      for (const base of [0, Math.PI]) {
        ctx.beginPath(); ctx.arc(0, 0, R + 7, base - EXTREME_HALF_ARC, base + EXTREME_HALF_ARC); ctx.stroke();
      }
      // Xライン
      ctx.save();
      ctx.lineCap = 'round';
      for (const rot of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
        ctx.save(); ctx.rotate(rot);
        const g = ctx.createLinearGradient(40, 0, R, 0);
        g.addColorStop(0, 'rgba(90,171,255,0)'); g.addColorStop(1, 'rgba(90,171,255,0.85)');
        ctx.strokeStyle = g; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(R - 14, 0); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(90,171,255,0.3)';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.68, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.stroke();

      // ベイ
      const beys = beysRef.current;
      if (beys) {
        beys.forEach((b, i) => {
          const t = TYPES[b.type];
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.ellipse(3, 6, BEY_R, BEY_R * 0.8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.rotate(b.angle);
          ctx.fillStyle = t.color;
          for (let k = 0; k < 3; k++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(BEY_R, -6); ctx.lineTo(BEY_R + 2, 8); ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = '#0b1230';
          ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.62, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = t.color; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = i === 0 ? '#fff' : '#ffb4b4';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
      }
      // 火花
      const sp = sparksRef.current;
      for (let i = sp.length - 1; i >= 0; i--) {
        const s = sp[i];
        s.life -= 1 / 60; s.x += s.vx / 60; s.y += s.vy / 60;
        if (s.life <= 0) { sp.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255,220,100,${Math.min(1, s.life * 2)})`;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      ctx.restore();

      // 衝突フラッシュ
      if (flashRef.current > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${flashRef.current * 0.25})`;
        ctx.fillRect(0, 0, SIZE, SIZE);
        flashRef.current *= 0.85;
      }

      // HUD：回転数・バーストゲージ
      if (beys) {
        beys.forEach((b, i) => {
          const x = i === 0 ? 14 : SIZE - 214;
          const y = i === 0 ? SIZE - 54 : 14;
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, 200, 40);
          ctx.fillStyle = '#5aabff'; ctx.fillRect(x + 6, y + 6, 188 * Math.max(0, b.spin / b.spinMax), 12);
          ctx.fillStyle = '#ef4444'; ctx.fillRect(x + 6, y + 24, 188 * Math.min(1, b.burst / 100), 10);
          ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif';
          ctx.fillText('SPIN', x + 8, y + 16); ctx.fillText('BURST', x + 8, y + 33);
        });
      }
    };

    const loop = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000);
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
            padding: '12px 16px', minWidth: 140, borderRadius: 10, cursor: 'pointer',
            border: `3px solid ${selected === k ? TYPES[k].color : '#2a3566'}`,
            background: selected === k ? '#14204f' : '#0a1030', color: '#fff',
          }}
        >
          <div style={{ fontWeight: 700, color: TYPES[k].color }}>{TYPES[k].name}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{TYPES[k].desc}</div>
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
      <div style={{ display: 'flex', width: '100%', maxWidth: 680, justifyContent: 'space-between', alignItems: 'center' }}>
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
            外周の金色ゾーンから場外に出すとエクストリームフィニッシュ！
          </div>
          <button style={btn} onClick={startMatch}>バトル開始</button>
        </div>
      ) : (
        <div style={{ position: 'relative', width: 'min(92vw, 640px)', aspectRatio: '1' }}>
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: '100%', height: '100%' }} />
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
