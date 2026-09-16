import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { PartStats, MachineSetting } from './types';
import { CircuitScene, getTrackGeometry } from './CircuitScene';
import { RaceCar, type RaceCarHandle } from './RaceCar';

interface RaceProps {
  setting: MachineSetting;
  totalStats: PartStats;
  onBackToGarage: () => void;
}

// 楕円コースが常に同じ回転方向に曲がり続けるため、姿勢の傾き（ドリフト）は常に同じ向き
const LEAN_DIR = -1;
const TARGET_LAPS = 3;

const ALL_BODIES = ['b_magnum', 'b_sonic', 'b_tridagger'];
// CPUライバルの固定ステータス（プレイヤーの標準的なビルドと張り合える範囲で設定）
const AI_PRESETS: PartStats[] = [
  { speed: 140, power: 130, cornering: 70, stamina: 50, weight: 60 },
  { speed: 165, power: 100, cornering: 95, stamina: 55, weight: 68 },
];
// 3台が重ならないよう、コースの同心楕円上に少しずつレーンをずらして配置
const LANE_MUL = [1, 1.08, 0.92];

interface RacerConfig {
  id: string;
  name: string;
  bodyId: string;
  totalStats: PartStats;
  isPlayer: boolean;
}

interface RacerRuntime {
  progress: number;
  speed: number;
  laps: number;
  bouncePhase: number;
  leanAngle: number;
}

interface RankEntry {
  name: string;
  isPlayer: boolean;
  distance: number;
}

export const Race: React.FC<RaceProps> = ({ setting, totalStats, onBackToGarage }) => {
  const [status, setStatus] = useState<'countdown' | 'running' | 'course_out' | 'goal'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [currentLap, setCurrentLap] = useState(1);
  const [time, setTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [lapStart, setLapStart] = useState(0);
  const [finalRanking, setFinalRanking] = useState<RankEntry[] | null>(null);

  // 3人対決：プレイヤー + CPUライバル2人。ボディ写真は3種類とも使われるように配分
  const racers = useMemo<RacerConfig[]>(() => {
    const playerBody = setting.body || ALL_BODIES[0];
    const aiBodies = ALL_BODIES.filter(b => b !== playerBody);
    return [
      { id: 'player', name: 'あなた', bodyId: playerBody, totalStats, isPlayer: true },
      { id: 'ai1', name: 'ライバル①', bodyId: aiBodies[0] ?? ALL_BODIES[1], totalStats: AI_PRESETS[0], isPlayer: false },
      { id: 'ai2', name: 'ライバル②', bodyId: aiBodies[1] ?? ALL_BODIES[2], totalStats: AI_PRESETS[1], isPlayer: false },
    ];
  }, [setting.body, totalStats]);

  const runtimeRef = useRef<RacerRuntime[]>(racers.map(() => ({ progress: 0, speed: 0, laps: 0, bouncePhase: 0, leanAngle: 0 })));
  const carRefs = useRef<(RaceCarHandle | null)[]>([]);
  const rankValueRef = useRef<HTMLDivElement>(null);
  const isOut = useRef(false);

  // 初期姿勢（スタートライン上、コース進行方向を向く）
  useEffect(() => {
    const { cx, cy, rx } = getTrackGeometry(window.innerWidth, window.innerHeight);
    racers.forEach((_, i) => {
      const mul = LANE_MUL[i] ?? 1;
      const car = carRefs.current[i];
      if (car) {
        if (car.root) {
          car.root.style.left = `${cx + rx * mul}px`;
          car.root.style.top = `${cy}px`;
        }
        if (car.rotate) car.rotate.style.transform = 'rotate(90deg)';
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // レースループ（プレイヤーのゲームロジックは完全保持。CPU2人も同じ物理式で同時に走行させる）
  useEffect(() => {
    if (status !== 'running') return;
    let animId: number;
    let last = performance.now();

    const finishRace = (result: 'goal' | 'course_out') => {
      isOut.current = true;
      const ranking: RankEntry[] = racers
        .map((r, i) => ({
          name: r.name,
          isPlayer: r.isPlayer,
          distance: runtimeRef.current[i].laps * Math.PI * 2 + runtimeRef.current[i].progress,
        }))
        .sort((a, b) => b.distance - a.distance);
      setFinalRanking(ranking);
      setStatus(result);
    };

    const loop = (now: number) => {
      if (isOut.current) return;
      const delta = (now - last) / 1000;
      last = now;

      const { cx, cy, rx, ry } = getTrackGeometry(window.innerWidth, window.innerHeight);

      racers.forEach((racer, i) => {
        const rt = runtimeRef.current[i];

        const maxSpeed = racer.totalStats.speed * 0.01;
        const acceleration = (racer.totalStats.power / racer.totalStats.weight) * 0.005;
        rt.speed = Math.min(rt.speed + acceleration * delta * 60, maxSpeed);

        rt.progress += rt.speed * delta;

        if (rt.progress >= Math.PI * 2) {
          rt.progress %= Math.PI * 2;
          rt.laps += 1;

          if (racer.isPlayer) {
            const lapTime = time - lapStart;
            if (bestLap === null || lapTime < bestLap) setBestLap(lapTime);
            setLapStart(time);

            if (rt.laps >= TARGET_LAPS) {
              finishRace('goal');
            } else {
              setCurrentLap(rt.laps + 1);
            }
          }
        }

        const t = rt.progress;
        const dx = -rx * Math.sin(t);
        const dy = ry * Math.cos(t);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // コースアウト判定はプレイヤーのみ（preserved from before）
        const isCorner = Math.abs(Math.cos(t)) > 0.8;
        if (racer.isPlayer && isCorner && rt.speed > 0.5) {
          const stabilityLimit = (racer.totalStats.cornering / 100) * 0.8 + 0.3;
          if (rt.speed > stabilityLimit) {
            finishRace('course_out');
          }
        }

        // 車体の上下動（サスペンションのバウンス。速度が上がるほど大きく速く揺れる）
        rt.bouncePhase += delta * (5 + rt.speed * 14);
        const bounceAmp = Math.min(4.5, 1 + rt.speed * 6);
        const bounceY = Math.sin(rt.bouncePhase) * bounceAmp;

        // コーナーでの姿勢変化（進行方向の接線角度に、コーナリング時のドリフト角を上乗せ）
        const leanTarget = isCorner ? LEAN_DIR * Math.min(14, rt.speed * 22) : 0;
        rt.leanAngle += (leanTarget - rt.leanAngle) * Math.min(1, delta * 8);

        const mul = LANE_MUL[i] ?? 1;
        const x = cx + rx * mul * Math.cos(t);
        const y = cy + ry * mul * Math.sin(t);

        const car = carRefs.current[i];
        if (car) {
          if (car.root) {
            car.root.style.left = `${x}px`;
            car.root.style.top = `${y}px`;
          }
          if (car.bounce) car.bounce.style.transform = `translateY(${bounceY}px)`;
          if (car.rotate) car.rotate.style.transform = `rotate(${angle + rt.leanAngle}deg)`;
          if (car.trail) {
            const speedRatio = maxSpeed > 0 ? rt.speed / maxSpeed : 0;
            car.trail.style.opacity = `${Math.min(0.55, speedRatio * 0.6)}`;
            car.trail.style.transform = `scale(${1 + speedRatio * 0.5})`;
          }
        }
      });

      // 現在の順位をHUDに直接反映（頻繁な再レンダリングを避けるための直接DOM更新）
      if (rankValueRef.current) {
        const distances = racers.map((_, i) => runtimeRef.current[i].laps * Math.PI * 2 + runtimeRef.current[i].progress);
        const playerDistance = distances[0];
        const rank = 1 + distances.filter(d => d > playerDistance).length;
        rankValueRef.current.textContent = `${rank}`;
      }

      if (!isOut.current) {
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [status, racers, time, lapStart, bestLap]);

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

      {/* ── CARS: player + 2 CPU rivals, each an actual machine photo positioned/animated as its own game object ── */}
      {racers.map((racer, i) => (
        <RaceCar
          key={racer.id}
          ref={el => { carRefs.current[i] = el; }}
          bodyId={racer.bodyId}
          isOut={racer.isPlayer && status === 'course_out'}
          label={racer.isPlayer ? 'YOU' : racer.name}
          highlight={racer.isPlayer}
        />
      ))}

      {/* ── HUD: TOP BAR ── */}
      <div className="race-topbar">
        <button onClick={onBackToGarage} className="race-back-btn">◀ ガレージ</button>

        <div className="race-center-hud">
          <div className="race-lap">
            <div className="race-hud-label">LAP</div>
            <div className="race-hud-value">
              {Math.min(currentLap, TARGET_LAPS)} <span className="race-hud-sub">/ {TARGET_LAPS}</span>
            </div>
          </div>

          <div className="race-rank">
            <div className="race-hud-label">順位</div>
            <div className="race-hud-value race-hud-value--rank">
              <span ref={rankValueRef}>1</span> <span className="race-hud-sub">/ {racers.length}</span>
            </div>
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
            {finalRanking && <RankList ranking={finalRanking} />}
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
            {finalRanking && <RankList ranking={finalRanking} />}
            <button onClick={onBackToGarage} className="race-result-btn race-result-btn--gold">
              ガレージに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const RankList: React.FC<{ ranking: RankEntry[] }> = ({ ranking }) => (
  <div className="race-rank-list">
    {ranking.map((r, i) => (
      <div key={r.name} className={`race-rank-row${r.isPlayer ? ' is-player' : ''}`}>
        <span className="race-rank-pos">{i + 1}位</span>
        <span className="race-rank-name">{r.name}</span>
      </div>
    ))}
  </div>
);
