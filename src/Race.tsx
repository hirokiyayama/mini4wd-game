import React, { useState, useEffect, useRef } from 'react';
import type { PartStats, MachineSetting } from './types';
import { CircuitScene } from './CircuitScene';
import { RaceCar, type RaceCarHandle } from './RaceCar';

interface RaceProps {
  setting: MachineSetting;
  totalStats: PartStats;
  onBackToGarage: () => void;
}

// 楕円コースが常に同じ回転方向に曲がり続けるため、姿勢の傾き（ドリフト）は常に同じ向き
const LEAN_DIR = -1;

export const Race: React.FC<RaceProps> = ({ setting, totalStats, onBackToGarage }) => {
  const [status, setStatus] = useState<'countdown' | 'running' | 'course_out' | 'goal'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [currentLap, setCurrentLap] = useState(1);
  const [time, setTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [lapStart, setLapStart] = useState(0);
  const targetLaps = 3;

  const carRef = useRef<RaceCarHandle>(null);
  const progress = useRef(0);
  const speed = useRef(0);
  const laps = useRef(0);
  const isOut = useRef(false);
  const wheelSpin = useRef(0);
  const rollerSpin = useRef(0);
  const bouncePhase = useRef(0);
  const leanAngle = useRef(0);

  // 初期姿勢（スタートライン上、コース進行方向を向く）
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const cy = vh / 2;
    const rx = Math.min(vw * 0.35, 320);
    const car = carRef.current;
    if (car) {
      if (car.root) {
        car.root.style.left = `${cx + rx}px`;
        car.root.style.top = `${cy}px`;
      }
      if (car.rotate) car.rotate.style.transform = 'rotate(90deg)';
    }
  }, []);

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

      // タイヤ・ローラーの自転（速度に応じて回転速度が変わる）
      wheelSpin.current = (wheelSpin.current + speed.current * delta * 2400) % 360;
      rollerSpin.current = (rollerSpin.current + speed.current * delta * 4200) % 360;

      // 車体の上下動（サスペンションのバウンス。速度が上がるほど大きく速く揺れる）
      bouncePhase.current += delta * (5 + speed.current * 14);
      const bounceAmp = Math.min(4.5, 1 + speed.current * 6);
      const bounceY = Math.sin(bouncePhase.current) * bounceAmp;

      // コーナーでの姿勢変化（進行方向の接線角度に、コーナリング時のドリフト角を上乗せ）
      const leanTarget = isCorner ? LEAN_DIR * Math.min(14, speed.current * 22) : 0;
      leanAngle.current += (leanTarget - leanAngle.current) * Math.min(1, delta * 8);

      const car = carRef.current;
      if (car) {
        if (car.root) {
          car.root.style.left = `${x}px`;
          car.root.style.top = `${y}px`;
        }
        if (car.bounce) car.bounce.style.transform = `translateY(${bounceY}px)`;
        if (car.rotate) car.rotate.style.transform = `rotate(${angle + leanAngle.current}deg)`;
        car.wheels.forEach(w => { w.style.transform = `rotate(${wheelSpin.current}deg)`; });
        car.rollers.forEach(r => { r.style.transform = `rotate(${rollerSpin.current}deg)`; });
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

  return (
    <div className="mini4wd-screen">
      <CircuitScene />
      <div className="screen-vignette" />
      <div className="screen-scanline" />

      {/* ── CAR: body / 4 wheels / rollers as separate, independently-animated parts ── */}
      <RaceCar ref={carRef} bodyId={setting.body} isOut={status === 'course_out'} />

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
