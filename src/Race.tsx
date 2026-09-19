import React, { useState, useEffect, useRef } from 'react';
import type { PartStats, Player } from './types';
import { PARTS } from './data';
import { CircuitScene } from './CircuitScene';
import { RaceCar, type RaceCarHandle } from './RaceCar';
import { sampleCourse, type CourseId } from './courses';
import { getSpecialMove, type SpecialMove, type SpecialFxKey } from './specials';
import { playSpecialSound } from './sound';
import { SoundToggle } from './SoundToggle';
import { playRaceBgm, stopRaceBgm } from './bgm';

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
// スタミナが基準からどれだけ離れているか（staminaGap）に比例して終盤の
// 速度倍率が連続的に変化する。以前は上限/下限でキャップしていたため、
// 極端にスタミナが低い構成でも「そこから先はもう変わらない」という
// 不自然な頭打ちが生じていた。キャップを撤廃し、差が大きいほど際限なく
// 効果が強まるようにする。SAFETY_FLOOR/CEILING は実際には到達しない
// 想定外の値が来た場合の保険にすぎない。
const STAMINA_EFFECT_COEF = 0.01; // staminaGap 1あたりの倍率変化量
const STAMINA_MUL_SAFETY_FLOOR = 0.25;
const STAMINA_MUL_SAFETY_CEILING = 2;

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

// ── 必殺技：ラスト1周（3周レースなら3周目）に入ってから、各マシンがこの確率で
// 自分の必殺技を発動する。3週目突入時点で最下位のマシンだけは突入と同時に
// 抽選、それ以外のマシンは自分が3週目に入った後、他の誰かに追い抜かれた
// 瞬間に抽選する（一度も追い抜かれなければ発動しないまま終わる）。
// 発動時はレース画面を一時停止してセリフを演出表示し、演出が終わると
// 実際の効果が一定時間発動する。
const SPECIAL_TRIGGER_LAP = TARGET_LAPS - 1; // このラップ数に達した瞬間が「3周目に入った」タイミング
const SPECIAL_TRIGGER_CHANCE = 1;
const SPECIAL_ANNOUNCE_MS = 2200; // セリフ演出の停止時間
const SPECIAL_EFFECT_DURATION = 3.5; // boost/corner系：効果が続く時間（秒）
const SPECIAL_DEBUFF_DURATION = 2.5; // attack系：命中した相手が妨害を受ける時間（秒）
const SPECIAL_FX_ATTACK_DURATION = 1.4; // attack系：発動者自身の演出エフェクトの長さ
const SPECIAL_BOOST_MUL = 1.6; // boost系：最高速の倍率
const SPECIAL_DEBUFF_MUL = 0.45; // attack系：命中した相手の最高速の倍率
const SPECIAL_CORNER_SEG_MUL = 1.45; // corner系：コーナーでも直線並み（以上）の速度を出せる
// 攻撃技の索敵範囲（範囲攻撃）：自分より前方にいるマシンには距離を問わず全機命中させる
// （半周などに制限すると、終盤で差が開いた際に一部しか巻き込めず「1機しか効かない」ように見えるため）
const SPECIAL_ATTACK_CONE_RANGE = Infinity;

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
  specialRolled: boolean; // 必殺技抽選を済ませたか（結果がハズレでも一度きり）
  isSlowest: boolean; // 3週目突入時点で最下位だったマシンか（＝3週目突入と同時に抽選する側）
  specialBoostMul: number; // boost系必殺技：最高速倍率（発動中のみ1より大きい）
  specialBoostTimer: number;
  specialCornerTimer: number; // corner系必殺技：コーナー無敵＋速度低下無効の残り時間
  specialDebuffMul: number; // attack系必殺技を受けた側：最高速倍率（1より小さい）
  specialDebuffTimer: number;
  specialFxTimer: number; // 自機に表示する必殺技エフェクトの残り時間（演出用）
  specialFxTotal: number; // ↑の開始時の合計時間（経過率の計算用）
  specialFxKind: SpecialFxKey | null; // 発動中の必殺技エフェクト種別
}

interface RankEntry {
  name: string;
  state: RacerState;
}

interface ActiveSpecialEvent {
  racerIndex: number;
  move: SpecialMove;
}

function raceDistance(rt: RacerRuntime): number {
  return rt.laps * Math.PI * 2 + rt.progress;
}

// マグナム（トルネード＝ジャンプ→高速回転）とブロッケンG（ハンマー＝ウイリー→叩きつけ）用の
// 演出開始直後だけのジャンプ・回転モーション。0→1→0 と滑らかに立ち上がって収まる包絡線を使うので、
// 通常の姿勢制御にスナップなく合流する
function specialMotionEnvelope(elapsed: number, windowLen: number): number {
  if (windowLen <= 0) return 0;
  const t = Math.min(1, Math.max(0, elapsed / windowLen));
  return Math.sin(t * Math.PI);
}

// 攻撃系必殺技の対象を決める。cone=前方の範囲内すべて／single=最も近い前方1機／
// homing=前方にいる中で最も先行している1機（＝現在の先頭）をロックオン
function findAttackTargets(kind: 'attack_cone' | 'attack_single' | 'attack_homing', actorIndex: number, runtime: RacerRuntime[]): number[] {
  const actorDist = raceDistance(runtime[actorIndex]);
  const ahead = runtime
    .map((rt, i) => ({ i, dist: raceDistance(rt) }))
    .filter(c => c.i !== actorIndex && runtime[c.i].state === 'running' && c.dist > actorDist);
  if (ahead.length === 0) return [];
  if (kind === 'attack_cone') {
    return ahead.filter(c => c.dist - actorDist <= SPECIAL_ATTACK_CONE_RANGE).map(c => c.i);
  }
  if (kind === 'attack_single') {
    ahead.sort((a, b) => a.dist - b.dist);
    return [ahead[0].i];
  }
  // attack_homing：先頭を追尾ロックオン
  ahead.sort((a, b) => b.dist - a.dist);
  return [ahead[0].i];
}

export const Race: React.FC<RaceProps> = ({ players, courseId, onBackToGarage }) => {
  const [status, setStatus] = useState<'countdown' | 'running' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [time, setTime] = useState(0);
  const [finalRanking, setFinalRanking] = useState<RankEntry[] | null>(null);
  const [, forceTick] = useState(0);
  const [activeSpecial, setActiveSpecial] = useState<ActiveSpecialEvent | null>(null);

  const runtimeRef = useRef<RacerRuntime[]>(players.map(() => ({
    progress: 0, speed: 0, laps: 0, bouncePhase: 0, leanAngle: 0, state: 'running',
    eventMul: 1, eventTimer: 0, eventKind: null, segMulSmooth: 1,
    specialRolled: false, isSlowest: false, specialBoostMul: 1, specialBoostTimer: 0, specialCornerTimer: 0,
    specialDebuffMul: 1, specialDebuffTimer: 0, specialFxTimer: 0, specialFxTotal: 0, specialFxKind: null,
  })));
  const carRefs = useRef<(RaceCarHandle | null)[]>([]);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rankRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lapRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const raceOver = useRef(false);
  const pendingSpecialsRef = useRef<number[]>([]);
  const specialOverlayActiveRef = useRef(false);
  const slowestAssignedRef = useRef(false); // 最下位マシンの判定を済ませたか（レース中1回だけ）
  const prevRankRef = useRef<number[]>(players.map(() => 0)); // 追い抜かれた瞬間を検知するための直前順位

  // レース画面の表示中だけBGMをランダム再生する（3曲からランダムに1つを選択）
  useEffect(() => {
    playRaceBgm();
    return () => stopRaceBgm();
  }, []);

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

  // タイマー（必殺技の演出停止中はタイムも止める）
  useEffect(() => {
    let timer: number;
    if (status === 'running') {
      timer = window.setInterval(() => {
        if (!specialOverlayActiveRef.current) setTime(prev => prev + 10);
      }, 10);
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

    // 3週目へ最初に突入したタイミングで、その時点の最下位マシンを1台だけ確定する。
    // このマシンだけが「3週目突入と同時」に抽選され、残りは「追い抜かれた瞬間」抽選になる
    const assignSlowestRole = () => {
      const running = runtimeRef.current
        .map((rt, i) => ({ i, dist: raceDistance(rt) }))
        .filter(c => runtimeRef.current[c.i].state === 'running');
      if (running.length === 0) return;
      running.sort((a, b) => a.dist - b.dist);
      runtimeRef.current[running[0].i].isSlowest = true;
    };

    // 必殺技の演出（画面停止＋セリフ表示）が終わったタイミングで実際の効果を適用する
    const applySpecialEffect = (racerIndex: number, move: SpecialMove) => {
      const rt = runtimeRef.current[racerIndex];
      if (!rt || rt.state !== 'running') return;
      rt.specialFxKind = move.fxKey;
      if (move.kind === 'boost') {
        rt.specialBoostMul = SPECIAL_BOOST_MUL;
        rt.specialBoostTimer = SPECIAL_EFFECT_DURATION;
        rt.specialFxTimer = SPECIAL_EFFECT_DURATION;
        rt.specialFxTotal = SPECIAL_EFFECT_DURATION;
      } else if (move.kind === 'corner') {
        // コーナーでの速度低下・コースアウト無効化だけでは直線区間で恩恵がなく
        // 効果が薄いため、boost系と同じ最高速アップも重ねて発動させる
        rt.specialBoostMul = SPECIAL_BOOST_MUL;
        rt.specialBoostTimer = SPECIAL_EFFECT_DURATION;
        rt.specialCornerTimer = SPECIAL_EFFECT_DURATION;
        rt.specialFxTimer = SPECIAL_EFFECT_DURATION;
        rt.specialFxTotal = SPECIAL_EFFECT_DURATION;
      } else {
        const targets = findAttackTargets(move.kind, racerIndex, runtimeRef.current);
        rt.specialFxTimer = SPECIAL_FX_ATTACK_DURATION;
        rt.specialFxTotal = SPECIAL_FX_ATTACK_DURATION;
        if (targets.length === 0) {
          // 前方に敵がいなければ空振り。せっかくの演出が無駄にならないよう自機を少しブーストする
          rt.specialBoostMul = SPECIAL_BOOST_MUL;
          rt.specialBoostTimer = SPECIAL_EFFECT_DURATION;
        } else {
          targets.forEach(ti => {
            const targetRt = runtimeRef.current[ti];
            targetRt.specialDebuffMul = SPECIAL_DEBUFF_MUL;
            targetRt.specialDebuffTimer = SPECIAL_DEBUFF_DURATION;
          });
        }
      }
    };

    // 必殺技の演出待ちキューを1件処理する（画面停止→技名演出→効果発動→再開）
    const processSpecialQueue = () => {
      if (specialOverlayActiveRef.current) return;
      while (pendingSpecialsRef.current.length > 0) {
        const idx = pendingSpecialsRef.current.shift()!;
        const rt = runtimeRef.current[idx];
        if (!rt || rt.state !== 'running') continue;
        const move = getSpecialMove(players[idx].setting.body);
        specialOverlayActiveRef.current = true;
        setActiveSpecial({ racerIndex: idx, move });
        playSpecialSound();
        window.setTimeout(() => {
          applySpecialEffect(idx, move);
          specialOverlayActiveRef.current = false;
          setActiveSpecial(null);
        }, SPECIAL_ANNOUNCE_MS);
        break;
      }
    };

    const loop = (now: number) => {
      if (raceOver.current) return;
      if (specialOverlayActiveRef.current) {
        last = now;
        animId = requestAnimationFrame(loop);
        return;
      }
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

        // 必殺技の効果タイマー（boost/corner/debuff/演出FX）を毎フレーム減衰させる
        if (rt.specialBoostTimer > 0) {
          rt.specialBoostTimer -= delta;
          if (rt.specialBoostTimer <= 0) { rt.specialBoostTimer = 0; rt.specialBoostMul = 1; }
        }
        if (rt.specialCornerTimer > 0) {
          rt.specialCornerTimer -= delta;
          if (rt.specialCornerTimer <= 0) rt.specialCornerTimer = 0;
        }
        if (rt.specialDebuffTimer > 0) {
          rt.specialDebuffTimer -= delta;
          if (rt.specialDebuffTimer <= 0) { rt.specialDebuffTimer = 0; rt.specialDebuffMul = 1; }
        }
        if (rt.specialFxTimer > 0) {
          rt.specialFxTimer -= delta;
          if (rt.specialFxTimer <= 0) { rt.specialFxTimer = 0; rt.specialFxKind = null; }
        }

        // スピード ⇔ コーナーのトレードオフ：基礎ペースは両ステータスの合計、
        // 直線かコーナーかでどちらが有利かが入れ替わる（滑らかに遷移させる）
        const basePace = (racer.totalStats.speed + racer.totalStats.cornering) * BASE_PACE_SCALE;
        const diff = racer.totalStats.speed - racer.totalStats.cornering;
        // corner系必殺技の発動中はコーナーでも直線並み（以上）の速度を維持する
        const targetSegMul = curSample.isCorner
          ? (rt.specialCornerTimer > 0 ? SPECIAL_CORNER_SEG_MUL : Math.max(SEG_MUL_FLOOR, 1 - diff * SPEED_CORNER_TRADEOFF))
          : Math.max(SEG_MUL_FLOOR, 1 + diff * SPEED_CORNER_TRADEOFF);
        rt.segMulSmooth += (targetSegMul - rt.segMulSmooth) * Math.min(1, delta * SEG_MUL_SMOOTH_RATE);

        // ラスト1周に入ったら一気に効いてくる「バテ／second wind」係数（逆転要素）。
        // 線形（直線的）に立ち上げることで、なだらかにではなくラップ切り替わりで
        // はっきり分かるように失速・巻き返しさせる
        const distanceTarget = TARGET_LAPS * Math.PI * 2;
        const raceFrac = Math.min(1, (rt.laps * Math.PI * 2 + rt.progress) / distanceTarget);
        const fatigueEase = Math.max(0, (raceFrac - FATIGUE_START_FRAC) / (1 - FATIGUE_START_FRAC));
        const staminaGap = racer.totalStats.stamina - STAMINA_BASELINE;
        const staminaMul = Math.max(
          STAMINA_MUL_SAFETY_FLOOR,
          Math.min(STAMINA_MUL_SAFETY_CEILING, 1 + staminaGap * STAMINA_EFFECT_COEF * fatigueEase)
        );

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

        const maxSpeed = basePace * rt.segMulSmooth * staminaMul * slopeMul * rt.eventMul * rt.specialBoostMul * rt.specialDebuffMul * GLOBAL_SPEED_SCALE;
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
          // 3周目（ラストラップ）に入った瞬間：最初にここへ来たマシンを基準に最下位を確定し、
          // 最下位マシン自身が3周目に入った瞬間はここで必殺技を抽選する
          if (rt.state === 'running' && rt.laps === SPECIAL_TRIGGER_LAP) {
            if (!slowestAssignedRef.current) {
              assignSlowestRole();
              slowestAssignedRef.current = true;
            }
            if (rt.isSlowest && !rt.specialRolled) {
              rt.specialRolled = true;
              if (Math.random() < SPECIAL_TRIGGER_CHANCE) {
                pendingSpecialsRef.current.push(i);
              }
            }
          }
        }

        const p = sampleCourse(courseId, rt.progress, window.innerWidth, window.innerHeight, mul);

        if (rt.state === 'running' && p.cornerRisk && rt.speed > 0.5 && rt.specialCornerTimer <= 0) {
          // しきい値自体はイベントで変動させない（絶好調中はそのぶん speed が
          // 伸びているので自然とコーナーが危なくなり、つまづき中は speed が
          // 落ちているぶん自然と安全になる＝同じセッティングでも結果が変わりうる）
          // corner系必殺技の発動中はコースアウト判定そのものを免除する（壁走り／ドリフト演出との整合）
          const stabilityLimit = (basePace * STABILITY_BASE_PACE_FRAC + racer.totalStats.cornering * STABILITY_CORNERING_BONUS + STABILITY_MIN) * GLOBAL_SPEED_SCALE;
          if (rt.speed > stabilityLimit) {
            rt.state = 'crashed';
          }
        }

        // 車体の上下動（サスペンションのバウンス。速度が上がるほど大きく速く揺れる）
        rt.bouncePhase += delta * (5 + rt.speed * 14);
        const bounceAmp = Math.min(4.5, 1 + rt.speed * 6);
        let bounceY = Math.sin(rt.bouncePhase) * bounceAmp;

        // コーナーでの姿勢変化（進行方向の接線角度に、コーナリング時のドリフト角を上乗せ）
        const leanTarget = p.isCorner ? LEAN_DIR * Math.min(14, rt.speed * 22) : 0;
        rt.leanAngle += (leanTarget - rt.leanAngle) * Math.min(1, delta * 8);
        // つまづき中は小刻みに車体が揺れる演出
        const stumbleJitter = rt.eventKind === 'stumble' ? Math.sin(rt.bouncePhase * 3) * 6 : 0;

        // マグナム（大ジャンプ→高速回転）とブロッケンG（ウイリー→叩きつけ）は
        // 必殺技発動の瞬間だけ通常の姿勢制御に上乗せしてジャンプ・追加回転させる
        let extraSpin = 0;
        if (rt.specialFxTimer > 0) {
          const fxElapsed = rt.specialFxTotal - rt.specialFxTimer;
          if (rt.specialFxKind === 'tornado') {
            const envelope = specialMotionEnvelope(fxElapsed, 1.2);
            bounceY -= envelope * 34;
            extraSpin = envelope * 720;
          } else if (rt.specialFxKind === 'hammer') {
            const envelope = specialMotionEnvelope(fxElapsed, 1.0);
            bounceY -= envelope * 26;
          }
        }

        const car = carRefs.current[i];
        if (car) {
          if (car.root) {
            car.root.style.left = `${p.x}px`;
            car.root.style.top = `${p.y}px`;
          }
          if (car.bounce) car.bounce.style.transform = `translateY(${bounceY}px)`;
          if (car.rotate) car.rotate.style.transform = `rotate(${p.angle + rt.leanAngle + stumbleJitter + extraSpin}deg)`;
          if (car.trail) {
            const speedRatio = maxSpeed > 0 ? rt.speed / maxSpeed : 0;
            // 絶好調中はトレイルを大きく明るく、つまづき中は小さく暗く見せて演出する
            const eventFlair = rt.eventKind === 'boost' ? 1.4 : rt.eventKind === 'stumble' ? 0.6 : 1;
            car.trail.style.opacity = `${Math.min(0.7, speedRatio * 0.6 * eventFlair)}`;
            car.trail.style.transform = `scale(${1 + speedRatio * 0.5 * eventFlair})`;
          }
          if (car.special) {
            const fxActive = rt.specialFxTimer > 0;
            const move = getSpecialMove(racer.setting.body);
            car.special.style.setProperty('--special-color', move.color);
            car.special.style.setProperty('--special-glow', move.glow);
            car.special.className = `mc-special${fxActive ? ` mc-special--active mc-special--${move.fxKey}` : ''}`;
            car.special.style.opacity = fxActive ? '1' : '0';
            // ブレード／針／壁走りのような進行方向依存の演出は、車体の向きに合わせて回転させる
            car.special.style.transform = `rotate(${p.angle + rt.leanAngle}deg)`;
          }
        }

        if (rt.state === 'crashed') {
          forceTick(t => t + 1); // re-render once so this car's shake class/badge reflect the crash
        }
      });

      // リーダーボード（DOM直接更新で頻繁な再レンダリングを回避）
      const distances = players.map((_, i) => runtimeRef.current[i].laps * Math.PI * 2 + runtimeRef.current[i].progress);
      const order = [...distances.keys()].sort((a, b) => distances[b] - distances[a]);
      const rankOf: number[] = new Array(players.length);
      order.forEach((racerIndex, rank) => {
        rankOf[racerIndex] = rank;
        if (rankRefs.current[racerIndex]) rankRefs.current[racerIndex]!.textContent = `${rank + 1}`;
        // 1位が左端になるよう表示順を入れ替える。各行の幅を固定してあるので、
        // 入れ替わってもリーダーボード全体の幅は変わらず、隣のタイマー等はぶれない
        if (rowRefs.current[racerIndex]) rowRefs.current[racerIndex]!.style.order = String(rank);
        const rt = runtimeRef.current[racerIndex];
        const lapEl = lapRefs.current[racerIndex];
        if (lapEl) {
          lapEl.textContent = rt.state === 'crashed' ? 'OUT' : rt.state === 'finished' ? 'FINISH' : `${Math.min(rt.laps + 1, TARGET_LAPS)}/${TARGET_LAPS}`;
        }
      });

      // 最下位以外のマシンは、自分が3週目に入った後で誰かに追い抜かれた（順位が悪化した）
      // 瞬間に一度だけ必殺技を抽選する
      players.forEach((_, i) => {
        const rt = runtimeRef.current[i];
        if (
          rt.state === 'running' && !rt.isSlowest && !rt.specialRolled &&
          rt.laps >= SPECIAL_TRIGGER_LAP && rankOf[i] > prevRankRef.current[i]
        ) {
          rt.specialRolled = true;
          if (Math.random() < SPECIAL_TRIGGER_CHANCE) {
            pendingSpecialsRef.current.push(i);
          }
        }
        prevRankRef.current[i] = rankOf[i];
      });

      // 抽選に成功したマシンがあれば、ここで必殺技の演出をキューから1件開始する
      // （発動した場合は演出が終わるまでゴール判定を持ち越す）
      processSpecialQueue();
      if (specialOverlayActiveRef.current) {
        animId = requestAnimationFrame(loop);
        return;
      }

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

      {/* ── HUD: TOP BAR（順位表示はタイマーの左に配置） ── */}
      <div className="race-topbar">
        <button onClick={onBackToGarage} className="race-back-btn">◀ ガレージ</button>
        <div className="race-topbar-right">
          <div className="race-leaderboard">
            {players.map((racer, i) => {
              const bodyName = PARTS.find(p => p.id === racer.setting.body)?.name ?? '';
              return (
                <div key={racer.id} ref={el => { rowRefs.current[i] = el; }} className="race-leaderboard-row">
                  <span className="race-leaderboard-rank" ref={el => { rankRefs.current[i] = el; }}>{i + 1}</span>
                  <span className="race-leaderboard-names">
                    <span className="race-leaderboard-name">{racer.name}{racer.isCPU && <span className="race-cpu-badge">🤖{racer.cpuLevel}</span>}</span>
                    <span className="race-leaderboard-machine">{bodyName}</span>
                  </span>
                  <span className="race-leaderboard-lap" ref={el => { lapRefs.current[i] = el; }}>1/{TARGET_LAPS}</span>
                </div>
              );
            })}
          </div>
          <div className="race-timer">
            <div className="race-hud-label">TIME</div>
            <div className="race-hud-value race-hud-value--gold">{formatTime(time)}</div>
          </div>
          <SoundToggle />
        </div>
      </div>

      {/* ── 必殺技演出：発動中はレース画面を止めて顔画像とセリフを大きく中央に表示 ── */}
      {activeSpecial && (
        <div
          className="race-overlay race-special-overlay"
          style={{ '--special-color': activeSpecial.move.color, '--special-glow': activeSpecial.move.glow } as React.CSSProperties}
        >
          <div className="race-special-flash" />
          <div className="race-special-content">
            <img src={activeSpecial.move.faceImage} alt="" className="race-special-face" />
            <div className="race-special-quote">{activeSpecial.move.quote}</div>
          </div>
        </div>
      )}

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
