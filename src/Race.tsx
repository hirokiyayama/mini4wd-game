import React, { useState, useEffect, useRef } from 'react';
import type { PartStats, Player } from './types';
import { CircuitScene } from './CircuitScene';
import { RaceCar, type RaceCarHandle } from './RaceCar';
import { sampleCourse, type CourseId } from './courses';

interface RaceProps {
  players: (Player & { totalStats: PartStats })[];
  courseId: CourseId;
  onBackToGarage: () => void;
}

// コースが常に同じ回転方向に曲がり続けるため、姿勢の傾き（ドリフト）は常に同じ向き
const LEAN_DIR = -1;
const TARGET_LAPS = 3;
// 3台が重ならないよう、コースの相似形上に少しずつレーンをずらして配置
const LANE_MUL = [1, 1.08, 0.92];

type RacerState = 'running' | 'crashed' | 'finished';

interface RacerRuntime {
  progress: number;
  speed: number;
  laps: number;
  bouncePhase: number;
  leanAngle: number;
  state: RacerState;
}

interface RankEntry {
  name: string;
  state: RacerState;
}

export const Race: React.FC<RaceProps> = ({ players, courseId, onBackToGarage }) => {
  const [status, setStatus] = useState<'countdown' | 'running' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [time, setTime] = useState(0);
  const [finalRanking, setFinalRanking] = useState<RankEntry[] | null>(null);
  const [, forceTick] = useState(0);

  const runtimeRef = useRef<RacerRuntime[]>(players.map(() => ({ progress: 0, speed: 0, laps: 0, bouncePhase: 0, leanAngle: 0, state: 'running' })));
  const carRefs = useRef<(RaceCarHandle | null)[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rankRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lapRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const raceOver = useRef(false);

  // 初期姿勢（スタートライン上、コース進行方向を向く）
  useEffect(() => {
    players.forEach((_, i) => {
      const mul = LANE_MUL[i] ?? 1;
      const car = carRefs.current[i];
      const p = sampleCourse(courseId, 0, window.innerWidth, window.innerHeight, mul);
      if (car) {
        if (car.root) {
          car.root.style.left = `${p.x}px`;
          car.root.style.top = `${p.y}px`;
        }
        if (car.rotate) car.rotate.style.transform = `rotate(${p.angle}deg)`;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カウントダウン
  useEffect(() => {
    if (status !== 'countdown') return;
    if (countdown <= 0) {
      setStatus('running');
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

  // レースループ：3人分の物理演算を同時に進める（ゲームロジックはプレイヤー分をそのまま全員に適用）
  useEffect(() => {
    if (status !== 'running') return;
    let animId: number;
    let last = performance.now();

    const finishRace = () => {
      raceOver.current = true;
      const ranking: RankEntry[] = players
        .map((p, i) => ({
          name: p.name,
          state: runtimeRef.current[i].state,
          distance: runtimeRef.current[i].laps * Math.PI * 2 + runtimeRef.current[i].progress,
        }))
        .sort((a, b) => b.distance - a.distance)
        .map(({ name, state }) => ({ name, state }));
      setFinalRanking(ranking);
      setStatus('finished');
    };

    const loop = (now: number) => {
      if (raceOver.current) return;
      const delta = (now - last) / 1000;
      last = now;

      let anyFinished = false;
      let anyRunning = false;

      players.forEach((racer, i) => {
        const rt = runtimeRef.current[i];
        if (rt.state !== 'running') return;
        anyRunning = true;

        const maxSpeed = racer.totalStats.speed * 0.01;
        const acceleration = (racer.totalStats.power / racer.totalStats.weight) * 0.005;
        rt.speed = Math.min(rt.speed + acceleration * delta * 60, maxSpeed);
        rt.progress += rt.speed * delta;

        if (rt.progress >= Math.PI * 2) {
          rt.progress %= Math.PI * 2;
          rt.laps += 1;
          if (rt.laps >= TARGET_LAPS) {
            rt.state = 'finished';
            anyFinished = true;
          }
        }

        const mul = LANE_MUL[i] ?? 1;
        const p = sampleCourse(courseId, rt.progress, window.innerWidth, window.innerHeight, mul);

        if (rt.state === 'running' && p.isCorner && rt.speed > 0.5) {
          const stabilityLimit = (racer.totalStats.cornering / 100) * 0.8 + 0.3;
          if (rt.speed > stabilityLimit) {
            rt.state = 'crashed';
          }
        }

        // 車体の上下動（サスペンションのバウンス。速度が上がるほど大きく速く揺れる）
        rt.bouncePhase += delta * (5 + rt.speed * 14);
        const bounceAmp = Math.min(4.5, 1 + rt.speed * 6);
        const bounceY = Math.sin(rt.bouncePhase) * bounceAmp;

        // コーナーでの姿勢変化（進行方向の接線角度に、コーナリング時のドリフト角を上乗せ）
        const leanTarget = p.isCorner ? LEAN_DIR * Math.min(14, rt.speed * 22) : 0;
        rt.leanAngle += (leanTarget - rt.leanAngle) * Math.min(1, delta * 8);

        const car = carRefs.current[i];
        if (car) {
          if (car.root) {
            car.root.style.left = `${p.x}px`;
            car.root.style.top = `${p.y}px`;
          }
          if (car.bounce) car.bounce.style.transform = `translateY(${bounceY}px)`;
          if (car.rotate) car.rotate.style.transform = `rotate(${p.angle + rt.leanAngle}deg)`;
          if (car.trail) {
            const speedRatio = maxSpeed > 0 ? rt.speed / maxSpeed : 0;
            car.trail.style.opacity = `${Math.min(0.55, speedRatio * 0.6)}`;
            car.trail.style.transform = `scale(${1 + speedRatio * 0.5})`;
          }
        }

        if (rt.state === 'crashed') {
          forceTick(t => t + 1); // re-render once so this car's shake class/badge reflect the crash
        }
      });

      // リーダーボード（DOM直接更新で頻繁な再レンダリングを回避）
      const distances = players.map((_, i) => runtimeRef.current[i].laps * Math.PI * 2 + runtimeRef.current[i].progress);
      const order = [...distances.keys()].sort((a, b) => distances[b] - distances[a]);
      order.forEach((racerIndex, rank) => {
        if (rankRefs.current[racerIndex]) rankRefs.current[racerIndex]!.textContent = `${rank + 1}`;
        if (rowRefs.current[racerIndex]) rowRefs.current[racerIndex]!.style.order = String(rank);
        const rt = runtimeRef.current[racerIndex];
        const lapEl = lapRefs.current[racerIndex];
        if (lapEl) {
          lapEl.textContent = rt.state === 'crashed' ? 'OUT' : rt.state === 'finished' ? 'FINISH' : `${Math.min(rt.laps + 1, TARGET_LAPS)}/${TARGET_LAPS}`;
        }
      });

      if (anyFinished || !anyRunning) {
        finishRace();
        return;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, players, courseId]);

  const formatTime = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}'${s.toString().padStart(2, '0')}"${cs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mini4wd-screen">
      <CircuitScene courseId={courseId} minimal />
      <div className="screen-vignette" />
      <div className="screen-scanline" />

      {/* ── CARS: all 3 user-configured machines, each an actual photo positioned/animated as its own game object ── */}
      {players.map((racer, i) => (
        <RaceCar
          key={racer.id}
          ref={el => { carRefs.current[i] = el; }}
          bodyId={racer.setting.body}
          isOut={runtimeRef.current[i].state === 'crashed'}
          label={racer.name}
        />
      ))}

      {/* ── HUD: TOP BAR ── */}
      <div className="race-topbar">
        <button onClick={onBackToGarage} className="race-back-btn">◀ ガレージ</button>
        <div className="race-timer">
          <div className="race-hud-label">TIME</div>
          <div className="race-hud-value race-hud-value--gold">{formatTime(time)}</div>
        </div>
      </div>

      {/* ── LEADERBOARD ── */}
      <div className="race-leaderboard">
        {players.map((racer, i) => (
          <div key={racer.id} ref={el => { rowRefs.current[i] = el; }} className="race-leaderboard-row">
            <span className="race-leaderboard-rank" ref={el => { rankRefs.current[i] = el; }}>{i + 1}</span>
            <span className="race-leaderboard-name">{racer.name}</span>
            <span className="race-leaderboard-lap" ref={el => { lapRefs.current[i] = el; }}>1/{TARGET_LAPS}</span>
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

      {/* ── RESULT ── */}
      {status === 'finished' && (
        <div className="race-overlay">
          <div className="race-result-card race-result-card--gold">
            <div className="race-result-icon">🏁</div>
            <div className="race-result-title race-result-title--gold">RESULT</div>
            <div className="race-result-time">{formatTime(time)}</div>
            {finalRanking && (
              <div className="race-rank-list">
                {finalRanking.map((r, i) => (
                  <div key={r.name} className="race-rank-row">
                    <span className="race-rank-pos">{i + 1}位</span>
                    <span className="race-rank-name">{r.name}</span>
                    {r.state === 'crashed' && <span className="race-rank-tag race-rank-tag--out">コースアウト</span>}
                    {r.state === 'finished' && <span className="race-rank-tag race-rank-tag--finish">完走</span>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={onBackToGarage} className="race-result-btn race-result-btn--gold">
              ガレージに戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
