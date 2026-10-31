import { useEffect, useRef, useState, useCallback } from 'react';
import wizardImg from './assets/beys/wizard.png';
import sharkImg from './assets/beys/shark.png';
import aeroImg from './assets/beys/aero.png';
import meteorImg from './assets/beys/meteor.png';
import cobaltImg from './assets/beys/cobalt.png';
import gloryImg from './assets/beys/glory.png';
import knight2Img from './assets/beys/knight2.png';

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

// ステータスは各パーツの数値の合計（パーツ表の値そのまま）
interface Stats { atk: number; def: number; sta: number; dash: number; burst: number }
const STAT_LABELS: [keyof Stats, string][] = [
  ['atk', '攻撃'], ['def', '防御'], ['sta', '持久'], ['dash', 'ダッシュ'], ['burst', 'バースト耐性'],
];
// バーの目盛り（この値で満タン）
const STAT_MAX: Record<keyof Stats, number> = { atk: 140, def: 80, sta: 140, dash: 40, burst: 90 };

interface PartDef {
  id: string; name: string; desc: string;
  s: Partial<Stats>; weight: number; height?: number; // 重量(g) / 高さ（ラチェットのみ）
  hid?: Partial<Stats>; // 隠れ性能：画面の数字は変えずに、バトルの計算だけ、この値に置き換える
  color?: string; blades?: number; img?: string;
  dashSpeed?: number; // Xダッシュの速さの倍率（現在はどのビットも等倍。R/LRはダッシュの回数だけが増える）
  steady?: number; // 当てられたときの飛ばされにくさ（小さいほど飛ばされにくい。姿勢保持・攻撃をかわす系のビット）
  exitResist?: number; // 場外（オーバー/エクストリーム）への出にくさの倍率
  mobility?: number; // 動き回りやすさ（R系は斜めシュートでも動く / Hは水平シュートでもあまり動かない）
  spinDir?: 1 | -1; // ブレードの回転方向（1=右回転、-1=左回転）。左回転は右回転のベイと当たると回転を吸収できる
  absorb?: number; // 左回転ブレードの回転吸収力（ビットとの組み合わせで決まる）
  burstMod?: number; // ブレードの形状によるバーストしやすさ（大きいほどバーストしにくい）
  smash?: number; // Xダッシュ中の打撃力の倍率（Eビットのスマッシュ攻撃）
  absorbBit?: number; // ビット側の回転吸収の得意さ
  integrated?: boolean; // ラチェット一体型のブレード（ラチェットは選べない。高さと重量はブレードのもの）
  syn?: { blades: string[]; good?: Partial<Stats>; bad?: Partial<Stats> }; // 相性のよいブレードに付けたときの隠れ補正 / それ以外に付けたときの隠れ補正（バトルの計算だけ）
  dashCost?: number; // Xダッシュで失う持久の倍率（Nrビット：スタミナロスを軽減）
  kick?: number; // 当たったとき、相手を弾く力の倍率（グローリーワルキューレ：スプリング内蔵の可動刃）
  burstFloor?: number; // ラチェット/ブレードがビットのバースト耐性を一定以上にそろえる（バトルの計算だけ）
  dashLimit?: [number, number]; // 1ラウンドでXダッシュできる回数の上限（最小〜最大からランダム）。Eビットは2〜3回
}
const BLADES: PartDef[] = [
  { id: 'meteor', name: 'メテオドラグーン', desc: '大型ラバー軸が搭載された3枚刃で、強烈な一撃を繰り出す。メタルが塗装され性能がアップしている。', s: { atk: 75, def: 15, sta: 35 }, weight: 39.0, color: '#c4b5fd', blades: 3, img: meteorImg, spinDir: -1, absorb: 0.45, burstMod: 1.5 },
  { id: 'cobalt', name: 'コバルトドラグーン', desc: '先端が分厚い4枚のアッパー刃による高い弾き性能を持った左回転ブレード。', s: { atk: 60, def: 15, sta: 25 }, weight: 37.9, color: '#3b82f6', blades: 4, img: cobaltImg, spinDir: -1, absorb: 1.0, burstMod: 1.0 },
  { id: 'wizard', name: 'ウィザードロッド', desc: '外重心かつ径の大きい5枚刃形状で、遠心力を生み出すことに特化した設計。', s: { atk: 15, def: 25, sta: 60 }, weight: 35.1, color: '#fbbf24', blades: 5, img: wizardImg },
  { id: 'aero', name: 'エアロペガサス', desc: '大型の3枚刃が高い打撃力を生む設計。メタルが二重に塗装され性能がアップしている。', s: { atk: 70, def: 30, sta: 35 }, weight: 38.7, color: '#38bdf8', blades: 3, img: aeroImg },
  { id: 'shark', name: 'シャークスケイル', desc: '打撃部位を複数備えた大型2枚刃で、低い位置からの強烈なアッパー攻撃に特化した設計。', s: { atk: 70, def: 15, sta: 15 }, weight: 37.3, color: '#8b5cf6', blades: 2, img: sharkImg },
  { id: 'glory', name: 'グローリーワルキューレ', desc: 'ラチェット一体型のブレード。スプリング内蔵の可動刃が攻撃時にバウンドし、反発力による強烈な弾き性能に特化。メタルが塗装され性能がアップしている。', s: { atk: 85, def: 35, sta: 25 }, weight: 43.5, height: 50, color: '#fde68a', blades: 4, img: gloryImg, integrated: true, kick: 1.25, burstFloor: 80 }, // 構造上ビットが抜けにくい：B/E/FB/Nrでもバーストしにくい
  { id: 'knight2', name: 'ナイトシールドV2', desc: '6枚の防御刃で衝撃を吸収しやすいダンパー構造を採用。', s: { atk: 22, def: 60, sta: 28 }, hid: { sta: 55 }, weight: 36.5, color: '#4ade80', blades: 6, img: knight2Img },
];
const RATCHETS: PartDef[] = [
  { id: 'r160', name: '1-60', desc: 'ベイを低めにセットするパーツ。攻撃性能に特化した1枚刃を採用。', s: { atk: 17, def: 9, sta: 4 }, height: 60, weight: 6.0 },
  { id: 'r170', name: '1-70', desc: 'ベイの高さを中位にセットするパーツ。攻撃性能に特化した1枚刃を採用。', s: { atk: 17, def: 6, sta: 7 }, height: 70, weight: 6.1 },
  { id: 'r360', name: '3-60', desc: 'ベイを低めにセットするパーツ。弾き性能の高い3枚刃を採用。', s: { atk: 15, def: 9, sta: 6 }, height: 60, weight: 6.3 },
  { id: 'r560', name: '5-60', desc: 'ベイを低くにセットするパーツ。分厚く遠心力に優れた5枚刃を採用。', s: { atk: 10, def: 9, sta: 11 }, height: 60, weight: 6.6 },
  { id: 'r760', name: '7-60', desc: 'ベイを低めにセットするパーツ。分厚く防御性能に優れた連打7枚刃を採用。', s: { atk: 8, def: 14, sta: 8 }, height: 60, weight: 7.2 },
  { id: 'r960', name: '9-60', desc: 'ベイを低めにセットするパーツ。連打に優れた9枚刃を採用。', s: { atk: 13, def: 10, sta: 7 }, hid: { sta: 12, atk: 8 }, height: 60, weight: 6.1 },
  { id: 'r965', name: '9-65', desc: 'ベイを低めにセットするパーツ。ビットのバースト耐性を一定にする構造によりブレが少ない、シンプルタイプのラチェット。連打に優れた9枚刃を採用。', s: { atk: 13, def: 10, sta: 7 }, height: 65, weight: 4.3, burstFloor: 50 },
];
const BITS: PartDef[] = [
  { id: 'E', name: 'E', desc: '大型のガイドが付いた設計で姿勢をキープしやすく、Xダッシュ時に軸先が浮き上がりスマッシュ攻撃が可能。', s: { atk: 30, def: 15, sta: 20, dash: 35, burst: 30 }, weight: 3.1, smash: 1.35, absorbBit: 1, dashLimit: [2, 3] },
  { id: 'B', name: 'B', desc: '球状の軸先による、程よい動きで攻撃をかわし高い持久力を実現。', s: { atk: 15, def: 25, sta: 50, dash: 10, burst: 30 }, weight: 2.1 },
  { id: 'FB', name: 'FB', desc: 'ラチェットに対してフリー回転するビット。細めで球状の軸先により回転のロスを減らす設計。', s: { atk: 10, def: 25, sta: 60, dash: 5, burst: 30 }, weight: 2.0 },
  { id: 'R', name: 'R', desc: '10枚歯ギヤでXダッシュの速度を抑える分、ダッシュ回数を増やす設計。', s: { atk: 40, def: 10, sta: 20, dash: 30, burst: 80 }, weight: 2.1, mobility: 1.8 },
  { id: 'LR', name: 'LR', desc: 'Rビットより1mm低く設計され、アッパー攻撃を得意とする。', s: { atk: 45, def: 5, sta: 15, dash: 35, burst: 80 }, weight: 2.0, mobility: 1.8 },
  { id: 'H', name: 'H', desc: '軸先側の6つの平面形状がベイの傾きを抑制し、常に安定した体勢を保持し続ける設計。', s: { atk: 30, def: 35, sta: 20, dash: 15, burst: 80 }, weight: 2.6, mobility: 0.45, steady: 0.92, exitResist: 1.1 },
  { id: 'L', name: 'L', desc: '3段階の高さを持つ軸先により、低速・中速・高速の3パターンの攻撃速度を実現。', s: { atk: 40, def: 5, sta: 15, dash: 40, burst: 80 }, weight: 2.7, syn: { blades: ['meteor', 'glory'], good: { atk: 20, sta: 5 }, bad: { atk: -20, sta: -10, dash: -10 } } },
  { id: 'Nr', name: 'Nr', desc: '細い球状の軸先で長く回り、10枚刃ギヤでXダッシュ時の速度を抑えスタミナロスを軽減する設計。', s: { atk: 15, def: 20, sta: 60, dash: 5, burst: 30 }, weight: 1.9, dashCost: 0.4, syn: { blades: ['wizard', 'knight2'], good: { sta: 20 } } },
  { id: 'K', name: 'K', desc: '角ばった軸先側面でスタジアム内を蹴り、連続攻撃やカウンター防御に繋がる動きを実現。', s: { atk: 35, def: 25, sta: 15, dash: 25, burst: 80 }, weight: 2.1 },
];

// ブレードの写真（背景を抜いた画像）。戦闘中・プレビューでこの画像を回して描く
const SPRITES: Record<string, HTMLImageElement> = {};
for (const bl of BLADES) {
  if (!bl.img) continue;
  const im = new Image();
  im.src = bl.img;
  SPRITES[bl.id] = im;
}

interface Custom { blade: string; ratchet: string; bit: string }
// バランス確認用：?me=blade,ratchet,bit &cpu=blade,ratchet,bit &speed=倍速（通常は使わない）
const urlParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
const urlCustom = (key: string): Custom | null => {
  const v = urlParams.get(key)?.split(',');
  return v && v.length === 3 ? { blade: v[0], ratchet: v[1], bit: v[2] } : null;
};
const DEFAULT_CUSTOM: Custom = { blade: 'shark', ratchet: 'r560', bit: 'B' };
const pick = (list: PartDef[], id: string) => list.find(p => p.id === id) ?? list[0];

const isInt = (c: Custom) => !!pick(BLADES, c.blade).integrated; // ラチェット一体型のブレードか

// 3on3の公式ルール：3体で同じパーツ（ブレード・ラチェット・ビット）を重ねて使えない
const KEYS = ['blade', 'ratchet', 'bit'] as const;
const LISTS: Record<(typeof KEYS)[number], PartDef[]> = { blade: BLADES, ratchet: RATCHETS, bit: BITS };
const shuffled = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
// 重複しているパーツを、まだ使っていないパーツに置き換える
function dedupeDeck(deck: Custom[]): Custom[] {
  const out = deck.map(c => ({ ...c }));
  for (const key of KEYS) {
    const used = new Set<string>();
    for (const c of out) {
      if (key === 'ratchet' && isInt(c)) continue; // 一体型はラチェットを使わない
      if (used.has(c[key])) {
        const free = LISTS[key].find(pt => !used.has(pt.id) && !out.some(o => o !== c && o[key] === pt.id && !(key === 'ratchet' && isInt(o))));
        if (free) c[key] = free.id;
      }
      used.add(c[key]);
    }
  }
  return out;
}
// 選んだパーツはそのまま、空欄（ランダム）は、重ならないようにランダムに決める
function randomDeck(sels: Custom[]): Custom[] {
  const out = sels.map(c => ({ ...c }));
  for (const key of KEYS) {
    const taken = new Set(out.filter(o => !(key === 'ratchet' && isInt(o))).map(o => o[key]).filter(Boolean));
    const pool = shuffled(LISTS[key].map(pt => pt.id).filter(id => !taken.has(id)));
    for (const o of out) if (!o[key]) o[key] = pool.pop() ?? LISTS[key][0].id;
  }
  return out;
}

const makeDefaultDeck = (): Custom[] => randomDeck([0, 1, 2].map(() => ({ blade: '', ratchet: '', bit: '' }))); // 重ならない3体

// パーツの数値を合計する（重量・高さも）
function calcStats(c: Custom, hidden = false) {
  const st: Stats = { atk: 0, def: 0, sta: 0, dash: 0, burst: 0 };
  const bl = pick(BLADES, c.blade), ra = pick(RATCHETS, c.ratchet), bit = pick(BITS, c.bit);
  const parts = bl.integrated ? [bl, bit] : [bl, ra, bit]; // ラチェット一体型のブレードは、ラチェットを使わない
  let weight = 0;
  for (const part of parts) {
    // hidden=true のときは、隠れ性能のあるパーツだけ、その値で計算する（バトル用）
    const src = hidden ? { ...part.s, ...part.hid } : part.s;
    const mul = hidden && RATCHETS.includes(part) ? 3 : 1; // ラチェットの数値はバトルの計算で3倍に効かせる
    for (const [k, v] of Object.entries(src)) st[k as keyof Stats] += (v as number) * mul;
    weight += part.weight;
  }
  if (hidden) {
    // ビットとブレードの相性（バトルの計算だけ）：Lはメテオドラグーン・グローリーワルキューレ向き、Nrは持久系のブレード向き
    if (bit.syn) {
      const adj = bit.syn.blades.includes(bl.id) ? bit.syn.good : bit.syn.bad;
      for (const [k, v] of Object.entries(adj ?? {})) st[k as keyof Stats] += v as number;
    }
    if (!bl.integrated && ra.burstFloor !== undefined) st.burst = Math.max(st.burst, ra.burstFloor);
    if (bl.burstFloor !== undefined) st.burst = Math.max(st.burst, bl.burstFloor);
  }
  return { st, weight: Math.round(weight * 10) / 10, height: bl.integrated ? bl.height ?? 50 : ra.height ?? 60, bit };
}

// 合計値 → バトル中の動きの係数（基準値の付近で1になる）
const norm = (v: number, ref: number, k: number) => Math.max(0.3, 1 + k * (v / ref - 1));

function buildBey(c: Custom) {
  const bl = pick(BLADES, c.blade), { st, weight, height, bit } = calcStats(c);
  const ef = calcStats(c, true).st; // バトルの計算用（隠れ性能を含む）。画面には st を出す
  return {
    name: bl.integrated ? `${bl.name} ${c.bit}` : `${bl.name} ${pick(RATCHETS, c.ratchet).name} ${c.bit}`,
    color: bl.color ?? '#f59e0b', blades: bl.blades ?? 3, sprite: SPRITES[bl.id] ?? null,
    stats: st, weight, height,
    atk: norm(ef.atk, 90, 1.0), // 与ダメージ・弾き飛ばす力
    def: norm(ef.def, 55, 0.45), // 被スピンダメージの軽減
    decay: 0.85 / norm(ef.sta, 90, 0.6), // 持久が高いほど回転が減りにくい
    mass: (weight / 45) ** 2 * (60 / height), // 重いほど、ラチェットが低いほど、飛ばされにくい
    burstRes: norm(ef.burst, 55, 0.35) * (1 + ((bl.burstMod ?? 1) - 1) * (bit.id === 'E' ? 1 : 0.3)), // ブレードの形状による差は、Eビットのときに大きく出る // バースト耐性（ビットの値）
    dash: bit.dashSpeed ?? 1, // Xダッシュの速さ
    dashCost: bit.dashCost ?? 1, // Xダッシュで失う持久の倍率
    kick: bl.kick ?? 1, // 相手を弾く力の倍率
    smash: bit.smash ?? 1, // Eビット：Xダッシュ中の打撃力
    dashLimit: bit.dashLimit ?? null,
    spinDir: bl.spinDir ?? 1, // 左回転ブレードは -1
    absorb: (bl.absorb ?? 0) * (bit.absorbBit ?? 0.25), // 左回転の回転吸収力（Eビットで大きく発揮される）
    mobility: bit.mobility ?? 1,
    steady: bit.steady ?? 1,
    exitResist: bit.exitResist ?? 1,
    dashCd: Math.min(4, Math.max(0.5, 20 / ef.dash)), // ダッシュ値が高いほど、ダッシュ回数が増える
  };
}

// バトルで使うベイ（スタート時に、カスタマイズ内容から作り直す）
const TYPES: Record<BeyType, ReturnType<typeof buildBey>> = { me: buildBey(DEFAULT_CUSTOM), cpu: buildBey(DEFAULT_CUSTOM) };

// ---------------- トーナメント ----------------
type Style = 'power' | 'technique' | 'attacker' | 'stamina' | 'defense' | 'absorb' | 'dasher' | 'balance' | 'wild';
// タイプごとに使うパーツの傾向（3体で同じパーツは重ならない）
const STYLE_POOLS: Record<Style, { blade: string[]; ratchet: string[]; bit: string[] } | null> = {
  attacker: { blade: ['aero', 'shark', 'glory', 'meteor'], ratchet: ['r160', 'r170', 'r360'], bit: ['LR', 'R', 'K', 'L', 'E'] },
  stamina: { blade: ['wizard', 'knight2', 'shark'], ratchet: ['r960', 'r965', 'r760'], bit: ['B', 'FB', 'Nr'] },
  defense: { blade: ['knight2', 'wizard', 'aero'], ratchet: ['r760', 'r560', 'r960'], bit: ['H', 'B', 'FB'] },
  absorb: { blade: ['cobalt', 'meteor', 'glory'], ratchet: ['r960', 'r760', 'r560'], bit: ['E', 'L', 'LR'] },
  dasher: { blade: ['aero', 'shark', 'glory'], ratchet: ['r760', 'r360', 'r960'], bit: ['R', 'LR', 'K'] },
  power: { blade: ['glory', 'meteor', 'aero'], ratchet: ['r160', 'r360', 'r170'], bit: ['L', 'E', 'LR'] },
  technique: { blade: ['shark', 'aero', 'wizard'], ratchet: ['r760', 'r360', 'r560'], bit: ['R', 'LR', 'B'] },
  balance: null, wild: null,
};
function buildRosterDeck(style: Style): Custom[] {
  const pool = STYLE_POOLS[style];
  const sels: Custom[] = [0, 1, 2].map(() => ({ blade: '', ratchet: '', bit: '' }));
  if (!pool) return randomDeck(sels);
  for (const key of KEYS) {
    const ids = shuffled(pool[key]);
    sels.forEach((c, i) => { c[key] = ids[i % ids.length]; });
  }
  return dedupeDeck(sels);
}
// 32人のCPUキャラクター（名前・タイプ・デッキ）
const ROSTER_DEF: [string, Style, string][] = [
  ['ハヤテ', 'power', '豪腕シュートの暴風雨'], ['ソウマ', 'power', '一撃必殺の剛腕'], ['レオ', 'power', '獅子の咆哮シューター'], ['ゴウ', 'power', 'パワー全開、ブレーキなし'],
  ['ミナト', 'technique', '逆転の貴公子'], ['シズク', 'technique', '一滴で流れを変える男'], ['リョウ', 'technique', '寸分たがわぬ職人芸'], ['アヤメ', 'technique', '舞うように決める華麗な技'],
  ['カイト', 'attacker', 'アタック一筋15年'], ['ライガ', 'attacker', '雷鳴のフルアタック'], ['ジン', 'attacker', '攻めて攻めて攻めまくる'], ['ツバサ', 'attacker', '空を裂くアタッカー'],
  ['ヤマト', 'stamina', '回り続ける不動の山'], ['コハク', 'stamina', '琥珀のスタミナ王'], ['ナギ', 'stamina', '凪のごとく静かに粘る'], ['サクヤ', 'stamina', '最後まで立っている男'],
  ['タクミ', 'defense', '鉄壁の守護神'], ['ダイチ', 'defense', '大地のごとき安定感'], ['ミオ', 'defense', '傷つかない盾'],
  ['アスカ', 'absorb', '回転を食らう逆回転使い'], ['イオリ', 'absorb', '左回転の魔術師'], ['カナタ', 'absorb', '彼方へ奪い去る吸収の達人'],
  ['ホノカ', 'dasher', '炎のXダッシュ連打'], ['トウマ', 'dasher', '加速する閃光'], ['レイジ', 'dasher', '何度でも駆け抜ける男'],
  ['ユイ', 'balance', '万能のオールラウンダー'], ['ソラ', 'balance', 'どんな相手にも対応する天才'], ['ハルカ', 'balance', '安定感ナンバーワン'], ['ケンシン', 'balance', '研ぎ澄まされた中庸'],
  ['ガク', 'wild', '気まぐれ天才肌'], ['ミヤビ', 'wild', '読めない男'], ['リク', 'wild', '予測不能のトリックスター'],
];
const ROSTER = ROSTER_DEF.map(([name, style, catchphrase]) => ({ name, style, catchphrase, deck: buildRosterDeck(style) }));

interface Entrant { id: number; name: string; catchphrase?: string; human: boolean; style?: Style; deck: Custom[] }
const fullName = (e: Entrant) => (e.catchphrase ? `「${e.catchphrase}」${e.name}` : e.name); // キャッチコピー付きの名前
interface TMatch { a: number | null; b: number | null; winner: number | null; score: string }
interface Tour { entrants: Entrant[]; rounds: TMatch[][]; fmt: '1v1' | '3v3'; cur: { r: number; i: number } | null; champion: number | null }

function createTour(entrants: Entrant[], fmt: '1v1' | '3v3'): Tour {
  const n = entrants.length;
  let size = 2;
  while (size < n) size *= 2;
  const ids = shuffled(entrants.map(e => e.id));
  const slots: (number | null)[] = Array(size).fill(null);
  const half = size / 2;
  for (let m = 0; m < half; m++) slots[2 * m] = ids[m]; // 各試合に1人ずつ置いてから、残りを対戦相手にする（不戦勝を均等にばらす）
  for (let k = 0; k < n - half; k++) slots[2 * k + 1] = ids[half + k];
  const first: TMatch[] = Array.from({ length: half }, (_, m) => ({ a: slots[2 * m], b: slots[2 * m + 1], winner: null, score: '' }));
  return { entrants, rounds: [first], fmt, cur: null, champion: null };
}

// CPU同士の試合は、ベイの数値から自動で決着をつける
function simulateCpuMatch(A: Entrant, B: Entrant): { aWins: boolean; score: string } {
  const rate = (c: Custom, style?: Style) => {
    const b = buildBey(c);
    return 0.9 * b.atk + 0.6 * b.def + 0.9 / b.decay + 0.35 * b.burstRes + 0.4 * b.mass + (style === 'technique' ? 0.2 : style === 'power' ? 0.15 : 0);
  };
  const ra = A.deck.map(c => rate(c, A.style)), rb = B.deck.map(c => rate(c, B.style));
  let pa = 0, pb = 0, idx = 0;
  while (pa < 4 && pb < 4) {
    const p = 1 / (1 + Math.exp(-(ra[idx % ra.length] - rb[idx % rb.length]) * 1.6));
    const roll = Math.random(), pts = roll < 0.25 ? 1 : roll < 0.8 ? 2 : 3; // スピン1 / オーバー・バースト2 / エクストリーム3
    if (Math.random() < p) pa += pts; else pb += pts;
    idx++;
  }
  return { aWins: pa >= 4, score: `${pa}-${pb}` };
}

// CPU同士・不戦勝を自動で進め、プレイヤーが出る試合（または優勝）まで進める
function settleTour(t: Tour) {
  t.cur = null;
  for (;;) {
    const r = t.rounds.length - 1, round = t.rounds[r];
    for (let i = 0; i < round.length; i++) {
      const m = round[i];
      if (m.winner !== null) continue;
      if (m.a === null || m.b === null) { m.winner = m.a ?? m.b; continue; }
      const A = t.entrants[m.a], B = t.entrants[m.b];
      if (A.human || B.human) { t.cur = { r, i }; return; }
      const res = simulateCpuMatch(A, B);
      m.winner = res.aWins ? m.a : m.b;
      m.score = res.score;
    }
    if (round.length === 1) { t.champion = round[0].winner; return; }
    const next: TMatch[] = [];
    for (let i = 0; i < round.length; i += 2) next.push({ a: round[i].winner, b: round[i + 1].winner, winner: null, score: '' });
    t.rounds.push(next);
  }
}
const roundLabel = (len: number, r: number) => (len === 1 ? '決勝' : len === 2 ? '準決勝' : `${r + 1}回戦`);

// トーナメント表：左右から勝ち上がって、中央が優勝（人数は2〜32人。足りない席は不戦勝）
function BracketView({ t }: { t: Tour }) {
  const size = t.rounds[0].length * 2;
  const R = Math.round(Math.log2(size)); // ラウンド数
  const cw = 124, gap = 28, rh = 28, vg = 8, padX = 32, topPad = 150, centerW = 210;
  const halfW = R * (cw + gap) - gap;
  const totalW = 2 * padX + 2 * halfW + centerW;
  const rows = size / 2;
  const totalH = Math.max(topPad + rows * (rh + vg) + 24, topPad + (rh + vg) * (rows / 2) + 230); // 順位の欄が収まる高さ
  const xL = (c: number) => padX + c * (cw + gap);
  const xR = (c: number) => totalW - padX - cw - c * (cw + gap);
  const memo: Record<string, number> = {};
  const yOf = (c: number, k: number): number => {
    const key = `${c}-${k}`;
    if (memo[key] !== undefined) return memo[key];
    const v = c === 0 ? topPad + k * (rh + vg) : (yOf(c - 1, 2 * k) + yOf(c - 1, 2 * k + 1)) / 2;
    return (memo[key] = v);
  };
  const short = (id: number) => t.entrants[id].name;
  // 列 c の j 番目の席にいる参加者（null=不戦勝/まだ決まっていない）
  const seat = (c: number, j: number): { id: number | null; bye: boolean } => {
    if (c === 0) {
      const m = t.rounds[0][Math.floor(j / 2)];
      const id = j % 2 === 0 ? m.a : m.b;
      return { id, bye: id === null };
    }
    const prev = t.rounds[c - 1]?.[j];
    return { id: prev ? prev.winner : null, bye: false };
  };
  const yF = yOf(R - 1, 0) + rh / 2; // 決勝の線の高さ
  const lines: string[] = [];
  for (let c = 1; c < R; c++) {
    const cnt = size / 2 ** (c + 1);
    for (let k = 0; k < cnt; k++) {
      const yp = yOf(c, k) + rh / 2, y1 = yOf(c - 1, 2 * k) + rh / 2, y2 = yOf(c - 1, 2 * k + 1) + rh / 2;
      // 左側
      let x1 = xL(c - 1) + cw, xm = x1 + gap / 2, xp = xL(c);
      lines.push(`M${x1} ${y1}H${xm}V${y2}H${x1}M${xm} ${yp}H${xp}`);
      // 右側（鏡写し）
      x1 = xR(c - 1); xm = x1 - gap / 2; xp = xR(c) + cw;
      lines.push(`M${x1} ${y1}H${xm}V${y2}H${x1}M${xm} ${yp}H${xp}`);
    }
  }
  lines.push(`M${padX + halfW} ${yF}H${totalW - padX - halfW}`);
  const cur = t.cur;
  const cell = (c: number, k: number, right: boolean) => {
    const cnt = size / 2 ** (c + 1);
    const j = right ? cnt + k : k;
    const { id, bye } = seat(c, j);
    const m = t.rounds[c]?.[Math.floor(j / 2)];
    const isCur = !!cur && cur.r === c && Math.floor(j / 2) === cur.i;
    const won = id !== null && !!m && m.winner === id;
    const lost = id !== null && !!m && m.winner !== null && m.winner !== id;
    return (
      <div key={`${right ? 'R' : 'L'}${c}-${k}`} style={{
        position: 'absolute', left: right ? xR(c) : xL(c), top: yOf(c, k), width: cw, height: rh, boxSizing: 'border-box',
        border: `2px solid ${isCur ? '#e6a800' : '#2b2b2b'}`, background: isCur ? '#fff7d6' : '#fff', borderRadius: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
        fontWeight: won ? 900 : 700, fontSize: 13, color: id === null ? '#9a9a9a' : t.entrants[id].human ? '#1d4ed8' : '#111',
        textDecoration: lost ? 'line-through' : 'none', opacity: lost ? 0.55 : 1,
      }}>
        <span style={{ maxWidth: cw - 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{id !== null ? short(id) : bye ? <i style={{ fontSize: 11 }}>BYE</i> : ''}</span>
        {c === 0 && (
          <span style={{ position: 'absolute', [right ? 'right' : 'left']: -27, top: -2, width: 20, height: rh, background: '#a9d11a', color: '#222', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}>{j + 1}</span>
        )}
      </div>
    );
  };
  const cells: React.ReactNode[] = [];
  for (let c = 0; c < R; c++) {
    const cnt = size / 2 ** (c + 1);
    for (let k = 0; k < cnt; k++) { cells.push(cell(c, k, false)); cells.push(cell(c, k, true)); }
  }
  // 順位（1位=優勝、2位=決勝の負け、3位/4位=準決勝の負け）
  const loser = (m?: TMatch) => (m && m.winner !== null ? (m.a === m.winner ? m.b : m.a) : null);
  const finalM = t.rounds[R - 1]?.[0];
  const second = loser(finalM);
  const semi = R >= 2 ? (t.rounds[R - 2] ?? []).map(loser).filter((x): x is number => x !== null) : [];
  const cx = totalW / 2;
  const avail = Math.min(typeof window === 'undefined' ? 1200 : window.innerWidth - 24, 1500);
  const k = Math.min(1, avail / totalW);
  return (
    <div style={{ width: totalW * k, height: totalH * k, margin: '0 auto' }}>
      <div style={{ position: 'relative', width: totalW, height: totalH, transform: `scale(${k})`, transformOrigin: 'top left', background: '#f1f1ee', borderRadius: 10, color: '#111' }}>
        <div style={{ position: 'absolute', top: 10, left: 0, width: totalW, textAlign: 'center', fontWeight: 900, fontSize: 22, letterSpacing: 3, color: '#1a1a1a' }}>TOURNAMENT</div>
        <svg width={totalW} height={totalH} style={{ position: 'absolute', left: 0, top: 0 }}>
          {lines.map((d, i) => <path key={i} d={d} stroke="#555" strokeWidth={2} fill="none" />)}
          {/* トロフィー */}
          <g transform={`translate(${cx - 34} ${Math.max(44, yF - 118)})`} fill="#e6b422" stroke="#7a5a00" strokeWidth={2}>
            <path d="M8 4h52v18c0 16-10 28-26 28S8 38 8 22z" />
            <path d="M8 10H0c0 14 6 22 16 24M60 10h8c0 14-6 22-16 24" fill="none" />
            <rect x="28" y="50" width="12" height="16" />
            <rect x="16" y="66" width="36" height="9" rx="2" />
          </g>
        </svg>
        <div style={{ position: 'absolute', left: cx - 80, top: yF + 14, width: 160, textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 2, color: '#7a5a00' }}>WINNER</div>
          <div style={{
            marginTop: 2, height: 32, border: '3px solid #d4a300', background: '#fffbe0', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 15, color: t.champion !== null && t.entrants[t.champion].human ? '#1d4ed8' : '#111',
          }}>{t.champion !== null ? short(t.champion) : ''}</div>
          <div style={{ marginTop: 12, textAlign: 'left', fontSize: 12, fontWeight: 700, lineHeight: 1.7 }}>
            <div>1st　{t.champion !== null ? short(t.champion) : ''}</div>
            <div>2nd　{second !== null ? short(second) : ''}</div>
            <div>3rd　{semi[0] !== undefined ? short(semi[0]) : ''}</div>
            <div>4th　{semi[1] !== undefined ? short(semi[1]) : ''}</div>
          </div>
        </div>
        {cells}
      </div>
    </div>
  );
}

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
  dir: 1 | -1; // 回転方向（1=右回転、-1=左回転）
  curl: number; dashT: number; dashCd: number; dashFx: number;
  trail: { x: number; y: number }[];
  out: boolean; dead: boolean;
  holdT: number; // 斜めシュート：その場にとどまる残り時間
  riding: boolean; rideT: number; // Xライン（リング）に乗って走行中
  ax: number; ay: number; push: number; // 走らせる向きと、斜めシュートで動き出すときの勢い
  knockT: number; // 相手に当てられて飛ばされた直後の時間（この間に壁へ当たると持久が削られる。自分でぶつかったときは削れない）
  hit: boolean; // 動き出す前に当てられたか（当てられたら矢印の向きではなく、弾かれた向きに進む）
  rideChance: number; onRing: boolean; // 斜めシュートはリングに乗りにくい
  dashesLeft: number; // 残りXダッシュ回数（Eビットは2〜3回まで）
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
function defaultAim(x: number, y: number, dir: 1 | -1 = 1) {
  const d = Math.hypot(x, y) || 1;
  const ux = (y / d) * 0.9 * dir + (x / d) * 0.45, uy = (-x / d) * 0.9 * dir + (y / d) * 0.45;
  const l = Math.hypot(ux, uy) || 1;
  return { x: ux / l, y: uy / l };
}

// 水平シュート：すぐにリングへ向かいエクストリームダッシュ / 斜めシュート：その場でほんの少し動きながらとどまり、それから動き出す（その間は飛ばされにくい）
// power(0〜1)：発射時のゲージで決まる。回転数と飛び出しの勢いに効く
function makeBey(type: BeyType, x: number, y: number, diag: boolean, aim: { x: number; y: number } | null, power: number): Bey {
  const spinMax = 3000 * (0.6 + 0.4 * power);
  const a = aim ?? defaultAim(x, y, TYPES[type].spinDir);
  const mob = TYPES[type].mobility;
  const sp = (700 + 500 * power) * Math.min(1, mob); // Hは水平に打ってもあまり飛び出さない
  return {
    type, x, y, vx: diag ? 0 : a.x * sp, vy: diag ? 0 : a.y * sp,
    spin: spinMax, spinMax, burst: 0, angle: 0,
    dir: TYPES[type].spinDir, curl: 1.1 * TYPES[type].spinDir, dashT: 0, dashCd: 0, dashFx: 0, trail: [], out: false, dead: false,
    // 斜め：その場にとどまる（R系は短く、よく動く） / Hは水平でも少しとどまる
    holdT: diag ? (mob > 1 ? 0.8 : 1.4) : mob < 1 ? 0.5 * (1 - mob) : 0, riding: false, rideT: 0,
    ax: a.x, ay: a.y, push: (130 + 140 * power) * (mob > 1 ? 1.3 : 1),
    knockT: 0, hit: false, rideChance: diag ? 0.4 : 1, onRing: false,
    dashesLeft: TYPES[type].dashLimit ? TYPES[type].dashLimit![0] + Math.floor(Math.random() * (TYPES[type].dashLimit![1] - TYPES[type].dashLimit![0] + 1)) : Infinity,
  };
}

// 高速回転のベイは止まって見えるほど速く回っているので、残像（ブラー）で描く。回転が落ちると羽根がはっきり見えてくる
function drawBey(ctx: CanvasRenderingContext2D, color: string, ring: string, angle: number, ratio: number, cap: string, nBlades = 3, sprite: HTMLImageElement | null = null, dir: 1 | -1 = 1, showRing = true) {
  const useSprite = !!sprite && sprite.complete && sprite.naturalWidth > 0;
  // 回転が落ちてくるとふらつく
  if (ratio > 0.001 && ratio < 0.3) {
    const t = performance.now(), A = (0.3 - ratio) * 14;
    ctx.translate(Math.cos(t * 0.03) * A, Math.sin(t * 0.04) * A);
  }
  if (showRing) { // 対戦中は、どちらのベイか分かるように青（自分）/赤（CPU）の線を付ける
    ctx.strokeStyle = ring; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, BEY_R + 4, 0, Math.PI * 2); ctx.stroke();
  }
  const blades = () => {
    if (useSprite) { const sz = BEY_R * 2.15; ctx.drawImage(sprite!, -sz / 2, -sz / 2, sz, sz); return; }
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
  if (!useSprite) { ctx.beginPath(); ctx.arc(0, 0, BEY_R * 0.95, 0, Math.PI * 2); ctx.fill(); } // ぼやけた円盤
  ctx.restore();
  const sweep = 2.4 * Math.pow(ratio, 1.5); // 回転が速いほど残像が長い。落ちてくると羽根がはっきり見える
  ctx.save();
  ctx.rotate(angle);
  ctx.fillStyle = color;
  const baseAlpha = ctx.globalAlpha;
  for (let k = 0; k < 8 && sweep > 0.05; k++) {
    ctx.save(); ctx.rotate(-dir * (k / 8) * sweep); ctx.globalAlpha = baseAlpha * (0.38 - k * 0.04); blades(); ctx.restore();
  }
  ctx.globalAlpha = baseAlpha * (0.5 + 0.45 * (1 - Math.min(1, ratio / 0.5)));
  blades();
  ctx.restore();
  if (useSprite) return; // 写真には中心のエンブレムも入っている
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
  const [phase, setPhase] = useState<'top' | 'select' | 'order' | 'tbracket' | 'tchamp' | 'launch' | 'count' | 'battle' | 'result' | 'over'>('top');
  const [shotMode, setShotMode] = useState<'flat' | 'diag'>('flat');
  const [hasDrop, setHasDrop] = useState(false);
  const [mySide, setMySide] = useState<'left' | 'right'>('left'); // 自分が立つ側（左の人は左半分、右の人は右半分にしか落とせない）
  const [count, setCount] = useState<number | null>(null);
  // 対戦モード：1on1 / 3on3（3体のデッキ。順番を決めて、どちらかが4ポイント取るまで）
  const [mode, setMode] = useState<'1v1' | '3v3'>('1v1');
  const [gameMode, setGameMode] = useState<'versus' | 'tournament'>('versus'); // トップページ：通常の対戦 / トーナメント
  const [oppView, setOppView] = useState<'show' | 'hide'>('show'); // CPU対戦：相手の落とす位置を見せるか
  const [tCpu, setTCpu] = useState(7); // トーナメント：CPUの数（0〜32）
  const [tHumans, setTHumans] = useState(1); // トーナメント：プレイヤーの数（0〜32）
  const [vs, setVs] = useState<'cpu' | '2p'>('cpu'); // 対戦相手：CPU / 2人対戦
  // プレイヤーごとのデッキ（3体）。0=プレイヤー1、1=プレイヤー2、…（トーナメントは最大32人）
  const [decks, setDecks] = useState<Custom[][]>(() => Array.from({ length: 32 }, (_, i) =>
    i === 0 ? [urlCustom('me') ?? DEFAULT_CUSTOM, { blade: 'aero', ratchet: 'r360', bit: 'R' }, { blade: 'wizard', ratchet: 'r960', bit: 'FB' }]
    : i === 1 ? [{ blade: 'cobalt', ratchet: 'r160', bit: 'E' }, { blade: 'meteor', ratchet: 'r760', bit: 'LR' }, { blade: 'shark', ratchet: 'r360', bit: 'H' }]
    : makeDefaultDeck()));
  const [playerNames, setPlayerNames] = useState<string[]>(() => Array(32).fill('')); // プレイヤーの名前（空欄なら初期の名前）
  const customs = decks[0];
  const customs2 = decks[1];
  const [who, setWho] = useState(0); // カスタマイズ中のプレイヤー
  const [slot, setSlot] = useState(0); // カスタマイズ中のベイ（3on3は 0〜2）
  const curDeck = decks[who];
  const custom = curDeck[slot];
  const setCustom = (f: (c: Custom) => Custom) => setDecks(ds => ds.map((d, i) => (i === who ? d.map((c, j) => (j === slot ? f(c) : c)) : d)));
  const [names, setNames] = useState<{ me: string; cpu: string } | null>(null); // トーナメントの試合中の名前
  const defaultName = (k: number) => (gameMode === 'versus' ? (vs === 'cpu' ? 'あなた' : `プレイヤー${k + 1}`) : `プレイヤー${k + 1}`);
  const playerName = (k: number) => playerNames[k].trim() || defaultName(k);
  const nameMe = names?.me ?? playerName(0);
  const nameCpu = names?.cpu ?? (vs === '2p' ? playerName(1) : 'CPU');
  const namesRef = useRef({ me: 'あなた', cpu: 'CPU' });
  namesRef.current = { me: nameMe, cpu: nameCpu };
  const tourRef = useRef<Tour | null>(null);
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);
  const tourMatchRef = useRef<{ r: number; i: number; meId: number; cpuId: number } | null>(null);
  const cpuStyleRef = useRef<Style | undefined>(undefined); // トーナメント：CPUのタイプ（打ち方に反映）
  const [placeStep, setPlaceStep] = useState(0); // トーナメントの2人対戦：順番に場所を決める（0=左, 1=右, 2=完了）。相手には見えない
  const placeStepRef = useRef(0);
  placeStepRef.current = placeStep;
  const seq = gameMode === 'tournament' && vs === '2p';
  const seqRef = useRef(false);
  seqRef.current = seq;
  const [orderWho, setOrderWho] = useState<0 | 1>(0); // 2人対戦の3on3：順番を決めているプレイヤー
  const [hasDrop2, setHasDrop2] = useState(false); // 2人対戦：プレイヤー2が場所を決めたか
  const [shotMode2, setShotMode2] = useState<'flat' | 'diag'>('flat');
  const [, setCpuCustom] = useState<Custom>(DEFAULT_CUSTOM); // 再描画用（中身は TYPES.cpu に入る）
  const [cpuSels, setCpuSels] = useState<Custom[]>([0, 1, 2].map(() => ({ blade: '', ratchet: '', bit: '' }))); // CPUのパーツ選択（空 = ランダム）
  const [deck, setDeck] = useState<{ me: Custom[]; cpu: Custom[] }>({ me: [], cpu: [] }); // この対戦で使う3体（1on1は1体）
  const [orderPick, setOrderPick] = useState<number[]>([]); // 順番決めの途中
  const [order, setOrder] = useState<number[]>([]); // 自分の出す順番（deck.me の番号）
  const cpuOrderRef = useRef<number[]>([0, 1, 2]);
  const vsRef = useRef<'cpu' | '2p'>('cpu');
  const hideOppRef = useRef(false); // 相手の落とす位置を隠す（CPU対戦の設定 / トーナメント）
  const mode2Ref = useRef<'flat' | 'diag'>('flat');
  const aim2Ref = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef<0 | 1>(0); // ドラッグで向きを決めているプレイヤー
  const [roundIdx, setRoundIdx] = useState(0); // 3体のうち何戦目か
  const [cycle, setCycle] = useState(0); // 3体使い切って順番を決め直した回数
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
  const cpuPlanRef = useRef<{ x: number; y: number; diag: boolean; aim: { x: number; y: number }; power?: number } | null>(null);
  const countTimers = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  const flashRef = useRef(0);
  const endedRef = useRef(false);
  const scoreRef = useRef({ me: 0, cpu: 0 });
  const timerRef = useRef<number | undefined>(undefined);
  phaseRef.current = phase;
  modeRef.current = shotMode;
  vsRef.current = vs;
  hideOppRef.current = (vs === 'cpu' && oppView === 'hide') || gameMode === 'tournament';
  mode2Ref.current = shotMode2;
  sideRef.current = mySide;

  // CPUは自分の半分の中で、毎回ちがう場所・シュートの仕方・向きで落とす（ラウンド開始時に決まり、向きを決めるときから見える）
  const planCpu = (style?: Style) => {
    const cpuSx = sideRef.current === 'left' ? 1 : -1; // 自分と反対側
    const lim = R - BEY_R - 8, m = BEY_R + 8;
    const dir = TYPES.cpu.spinDir;
    const clampPos = (x: number, y: number) => { // 自陣の半分の中に収める
      const ax = Math.min(Math.max(x * cpuSx, m), lim);
      const maxY = Math.sqrt(Math.max(0, lim * lim - ax * ax));
      return { x: ax * cpuSx, y: Math.max(-maxY, Math.min(maxY, y)) };
    };
    // リングに乗って、できるだけ早く上側からXダッシュできる出発点（技巧派）
    const ringStart = () => {
      let best = 0, bestD = 1e9;
      for (let deg = 0; deg < 360; deg += 5) {
        if (Math.cos((deg * Math.PI) / 180) * R * 0.86 * cpuSx < m) continue;
        const d = dir === 1 ? (((deg + 90) % 360) + 360) % 360 : (((-90 - deg) % 360) + 360) % 360;
        if (d < bestD) { bestD = d; best = deg; }
      }
      const th = ((best + (Math.random() - 0.5) * 10) * Math.PI) / 180;
      return clampPos(Math.cos(th) * R * 0.86, Math.sin(th) * R * 0.86);
    };
    const randPos = (r0: number, r1: number) => {
      const rr = (r0 + (r1 - r0) * Math.random()) * lim;
      const phi = (Math.random() - 0.5) * Math.PI * 0.92; // 自陣の半分の中の角度
      return clampPos(cpuSx * Math.cos(phi) * rr, Math.sin(phi) * rr);
    };
    const toOpp = (x: number, y: number) => { // 相手側の半分の中央へ
      const dx = -cpuSx * R * 0.45 - x, dy = -y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };
    if (style && style !== 'balance' && style !== 'wild') {
      // タイプごとの打ち方
      if (style === 'technique' || style === 'dasher') {
        const pos = style === 'technique' ? ringStart() : randPos(0.7, 0.9);
        return { ...pos, diag: false, aim: defaultAim(pos.x, pos.y, dir), power: style === 'technique' ? 0.9 : 0.85 };
      }
      if (style === 'attacker' || style === 'power') {
        const pos = randPos(0.55, 0.9);
        const aim = Math.random() < 0.5 ? toOpp(pos.x, pos.y) : defaultAim(pos.x, pos.y, dir);
        return { ...pos, diag: false, aim, power: style === 'power' ? 1.0 : 0.9 }; // シュートパワー型は最大の勢い
      }
      if (style === 'stamina') { // 持久型：その場にとどまって回転を温存する
        const pos = randPos(0.05, 0.4);
        return { ...pos, diag: true, aim: defaultAim(pos.x, pos.y, dir), power: 0.8 };
      }
      if (style === 'defense') {
        const pos = randPos(0.2, 0.6);
        return { ...pos, diag: Math.random() < 0.7, aim: defaultAim(pos.x, pos.y, dir), power: 0.8 };
      }
      if (style === 'absorb') { // 回転吸収使い：右回転の相手に当たりにいく
        const pos = randPos(0.3, 0.7);
        return { ...pos, diag: Math.random() < 0.3, aim: toOpp(pos.x, pos.y), power: 0.85 };
      }
    }
    const diag = Math.random() < (cpuLastMode.current === 'diag' ? 0.3 : 0.7); // 前回と違うほうを選びやすい
    cpuLastMode.current = diag ? 'diag' : 'flat';
    const { x, y } = randPos(diag ? 0.12 : 0.55, diag ? 0.72 : 0.9);
    // 向き：リングをたどる向き / 相手側へ / ランダム、のどれか
    const roll = Math.random();
    let aim: { x: number; y: number };
    if (roll < 0.35) {
      const a0 = defaultAim(x, y, dir), rot = (Math.random() - 0.5) * 1.2;
      aim = { x: a0.x * Math.cos(rot) - a0.y * Math.sin(rot), y: a0.x * Math.sin(rot) + a0.y * Math.cos(rot) };
    } else if (roll < 0.65) {
      aim = toOpp(x, y);
    } else {
      const a = Math.random() * Math.PI * 2;
      aim = { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x, y, diag, aim };
  };

  // 1戦ぶんの準備：ベイのデータを作って、場所決めの画面へ
  const setupRound = (m: Custom, c: Custom) => {
    TYPES.me = buildBey(m);
    TYPES.cpu = buildBey(c);
    setCpuCustom(c);
    beysRef.current = null;
    partsRef.current = [];
    dropRef.current = null;
    aimRef.current = null;
    cpuPlanRef.current = vsRef.current === '2p' ? null : planCpu(cpuStyleRef.current); // 2人対戦は、プレイヤー2が自分で決める
    setPlaceStep(0);
    aim2Ref.current = null;
    setHasDrop2(false);
    setHasDrop(false);
    setPhase('launch');
  };

  const startMatch = () => {
    window.clearTimeout(timerRef.current);
    scoreRef.current = { me: 0, cpu: 0 };
    setScore({ me: 0, cpu: 0 });
    setMessage(null);
    const n = mode === '3v3' ? 3 : 1;
    // CPUのベイ：選んだパーツはそのまま、選ばなかった（ランダムの）部分だけ毎回ランダムに決める
    const meDeck = customs.slice(0, n);
    let cpuDeck: Custom[];
    if (vs === '2p') cpuDeck = customs2.slice(0, n);
    else {
      cpuDeck = randomDeck(cpuSels.slice(0, n)); // 3体で同じパーツを重ねない
      const u = urlCustom('cpu');
      if (u) cpuDeck[0] = u;
    }
    if (vs === '2p') setMySide('left'); // 2人対戦：プレイヤー1が左、プレイヤー2が右
    setDeck({ me: meDeck, cpu: cpuDeck });
    setRoundIdx(0);
    setCycle(0);
    if (n === 3) { // 3on3：まず順番を決める
      beysRef.current = null;
      setOrderPick([]);
      setOrder([]);
      setOrderWho(0);
      setPhase('order');
      return;
    }
    setupRound(meDeck[0], cpuDeck[0]);
  };

  // 3on3：順番を決定（CPUの順番はランダムで非公開）
  const confirmOrder = () => {
    if (orderPick.length !== 3) return;
    if (vs === '2p') { // 2人対戦：プレイヤー1 → プレイヤー2 の順に、相手に見せずに順番を決める
      if (orderWho === 0) { setOrder(orderPick); setOrderPick([]); setOrderWho(1); return; }
      cpuOrderRef.current = orderPick;
      setRoundIdx(0);
      setupRound(deck.me[order[0]], deck.cpu[orderPick[0]]);
      return;
    }
    const perm = [0, 1, 2].sort(() => Math.random() - 0.5);
    cpuOrderRef.current = perm;
    setOrder(orderPick);
    setRoundIdx(0);
    setupRound(deck.me[orderPick[0]], deck.cpu[perm[0]]);
  };

  // ---- トーナメント：参加者を決めて、組み合わせを作る（CPUは32人のロスターから）
  const startTournament = () => {
    const fmt = mode;
    const humans: Entrant[] = Array.from({ length: tHumans }, (_, k) => ({
      id: k, name: playerNames[k].trim() || `プレイヤー${k + 1}`, human: true, deck: (fmt === '3v3' ? decks[k] : [decks[k][0]]).map(c => ({ ...c })),
    }));
    const cpus: Entrant[] = shuffled(ROSTER).slice(0, tCpu).map((r, j) => ({
      id: tHumans + j, name: r.name, catchphrase: r.catchphrase, human: false, style: r.style, deck: (fmt === '3v3' ? r.deck : [r.deck[0]]).map(c => ({ ...c })),
    }));
    const t = createTour([...humans, ...cpus], fmt);
    settleTour(t);
    tourRef.current = t;
    tourMatchRef.current = null;
    setNames(null);
    setPhase(t.champion !== null ? 'tchamp' : 'tbracket');
    bump();
  };

  // ---- トーナメント：次の試合を始める（立ち位置は試合ごとにランダム）
  const startTourMatch = () => {
    const t = tourRef.current;
    if (!t || !t.cur) return;
    const m = t.rounds[t.cur.r][t.cur.i];
    const A = t.entrants[m.a!], B = t.entrants[m.b!];
    let me = A, cpu = B;
    if (A.human && B.human) { // プレイヤー同士：左右をランダムに
      if (Math.random() < 0.5) { me = B; cpu = A; }
      vsRef.current = '2p'; setVs('2p');
      sideRef.current = 'left'; setMySide('left');
    } else { // プレイヤー対CPU：プレイヤーの立つ側をランダムに
      me = A.human ? A : B; cpu = A.human ? B : A;
      const side = Math.random() < 0.5 ? 'left' : 'right';
      vsRef.current = 'cpu'; setVs('cpu');
      sideRef.current = side; setMySide(side);
    }
    tourMatchRef.current = { r: t.cur.r, i: t.cur.i, meId: me.id, cpuId: cpu.id };
    cpuStyleRef.current = cpu.style;
    setNames({ me: me.name, cpu: cpu.name });
    setDeck({ me: me.deck, cpu: cpu.deck });
    scoreRef.current = { me: 0, cpu: 0 };
    setScore({ me: 0, cpu: 0 });
    setMessage(null);
    setRoundIdx(0);
    setCycle(0);
    if (t.fmt === '3v3') { // 3on3：順番決めから
      beysRef.current = null;
      setOrderPick([]); setOrder([]); setOrderWho(0);
      setPhase('order');
      return;
    }
    setupRound(me.deck[0], cpu.deck[0]);
  };

  // ---- トーナメント：試合の結果を記録して、次へ進める（CPU同士の試合は自動で決着）
  const finishTourMatch = (winner: 'me' | 'cpu') => {
    const t = tourRef.current, tm = tourMatchRef.current;
    if (!t || !tm) return;
    const m = t.rounds[tm.r][tm.i];
    m.winner = winner === 'me' ? tm.meId : tm.cpuId;
    m.score = `${score.me}-${score.cpu}`;
    settleTour(t);
    tourMatchRef.current = null;
    setNames(null);
    setPhase(t.champion !== null ? 'tchamp' : 'tbracket');
    bump();
  };

  // 対戦画面からカスタマイズ画面に戻る
  const backToSelect = () => {
    window.clearTimeout(timerRef.current);
    countTimers.current.forEach(window.clearTimeout);
    endedRef.current = true;
    beysRef.current = null;
    partsRef.current = [];
    dropRef.current = null;
    aimRef.current = null;
    cpuPlanRef.current = null;
    setCount(null);
    setMessage(null);
    setHasDrop(false);
    setHasDrop2(false);
    if (gameMode === 'tournament') { // トーナメント中は、トーナメント表に戻る（その試合は後でやり直し）
      setNames(null);
      setPhase('tbracket');
      return;
    }
    setPhase('select');
  };

  const nextRound = () => {
    setMessage(null);
    if (mode === '3v3') {
      const ni = roundIdx + 1;
      if (ni >= 3) { // 3体使い切っても決着がつかなければ、もう一度順番を決める（点数は引き継ぐ）
        beysRef.current = null;
        setCycle(c => c + 1);
        setOrderPick([]);
        setOrder([]);
        setOrderWho(0);
        setPhase('order');
        return;
      }
      setRoundIdx(ni);
      setupRound(deck.me[order[ni]], deck.cpu[cpuOrderRef.current[ni]]);
      return;
    }
    setupRound(deck.me[0], deck.cpu[0]);
  };

  // 「GO!シュート!」の表示が消えたら、ベイを落とす
  const fireNow = useCallback(() => {
    const my = dropRef.current, cpu = cpuPlanRef.current;
    if (phaseRef.current !== 'count' || !my || !cpu) return;
    countTimers.current.forEach(window.clearTimeout);
    beysRef.current = [
      makeBey('me', my.x, my.y, modeRef.current === 'diag', aimRef.current, 0.85),
      makeBey('cpu', cpu.x, cpu.y, cpu.diag, cpu.aim, vsRef.current === '2p' ? 0.85 : cpu.power ?? 0.7 + Math.random() * 0.3),
    ];
    endedRef.current = false;
    (window as unknown as { __dashes?: number[] }).__dashes = [0, 0];
    setPhase('battle');
  }, []);

  // スタート：3・2・1・GO!シュート! → 表示が消えたらベイが落ちる
  const countScale = Number(urlParams.get('speed')) || 1;
  const shoot = useCallback(() => {
    if (phaseRef.current !== 'launch' || !dropRef.current) return;
    if (vsRef.current === '2p' && !cpuPlanRef.current) return; // 2人対戦は、両方が場所を決めてから
    beysRef.current = null;
    partsRef.current = [];
    setPhase('count');
    setCount(3);
    countTimers.current.forEach(window.clearTimeout);
    countTimers.current = [
      window.setTimeout(() => setCount(2), 800 / countScale),
      window.setTimeout(() => setCount(1), 1600 / countScale),
      window.setTimeout(() => setCount(0), 2400 / countScale),
      window.setTimeout(() => { setCount(null); fireNow(); }, 3200 / countScale),
    ];
  }, [fireNow, countScale]);

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
    const two = vsRef.current === '2p';
    // 2人対戦：左半分をタップ＝プレイヤー1、右半分をタップ＝プレイヤー2
    const player: 0 | 1 = two ? (p.x < 0 ? 0 : 1) : 0;
    if (two && seqRef.current && player !== placeStepRef.current) return; // トーナメントの2人対戦：順番に決める
    const sx = two ? (player === 0 ? -1 : 1) : sideRef.current === 'left' ? -1 : 1;
    // 左側の人は左半分、右側の人は右半分にしか落とせない
    const ax = Math.min(Math.max(p.x * sx, m), lim);
    const maxY = Math.sqrt(Math.max(0, lim * lim - ax * ax));
    const x = ax * sx, y = Math.max(-maxY, Math.min(maxY, p.y));
    activeRef.current = player;
    if (player === 0) {
      dropRef.current = { x, y };
      aimRef.current = null;
      setHasDrop(true);
    } else {
      aim2Ref.current = null;
      cpuPlanRef.current = { x, y, diag: mode2Ref.current === 'diag', aim: defaultAim(x, y, TYPES.cpu.spinDir) };
      setHasDrop2(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.buttons || phaseRef.current !== 'launch') return;
    const p = toStadium(e);
    if (activeRef.current === 1 && vsRef.current === '2p') {
      const c = cpuPlanRef.current;
      if (!c) return;
      const dx = p.x - c.x, dy = p.y - c.y, l = Math.hypot(dx, dy);
      aim2Ref.current = l > 24 ? { x: dx / l, y: dy / l } : null;
      cpuPlanRef.current = { ...c, aim: aim2Ref.current ?? defaultAim(c.x, c.y, TYPES.cpu.spinDir) };
      return;
    }
    if (!dropRef.current) return;
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
  const canvasOn = phase === 'launch' || phase === 'count' || phase === 'battle' || phase === 'result' || phase === 'over'; // 対戦用のキャンバスが表示されている
  // カスタマイズ画面のベイのプレビュー（回さずに静止して表示）
  useEffect(() => {
    if (!inSelect) return;
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const bey = buildBey(custom);
    const draw = () => {
      ctx.clearRect(0, 0, 170, 170);
      ctx.save(); ctx.translate(85, 85); ctx.scale(2.2, 2.2);
      drawBey(ctx, bey.color, '#5aabff', 0, 0, '#fff', bey.blades, bey.sprite, bey.spinDir, false);
      ctx.restore();
    };
    draw();
    bey.sprite?.addEventListener('load', draw); // 画像の読み込みが終わったら描き直す
    return () => bey.sprite?.removeEventListener('load', draw);
  }, [inSelect, custom]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvasOn || !canvas) return;
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
        { const rt = Math.max(0, b.spin / b.spinMax); b.angle += b.spin > 0 ? b.dir * (1.5 + 38 * rt * rt) * DT : 0; }
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
        b.knockT = Math.max(0, b.knockT - DT);

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
          const drift = (24 + 0.06 * b.push) * (t.mobility > 1 ? t.mobility ** 2 : 1);
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
        const minSp = 240 * Math.max(0, ratio - 0.25) * Math.min(1, t.mobility);
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
        // 逆走しているとき（リングをたどる向きと逆に動いているとき）は、無理にリングに乗ってダッシュしない
        const ringTx = (b.dir * b.y) / (dist || 1), ringTy = (-b.dir * b.x) / (dist || 1);
        const alongRing = b.vx * ringTx + b.vy * ringTy; // リングをたどる向きの速さ（負なら逆走）
        if (!b.riding && b.dashesLeft > 0 && b.dashCd <= 0 && ratio > 0.15 && speed > 120 && dist > R * 0.8 && alongRing > 0.2 * speed) {
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
          // 右回転は反時計回りにリングを走る（右側を駆け上がる）。左回転はその鏡写し（左側を駆け上がる）
          const tx = (b.dir * b.y) / d, ty = (-b.dir * b.x) / d;
          const rs = 900 * t.dash;
          const fix = (R * 0.9 - d) * 8; // リングの上に保つ
          b.vx = tx * rs + (b.x / d) * fix; b.vy = ty * rs + (b.y / d) * fix;
          b.x += b.vx * DT; b.y += b.vy * DT;
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 14) b.trail.shift();
          b.spin = Math.max(0, b.spin - (4.5 + rs * 0.02) * t.decay * DT * 6);
          const atTop = Math.abs(Math.atan2(b.y, b.x) + Math.PI / 2) < 0.2;
          if (atTop && b.rideT > 0.05) {
            // 上側から中央へ発射
            const nx = -b.x / d, ny = -b.y / d;
            let dx = nx * 0.85 + tx * 0.35, dy = ny * 0.85 + ty * 0.35;
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const dashSpeed = (1100 + 350 * ratio) * t.dash * (0.5 + 0.5 * ratio); // 回転が落ちるとダッシュも弱くなる
            b.vx = dx * dashSpeed; b.vy = dy * dashSpeed;
            b.riding = false;
            b.dashT = 0.4; b.dashCd = (2 + Math.random() * 1.5) * t.dashCd; b.dashFx = 0.7;
            b.rideChance = 1; // 1回ダッシュしたら、斜めシュートでも水平と同じ（R/LRはここから何度もダッシュ）
            b.dashesLeft--;
            b.spin = Math.max(0, b.spin - b.spinMax * 0.05 * t.dashCost); // Xダッシュでも持久が削られる（回数が多いR/LRほど消耗する）
            { const w = window as unknown as { __dashes?: number[] }; (w.__dashes ??= [0, 0])[beys.indexOf(b)]++; } // 動作確認用のダッシュ回数カウンタ
            spark(b.x, b.y, 14);
          } else if (b.rideT > 3.2) {
            b.riding = false; b.dashCd = 0.6;
          }
          continue;
        }
        const damp = 1 - (0.08 + (1 - ratio) * 0.7 + (b.dashT > 0 ? 1.3 : 0)) * DT; // ダッシュ中は失速し、反対側のライン付近まで届く
        b.vx *= damp; b.vy *= damp;
        speed = Math.hypot(b.vx, b.vy);
        if (speed > 1800) { b.vx *= 1800 / speed; b.vy *= 1800 / speed; speed = 1800; } // 速すぎて突き抜けないように上限
        b.x += b.vx * DT; b.y += b.vy * DT;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 14) b.trail.shift();
        b.spin = Math.max(0, b.spin - (4.5 + speed * 0.02) * t.decay * DT * 6);

        // 外周の壁：出口以外は弾き返す
        const d2 = Math.hypot(b.x, b.y);
        const lim = R - BEY_R * 0.3;
        const outSpeed = (b.vx * b.x + b.vy * b.y) / (d2 || 1);
        const ek = exitKind(b.x, b.y);
        // 出口の手前には段があり、それを越える勢いがないと入れない（エクストリームは特に高い）
        const needOut = (ek === 'extreme' ? 420 : ek === 'over' ? 300 : 0) * TYPES[b.type].exitResist;
        if (d2 > lim && (!ek || outSpeed < needOut)) {
          const nx = b.x / d2, ny = b.y / d2;
          const outv = b.vx * nx + b.vy * ny;
          if (outv > 0) {
            b.vx -= 1.55 * outv * nx; b.vy -= 1.55 * outv * ny;
            // 相手に強く飛ばされて壁に当たって戻ってくると、持久が少し削られる（自分でぶつかったときは削れない）
            if (outv > 150 && b.knockT > 0) { b.spin = Math.max(0, b.spin - 0.4 * outv); spark(b.x, b.y, 4); }
          }
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
          // 弾く力は、ぶつかった2つのベイの回転の強さで決まる。回転が落ちるほど、反発が小さくなる
          // （満タンの回転では係数4.6、回転が3割なら約1.8、1割なら約1.3）
          const spinPow = Math.pow((a.spin / a.spinMax + b.spin / b.spinMax) / 2, 1.3);
          const j = ((1.1 + 3.5 * spinPow) * (rel + spinKick)) / (1 / ma + 1 / mb);
          const sa0 = Math.hypot(a.vx, a.vy), sb0 = Math.hypot(b.vx, b.vy);
          a.vx -= (j / ma) * nx * ta.steady * tb.kick; a.vy -= (j / ma) * ny * ta.steady * tb.kick;
          b.vx += (j / mb) * nx * tb.steady * ta.kick; b.vy += (j / mb) * ny * tb.steady * ta.kick;
          // 当てられて速度が増したほう＝飛ばされたほう
          if (Math.hypot(a.vx, a.vy) > Math.max(250, sa0 * 1.15)) a.knockT = 1.2;
          if (Math.hypot(b.vx, b.vy) > Math.max(250, sb0 * 1.15)) b.knockT = 1.2;
          // Xダッシュ中の打撃は強い（Eビットはスマッシュ攻撃でさらに強い）
          const impact = rel * Math.max(a.dashT > 0 ? 1.5 * ta.smash : 1, b.dashT > 0 ? 1.5 * tb.smash : 1) * (0.45 + 0.55 * spinPow);
          // 反対回転どうしが当たると、接触面の動きが揃ってスピンの削れが少し減る
          const oppo = a.dir !== b.dir ? 0.6 : 1;
          // バースト：ラチェットにうまく強打が当たると一発で起こる。強く当たるほど・当てる側の回転が強いほど確率が高く、
          // 当てられる側の回転が弱いほど確率が下がる（回転が5分の1以下ならバーストしない）。ちょこちょこ当たるだけではバーストしない
          const tryBurst = (v: Bey, tv: typeof ta, att: Bey, tAtt: typeof ta) => {
            const sf = Math.max(0, (v.spin / v.spinMax - 0.2) / 0.8);
            const hardness = Math.min(1.5, Math.max(0, (impact - 300) / 450));
            const attSpin = Math.max(0.3, att.spin / att.spinMax);
            if (Math.random() < (0.13 * hardness * tAtt.atk * attSpin * sf) / tv.burstRes) v.burst = 100;
          };
          tryBurst(a, ta, b, tb);
          tryBurst(b, tb, a, ta);
          a.spin = Math.max(0, a.spin - (impact * tb.atk * 0.28 * oppo) / ta.def);
          b.spin = Math.max(0, b.spin - (impact * ta.atk * 0.28 * oppo) / tb.def);
          if (a.dir !== b.dir) {
            // 回転吸収：左回転ベイは、右回転ベイの回転を奪える（Eビットのコバルトドラグーンが最も得意）。
            // 吸収力が足りない組み合わせでは、逆に左回転ベイのほうが回転を奪われる
            const Lb = a.dir < 0 ? a : b, Rb = Lb === a ? b : a;
            const net = TYPES[Lb.type].absorb - 0.45, imp = Math.min(1, impact / 500);
            if (net > 0) {
              const T = net * 0.38 * Rb.spin * imp;
              Rb.spin = Math.max(0, Rb.spin - T);
              Lb.spin = Math.min(Lb.spinMax * 1.05, Lb.spin + T * 0.85);
            } else {
              const T = -net * 0.3 * Lb.spin * imp;
              Lb.spin = Math.max(0, Lb.spin - T);
              Rb.spin = Math.min(Rb.spinMax * 1.05, Rb.spin + T * 0.7);
            }
          }
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40));
          flashRef.current = Math.min(1, impact / 600);
          // 動き出す前に当てられたら、弾かれて進行方向が変わる（矢印の向きには戻らない）
          for (const x of [a, b]) {
            x.hit = true;
            x.rideChance = 1; // 当たったあとは水平シュートと同じ（リングに乗れる）
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
        // 回転が5分の1以下になったベイはバーストしない
        if (bey.burst >= 100 && bey.spin / bey.spinMax > 0.2) { endRound(other, 'burst'); return; }
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
        if (vsRef.current === '2p') { // 2人対戦：左（プレイヤー1・青）と右（プレイヤー2・赤）の両方を色分け
          ctx.fillStyle = 'rgba(90,171,255,0.16)'; ctx.fillRect(-R, -R, R, R * 2);
          ctx.fillStyle = 'rgba(239,68,68,0.12)'; ctx.fillRect(0, -R, R, R * 2);
        } else {
          ctx.fillStyle = 'rgba(90,171,255,0.16)';
          ctx.fillRect(sx < 0 ? -R : 0, -R, R, R * 2);
        }
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
          drawBey(ctx, t.color, i === 0 ? '#5aabff' : '#ef4444', b.angle, Math.max(0, b.spin / b.spinMax), i === 0 ? '#fff' : '#ffb4b4', t.blades, t.sprite, t.spinDir);
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
      const drawGhost = (g: { x: number; y: number }, aim: { x: number; y: number }, diag: boolean, color: string, ring: string, arrow: string, label: string, nb: number, sp: HTMLImageElement | null, sd: 1 | -1, showInfo = true) => {
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.globalAlpha = 0.85;
        drawBey(ctx, color, ring, (performance.now() / 18) * sd, 1, '#fff', nb, sp, sd);
        ctx.globalAlpha = 1;
        if (!showInfo) { ctx.restore(); return; } // CPU対戦では、相手の打ち方（水平/斜め）と進行方向は見せない（位置だけ見える）
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
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && dropRef.current && (!seqRef.current || (phaseRef.current === 'launch' && placeStepRef.current === 0))) {
        const g = dropRef.current;
        const diag = modeRef.current === 'diag';
        drawGhost(g, aimRef.current ?? defaultAim(g.x, g.y, TYPES.me.spinDir), diag, TYPES.me.color, '#5aabff', '#e8590c', `${namesRef.current.me}：${diag ? '斜めシュート' : '水平シュート'}`, TYPES.me.blades, TYPES.me.sprite, TYPES.me.spinDir);
      }
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && cpuPlanRef.current && (vsRef.current === '2p' ? (!seqRef.current || (phaseRef.current === 'launch' && placeStepRef.current === 1)) : !hideOppRef.current)) {
        const c = cpuPlanRef.current;
        drawGhost(c, c.aim, c.diag, TYPES.cpu.color, '#ef4444', '#d62828', `${namesRef.current.cpu}：${c.diag ? '斜めシュート' : '水平シュート'}`, TYPES.cpu.blades, TYPES.cpu.sprite, TYPES.cpu.spinDir, vsRef.current === '2p');
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
  }, [endRound, canvasOn]);

  const humanCount = gameMode === 'tournament' ? tHumans : vs === '2p' ? 2 : 1; // カスタマイズするプレイヤーの数

  // 3on3：他のベイで使っているパーツは選べない（公式ルール）
  const usedByOthers = (key: (typeof KEYS)[number]) => {
    if (key === 'ratchet' && isInt(custom)) return RATCHETS.map(r => r.id); // ラチェット一体型は選べない
    return mode === '3v3' ? curDeck.filter((c, i) => i !== slot && !(key === 'ratchet' && isInt(c))).map(c => c[key]) : [];
  };

  // 2人対戦：シュートの種類（水平 / 斜め）を選ぶボタン
  const modeButtons2p = (cur: 'flat' | 'diag', onPick: (k: 'flat' | 'diag') => void, color: string, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <div style={{ fontWeight: 800, color, fontSize: 13 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([['flat', '水平シュート'], ['diag', '斜めシュート']] as const).map(([k, t]) => (
          <button
            key={k}
            onClick={() => onPick(k)}
            style={{
              padding: '6px 12px', borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 13,
              border: `3px solid ${cur === k ? color : '#2a3566'}`, background: cur === k ? '#14204f' : '#0a1030',
            }}
          >{t}</button>
        ))}
      </div>
    </div>
  );

  // ベイのカスタマイズ画面：ブレード / ラチェット / ビットを組み合わせる
  const myBey = buildBey(custom);
  const partPicker = (title: string, list: PartDef[], value: string, onPick: (id: string) => void, blocked: string[] = []) => {
    const sel = list.find(pt => pt.id === value) ?? list[0];
    const allBlocked = list.every(pt => blocked.includes(pt.id));
    return (
      <div style={{ flex: list.length > 6 ? '2 1 330px' : '1 1 200px', minWidth: 200 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>{title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {list.map(pt => {
            const bl = blocked.includes(pt.id);
            return (
              <button
                key={pt.id}
                onClick={() => { if (!bl) onPick(pt.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 18, fontWeight: 700, fontSize: 13,
                  cursor: bl ? 'not-allowed' : 'pointer', color: '#fff', opacity: bl ? 0.35 : 1,
                  border: `2px solid ${value === pt.id && !allBlocked ? (pt.color ?? '#ffd740') : '#2a3566'}`,
                  background: value === pt.id && !allBlocked ? '#14204f' : '#0a1030',
                }}
              >
                {pt.img && <img src={pt.img} alt="" width={26} height={26} />}
                <span style={{ color: pt.color ?? '#fff' }}>{pt.name}</span>
              </button>
            );
          })}
        </div>
        {/* 押した（選んだ）パーツの詳細 */}
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#0a1030', border: '1px solid #2a3566', fontSize: 11.5, minHeight: 64 }}>
          {allBlocked ? (
            <div style={{ opacity: 0.8 }}>ラチェット一体型のブレードなので、ラチェットは選べません。</div>
          ) : (
            <>
              <div style={{ fontWeight: 800, color: sel.color ?? '#fff', fontSize: 13 }}>{sel.name}</div>
              <div style={{ opacity: 0.85, margin: '3px 0' }}>{sel.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                {STAT_LABELS.filter(([k]) => sel.s[k] !== undefined).map(([k, label]) => (
                  <span key={k}>{label} <b>{sel.s[k]}</b></span>
                ))}
                {sel.height !== undefined && <span>高さ <b>{sel.height}</b></span>}
                <span style={{ opacity: 0.8 }}>{sel.weight}g</span>
                {sel.img && <span style={{ color: sel.spinDir === -1 ? '#ffd740' : '#9fb2ff', fontWeight: 700 }}>{sel.spinDir === -1 ? '左回転' : '右回転'}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };
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
                <div style={{ width: `${Math.min(100, (myBey.stats[key] / STAT_MAX[key]) * 100)}%`, height: '100%', borderRadius: 3, background: myBey.color }} />
              </div>
              <span style={{ width: 28, textAlign: 'right' }}>{myBey.stats[key]}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, marginTop: 8, opacity: 0.85, textAlign: 'center' }}>総重量 {myBey.weight}g ／ ラチェットの高さ {myBey.height}</div>
          <div style={{ fontSize: 12, marginTop: 4, textAlign: 'center', fontWeight: 700, color: myBey.spinDir === -1 ? '#ffd740' : '#9fb2ff' }}>{myBey.spinDir === -1 ? '左回転（右回転のベイの回転を吸収できる）' : '右回転'}</div>
        </div>
      </div>
      {partPicker('ブレード', BLADES, custom.blade, id => setCustom(c => ({ ...c, blade: id })), usedByOthers('blade'))}
      {partPicker('ラチェット', RATCHETS, custom.ratchet, id => setCustom(c => ({ ...c, ratchet: id })), usedByOthers('ratchet'))}
      {partPicker('ビット', BITS, custom.bit, id => setCustom(c => ({ ...c, bit: id })), usedByOthers('bit'))}
    </div>
  );

  const btn: React.CSSProperties = {
    padding: '12px 32px', fontSize: 18, fontWeight: 800, borderRadius: 10, cursor: 'pointer',
    border: 'none', background: '#ffd740', color: '#04071a',
  };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16, color: '#fff', background: '#04071a', boxSizing: 'border-box' }}>
      {(phase === 'order' || canvasOn) && (
        <button
          onClick={backToSelect}
          style={{ position: 'fixed', bottom: 10, left: 10, zIndex: 20, padding: '6px 12px', borderRadius: 8, border: '2px solid #2a3566', background: '#0a1030', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >← カスタマイズに戻る</button>
      )}
      {!canvasOn ? (
        <h2 style={{ margin: 0, letterSpacing: 2 }}>BEYBLADE X BATTLE</h2>
      ) : (
        // 上部：名前 + スピン / バーストゲージ（自分が選んだ側に自分を表示）
        <div style={{ display: 'flex', width: `min(96vw, 900px)`, gap: 24 }}>
          {(mySide === 'left'
            ? [[nameMe, '#5aabff', 0, 'left'], [nameCpu, '#ef4444', 2, 'right']]
            : [[nameCpu, '#ef4444', 2, 'left'], [nameMe, '#5aabff', 0, 'right']]
          ).map(([name, color, , align]) => (
            <div key={name as string} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, color: color as string, textAlign: align as 'left' | 'right' }}>{name}</div>
            </div>
          ))}
        </div>
      )}

      {phase === 'top' ? (
        // トップページ：相手 / 対戦 / トーナメント
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, marginTop: 30, width: 'min(96vw, 760px)' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>モードを選ぼう</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {([['versus', '対戦', '相手と戦う（CPU / 2人）'], ['tournament', 'トーナメント', '最大32人で勝ち抜き戦']] as const).map(([k, label, sub]) => (
              <button
                key={k}
                onClick={() => setGameMode(k)}
                style={{
                  padding: '14px 28px', borderRadius: 12, cursor: 'pointer', color: '#fff', textAlign: 'center',
                  border: `3px solid ${gameMode === k ? '#ffd740' : '#2a3566'}`, background: gameMode === k ? '#14204f' : '#0a1030',
                }}
              ><div style={{ fontWeight: 900, fontSize: 22 }}>{label}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{sub}</div></button>
            ))}
          </div>

          {gameMode === 'versus' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>相手：</span>
                {([['cpu', 'CPU', '1人で対戦'], ['2p', '2人対戦', '2人で1つの画面で対戦']] as const).map(([k, label, sub]) => (
                  <button
                    key={k}
                    onClick={() => { setVs(k); if (k === '2p') setMySide('left'); }}
                    style={{
                      padding: '8px 18px', borderRadius: 10, cursor: 'pointer', color: '#fff', textAlign: 'center',
                      border: `3px solid ${vs === k ? '#ffd740' : '#2a3566'}`, background: vs === k ? '#14204f' : '#0a1030',
                    }}
                  ><div style={{ fontWeight: 800, fontSize: 16 }}>{label}</div><div style={{ fontSize: 11, opacity: 0.8 }}>{sub}</div></button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>対戦：</span>
                {([['1v1', '1on1', '1体で対戦'], ['3v3', '3on3', '3体の順番を決めて対戦']] as const).map(([k, label, sub]) => (
                  <button
                    key={k}
                    onClick={() => { setMode(k); if (k === '3v3') setDecks(ds => ds.map(d => dedupeDeck(d))); }}
                    style={{
                      padding: '8px 18px', borderRadius: 10, cursor: 'pointer', color: '#fff', textAlign: 'center',
                      border: `3px solid ${mode === k ? '#ffd740' : '#2a3566'}`, background: mode === k ? '#14204f' : '#0a1030',
                    }}
                  ><div style={{ fontWeight: 800, fontSize: 16 }}>{label}</div><div style={{ fontSize: 11, opacity: 0.8 }}>{sub}</div></button>
                ))}
              </div>
              {vs === 'cpu' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>相手の落とす位置：</span>
                  {([['show', '見える'], ['hide', '見えない']] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setOppView(k)}
                      style={{
                        padding: '8px 18px', borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 700,
                        border: `3px solid ${oppView === k ? '#ffd740' : '#2a3566'}`, background: oppView === k ? '#14204f' : '#0a1030',
                      }}
                    >{label}</button>
                  ))}
                  <span style={{ fontSize: 11, opacity: 0.75 }}>（相手の打ち方と向きは、どちらでも見えません）</span>
                </div>
              )}
            </>
          )}

          {gameMode === 'tournament' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>対戦：</span>
                {([['1v1', '1on1', '1体で対戦'], ['3v3', '3on3', '3体の順番を決めて対戦']] as const).map(([k, label, sub]) => (
                  <button
                    key={k}
                    onClick={() => { setMode(k); if (k === '3v3') setDecks(ds => ds.map(d => dedupeDeck(d))); }}
                    style={{
                      padding: '8px 18px', borderRadius: 10, cursor: 'pointer', color: '#fff', textAlign: 'center',
                      border: `3px solid ${mode === k ? '#ffd740' : '#2a3566'}`, background: mode === k ? '#14204f' : '#0a1030',
                    }}
                  ><div style={{ fontWeight: 800, fontSize: 16 }}>{label}</div><div style={{ fontSize: 11, opacity: 0.8 }}>{sub}</div></button>
                ))}
              </div>
              {([['CPUの数', tCpu, (v: number) => setTCpu(Math.max(0, Math.min(32 - tHumans, v))), '#ef4444'], ['プレイヤーの数', tHumans, (v: number) => setTHumans(Math.max(0, Math.min(32 - tCpu, v))), '#5aabff']] as const).map(([label, val, set, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color, width: 110, textAlign: 'right' }}>{label}</span>
                  <button style={{ ...btn, padding: '2px 12px', fontSize: 18 }} onClick={() => set(val - 1)}>−</button>
                  <input type="range" min={0} max={32} value={val} onChange={e => set(Number(e.target.value))} style={{ width: 200 }} />
                  <button style={{ ...btn, padding: '2px 12px', fontSize: 18 }} onClick={() => set(val + 1)}>＋</button>
                  <span style={{ fontSize: 22, fontWeight: 900, width: 36 }}>{val}</span>
                </div>
              ))}
              <div style={{ fontSize: 14, textAlign: 'center', opacity: 0.9 }}>
                参加：合計 <b>{tCpu + tHumans}</b> 人（最大32人）。立ち位置（左右）は試合ごとにランダム、試合前に相手の落とす位置は見えません。
                {tCpu + tHumans < 2 && <div style={{ color: '#ff8b8b' }}>2人以上にしてください</div>}
              </div>
            </>
          )}

          <button
            style={{ ...btn, opacity: gameMode === 'tournament' && tCpu + tHumans < 2 ? 0.4 : 1 }}
            disabled={gameMode === 'tournament' && tCpu + tHumans < 2}
            onClick={() => { setWho(0); setSlot(0); setPhase('select'); }}
          >次へ（カスタマイズ）</button>
        </div>
      ) : phase === 'select' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => setPhase('top')} style={{ padding: '6px 14px', borderRadius: 8, border: '2px solid #2a3566', background: '#0a1030', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>← トップへ</button>
            <span style={{ fontSize: 14, opacity: 0.9 }}>
              {gameMode === 'tournament' ? `トーナメント（CPU ${tCpu}人・プレイヤー ${tHumans}人）・${mode === '3v3' ? '3on3' : '1on1'}` : `${vs === 'cpu' ? 'CPU対戦' : '2人対戦'}・${mode === '3v3' ? '3on3' : '1on1'}`}
            </span>
          </div>
          <div style={{ fontSize: 18 }}>ベイをカスタマイズしよう（{WIN_POINTS}ポイント先取）</div>
          {humanCount === 0 && <div style={{ fontSize: 15, opacity: 0.9 }}>プレイヤーがいないので、CPU同士のトーナメントを観戦します。</div>}
          {humanCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
              名前
              <input
                value={playerNames[who]}
                placeholder={defaultName(who)}
                maxLength={12}
                onChange={e => setPlayerNames(ns => ns.map((n, i) => (i === who ? e.target.value : n)))}
                style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #2a3566', background: '#0a1030', color: '#fff', fontSize: 15, width: 180 }}
              />
              <span style={{ fontSize: 11, opacity: 0.7 }}>（最大12文字）</span>
            </label>
          )}
          {humanCount > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 'min(96vw, 900px)' }}>
              {Array.from({ length: humanCount }, (_, k) => {
                const c = k === 0 ? '#5aabff' : k === 1 ? '#ef4444' : '#ffd740';
                return (
                  <button
                    key={k}
                    onClick={() => { setWho(k); setSlot(0); }}
                    style={{
                      padding: '6px 14px', borderRadius: 10, cursor: 'pointer', color: '#fff', fontWeight: 800,
                      border: `3px solid ${who === k ? c : '#2a3566'}`, background: who === k ? '#14204f' : '#0a1030',
                    }}
                  >{gameMode === 'versus' ? `${playerName(k)}のベイ（${k === 0 ? '左側' : '右側'}）` : playerName(k)}</button>
                );
              })}
            </div>
          )}
          {humanCount > 0 && mode === '3v3' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <button
                  key={i}
                  onClick={() => setSlot(i)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 12, textAlign: 'left',
                    border: `3px solid ${slot === i ? buildBey(curDeck[i]).color : '#2a3566'}`,
                    background: slot === i ? '#14204f' : '#0a1030',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>ベイ{i + 1}</div>
                  <div style={{ color: buildBey(curDeck[i]).color }}>{buildBey(curDeck[i]).name}</div>
                </button>
              ))}
            </div>
          )}
          {humanCount > 0 && customizer}
          {/* CPUのベイを選ぶ（選ばなければランダム）。3on3は3体ぶん */}
          {gameMode === 'versus' && vs === 'cpu' && Array.from({ length: mode === '3v3' ? 3 : 1 }, (_, n) => (
            <div key={n} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', padding: '10px 14px', borderRadius: 12, background: '#0a1030', border: '2px solid #5a2a2a' }}>
              <span style={{ fontWeight: 800, color: '#ef4444' }}>{mode === '3v3' ? `CPUのベイ${n + 1}` : 'CPUのベイ'}</span>
              {([['ブレード', BLADES, 'blade'], ['ラチェット', RATCHETS, 'ratchet'], ['ビット', BITS, 'bit']] as const).map(([label, list, key]) => (
                <label key={key} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {label}
                  <select
                    value={cpuSels[n][key]}
                    onChange={e => setCpuSels(cs => cs.map((c, i) => (i === n ? { ...c, [key]: e.target.value } : c)))}
                    style={{ padding: '5px 8px', borderRadius: 6, background: '#14204f', color: '#fff', border: '1px solid #2a3566', fontSize: 13 }}
                  >
                    <option value="">ランダム</option>
                    {list.map(pt => <option key={pt.id} value={pt.id} disabled={mode === '3v3' && cpuSels.some((c, i) => i !== n && c[key] === pt.id)}>{pt.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ))}
          {gameMode === 'versus' && vs === 'cpu' && (
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
          )}
          <button style={btn} onClick={gameMode === 'versus' ? startMatch : startTournament}>{gameMode === 'versus' ? 'バトル開始' : 'トーナメント開始'}</button>
        </div>
      ) : phase === 'order' ? (
        // 3on3：出す順番を決める（1番手 → 3番手）。点数は引き継ぐ
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 20, width: 'min(96vw, 1000px)' }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{vs === '2p' ? `${orderWho === 0 ? nameMe : nameCpu}の番です：` : ''}{cycle > 0 ? `3体使い切りました。もう一度、順番を決めよう（${cycle + 1}周目）` : '出す順番を決めよう'}</div>
          <div style={{ fontSize: 14, opacity: 0.85, textAlign: 'center' }}>
            出したい順に、ベイをタップ（1番手 → 3番手）。どちらかが{WIN_POINTS}ポイント取るまで続きます。{vs === '2p' && <><br />相手に順番が見えないように決めてね。</>}
          </div>
          <div style={{ fontSize: 40, fontWeight: 900 }}>
            <span style={{ color: '#5aabff' }}>{score.me}</span><span style={{ opacity: 0.6 }}> - </span><span style={{ color: '#ef4444' }}>{score.cpu}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(vs === '2p' && orderWho === 1 ? deck.cpu : deck.me).map((c, i) => {
              const bey = buildBey(c), pos = orderPick.indexOf(i);
              return (
                <button
                  key={i}
                  onClick={() => { if (pos < 0) setOrderPick(o => [...o, i]); }}
                  style={{
                    position: 'relative', width: 200, padding: '12px 10px', borderRadius: 12, cursor: pos < 0 ? 'pointer' : 'default', color: '#fff',
                    border: `3px solid ${pos >= 0 ? bey.color : '#2a3566'}`, background: pos >= 0 ? '#14204f' : '#0a1030',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  {bey.sprite && <img src={bey.sprite.src} alt="" width={90} height={90} />}
                  <div style={{ fontWeight: 800, color: bey.color, textAlign: 'center' }}>{bey.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>攻{bey.stats.atk} 防{bey.stats.def} 持{bey.stats.sta} ダ{bey.stats.dash} 耐{bey.stats.burst}</div>
                  {pos >= 0 && (
                    <div style={{ position: 'absolute', top: -12, left: -12, width: 36, height: 36, borderRadius: 18, background: '#ffd740', color: '#04071a', fontWeight: 900, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pos + 1}</div>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ ...btn, background: '#2a3566', color: '#fff', fontSize: 15, padding: '10px 20px' }} onClick={() => setOrderPick([])}>やり直し</button>
            <button style={{ ...btn, opacity: orderPick.length === 3 ? 1 : 0.4 }} disabled={orderPick.length !== 3} onClick={confirmOrder}>この順番で決定</button>
          </div>
          {vs === 'cpu' && <div style={{ fontSize: 13, opacity: 0.85, textAlign: 'center' }}>
            CPUの3体：{deck.cpu.map(c => buildBey(c).name).join(' ／ ')}（出す順番は非公開）
          </div>}
        </div>
      ) : phase === 'tbracket' || phase === 'tchamp' ? (
        // トーナメント表 / 優勝
        (() => {
          const t = tourRef.current;
          if (!t) return <div>トーナメントがありません</div>;
          const nm = (id: number | null) => (id === null ? '—' : fullName(t.entrants[id]));
          const cur = t.cur ? t.rounds[t.cur.r][t.cur.i] : null;
          const curLabel = t.cur ? roundLabel(t.rounds[t.cur.r].length, t.cur.r) : '';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: 'min(98vw, 1520px)' }}>
              <div style={{ fontSize: 14, opacity: 0.85 }}>トーナメント（{t.entrants.length}人・{t.fmt === '3v3' ? '3on3' : '1on1'}）</div>
              {phase === 'tchamp' && t.champion !== null ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, opacity: 0.8 }}>優勝</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 14px #000' }}>{nm(t.champion)}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                    {t.entrants.some(e => e.human) && (t.entrants[t.champion].human ? 'おめでとう！' : 'プレイヤーは敗退しました')}
                  </div>
                </div>
              ) : cur ? (
                <div style={{ textAlign: 'center', padding: '12px 22px', borderRadius: 12, border: '3px solid #ffd740', background: '#14204f' }}>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>次の試合：{curLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, margin: '4px 0' }}>
                    <span style={{ color: t.entrants[cur.a!].human ? '#5aabff' : '#fff' }}>{nm(cur.a)}</span>
                    <span style={{ opacity: 0.6 }}> vs </span>
                    <span style={{ color: t.entrants[cur.b!].human ? '#5aabff' : '#fff' }}>{nm(cur.b)}</span>
                  </div>
                  <button style={btn} onClick={startTourMatch}>試合開始</button>
                </div>
              ) : null}
              <BracketView t={t} />
              <button style={{ ...btn, background: '#2a3566', color: '#fff', fontSize: 15, padding: '10px 20px' }} onClick={() => { tourRef.current = null; setPhase('top'); }}>
                {phase === 'tchamp' ? 'トップへ' : 'トーナメントを中断してトップへ'}
              </button>
            </div>
          );
        })()
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
                {message.winner === 'me' ? nameMe : nameCpu} +{FINISH_INFO[message.finish].points}pt
              </div>
              {phase === 'over' ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 900, color: message.winner === 'me' ? '#5aabff' : '#ef4444' }}>
                    {vs === '2p' ? `${message.winner === 'me' ? nameMe : nameCpu} の勝ち！` : message.winner === 'me' ? 'YOU WIN!' : 'YOU LOSE...'}
                  </div>
                  {gameMode === 'tournament'
                    ? <button style={btn} onClick={() => finishTourMatch(message.winner)}>次へ（トーナメント表）</button>
                    : <button style={btn} onClick={() => setPhase('select')}>もう一度</button>}
                </>
              ) : (
                <button style={btn} onClick={nextRound}>次のラウンド</button>
              )}
            </div>
          )}
        </div>
      )}
      {canvasOn && (
        // 下中央：ポイントと、それぞれが使っているベイの名前（自分が選んだ側に合わせて左右を入れ替え）
        (() => {
          const me = { label: `${nameMe}のベイ`, bey: TYPES.me, pt: score.me, color: '#5aabff' };
          const cpu = { label: `${nameCpu}のベイ`, bey: TYPES.cpu, pt: score.cpu, color: '#ef4444' };
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
                <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{WIN_POINTS}ポイント先取{mode === '3v3' ? ` ／ 第${roundIdx + 1}戦（3体中）${cycle > 0 ? `・${cycle + 1}周目` : ''}` : ''}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{Rr.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: Rr.bey.color }}>{Rr.bey.name}</div>
              </div>
            </div>
          );
        })()
      )}
      {phase === 'launch' && seq && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, textAlign: 'center' }}>
            {placeStep === 0 ? `${nameMe}：左半分をタップ → ドラッグで向き → 「決定」（相手は画面を見ないでね）` : `${nameCpu}：右半分をタップ → ドラッグで向き → 「スタート」`}
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {placeStep === 0
              ? modeButtons2p(shotMode, setShotMode, '#5aabff', nameMe)
              : modeButtons2p(shotMode2, k => { setShotMode2(k); if (cpuPlanRef.current) cpuPlanRef.current = { ...cpuPlanRef.current, diag: k === 'diag' }; }, '#ef4444', nameCpu)}
            {placeStep === 0
              ? <button style={{ ...btn, padding: '10px 26px', opacity: hasDrop ? 1 : 0.4 }} disabled={!hasDrop} onClick={() => setPlaceStep(1)}>決定</button>
              : <button style={{ ...btn, padding: '10px 26px', opacity: hasDrop2 ? 1 : 0.4 }} disabled={!hasDrop2} onClick={shoot}>スタート！</button>}
          </div>
        </div>
      )}
      {phase === 'launch' && vs === '2p' && !seq && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, textAlign: 'center' }}>
            {!hasDrop && !hasDrop2 ? 'プレイヤー1は左半分、プレイヤー2は右半分をタップして、落とす場所を決めよう（ドラッグで向き）'
              : !hasDrop ? 'プレイヤー1：左半分をタップして、落とす場所を決めよう'
              : !hasDrop2 ? 'プレイヤー2：右半分をタップして、落とす場所を決めよう'
              : '準備OK！ ドラッグで向きを直して、スタート！'}
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {modeButtons2p(shotMode, setShotMode, '#5aabff', nameMe)}
            <button style={{ ...btn, padding: '10px 26px', opacity: hasDrop && hasDrop2 ? 1 : 0.4 }} disabled={!(hasDrop && hasDrop2)} onClick={shoot}>スタート！ (Space)</button>
            {modeButtons2p(shotMode2, k => { setShotMode2(k); if (cpuPlanRef.current) cpuPlanRef.current = { ...cpuPlanRef.current, diag: k === 'diag' }; }, '#ef4444', nameCpu)}
          </div>
        </div>
      )}
      {phase === 'launch' && vs === 'cpu' && (
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
