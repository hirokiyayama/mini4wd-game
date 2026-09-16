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

// ── パワー：スタート時の加速の伸び ──
// 最高速自体には関与させず（それはスピード/コーナーの役割）、0→最高速の
// 立ち上がりの速さだけをパワー/重さ比で決める。パワー/重さ比を単純比例
// ではなく累乗（ACCEL_EXPONENT）で効かせることで、少しのパワー差でも
// 加速の伸びにはっきり差がつくようにしている。
const ACCEL_SCALE = 0.002;
const ACCEL_EXPONENT = 1.6;

// ── 逆転要素：スタミナによるバテ／second wind ──
// スタミナ合計がこの値を上回るほど終盤に上乗せ、下回るほど終盤に失速する（基準値=平均的な構成のスタミナ）
const STAMINA_BASELINE = 15;
// ラスト1周（3周レースなら2/3経過）からバテ・巻き返し効果が一気に強まる
const FATIGUE_START_FRAC = 2 / 3;
const FATIGUE_MAX_CUT = 0.55; // 最大55%減速（低スタミナ・ダッシュ系モーター想定）
const SECOND_WIND_MAX_BOOST = 0.16; // 最大16%増速（高スタミナ構成のご褒美）

// ── パワーヒルウェイ専用：坂道でのパワー効果 ──
// パワー/重さ比がこの値と同じ機体は上り坂でも速度低下なし。これより低いと
// 上り区間で最高速が下がり、高いとむしろ坂で伸びる（パワー特化機の見せ場）。
const CLIMB_RATIO_BASELINE = 1.8;
const CLIMB_SPEED_MIN = 0.45;
const CLIMB_SPEED_MAX = 1.1;
const DOWNHILL_SPEED_BOOST = 1.12; // 下り区間は誰でも一律で少し伸びる

// ── スピード ⇔ コーナー のトレードオフ ──
// 「スピードが高いほど直線が速いがコーナーは遅い／コーナーが高いほど
// コーナーは速いが直線は遅い」という一貫した特性にする。基礎ペースは
// 両ステータスの合計から決め、その差分（diff）が直線・コーナーそれぞれの
// 得意・不得意を逆向きに作る。ただし差はあくまで軽い味付け程度に留め、
// 「加速・坂」というパワーの役割を食わないよう控えめに調整している。
const BASE_PACE_SCALE = 0.005; // (speed + cornering) 合計 → 基礎ペース
const SPEED_CORNER_TRADEOFF = 0.0004; // diffがどれだけ直線/コーナーの速さに影響するか（ごく軽め）
const SEG_MUL_FLOOR = 0.35; // 直線・コーナーどちらでも最低限これくらいは出せる
const SEG_MUL_SMOOTH_RATE = 6; // 直線⇔コーナー切り替え時、速度が滑らかに遷移する速さ
// レース全体のペースを落とす（体感で以前の約半分。速いセッティングで20秒前後を目安に）
const GLOBAL_SPEED_SCALE = 0.5;

// ── コーナーの安定しきい値 ──
// コーナー値だけで決めると「スピード系ボディ＋高速モーター」のように
// 合計値が大きいだけの構成が軒並みしきい値を超えてしまう（＝ほぼ確実に
// コースアウトする）ため、しきい値自体も基礎ペースに比例させ、その機体
// なりの速さに見合った安定性を確保できるようにする。コーナー値は上乗せ
// ボーナスとして残し、コーナー特化構成が最も安全になる序列は維持する。
// 実際のコーナー進入時は、直線⇔コーナーの速度切り替え（segMulSmooth）が
// 追いつくまでのラグや、絶好調イベントによる瞬間的な増速で理論値より
// 速くなる瞬間があるため、定常状態の計算よりだいぶ余裕を持たせておく
const STABILITY_BASE_PACE_FRAC = 1.1; // 基礎ペースのうちこの割合までは安定して曲がれる
const STABILITY_CORNERING_BONUS = 0.005; // コーナー値によるボーナス（上乗せ）
const STABILITY_MIN = 0.45; // 最低限のしきい値

// ── ランダムイベント：同じセッティング同士でも毎回違う展開になるように、
// 各マシンにたまに「絶好調（加速）」「つまづき（減速）」を発生させる。
const RANDOM_EVENT_CHANCE_PER_SEC = 0.32; // 発生していない間、1秒あたりこの確率で新規発生
const RANDOM_EVENT_MIN_DUR = 0.5;
const RANDOM_EVENT_MAX_DUR = 1.3;
const RANDOM_BOOST_MIN = 0.08; // 絶好調：+8%〜+18%（速度アップ＆コーナー安定）
const RANDOM_BOOST_MAX = 0.18;
const RANDOM_STUMBLE_MIN = 0.08; // つまづき：-8%〜-22%（速度ダウン＆コース安定悪化）
const RANDOM_STUMBLE_MAX = 0.22;

type RacerState = 'running' | 'crashed' | 'finished';
type RandomEventKind = 'boost' | 'stumble' | null;

interface RacerRuntime {
  progress: number;
  speed: number;
  laps: number;
  bouncePhase: number;
  leanAngle: number;
  state: RacerState;
  eventMul: number;
  eventTimer: number;
  eventKind: RandomEventKind;
  segMulSmooth: number;
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

  const runtimeRef = useRef<RacerRuntime[]>(players.map(() => ({ progress: 0, speed: 0, laps: 0, bouncePhase: 0, leanAngle: 0, state: 'running', eventMul: 1, eventTimer: 0, eventKind: null, segMulSmooth: 1 })));
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

        const mul = LANE_MUL[i] ?? 1;
        const curSample = sampleCourse(courseId, rt.progress, window.innerWidth, window.innerHeight, mul);
        const curSlope = curSample.slope;

        // スピード ⇔ コーナーのトレードオフ：基礎ペースは両ステータスの合計、
        // 直線かコーナーかでどちらが有利かが入れ替わる（滑らかに遷移させる）
        const basePace = (racer.totalStats.speed + racer.totalStats.cornering) * BASE_PACE_SCALE;
        const diff = racer.totalStats.speed - racer.totalStats.cornering;
        const targetSegMul = curSample.isCorner
          ? Math.max(SEG_MUL_FLOOR, 1 - diff * SPEED_CORNER_TRADEOFF)
          : Math.max(SEG_MUL_FLOOR, 1 + diff * SPEED_CORNER_TRADEOFF);
        rt.segMulSmooth += (targetSegMul - rt.segMulSmooth) * Math.min(1, delta * SEG_MUL_SMOOTH_RATE);

        // ラスト1周に入ったら一気に効いてくる「バテ／second wind」係数（逆転要素）。
        // 線形（直線的）に立ち上げることで、なだらかにではなくラップ切り替わりで
        // はっきり分かるように失速・巻き返しさせる
        const distanceTarget = TARGET_LAPS * Math.PI * 2;
        const raceFrac = Math.min(1, (rt.laps * Math.PI * 2 + rt.progress) / distanceTarget);
        const fatigueEase = Math.max(0, (raceFrac - FATIGUE_START_FRAC) / (1 - FATIGUE_START_FRAC));
        const staminaGap = racer.totalStats.stamina - STAMINA_BASELINE;
        const staminaMul = staminaGap >= 0
          ? 1 + Math.min(SECOND_WIND_MAX_BOOST, staminaGap * 0.0022) * fatigueEase
          : 1 - Math.min(FATIGUE_MAX_CUT, -staminaGap * 0.01) * fatigueEase;

        // 坂道（パワーヒルウェイ）でのパワー効果：上りはパワー/重さ比が低いと失速し、
        // 高いとむしろ加速。下りは誰でも一律ブースト
        let slopeMul = 1;
        if (curSlope === 1) {
          const climbRatio = racer.totalStats.power / racer.totalStats.weight;
          slopeMul = Math.max(CLIMB_SPEED_MIN, Math.min(CLIMB_SPEED_MAX, 0.4 + 0.6 * (climbRatio / CLIMB_RATIO_BASELINE)));
        } else if (curSlope === -1) {
          slopeMul = DOWNHILL_SPEED_BOOST;
        }

        // ランダムイベント（絶好調／つまづき）：発生中なら残り時間を減らし、
        // 終わったら平常運転に戻す。発生していなければ毎秒一定確率で新規抽選
        if (rt.eventTimer > 0) {
          rt.eventTimer -= delta;
          if (rt.eventTimer <= 0) {
            rt.eventTimer = 0;
            rt.eventMul = 1;
            rt.eventKind = null;
          }
        } else if (Math.random() < RANDOM_EVENT_CHANCE_PER_SEC * delta) {
          const isBoost = Math.random() < 0.5;
          const mag = isBoost
            ? RANDOM_BOOST_MIN + Math.random() * (RANDOM_BOOST_MAX - RANDOM_BOOST_MIN)
            : RANDOM_STUMBLE_MIN + Math.random() * (RANDOM_STUMBLE_MAX - RANDOM_STUMBLE_MIN);
          rt.eventMul = isBoost ? 1 + mag : 1 - mag;
          rt.eventKind = isBoost ? 'boost' : 'stumble';
          rt.eventTimer = RANDOM_EVENT_MIN_DUR + Math.random() * (RANDOM_EVENT_MAX_DUR - RANDOM_EVENT_MIN_DUR);
        }

        const maxSpeed = basePace * rt.segMulSmooth * staminaMul * slopeMul * rt.eventMul * GLOBAL_SPEED_SCALE;
        // パワーの役割はスタート時の加速の伸びと坂道（slopeMulで別途反映）に
        // 特化させる。ここの係数を控えめにして立ち上がりに時間をかけることで、
        // パワー差がレース序盤にはっきり体感できるようにしている
        const acceleration = Math.pow(racer.totalStats.power / racer.totalStats.weight, ACCEL_EXPONENT) * ACCEL_SCALE;
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

        const p = sampleCourse(courseId, rt.progress, window.innerWidth, window.innerHeight, mul);

        if (rt.state === 'running' && p.cornerRisk && rt.speed > 0.5) {
          // しきい値自体はイベントで変動させない（絶好調中はそのぶん speed が
          // 伸びているので自然とコーナーが危なくなり、つまづき中は speed が
          // 落ちているぶん自然と安全になる＝同じセッティングでも結果が変わりうる）
          const stabilityLimit = (basePace * STABILITY_BASE_PACE_FRAC + racer.totalStats.cornering * STABILITY_CORNERING_BONUS + STABILITY_MIN) * GLOBAL_SPEED_SCALE;
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
        // つまづき中は小刻みに車体が揺れる演出
        const stumbleJitter = rt.eventKind === 'stumble' ? Math.sin(rt.bouncePhase * 3) * 6 : 0;

        const car = carRefs.current[i];
        if (car) {
          if (car.root) {
            car.root.style.left = `${p.x}px`;
            car.root.style.top = `${p.y}px`;
          }
          if (car.bounce) car.bounce.style.transform = `translateY(${bounceY}px)`;
          if (car.rotate) car.rotate.style.transform = `rotate(${p.angle + rt.leanAngle + stumbleJitter}deg)`;
          if (car.trail) {
            const speedRatio = maxSpeed > 0 ? rt.speed / maxSpeed : 0;
            // 絶好調中はトレイルを大きく明るく、つまづき中は小さく暗く見せて演出する
            const eventFlair = rt.eventKind === 'boost' ? 1.4 : rt.eventKind === 'stumble' ? 0.6 : 1;
            car.trail.style.opacity = `${Math.min(0.7, speedRatio * 0.6 * eventFlair)}`;
            car.trail.style.transform = `scale(${1 + speedRatio * 0.5 * eventFlair})`;
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
            <span className="race-leaderboard-name">{racer.name}{racer.isCPU && <span className="race-cpu-badge">🤖{racer.cpuLevel}</span>}</span>
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
