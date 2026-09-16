import React, { useState, useEffect, useRef } from 'react';
import type { PartStats, MachineSetting } from './types';
import { CircuitScene } from './CircuitScene';

interface RaceProps {
  setting: MachineSetting;
  totalStats: PartStats;
  onBackToGarage: () => void;
}

export const Race: React.FC<RaceProps> = ({ setting, totalStats, onBackToGarage }) => {
  const [status, setStatus] = useState<'countdown' | 'running' | 'course_out' | 'goal'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [currentLap, setCurrentLap] = useState(1);
  const [time, setTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [lapStart, setLapStart] = useState(0);
  const targetLaps = 3;

  const carRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const speed = useRef(0);
  const laps = useRef(0);
  const isOut = useRef(false);

  // ボディ画像のパスを取得
  let carImage = '/magnum.jpg';
  if (setting.body === 'b_sonic') carImage = '/sonic.jpg';
  if (setting.body === 'b_tridagger') carImage = '/tridagger.jpg';

  // カウントダウン
  useEffect(() => {
    if (status !== 'countdown') return;
    if (countdown <= 0) {
      setStatus('running');
      setLapStart(0);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown]);

  // タイマー
  useEffect(() => {
    let timer: number;
    if (status === 'running') {
      timer = window.setInterval(() => setTime(prev => prev + 10), 10);
    }
    return () => clearInterval(timer);
  }, [status]);

  // レースループ（ゲームロジックは完全保持）
  useEffect(() => {
    if (status !== 'running') return;
    let animId: number;
    let last = performance.now();

    const loop = (now: number) => {
      if (isOut.current) return;
      const delta = (now - last) / 1000;
      last = now;

      const maxSpeed = totalStats.speed * 0.01;
      const acceleration = (totalStats.power / totalStats.weight) * 0.005;
      speed.current = Math.min(speed.current + acceleration * delta * 60, maxSpeed);

      progress.current += speed.current * delta;

      if (progress.current >= Math.PI * 2) {
        progress.current %= Math.PI * 2;
        laps.current += 1;

        // Best lap tracking
        const lapTime = time - lapStart;
        if (bestLap === null || lapTime < bestLap) setBestLap(lapTime);
        setLapStart(time);

        if (laps.current >= targetLaps) {
          setStatus('goal');
          return;
        } else {
          setCurrentLap(laps.current + 1);
        }
      }

      const t = progress.current;
      // Viewport adaptive oval
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = vw / 2;
      const cy = vh / 2;
      const rx = Math.min(vw * 0.35, 320);
      const ry = Math.min(vh * 0.28, 160);

      const x = cx + rx * Math.cos(t);
      const y = cy + ry * Math.sin(t);
      const dx = -rx * Math.sin(t);
      const dy = ry * Math.cos(t);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      // Corner course-out logic (preserved from before)
      const isCorner = Math.abs(Math.cos(t)) > 0.8;
      if (isCorner && speed.current > 0.5) {
        const stabilityLimit = (totalStats.cornering / 100) * 0.8 + 0.3;
        if (speed.current > stabilityLimit) {
          isOut.current = true;
          setStatus('course_out');
          return;
        }
      }

      if (carRef.current) {
        carRef.current.style.left = `${x}px`;
        carRef.current.style.top = `${y}px`;
        carRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [status, totalStats]);

  const formatTime = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}'${s.toString().padStart(2, '0')}"${cs.toString().padStart(2, '0')}`;
  };

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const cx = vw / 2;
  const cy = vh / 2;
  const rx = Math.min(vw * 0.35, 320);

  return (
    <div className="mini4wd-screen">
      <CircuitScene />
      <div className="screen-vignette" />
      <div className="screen-scanline" />

      {/* ── CAR (2D image on track) — position math is untouched game logic ── */}
      <div
        ref={carRef}
        className={`race-car${status === 'course_out' ? ' is-out' : ''}`}
        style={{
          left: `${cx + rx}px`,
          top: `${cy}px`,
          transform: 'translate(-50%, -50%) rotate(90deg)',
        }}
      >
        <img src={carImage} alt="Machine" className="race-car-img" />
      </div>

      {/* ── HUD: TOP BAR ── */}
      <div className="race-topbar">
        <button onClick={onBackToGarage} className="race-back-btn">◀ ガレージ</button>

        <div className="race-lap">
          <div className="race-hud-label">LAP</div>
          <div className="race-hud-value">
            {Math.min(currentLap, targetLaps)} <span className="race-hud-sub">/ {targetLaps}</span>
          </div>
        </div>

        <div className="race-timer">
          <div className="race-hud-label">TIME</div>
          <div className="race-hud-value race-hud-value--gold">{formatTime(time)}</div>
          {bestLap !== null && <div className="race-hud-best">BEST {formatTime(bestLap)}</div>}
        </div>
      </div>

      {/* ── MINI STAT HUD (bottom left) ── */}
      <div className="race-mini-stats">
        {[
          { label: 'SP', val: totalStats.speed, color: '#5aabff' },
          { label: 'PW', val: totalStats.power, color: '#ff6b35' },
          { label: 'CO', val: totalStats.cornering, color: '#00e5ff' },
        ].map(({ label, val, color }) => (
          <div key={label} className="race-mini-stat-row">
            <span className="race-mini-stat-label">{label}</span>
            <div className="race-mini-stat-track">
              <div className="race-mini-stat-fill" style={{ width: `${Math.min(100, val / 4)}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
            </div>
            <span className="race-mini-stat-val">{val}</span>
          </div>
        ))}
      </div>

      {/* ── COUNTDOWN ── */}
      {status === 'countdown' && (
        <div className="race-overlay">
          <div className={`race-countdown${countdown > 0 ? '' : ' is-go'}`}>
            {countdown > 0 ? countdown : 'GO!'}
          </div>
        </div>
      )}

      {/* ── COURSE OUT ── */}
      {status === 'course_out' && (
        <div className="race-overlay">
          <div className="race-result-card race-result-card--danger">
            <div className="race-result-icon">💥</div>
            <div className="race-result-title race-result-title--danger">COURSE OUT</div>
            <div className="race-result-sub">コーナーリング性能が不足しています</div>
            <button onClick={onBackToGarage} className="race-result-btn race-result-btn--danger">
              ガレージに戻る
            </button>
          </div>
        </div>
      )}

      {/* ── GOAL ── */}
      {status === 'goal' && (
        <div className="race-overlay">
          <div className="race-result-card race-result-card--gold">
            <div className="race-result-icon">🏁</div>
            <div className="race-result-title race-result-title--gold">GOAL!</div>
            <div className="race-result-time">{formatTime(time)}</div>
            {bestLap !== null && <div className="race-result-sub">Best Lap: {formatTime(bestLap)}</div>}
            <button onClick={onBackToGarage} className="race-result-btn race-result-btn--gold">
              ガレージに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
