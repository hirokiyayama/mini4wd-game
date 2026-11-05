import { useEffect, useRef, useState, useCallback } from 'react';
import wizardImg from './assets/beys/wizard.png';
import sharkImg from './assets/beys/shark.png';
import aeroImg from './assets/beys/aero.png';
import meteorImg from './assets/beys/meteor.png';
import cobaltImg from './assets/beys/cobalt.png';
import gloryImg from './assets/beys/glory.png';
import knight2Img from './assets/beys/knight2.png';
import { createRoom, joinRoom, randomCode } from './online';
import type { Link, Msg } from './online';
import launcherRedImg from './assets/launcher_red.png';
import launcherBlackImg from './assets/launcher_black.png';

// ベイブレードX風バトル（4ポイント先取）
// スタジアムは参考動画（真上視点）に合わせる：八角形の枠 + 円形のすり鉢 + オレンジのXライン(円形リング)
// 出口は下側の3か所のみ：中央=エクストリーム(3pt)、左右ポケット=オーバー(2pt)。それ以外の壁は弾き返す。
const WIN_POINTS = 4;
const R = 265; // すり鉢の半径
const BEY_R = 32;
const W = 900, H = 700, CX = W / 2, CY = 335;
const EXIT_HALF = 0.25; // 出口の幅（rad）
// ---- スタジアムの形：緑のリング（エクストリームライン）は円で、上に凹みがある。リングの外の壁は、円ではなく四角（角が丸い）
const WALL_N = 4;
const sqn = (x: number, y: number) => Math.pow(Math.pow(Math.abs(x), WALL_N) + Math.pow(Math.abs(y), WALL_N), 1 / WALL_N); // 四角い壁での「距離」（壁にぶつかるとき1に近づく）
const wallAt = (phi: number, H: number) => H / Math.pow(Math.pow(Math.abs(Math.sin(phi)), WALL_N) + Math.pow(Math.abs(Math.cos(phi)), WALL_N), 1 / WALL_N); // 真下を0とした向きphiでの、四角い壁までの距離
const RING_R = 238.5, NOTCH_DEPTH = 72, NOTCH_A1 = 0.1, NOTCH_A2 = 0.44;
function ringRadiusAtAngle(th: number) { // 画面の角度 th（右が0、下が+π/2）でのリングの半径。真上（-π/2）に凹みがある
  const a = Math.abs(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2)));
  if (a >= NOTCH_A2) return RING_R;
  if (a <= NOTCH_A1) return RING_R - NOTCH_DEPTH;
  const u = (NOTCH_A2 - a) / (NOTCH_A2 - NOTCH_A1);
  return RING_R - NOTCH_DEPTH * u * u * (3 - 2 * u);
}
const ringRadiusAt = (x: number, y: number) => ringRadiusAtAngle(Math.atan2(y, x));
const OVER_PHI = 0.64; // 下方向から左右ポケットまでの角度（rad）

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
  burstTough?: number; // ブレード自体のバーストしにくさ（ビットに関係なく掛かる倍率）
  burstFloor?: number; // ラチェット/ブレードがビットのバースト耐性を一定以上にそろえる（バトルの計算だけ）
  comeback?: number; // 場外ポケットに入りかけても、回転が強いとスタジアムに戻ってきやすい倍率
  dashLimit?: [number, number]; // 1ラウンドでXダッシュできる回数の上限（最小〜最大からランダム）。Eビットは2〜3回
}
const BLADES: PartDef[] = [
  { id: 'meteor', name: 'メテオドラグーン', desc: '大型ラバー軸が搭載された3枚刃で、強烈な一撃を繰り出す。メタルが塗装され性能がアップしている。', s: { atk: 75, def: 15, sta: 35 }, weight: 39.0, color: '#c4b5fd', blades: 3, img: meteorImg, spinDir: -1, absorb: 0.45, burstMod: 1.5 },
  { id: 'cobalt', name: 'コバルトドラグーン', desc: '先端が分厚い4枚のアッパー刃による高い弾き性能を持った左回転ブレード。', s: { atk: 60, def: 15, sta: 25 }, weight: 37.9, color: '#3b82f6', blades: 4, img: cobaltImg, spinDir: -1, absorb: 1.0, burstMod: 1.0 },
  { id: 'wizard', name: 'ウィザードロッド', desc: '外重心かつ径の大きい5枚刃形状で、遠心力を生み出すことに特化した設計。', s: { atk: 15, def: 25, sta: 60 }, weight: 35.1, color: '#fbbf24', blades: 5, img: wizardImg },
  { id: 'aero', name: 'エアロペガサス', desc: '大型の3枚刃が高い打撃力を生む設計。メタルが二重に塗装され性能がアップしている。', s: { atk: 70, def: 30, sta: 35 }, weight: 38.7, color: '#38bdf8', blades: 3, img: aeroImg },
  { id: 'shark', name: 'シャークスケイル', desc: '打撃部位を複数備えた大型2枚刃で、低い位置からの強烈なアッパー攻撃に特化した設計。', s: { atk: 70, def: 15, sta: 15 }, weight: 37.3, color: '#8b5cf6', blades: 2, img: sharkImg },
  { id: 'glory', comeback: 2.2, name: 'グローリーワルキューレ', desc: 'ラチェット一体型のブレード。スプリング内蔵の可動刃が攻撃時にバウンドし、反発力による強烈な弾き性能に特化。メタルが塗装され性能がアップしている。', s: { atk: 85, def: 35, sta: 25 }, weight: 43.5, height: 50, color: '#fde68a', blades: 4, img: gloryImg, integrated: true, kick: 1.25, burstFloor: 80, burstTough: 2.3 }, // 構造上ビットが抜けにくい：B/E/FB/Nrでもバーストしにくい
  { id: 'knight2', name: 'ナイトシールドV2', desc: '6枚の防御刃で衝撃を吸収しやすいダンパー構造を採用。', s: { atk: 22, def: 60, sta: 28 }, hid: { sta: 55 }, weight: 36.5, color: '#4ade80', blades: 6, img: knight2Img },
];
const RATCHETS: PartDef[] = [
  { id: 'r160', comeback: 2.2, name: '1-60', desc: 'ベイを低めにセットするパーツ。攻撃性能に特化した1枚刃を採用。', s: { atk: 17, def: 9, sta: 4 }, height: 60, weight: 6.0 },
  { id: 'r170', comeback: 2, name: '1-70', desc: 'ベイの高さを中位にセットするパーツ。攻撃性能に特化した1枚刃を採用。', s: { atk: 17, def: 6, sta: 7 }, height: 70, weight: 6.1 },
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
const LAUNCHERS = { red: new Image(), black: new Image() }; // 相手の落とす位置を隠しているときのヒント
LAUNCHERS.red.src = launcherRedImg; LAUNCHERS.black.src = launcherBlackImg;
const SPRITES: Record<string, HTMLImageElement> = {};

// ---- ブレードの形：写真の輪郭から、角度ごとの半径を作る（丸くない・凹凸がある）。当たる場所によって、弾く向き・飛ぶ量が変わり、形がいびつなほど動きが不規則になる
const SHAPE_N = 72;
const SHAPES: Record<string, { r: Float32Array; mean: number; nr: number; mx: number; cx: number; cy: number; ecc: number }> = {};
function computeShape(id: string, im: HTMLImageElement) {
  const S = im.naturalWidth || 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c2 = cv.getContext('2d'); if (!c2) return;
  c2.drawImage(im, 0, 0, S, S);
  const data = c2.getImageData(0, 0, S, S).data;
  const r = new Float32Array(SHAPE_N), c0 = S / 2;
  let sx0 = 0, sy0 = 0, cnt0 = 0; // 重さの中心（写真の形の重心）：回転の軸（画像の真ん中）からのずれ
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (data[(y * S + x) * 4 + 3] < 128) continue;
    sx0 += x + 0.5 - c0; sy0 += y + 0.5 - c0; cnt0++;
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, rr = Math.hypot(dx, dy);
    const k = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * SHAPE_N) % SHAPE_N;
    if (rr > r[k]) r[k] = rr;
  }
  // 抜けを埋めて、なめらかにする
  for (let k = 0; k < SHAPE_N; k++) if (r[k] === 0) r[k] = (r[(k + SHAPE_N - 1) % SHAPE_N] + r[(k + 1) % SHAPE_N]) / 2 || 1;
  const sm = new Float32Array(SHAPE_N), sc = (BEY_R * 2.15) / S;
  for (let k = 0; k < SHAPE_N; k++) sm[k] = ((r[(k + SHAPE_N - 1) % SHAPE_N] + 2 * r[k] + r[(k + 1) % SHAPE_N]) / 4) * sc;
  let mean = 0; for (const v of sm) mean += v; mean /= SHAPE_N;
  let sd = 0; for (const v of sm) sd += (v - mean) ** 2; sd = Math.sqrt(sd / SHAPE_N) / mean;
  const cmx = (sx0 / (cnt0 || 1)) * sc, cmy = (sy0 / (cnt0 || 1)) * sc;
  SHAPES[id] = { r: sm, mean, mx: Math.max(...sm), cx: cmx, cy: cmy, ecc: Math.hypot(cmx, cmy) / mean, nr: Math.max(0, Math.min(1, (sd - 0.015) / 0.035)) }; // nr：0＝まん丸 … 1＝いびつ
  (window as unknown as { __shapes?: typeof SHAPES }).__shapes = SHAPES; // 動作確認用
}
const nrOf = (id: string) => SHAPES[id]?.nr ?? 0.5;
// 変重心：ブレードの重い側が、いま向いている方向（-1〜1。相手の側に重い側が向いているほどプラス）
function heavySide(id: string, angle: number, nx: number, ny: number) {
  const sh = SHAPES[id]; if (!sh) return 0;
  const c = Math.cos(angle), sn = Math.sin(angle), wx = sh.cx * c - sh.cy * sn, wy = sh.cx * sn + sh.cy * c, m = Math.hypot(wx, wy);
  if (m < 1e-6) return 0;
  return Math.max(-1, Math.min(1, (wx * nx + wy * ny) / m)) * Math.min(1, sh.ecc * 12);
}
function shapeR(id: string, th: number) { // 角度 th（ベイから見た向き）での半径
  const sh = SHAPES[id];
  if (!sh) return BEY_R;
  const u = (((th + Math.PI) / (2 * Math.PI)) % 1 + 1) % 1, t = u * SHAPE_N - 0.5, i0 = Math.floor(t), f = t - i0;
  return sh.r[((i0 % SHAPE_N) + SHAPE_N) % SHAPE_N] * (1 - f) + sh.r[(((i0 + 1) % SHAPE_N) + SHAPE_N) % SHAPE_N] * f;
}
function shapeNormal(id: string, th: number) { // その点の外向きの法線の向き（凹凸があると、中心からの向きとずれる）
  const h = (2 * Math.PI) / SHAPE_N, r = shapeR(id, th), dr = (shapeR(id, th + h) - shapeR(id, th - h)) / (2 * h);
  return Math.atan2(r * Math.sin(th) - dr * Math.cos(th), r * Math.cos(th) + dr * Math.sin(th));
}
// 外形どうしの重なり：片方の外形の点が、もう片方の外形の内側に入っているかを調べる。いちばん深く食い込んだ点が「当たった点」で、
// そのときの相手の外形の向き（法線）が、弾く向きになる。ギザギザのブレードは、刃の先で当たるのか、刃の間に入るのかで、向きも深さも変わる
function polyContact(ida: string, xa: number, ya: number, aa: number, idb: string, xb: number, yb: number, ab: number): { nx: number; ny: number; pen: number; cx: number; cy: number } | null {
  let pen = 0, nx = 0, ny = 0, qx = 0, qy = 0;
  const step = (2 * Math.PI) / SHAPE_N;
  const test = (idv: string, xv: number, yv: number, av: number, ido: string, xo: number, yo: number, ao: number, sign: number) => {
    for (let k = 0; k < SHAPE_N; k++) {
      const th = -Math.PI + (k + 0.5) * step, rv = shapeR(idv, th), wa = th + av;
      const px = xv + rv * Math.cos(wa) - xo, py = yv + rv * Math.sin(wa) - yo, dist = Math.hypot(px, py);
      const thp = Math.atan2(py, px) - ao, pn = shapeR(ido, thp) - dist;
      if (pn > pen) { pen = pn; qx = px + xo; qy = py + yo; const Nw = shapeNormal(ido, thp) + ao; nx = Math.cos(Nw) * sign; ny = Math.sin(Nw) * sign; }
    }
  };
  test(ida, xa, ya, aa, idb, xb, yb, ab, -1); // aの点がbの中へ：b→aの外向き法線の逆（a→b向き）
  test(idb, xb, yb, ab, ida, xa, ya, aa, 1);  // bの点がaの中へ：aの外向き法線（a→b向き）
  return pen > 0 ? { nx, ny, pen, cx: qx, cy: qy } : null;
}
for (const bl of BLADES) {
  if (!bl.img) continue;
  const im = new Image();
  im.onload = () => computeShape(bl.id, im);
  im.src = bl.img;
  if (im.complete && im.naturalWidth) computeShape(bl.id, im);
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
    burstRes: norm(ef.burst, 55, 0.35) * (1 + ((bl.burstMod ?? 1) - 1) * (bit.id === 'E' ? 1 : 0.3)) * (bl.burstTough ?? 1), // ブレードの形状による差は、Eビットのときに大きく出る // バースト耐性（ビットの値）
    dash: bit.dashSpeed ?? 1, // Xダッシュの速さ
    dashCost: bit.dashCost ?? 1, // Xダッシュで失う持久の倍率
    kick: bl.kick ?? 1, // 相手を弾く力の倍率
    smash: bit.smash ?? 1, // Eビット：Xダッシュ中の打撃力
    dashLimit: bit.dashLimit ?? null,
    spinDir: bl.spinDir ?? 1, // 左回転ブレードは -1
    absorb: (bl.absorb ?? 0) * (bit.absorbBit ?? 0.25), // 左回転の回転吸収力（Eビットで大きく発揮される）
    mobility: bit.mobility ?? 1,
    bid: bl.id, // ブレードの種類（形の計算に使う）
    flat: ['K', 'L', 'R', 'LR'].includes(bit.id), // 底が平ら：きれいな円を描かず、楕円で回り、そのうちリングや壁に当たって軌道が変わる
    noRideInner: ['E', 'B', 'FB', 'H', 'Nr'].includes(bit.id), // 水平シュートで真ん中の円の中に落とすと、その円より少し大きいくらいの小さな円を描いて回る（ぶつかるまで）
    tip: bit.id === 'H', // 底がとがっている：B・FB・Nrより小さな円できれいに回る
    cruise: 360 * Math.sqrt(bit.mobility ?? 1), // 実際の動画：ベイは中央に落ち着いても止まらず、一定の速さで動き回り続ける（Rなど動き回るビットは速く、Hは遅い）
    steady: bit.steady ?? 1,
    exitResist: bit.exitResist ?? 1,
    comeback: (bl.comeback ?? 1) * (bl.integrated ? 1 : pick(RATCHETS, c.ratchet).comeback ?? 1), // 場外から戻りやすさ
    dashCd: Math.min(4, Math.max(0.5, 20 / ef.dash)), // ダッシュ値が高いほど、ダッシュ回数が増える
  };
}

// バトルで使うベイ（スタート時に、カスタマイズ内容から作り直す）
const TYPES: Record<BeyType, ReturnType<typeof buildBey>> = { me: buildBey(DEFAULT_CUSTOM), cpu: buildBey(DEFAULT_CUSTOM) };

// ---------------- CPUの強さ ----------------
type Diff = 'easy' | 'normal' | 'hard';
const DIFF_INFO: Record<Diff, { label: string; desc: string }> = {
  easy: { label: 'やさしい', desc: '打ち方が雑で、勢いも弱め。ベイの回転もかなり短い' },
  normal: { label: 'ふつう', desc: '標準' },
  hard: { label: 'つよい', desc: '上手な打ち方で、最大に近い勢い。ベイの回転も長い' },
};
const DIFF_SPIN: Record<Diff, number> = { easy: 0.7, normal: 1, hard: 1.15 }; // CPUのベイの回転数の倍率
// 「つよい」のCPUがパーツを選ばなかったときに使う、強めのカスタム
const HARD_POOL: Custom[] = [
  ['wizard', 'r960', 'B'], ['wizard', 'r160', 'H'], ['shark', 'r760', 'R'], ['shark', 'r960', 'FB'], ['shark', 'r160', 'LR'],
  ['aero', 'r760', 'R'], ['aero', 'r160', 'LR'], ['aero', 'r360', 'R'], ['meteor', 'r960', 'E'], ['meteor', 'r560', 'H'],
  ['cobalt', 'r960', 'E'], ['cobalt', 'r760', 'E'], ['glory', 'r560', 'E'], ['glory', 'r560', 'L'], ['knight2', 'r960', 'B'], ['knight2', 'r160', 'H'],
].map(([blade, ratchet, bit]) => ({ blade, ratchet, bit }));

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
// 名前の表示：1行目にキャッチコピー、2行目に名前（中央そろえ）
function NameBlock({ e, nameSize, catchSize, color }: { e: Entrant; nameSize: number; catchSize: number; color?: string }) {
  return (
    <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
      {e.catchphrase && <div style={{ fontSize: catchSize, fontWeight: 700, opacity: 0.85, color }}>{e.catchphrase}</div>}
      <div style={{ fontSize: nameSize, fontWeight: 900, color }}>{e.name}</div>
    </div>
  );
}
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
function BracketView({ t, availW, availH }: { t: Tour; availW: number; availH: number }) {
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
        <span style={{ maxWidth: cw - 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{id !== null ? short(id) : bye ? <i style={{ fontSize: 12.5 }}>BYE</i> : ''}</span>
        {c === 0 && (
          <span style={{ position: 'absolute', [right ? 'right' : 'left']: -27, top: -2, width: 20, height: rh, background: '#a9d11a', color: '#222', fontSize: 12.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties}>{j + 1}</span>
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
  const k = Math.max(0.5, Math.min(1, availW / totalW, availH / totalH)); // 小さくなりすぎないように（足りないぶんは、スクロール）
  return (
    <div style={{ width: totalW * k, height: totalH * k, flex: '0 0 auto', margin: '0 auto' }}>
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
  age: number; // 発射してからの時間（秒）
  coast: number; // ダッシュのあと、すぐに失速する時間
  ph0: number; // 進路のゆれの位相
  dAt: number; // （未使用）
  calmT: number; // 凹みから戻ったあと、しばらくは、勢いをつけない時間
  softDone: boolean; spiralT: number; orbR: number; diagShot: boolean; notched: boolean; prevD: number; // 斜めシュートか／上の凹みで一度とどまったか／前の位置のリングからの距離
  outAng: number; prevTh: number; // リングの外側を回った角度（1周回ったら、次の動きに移る）
  postT: number; // ぶつかってからの、惰性で動く時間（この間は、ビットごとの円・楕円の動きを切る）
  eAng: number; er: number; // 平らな底のビットの楕円の向き・ひらべったさ
  mode: number; r0: number; osgn: number; // ぶつかったあとの動き：0=そのまま 1=真ん中に戻る 2=その周りを回る（半径・回る向き）
  outT: number; outKind: 'extreme' | 'over'; outPhi: number; retPlan: boolean; retCount: number; grace: number; // 場外ポケット：滞在時間・出口の種類・戻るか・戻った回数・戻った直後の猶予
  dashesLeft: number; // 残りXダッシュ回数（Eビットは2〜3回まで）
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number; old?: boolean }
// 火花を作る（ぶつかった・壁に当たった・ダッシュの瞬間など）。多めに、速く、尾を引いて飛び散る
function makeSparks(arr: Spark[], x: number, y: number, n: number, old = false) {
  if (old) { // ぶつかったときの火花は、もとの小さな火花のまま
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220, life = 0.4 + Math.random() * 0.3;
      arr.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, w: 0, old: true });
    }
    return;
  }
  const k = Math.min(70, Math.round(n * 2.6));
  for (let i = 0; i < k; i++) {
    const a = Math.random() * Math.PI * 2, v = 140 + Math.random() * 520, life = 0.35 + Math.random() * 0.6;
    arr.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, w: 1.6 + Math.random() * 2.2 });
  }
}
interface Part { x: number; y: number; vx: number; vy: number; rot: number; vr: number; color: string; size: number; life: number }

// 出口に入れる幅：ベイの大きさぶん内側（仕切りの壁にかかっていると入れない）
const EXIT_ENTRY = EXIT_HALF - 0.07;
function exitKind(x: number, y: number): 'extreme' | 'over' | null {
  const a = Math.abs(Math.atan2(x, y)); // 下方向が0
  if (a < EXIT_ENTRY) return 'extreme';
  if (Math.abs(a - OVER_PHI) < EXIT_ENTRY) return 'over';
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
  const spinMax = 3350 * (0.6 + 0.4 * power);
  const smallCircle = !diag && TYPES[type].noRideInner && Math.hypot(x, y) < RING_R * 0.5; // 小さな円で回るビットは、最初から円に沿う向きで動き出す
  const tdn = Math.hypot(x, y) || 1, a = diag ? (aim ?? defaultAim(x, y, TYPES[type].spinDir)) : smallCircle ? { x: (y / tdn) * TYPES[type].spinDir, y: (-x / tdn) * TYPES[type].spinDir } : defaultAim(x, y, TYPES[type].spinDir); // 水平シュートは矢印なし：決めた向きには飛ばさず、そのまま回り始める（斜めだけ向きを決められる）
  const mob = TYPES[type].mobility;
  const sp = (260 + 140 * power) * Math.min(1, mob); // Hは水平に打ってもあまり飛び出さない
  return {
    type, x, y, vx: diag ? a.x * (75 + 0.16 * (130 + 140 * power) * (mob > 1 ? 1.3 : 1)) * (mob > 1 ? mob * mob : 1) : a.x * sp, vy: diag ? a.y * (75 + 0.16 * (130 + 140 * power) * (mob > 1 ? 1.3 : 1)) * (mob > 1 ? mob * mob : 1) : a.y * sp,
    spin: spinMax, spinMax, burst: 0, angle: 0,
    dir: TYPES[type].spinDir, curl: 1.1 * TYPES[type].spinDir, dashT: 0, dashCd: 0, dashFx: 0, trail: [], out: false, dead: false,
    // 斜め：その場にとどまる（R系は短く、よく動く） / Hは水平でも少しとどまる
    holdT: diag ? (mob > 1 ? 0.6 : 1.05) : mob < 1 ? 0.5 * (1 - mob) : 0, riding: false, rideT: 0,
    ax: a.x, ay: a.y, push: (130 + 140 * power) * (mob > 1 ? 1.3 : 1),
    knockT: 0, hit: false, rideChance: diag ? 0.4 : 1, onRing: false,
    age: 0, coast: 0, ph0: Math.random() * 6.28, dAt: 0, calmT: 0, diagShot: diag, orbR: !diag && TYPES[type].noRideInner && Math.hypot(x, y) < RING_R * 0.5 ? RING_R * 0.5 * 1.02 : 0, softDone: false, spiralT: 0, notched: false, prevD: 0, outAng: 0, prevTh: 0, postT: 0, eAng: Math.random() * Math.PI, er: 0.35 + Math.random() * 0.25, mode: 0, r0: 140, osgn: 1, outT: 0, outKind: 'extreme', outPhi: 0, retPlan: false, retCount: 0, grace: 0,
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
  // 実際のスタジアム（上から見た写真）に近づけた絵：透明な四角いケースの中に、黒い皿と、緑のエクストリームライン
  const half = 330;
  // ケース（透明・角が丸い四角）
  ctx.beginPath(); ctx.roundRect(-half, -half, half * 2, half * 2, 78);
  const fg = ctx.createLinearGradient(-half, -half, half, half);
  fg.addColorStop(0, '#e6ecf4'); fg.addColorStop(0.5, '#cfd8e4'); fg.addColorStop(1, '#bcc7d6');
  ctx.fillStyle = fg; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#9fadc0'; ctx.stroke();
  // ケースの反射
  ctx.save(); ctx.beginPath(); ctx.roundRect(-half + 10, -half + 10, half * 2 - 20, half * 2 - 20, 70); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.moveTo(-half, -half); ctx.lineTo(-40, -half); ctx.lineTo(-half, 120); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 下側の凹みパネル（ベイを入れるくぼみ）と、留め具
  ctx.fillStyle = '#aab6c7';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(sx * 215 - 58, 200, 116, 78, 16); ctx.fill(); }
  ctx.fillStyle = '#2a2f37';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(sx * 215 - 20, 228, 40, 28, 6); ctx.fill(); }
  // 四角い壁（黒い皿のふち）：円ではなく、角が丸い四角
  const H = R + 14;
  const sqPath = (Hh: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) { const th = (i / 180) * Math.PI * 2, r = wallAt(th, Hh); const x = Math.sin(th) * r, y = Math.cos(th) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
  };
  sqPath(H + 6); ctx.fillStyle = '#3a414d'; ctx.fill();
  sqPath(H); const wallG = ctx.createLinearGradient(0, -H, 0, H); wallG.addColorStop(0, '#1b1f26'); wallG.addColorStop(1, '#0d0f13');
  ctx.fillStyle = wallG; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(160,175,195,0.35)'; ctx.stroke();
  // 皿の中（黒）：大きな円の段
  const dish = ctx.createRadialGradient(-20, -30, 20, 0, 0, RING_R + 10);
  dish.addColorStop(0, '#2b313b'); dish.addColorStop(0.7, '#1a1e25'); dish.addColorStop(1, '#101318');
  ctx.beginPath(); ctx.arc(0, 0, RING_R + 6, 0, Math.PI * 2); ctx.fillStyle = dish; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(180,195,215,0.28)';
  for (const f of [0.5]) { ctx.beginPath(); ctx.arc(0, 0, RING_R * f, 0, Math.PI * 2); ctx.stroke(); ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, 0, RING_R * f - 3, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } // 段（外側に明るい縁、内側に影） // 一番小さい円と、リングのすぐ内側の円は、なし
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(-18, -22, RING_R * 0.62, 0.2, 1.6); ctx.stroke();

  // 出口（下側3か所）：四角い壁に沿って、外へ張り出す
  const px = (phi: number, rr: number) => [Math.sin(phi) * rr, Math.cos(phi) * rr] as const;
  const drawExit = (phi: number, color: string) => {
    const p1 = px(phi - EXIT_HALF, wallAt(phi - EXIT_HALF, H)), p2 = px(phi - EXIT_HALF, wallAt(phi - EXIT_HALF, H + 44));
    const p3 = px(phi + EXIT_HALF, wallAt(phi + EXIT_HALF, H + 44)), p4 = px(phi + EXIT_HALF, wallAt(phi + EXIT_HALF, H));
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p4[0], p4[1]); ctx.stroke(); // 出口の手前の段
  };
  drawExit(0, '#f5b800'); drawExit(OVER_PHI, '#d63a2f'); drawExit(-OVER_PHI, '#d63a2f');
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7a5a00';
  ctx.fillText('EXTREME 3pt', 0, wallAt(0, H) + 60);
  ctx.fillStyle = '#9b2a20';
  for (const sx of [-1, 1]) { const q = px(OVER_PHI * sx, wallAt(OVER_PHI, H) + 40); ctx.fillText('OVER 2pt', q[0], q[1] + 26); }
  ctx.textAlign = 'start';
  // 出口の手前の段と、仕切り壁
  for (const phi of [0, OVER_PHI, -OVER_PHI]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const th = phi - EXIT_HALF + (i / 24) * EXIT_HALF * 2, q = px(th, wallAt(th, H - 2)); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
    ctx.lineWidth = 9; ctx.strokeStyle = '#7c8899'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    for (const sg of [-1, 1]) {
      const th = phi + sg * EXIT_HALF, q = px(th, wallAt(th, H));
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(-th);
      ctx.fillStyle = '#4c5875'; ctx.fillRect(-4.5, -10, 9, 58); ctx.fillStyle = '#c3cbe0'; ctx.fillRect(-1.2, -10, 2.4, 58);
      ctx.restore();
    }
  }
  // エクストリームライン（緑・つや付き・ぎざぎざの縁）：ぐるっと一周あって、上に凹みがある
  const ringPath = (off: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) { const th = (i / 360) * Math.PI * 2 - Math.PI / 2, r = ringRadiusAtAngle(th) + off; const x = Math.cos(th) * r, y = Math.sin(th) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
  };
  ringPath(0); ctx.lineJoin = 'round';
  ctx.lineWidth = 17; ctx.strokeStyle = '#3f9a14'; ctx.stroke();
  const gg = ctx.createLinearGradient(0, -RING_R, 0, RING_R); gg.addColorStop(0, '#b4f25a'); gg.addColorStop(0.5, '#79d62c'); gg.addColorStop(1, '#9be84a');
  ringPath(0); ctx.lineWidth = 13; ctx.strokeStyle = gg; ctx.stroke();
  ringPath(-2); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
  ctx.setLineDash([2, 5]); ringPath(8); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(60,140,20,0.7)'; ctx.stroke(); ctx.setLineDash([]); // ぎざぎざ
  // 台座の文字
  ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(95,105,125,0.6)';
  ctx.fillText('BEYBLADE X', 0, -H - 24);
  ctx.textAlign = 'start';
}

// スマホの横画面に合わせた枠：実機の横画面ではそのまま、PCなど大きな画面では 844x390 の枠を拡大して表示する
function calcFrame() {
  const iw = typeof window === 'undefined' ? 844 : window.innerWidth, ih = typeof window === 'undefined' ? 390 : window.innerHeight;
  if (iw > ih && ih <= 520) return { w: iw, h: ih, scale: 1, emulate: false, portrait: false };
  const FWd = 844, FHd = 390;
  return { w: FWd, h: FHd, scale: Math.max(0.3, Math.min((iw - 24) / FWd, (ih - 24) / FHd, 2.2)), emulate: true, portrait: ih > iw };
}
function useFrame() {
  const [f, setF] = useState(calcFrame);
  useEffect(() => {
    const on = () => setF(calcFrame());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return f;
}

export function Beyblade() {
  const frame = useFrame();
  const [cpuOpen, setCpuOpen] = useState(false); // カスタマイズ画面：CPUのベイ設定を開く
  const [phase, setPhase] = useState<'top' | 'lobby' | 'select' | 'order' | 'tbracket' | 'tchamp' | 'launch' | 'count' | 'battle' | 'result' | 'over'>('top');
  const [shotMode, setShotMode] = useState<'flat' | 'diag'>('flat');
  const [hasDrop, setHasDrop] = useState(false);
  const [mySide, setMySide] = useState<'left' | 'right'>('left'); // 自分が立つ側（左の人は左半分、右の人は右半分にしか落とせない）
  const [count, setCount] = useState<number | null>(null);
  // 対戦モード：1on1 / 3on3（3体のデッキ。順番を決めて、どちらかが4ポイント取るまで）
  const [mode, setMode] = useState<'1v1' | '3v3'>('1v1');
  const [gameMode, setGameMode] = useState<'versus' | 'tournament'>('versus'); // トップページ：通常の対戦 / トーナメント
  const [diff, setDiff] = useState<Diff>('normal'); // CPUの強さ
  const diffRef = useRef<Diff>('normal');
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
  const [online, setOnline] = useState<'host' | 'guest' | null>(null);
  const onlineRef = useRef<'host' | 'guest' | null>(null);
  onlineRef.current = online;
  const [hostLeft, setHostLeft] = useState(true); // オンライン：ホストが左側か（ホストが選ぶ）
  const selfIdx: 0 | 1 = online ? ((online === 'host') === hostLeft ? 0 : 1) : 0; // 自分が左(0)・右(1)のどちらか
  const selfIdxRef = useRef<0 | 1>(0);
  selfIdxRef.current = selfIdx;
  const [onlineLabel, setOnlineLabel] = useState('');
  const ordersRef = useRef<(number[] | null)[]>([null, null]); // オンライン3on3：左・右それぞれが決めた出す順番
  const defaultName = (k: number) => (online ? (online === 'host' ? 'ホスト' : 'ゲスト') : gameMode === 'versus' ? (vs === 'cpu' ? 'あなた' : `プレイヤー${k + 1}`) : `プレイヤー${k + 1}`);
  const playerName = (k: number) => playerNames[k].trim() || defaultName(k);
  const nameMe = names?.me ?? playerName(0);
  const nameCpu = names?.cpu ?? (vs === '2p' ? playerName(1) : 'CPU');
  const namesRef = useRef({ me: 'あなた', cpu: 'CPU' });
  namesRef.current = { me: nameMe, cpu: nameCpu };
  const namesNowRef = useRef<{ me: string; cpu: string }>({ me: 'ホスト', cpu: 'ゲスト' }); // オンライン：この対戦の名前
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
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const [orderPick, setOrderPick] = useState<number[]>([]); // 順番決めの途中
  const [order, setOrder] = useState<number[]>([]); // 自分の出す順番（deck.me の番号）
  const cpuOrderRef = useRef<number[]>([0, 1, 2]);
  const vsRef = useRef<'cpu' | '2p'>('cpu');
  const hideOppRef = useRef(false); // 相手の落とす位置を隠す（CPU対戦の設定 / トーナメント）
  const mode2Ref = useRef<'flat' | 'diag'>('flat');
  const aim2Ref = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef<0 | 1>(0); // ドラッグで向きを決めているプレイヤー
  const [roundIdx, setRoundIdx] = useState(0); // 3体のうち何戦目か
  const cycleRef = useRef(0);
  const [cycle, setCycle] = useState(0); // 3体使い切って順番を決め直した回数
  cycleRef.current = cycle;
  const [score, setScore] = useState({ me: 0, cpu: 0 });
  const [message, setMessage] = useState<{ winner: 'me' | 'cpu'; finish: Finish } | null>(null);

  // ---- オンライン対戦：ホスト（部屋を作った側）が計算して、ゲストには動きを送る
  const linkRef = useRef<Link | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const handleMsgRef = useRef<(m: Msg) => void>(() => {});
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyMsg, setLobbyMsg] = useState('');
  const [topOnline, setTopOnline] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ deck: Custom[]; name: string } | null>(null); // ホスト側：ゲストが準備OKか
  const [selfReady, setSelfReady] = useState(false); // 自分の準備OK / 場所の決定
  const [placeLeft, setPlaceLeft] = useState(10); // 場所決めの残り秒数
  const deadlineRef = useRef(0);
  const selfReadyRef = useRef(false);
  selfReadyRef.current = selfReady;
  const placeSentRef = useRef(0);
  const tickRef = useRef(0);
  const onlineLabelRef = useRef('オンライン');
  const ghostDispRef = useRef<{ x: number; y: number } | null>(null); // 相手のランチャーの表示位置（なめらかに動かす）
  const readyRef = useRef({ host: false, guest: false });
  const snapsRef = useRef<{ t: number; b: number[][] }[]>([]);
  const lastSendRef = useRef(0);
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
  diffRef.current = diff;
  hideOppRef.current = vs === 'cpu' || gameMode === 'tournament'; // CPUの落とす位置は常に見えない（ランチャーのヒントだけ）
  mode2Ref.current = shotMode2;
  sideRef.current = mySide;

  // CPUは自分の半分の中で、毎回ちがう場所・シュートの仕方・向きで落とす（ラウンド開始時に決まり、向きを決めるときから見える）
  const planCpu = (style0?: Style) => {
    const d = diffRef.current;
    // やさしい：タイプ別の上手な打ち方をしない / つよい：タイプがなければ、技巧派かアタックの打ち方
    const style: Style | undefined = d === 'easy' ? undefined : d === 'hard' && !style0 ? (Math.random() < 0.6 ? 'technique' : 'attacker') : style0;
    const pl = planCpuBase(style);
    if (d === 'easy') return { ...pl, power: 0.35 + 0.25 * Math.random() }; // 勢いが弱い
    if (d === 'hard') return { ...pl, power: Math.max((pl as { power?: number }).power ?? 0.9, 0.95) };
    return pl;
  };
  const planCpuBase = (style?: Style) => {
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
    if (onlineRef.current === 'host') { // オンライン：場所決めは10秒。両方が「決定」するか、時間切れでシュート
      readyRef.current = { host: false, guest: false };
      setSelfReady(false);
      deadlineRef.current = Date.now() + 10000;
      setPlaceLeft(10);
      linkRef.current?.send({ t: 'round', me: m, cpu: c, names: namesNowRef.current, score: scoreRef.current, label: onlineLabelRef.current, hostLeft });
    }
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
      // つよい：パーツを選ばなかった1on1の相手は、強めのカスタムから選ぶ
      if (diff === 'hard' && n === 1 && !cpuSels[0].blade && !cpuSels[0].ratchet && !cpuSels[0].bit) cpuDeck = [{ ...HARD_POOL[Math.floor(Math.random() * HARD_POOL.length)] }];
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
    if (online) { // オンライン3on3：自分の順番を決める。両方そろったらホストが始める
      setSelfReady(true);
      if (online === 'host') { ordersRef.current[selfIdx] = orderPick; tryStartOrdered(); }
      else sendOn({ t: 'order', order: orderPick });
      return;
    }
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
        if (onlineRef.current === 'host') { ordersRef.current = [null, null]; setSelfReady(false); sendOn({ t: 'toOrder', deck, names: namesNowRef.current, score: scoreRef.current, hostLeft, cycle: cycle + 1 }); }
        setCycle(c => c + 1);
        setOrderPick([]);
        setOrder([]);
        setOrderWho(0);
        setPhase('order');
        return;
      }
      setRoundIdx(ni);
      onlineLabelRef.current = `3on3・第${ni + 1}戦${cycle > 0 ? `(${cycle + 1}周目)` : ''}`; setOnlineLabel(onlineLabelRef.current);
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
    const bs: [Bey, Bey] = [
      makeBey('me', my.x, my.y, modeRef.current === 'diag', aimRef.current, 0.85),
      makeBey('cpu', cpu.x, cpu.y, cpu.diag, cpu.aim, vsRef.current === '2p' ? 0.85 : cpu.power ?? 0.7 + Math.random() * 0.3),
    ];
    if (vsRef.current === 'cpu') { // CPUの強さ：ベイの回転数が変わる
      const m = DIFF_SPIN[diffRef.current];
      bs[1].spinMax *= m; bs[1].spin *= m;
    }
    beysRef.current = bs;
    endedRef.current = false;
    (window as unknown as { __dashes?: number[] }).__dashes = [0, 0];
    linkRef.current?.send({ t: 'fire' });
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
    const cnt = (n: number | null) => { setCount(n); linkRef.current?.send({ t: 'count', n }); }; // オンライン：相手にもカウントを見せる
    cnt(3);
    countTimers.current.forEach(window.clearTimeout);
    countTimers.current = [
      window.setTimeout(() => cnt(2), 800 / countScale),
      window.setTimeout(() => cnt(1), 1600 / countScale),
      window.setTimeout(() => cnt(0), 2400 / countScale),
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
    if (phaseRef.current !== 'launch' || (onlineRef.current && selfReadyRef.current)) return;
    const p = toStadium(e);
    const lim = R - BEY_R - 8, m = BEY_R + 8;
    const two = vsRef.current === '2p';
    // 2人対戦：左半分をタップ＝プレイヤー1、右半分をタップ＝プレイヤー2
    const player: 0 | 1 = two ? (p.x < 0 ? 0 : 1) : 0;
    if (onlineRef.current && (player !== selfIdxRef.current || selfReadyRef.current)) return; // オンライン：自分の半分だけ。決定後は動かせない
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
    if (onlineRef.current === 'host') linkRef.current?.send({ t: 'ghost', x, y }); // 自分の置き場所を相手にランチャーで見せる
    else if (onlineRef.current === 'guest') sendPlace(false);
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
      if (onlineRef.current === 'guest' && Date.now() - placeSentRef.current > 70) sendPlace(false);
      return;
    }
    if (!dropRef.current) return;
    const dx = p.x - dropRef.current.x, dy = p.y - dropRef.current.y;
    const l = Math.hypot(dx, dy);
    aimRef.current = l > 24 && modeRef.current === 'diag' ? { x: dx / l, y: dy / l } : null; // 向きを決められるのは斜めシュートだけ
    if (onlineRef.current === 'guest' && Date.now() - placeSentRef.current > 70) sendPlace(false);
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
        const fresh: Part[] = [];
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 300;
          fresh.push({
            x: loser.x, y: loser.y, vx: loser.vx * 0.4 + Math.cos(a) * sp, vy: loser.vy * 0.4 + Math.sin(a) * sp,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 24, color: i % 2 ? t.color : '#b8c2d4', size: 8 + Math.random() * 10, life: 3,
          });
        }
        partsRef.current.push(...fresh);
        flashRef.current = 1;
        linkRef.current?.send({ t: 'parts', parts: fresh });
      }
    }
    linkRef.current?.send({ t: 'end', winner, finish });
    setMessage({ winner, finish });
    // 決着の動きを見せてから結果表示
    timerRef.current = window.setTimeout(() => {
      const next = { ...scoreRef.current, [winner]: scoreRef.current[winner] + FINISH_INFO[finish].points };
      scoreRef.current = next;
      setScore(next);
      setPhase(next[winner] >= WIN_POINTS ? 'over' : 'result');
      linkRef.current?.send({ t: 'res', phase: next[winner] >= WIN_POINTS ? 'over' : 'result', score: next });
    }, 1300);
  }, []);

  // ---------------- オンライン対戦 ----------------
  const sendOn = (m: Msg) => linkRef.current?.send(m);
  const sendPlace = (ready: boolean) => { // ゲスト：自分の置き場所・向き・打ち方をホストに伝える
    if (onlineRef.current !== 'guest') return;
    let q: { x: number; y: number; diag: boolean; aim: { x: number; y: number } | null } | null = null;
    if (selfIdxRef.current === 1) { const c = cpuPlanRef.current; if (c) q = { x: c.x, y: c.y, diag: c.diag, aim: aim2Ref.current }; }
    else if (dropRef.current) q = { x: dropRef.current.x, y: dropRef.current.y, diag: modeRef.current === 'diag', aim: aimRef.current };
    if (!q) return;
    placeSentRef.current = Date.now();
    sendOn({ t: 'place', x: q.x, y: q.y, diag: q.diag, aim: q.aim, ready });
  };
  const leaveOnline = (msg = '') => {
    cancelRef.current?.(); cancelRef.current = null;
    const l = linkRef.current; linkRef.current = null;
    if (l) { l.onClose = () => {}; l.close(); }
    onlineRef.current = null; setOnline(null);
    window.clearTimeout(timerRef.current); countTimers.current.forEach(window.clearTimeout);
    endedRef.current = true;
    beysRef.current = null; partsRef.current = []; dropRef.current = null; aimRef.current = null; cpuPlanRef.current = null; snapsRef.current = [];
    setCount(null); setMessage(null); setHasDrop(false); setHasDrop2(false); setGuestInfo(null); setSelfReady(false); setNames(null);
    setLobbyMsg(msg); setTopOnline(true);
    setPhase('top');
  };
  const attachLink = (link: Link, role: 'host' | 'guest') => {
    linkRef.current = link; onlineRef.current = role; setOnline(role);
    link.onMsg = m => handleMsgRef.current(m);
    link.onClose = () => leaveOnline('相手との接続が切れました');
    vsRef.current = '2p'; setVs('2p'); setMode('1v1'); setGameMode('versus'); setMySide('left'); sideRef.current = 'left';
    setGuestInfo(null); setSelfReady(false); setLobbyMsg(''); setWho(0); setSlot(0); setNames(null);
    setPhase('select');
  };
  const makeRoom = () => {
    setLobbyMsg('');
    const start = (code: string) => {
      setRoomCode(code);
      cancelRef.current = createRoom(code, {
        onLink: l => (linkRef.current ? l.close() : attachLink(l, 'host')),
        onError: msg => { cancelRef.current?.(); if (msg === 'unavailable') start(randomCode()); else leaveOnline(msg); },
      });
    };
    start(randomCode());
    setPhase('lobby');
  };
  const enterRoom = () => {
    if (!/^\d{4}$/.test(joinCode)) { setLobbyMsg('4桁の部屋番号を入れてください'); return; }
    setLobbyMsg('つないでいます…');
    cancelRef.current?.();
    cancelRef.current = joinRoom(joinCode, { onLink: l => attachLink(l, 'guest'), onError: msg => setLobbyMsg(msg) });
  };
  // ホスト：ゲストが準備OKなら、対戦を始める（左側の人が「ベイ1」側、右側の人が「ベイ2」側として扱う）
  const startOnlineMatch = () => {
    if (!guestInfo) return;
    const n = mode === '3v3' ? 3 : 1;
    const hostDeck = customs.slice(0, n), guestDeck = guestInfo.deck.slice(0, n);
    const hn = playerNames[0].trim() || 'ホスト';
    const nn = hostLeft ? { me: hn, cpu: guestInfo.name } : { me: guestInfo.name, cpu: hn };
    const dk = hostLeft ? { me: hostDeck, cpu: guestDeck } : { me: guestDeck, cpu: hostDeck };
    namesNowRef.current = nn; setNames(nn);
    scoreRef.current = { me: 0, cpu: 0 }; setScore({ me: 0, cpu: 0 }); setMessage(null);
    setDeck(dk); setRoundIdx(0); setCycle(0);
    if (n === 3) { // 3on3：まず、それぞれが自分のベイの出す順番を決める（相手には見えない）
      ordersRef.current = [null, null]; setSelfReady(false); setOrderPick([]); setOrder([]); setOrderWho(0);
      setOnlineLabel('3on3・第1戦');
      linkRef.current?.send({ t: 'toOrder', deck: dk, names: nn, score: { me: 0, cpu: 0 }, hostLeft, cycle: 0 });
      beysRef.current = null;
      setPhase('order');
      return;
    }
    setOnlineLabel('1on1'); onlineLabelRef.current = '1on1';
    setupRound(dk.me[0], dk.cpu[0]);
  };
  const guestReady = () => {
    const on = !selfReady;
    setSelfReady(on);
    sendOn(on ? { t: 'ready', deck: customs.slice(0, mode === '3v3' ? 3 : 1), name: playerNames[0].trim() || 'ゲスト' } : { t: 'unready' });
  };
  // オンライン3on3：両方の順番がそろったら、第1戦を始める
  const tryStartOrdered = () => {
    const [o0, o1] = ordersRef.current;
    if (!o0 || !o1 || onlineRef.current !== 'host') return;
    ordersRef.current = [null, null];
    setOrder(o0); cpuOrderRef.current = o1; setRoundIdx(0);
    onlineLabelRef.current = `3on3・第1戦${cycleRef.current > 0 ? `(${cycleRef.current + 1}周目)` : ''}`; setOnlineLabel(onlineLabelRef.current);
    setupRound(deckRef.current.me[o0[0]], deckRef.current.cpu[o1[0]]);
  };
  // ホスト：ゲストに設定（1on1/3on3・左右）を知らせる
  useEffect(() => {
    if (online === 'host' && phase === 'select') linkRef.current?.send({ t: 'cfg', mode, hostLeft });
  }, [online, phase, mode, hostLeft, guestInfo]);
  const checkBothReady = () => { if (readyRef.current.host && readyRef.current.guest && phaseRef.current === 'launch') shoot(); };
  const decide = () => { // 場所を「決定」
    if (onlineRef.current === 'host') { readyRef.current.host = true; setSelfReady(true); checkBothReady(); }
    else { setSelfReady(true); sendPlace(true); }
  };
  const randomPlan = (side: 'left' | 'right') => { // 時間切れ：自分の半分のランダムな場所・向き・打ち方
    const sx = side === 'left' ? -1 : 1, lim = R - BEY_R - 8, m = BEY_R + 8;
    const rr = (0.15 + 0.75 * Math.random()) * lim, phi = (Math.random() - 0.5) * Math.PI * 0.92;
    const ax = Math.min(Math.max(Math.cos(phi) * rr, m), lim), maxY = Math.sqrt(Math.max(0, lim * lim - ax * ax));
    const x = ax * sx, y = Math.max(-maxY, Math.min(maxY, Math.sin(phi) * rr));
    const dir = side === 'left' ? TYPES.me.spinDir : TYPES.cpu.spinDir, a = Math.random() * Math.PI * 2;
    return { x, y, diag: Math.random() < 0.4, aim: Math.random() < 0.5 ? defaultAim(x, y, dir) : { x: Math.cos(a), y: Math.sin(a) } };
  };
  // ホスト：場所決めのタイマー（10秒）。時間切れで決まっていない人はランダムにシュート
  useEffect(() => {
    if (online !== 'host' || phase !== 'launch') return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setPlaceLeft(left); linkRef.current?.send({ t: 'timer', left });
      if (Date.now() >= deadlineRef.current) {
        deadlineRef.current = Infinity;
        if (!dropRef.current) {
          const q = randomPlan('left');
          dropRef.current = { x: q.x, y: q.y }; aimRef.current = q.aim; modeRef.current = q.diag ? 'diag' : 'flat'; setShotMode(q.diag ? 'diag' : 'flat'); setHasDrop(true);
          if (selfIdxRef.current === 0) linkRef.current?.send({ t: 'ghost', x: q.x, y: q.y });
        }
        if (!cpuPlanRef.current) {
          const q = randomPlan('right');
          cpuPlanRef.current = q; setHasDrop2(true);
          if (selfIdxRef.current === 1) linkRef.current?.send({ t: 'ghost', x: q.x, y: q.y });
        }
        shoot();
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, phase, shoot]);
  // 通信で届いたメッセージ
  handleMsgRef.current = (m: Msg) => {
    const role = onlineRef.current;
    if (role === 'host') {
      if (m.t === 'ready') setGuestInfo({ deck: m.deck as Custom[], name: String(m.name) });
      else if (m.t === 'unready') setGuestInfo(null);
      else if (m.t === 'order') { // 3on3：ゲストが順番を決めた
        ordersRef.current[1 - selfIdxRef.current] = m.order as number[];
        tryStartOrdered();
      } else if (m.t === 'place' && phaseRef.current === 'launch') { // ゲストの置き場所（ゲストが入っている側の枠に入れる）
        const x = Number(m.x), y = Number(m.y), diag = !!m.diag, gi = 1 - selfIdxRef.current;
        const aim = (m.aim as { x: number; y: number } | null) ?? defaultAim(x, y, gi === 0 ? TYPES.me.spinDir : TYPES.cpu.spinDir);
        if (gi === 1) { cpuPlanRef.current = { x, y, diag, aim }; setHasDrop2(true); }
        else { dropRef.current = { x, y }; aimRef.current = (m.aim as { x: number; y: number } | null); modeRef.current = diag ? 'diag' : 'flat'; setShotMode(diag ? 'diag' : 'flat'); setHasDrop(true); }
        if (m.ready) { readyRef.current.guest = true; checkBothReady(); }
      }
      return;
    }
    if (role !== 'guest') return;
    switch (m.t) {
      case 'round': {
        TYPES.me = buildBey(m.me as Custom); TYPES.cpu = buildBey(m.cpu as Custom);
        const nn = m.names as { me: string; cpu: string };
        namesNowRef.current = nn; setNames(nn); setOnlineLabel(String(m.label ?? '')); setHostLeft(!!m.hostLeft); selfIdxRef.current = m.hostLeft ? 1 : 0;
        scoreRef.current = m.score as { me: number; cpu: number }; setScore(scoreRef.current);
        countTimers.current.forEach(window.clearTimeout); window.clearTimeout(timerRef.current);
        beysRef.current = null; partsRef.current = []; snapsRef.current = []; dropRef.current = null; aimRef.current = null; cpuPlanRef.current = null; aim2Ref.current = null;
        setMessage(null); setCount(null); setHasDrop(false); setHasDrop2(false); setSelfReady(false); setPlaceLeft(10);
        vsRef.current = '2p'; setVs('2p');
        setPhase('launch');
        break;
      }
      case 'ghost': { // ホストの置き場所（ホストが入っている側の枠）
        const q = { x: Number(m.x), y: Number(m.y) };
        if (selfIdxRef.current === 1) dropRef.current = q; else cpuPlanRef.current = { ...q, diag: false, aim: defaultAim(q.x, q.y, TYPES.cpu.spinDir) };
        break;
      }
      case 'cfg': setMode(m.mode as '1v1' | '3v3'); setHostLeft(!!m.hostLeft); break;
      case 'toOrder': {
        const dk = m.deck as { me: Custom[]; cpu: Custom[] };
        setDeck(dk); setHostLeft(!!m.hostLeft); selfIdxRef.current = m.hostLeft ? 1 : 0;
        const nn = m.names as { me: string; cpu: string }; namesNowRef.current = nn; setNames(nn);
        scoreRef.current = m.score as { me: number; cpu: number }; setScore(scoreRef.current);
        setCycle(Number(m.cycle) || 0); setOnlineLabel(`3on3・第1戦`);
        countTimers.current.forEach(window.clearTimeout); window.clearTimeout(timerRef.current);
        beysRef.current = null; partsRef.current = []; snapsRef.current = []; setMessage(null); setCount(null);
        setOrderPick([]); setOrder([]); setSelfReady(false);
        setPhase('order');
        break;
      }
      case 'timer': setPlaceLeft(Number(m.left)); break;
      case 'count':
        if (phaseRef.current !== 'count') { beysRef.current = null; partsRef.current = []; snapsRef.current = []; setPhase('count'); }
        setCount(m.n as number | null);
        break;
      case 'fire': snapsRef.current = []; beysRef.current = null; setCount(null); setPhase('battle'); break;
      case 's': snapsRef.current.push({ t: performance.now(), b: m.b as number[][] }); if (snapsRef.current.length > 8) snapsRef.current.shift(); break;
      case 'sp': makeSparks(sparksRef.current, Number(m.x), Number(m.y), Number(m.n), !!m.old); break;
      case 'parts': partsRef.current.push(...(m.parts as Part[])); break;
      case 'end': setMessage({ winner: m.winner as 'me' | 'cpu', finish: m.finish as Finish }); break;
      case 'res': scoreRef.current = m.score as { me: number; cpu: number }; setScore(scoreRef.current); setPhase(m.phase as 'result' | 'over'); break;
      case 'toSelect': window.clearTimeout(timerRef.current); beysRef.current = null; setMessage(null); setSelfReady(false); setPhase('select'); break;
    }
  };

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

    const spark = (x: number, y: number, n: number, old = false) => {
      if (onlineRef.current === 'host') linkRef.current?.send({ t: 'sp', x: Math.round(x), y: Math.round(y), n, old });
      makeSparks(sparksRef.current, x, y, n, old);
    };

    const step = () => {
      if (onlineRef.current === 'guest') return; // ゲストは計算せず、ホストから届いた動きを描くだけ
      const beys = beysRef.current;
      if (!beys) return;
      if (phaseRef.current === 'count') { for (const b of beys) b.angle += 0.6; return; }
      if (phaseRef.current !== 'battle') return;
      for (const b of beys) {
        if (b.dead) continue;
        // 回転の速さは回転数に応じて落ちていく。0になったら止まる
        { const rt = Math.max(0, b.spin / b.spinMax); b.angle += b.spin > 0 ? b.dir * (2 + 75 * Math.pow(rt, 1.5)) * DT : 0; }
        if (b.out) {
          // 出口から場外ポケットへ滑り込む
          b.vx *= 1 - 5 * DT; b.vy *= 1 - 5 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          const dq = sqn(b.x, b.y);
          if (dq > R + 40) { b.x *= (R + 40) / dq; b.y *= (R + 40) / dq; }
          continue;
        }
        const t = TYPES[b.type];
        const ratio = Math.max(0, b.spin / b.spinMax);
        b.grace = Math.max(0, b.grace - DT);
        b.age += DT;
        b.postT = Math.max(0, b.postT - DT);
        b.calmT = Math.max(0, b.calmT - DT);
        if (b.outT > 0) {
          // 場外ポケットに入った：すぐには勝敗を決めず、少しその場で回る（回転が強ければスタジアムに戻ることがある）
          b.vx *= 1 - 4 * DT; b.vy *= 1 - 4 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          const th = Math.atan2(b.x, b.y), lim2 = EXIT_HALF - 0.06; // 仕切りの壁の間にとどまる
          const tc = Math.max(b.outPhi - lim2, Math.min(b.outPhi + lim2, th));
          const wr = wallAt(tc, R), rr = Math.max(wr + 4, Math.min(wr + 26, Math.hypot(b.x, b.y)));
          b.x = Math.sin(tc) * rr; b.y = Math.cos(tc) * rr;
          b.spin = Math.max(0, b.spin - 60 * t.decay * DT * 6 * 0.2);
          continue;
        }
        b.dashT = Math.max(0, b.dashT - DT);
        b.coast = Math.max(0, b.coast - DT);
        b.dashCd = Math.max(0, b.dashCd - DT);
        b.dashFx = Math.max(0, b.dashFx - DT);
        b.knockT = Math.max(0, b.knockT - DT);

        // 回転が止まったら、その場で止まる
        if (b.spin <= 0) {
          b.riding = false; b.holdT = 0;
          b.vx *= 1 - 8 * DT; b.vy *= 1 - 8 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          // 止まったベイは、勢いが残っていてもスタジアムの外には出ない（スピンフィニッシュは必ず場内）。
          // 激しく壁に当たったときは、いきなり止まらず、少し跳ね返って戻ってから止まる
          const d0 = sqn(b.x, b.y), lim0 = R - BEY_R * 1.1;
          if (d0 > lim0) {
            const g0x = Math.sign(b.x) * Math.pow(Math.abs(b.x), WALL_N - 1), g0y = Math.sign(b.y) * Math.pow(Math.abs(b.y), WALL_N - 1), g0l = Math.hypot(g0x, g0y) || 1;
            const nx = g0x / g0l, ny = g0y / g0l, outv = b.vx * nx + b.vy * ny;
            b.x *= lim0 / d0; b.y *= lim0 / d0;
            if (outv > 0) { b.vx -= 1.5 * outv * nx; b.vy -= 1.5 * outv * ny; }
          }
          continue;
        }

        // 斜めシュート：落とした場所でしばらく回り続け、それから動き出す
        if (b.holdT > 0) {
          b.holdT -= DT;
          // とどまっていても、狙った向きへほんの少しずつ動く（当てられたら、その場で解除される）
          const drift = (75 + 0.16 * b.push) * (t.mobility > 1 ? t.mobility ** 2 : 1);
          b.vx += (b.ax * drift + (Math.random() - 0.5) * 20 - b.vx) * 6 * DT;
          b.vy += (b.ay * drift + (Math.random() - 0.5) * 20 - b.vy) * 6 * DT;
          b.x += b.vx * DT; b.y += b.vy * DT;
          // 斜めシュートで壁の方へ向けても、壁は突き抜けない（その場でとどまっている間は出口にも入らない）
          { const dh = sqn(b.x, b.y), lh = R - BEY_R * 0.3;
            if (dh > lh) { const hx = Math.sign(b.x) * Math.pow(Math.abs(b.x), WALL_N - 1), hy = Math.sign(b.y) * Math.pow(Math.abs(b.y), WALL_N - 1), hl = Math.hypot(hx, hy) || 1, nx = hx / hl, ny = hy / hl, ov = b.vx * nx + b.vy * ny; b.x *= lh / dh; b.y *= lh / dh; if (ov > 0) { b.vx -= ov * nx; b.vy -= ov * ny; } } }
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
        const sT0 = Math.max(0, Math.min(1, (0.68 - ratio) / 0.38)), wMode = 1 - sT0 * sT0 * (3 - 2 * sT0); // 回転が強いほど1（ぶつかったあとの別々の動きが、はっきり出る）
        // 実際の動画：最初はリングの近くを動き回り、時間がたつにつれて中央付近に集まる（すり鉢の中心へ引かれる力が、だんだん強くなる）
        const aT = Math.max(0, Math.min(1, (0.68 - ratio) / 0.38));
        let kPull = 1.5 + 4.5 * aT * aT * (3 - 2 * aT);
        kPull *= 0.3 + 0.7 * Math.max(0, Math.min(1, 1 - b.postT)); // ぶつかった直後は、真ん中へ引き戻されず、はじけた向きへ惰性で動く
        if (b.mode === 2 && !t.flat) kPull *= 1 - 0.85 * wMode; // 回る動き：真ん中には引かれず、決まった半径を回る
        else if (b.mode === 1) kPull += 7 * wMode; // 真ん中に戻る動き
        const shp = Math.max(0, Math.min(1, 1 - b.postT)); // ぶつかった直後は0（円・楕円の力なし）、時間がたつと1に戻る
        if (t.flat) { // 楕円で回る：向きは、ゆっくり変わる
          b.eAng += 0.12 * DT;
          const ce = Math.cos(b.eAng), se = Math.sin(b.eAng), px = b.x * ce + b.y * se, py = -b.x * se + b.y * ce;
          const ax = -kPull * px, ay = -kPull * (b.er * shp + (1 - shp)) * py;
          b.vx += (ax * ce - ay * se) * DT; b.vy += (ax * se + ay * ce) * DT;
        } else {
          const kk = t.tip ? kPull * (1 + 0.9 * shp) : kPull; // Hは、小さな円
          b.vx += -b.x * kk * DT;
          b.vy += -b.y * kk * DT;
        }
        if (b.orbR > 0 && !b.hit && b.dashT <= 0 && !b.riding) { // ぶつかるまでは、真ん中の円より少し大きい円を、なめらかに描いて回る
          const w = Math.max(wMode, 0.4), rr = Math.hypot(b.x, b.y) || 1, ux = b.x / rr, uy = b.y / rr, tx = (b.dir * b.y) / rr, ty = (-b.dir * b.x) / rr;
          const tgt = t.cruise * 0.95, rv = Math.max(-260, Math.min(260, -(rr - b.orbR) * 4)); // 円の半径に近づくように、少しずつ内外へ寄る
          const k = Math.min(1, 7 * w * DT);
          b.vx += (tx * tgt + ux * rv - b.vx) * k; b.vy += (ty * tgt + uy * rv - b.vy) * k;
        }
        if (b.mode === 2 && !t.flat && wMode > 0.02 && b.dashT <= 0) { // 一方のベイは、真ん中の周りを回り続ける
          const rr = Math.hypot(b.x, b.y) || 1, ux = b.x / rr, uy = b.y / rr, tx = -uy * b.osgn, ty = ux * b.osgn;
          const pull = -(rr - b.r0) * 7 * wMode;
          b.vx += ux * pull * DT; b.vy += uy * pull * DT;
          const vtan = b.vx * tx + b.vy * ty, tgt = t.cruise * 0.95 * wMode;
          if (vtan < tgt) { b.vx += tx * (tgt - vtan) * 3 * DT; b.vy += ty * (tgt - vtan) * 3 * DT; }
        }
        // ジャイロ効果で軌道が緩やかにカーブする
        const c = b.curl * 0.35 * (0.3 + ratio) * DT; // ゆるやかなカーブ（外周をぐるぐる回り続けないように）
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
        const rem = ((((Math.atan2(b.y, b.x) + Math.PI / 2) * b.dir) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // ラインに乗ってから凹みまでの、走る向きの残りの角度（ぐるっと1周近く走らせない）
        if (!b.riding && b.dashesLeft > 0 && b.dashCd <= 0 && ratio > 0.25 && rem < 3.6 && speed > 120 && dist > R * 0.8 && alongRing > 0.2 * speed) {
          if (b.rideChance >= 1) { b.riding = true; b.rideT = 0; b.dAt = Math.max(-1, Math.min(1, (Math.random() + Math.random() - 1) * 1.5)); }
          else if (!b.onRing) {
            // 斜めシュートはリングに乗りにくい（乗れないぶん、自爆しにくい）
            b.onRing = true;
            if (Math.random() < b.rideChance) { b.riding = true; b.rideT = 0; b.dAt = Math.max(-1, Math.min(1, (Math.random() + Math.random() - 1) * 1.5)); }
            else b.rideChance = Math.min(1, b.rideChance + 0.2);
          }
        }
        if (dist < R * 0.7) b.onRing = false;
        if (b.riding) {
          b.rideT += DT;
          const d = Math.hypot(b.x, b.y) || 1;
          // 右回転は反時計回りにリングを走る（右側を駆け上がる）。左回転はその鏡写し（左側を駆け上がる）
          const tx = (b.dir * b.y) / d, ty = (-b.dir * b.x) / d;
          const rs = 1250 * t.dash;
          const fix = (ringRadiusAt(b.x, b.y) - d) * 8; // リングの上に保つ（上では凹みに沿う）
          b.vx = tx * rs + (b.x / d) * fix; b.vy = ty * rs + (b.y / d) * fix;
          b.x += b.vx * DT; b.y += b.vy * DT;
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 14) b.trail.shift();
          b.spin = Math.max(0, b.spin - (4.5 + rs * 0.0145) * t.decay * DT * 6);
          const atTop = Math.abs(Math.atan2(b.y, b.x) + Math.PI / 2) < 0.12; // 凹みの底（平らなところ）から発射する
          if (false as boolean && atTop && b.rideT > 0.05 && ratio > 0.22 && b.diagShot && !b.notched) { // 凹みでは止まらない：ラインに乗ってスピードがついたら、そのまま真ん中へ発射
            // 斜めシュート：凹みに少し滞在して、ゆっくり中央に向かって降りてくる
            b.notched = true; b.riding = false; b.rideChance = 1;
            const dn = d || 1; b.ax = -b.x / dn; b.ay = -b.y / dn; b.push = 150;
            b.holdT = 0.7 + Math.random() * 0.6; b.calmT = 3.0; b.vx = b.ax * 40; b.vy = b.ay * 40; b.dashCd = Math.max(b.dashCd, 0.8);
          } else if (atTop && b.rideT > 0.05 && ratio > 0.22) {
            // 上側から中央へ発射
            const nx = -b.x / d, ny = -b.y / d;
            // ダッシュの向き：真ん中に向かうか、回転が強いときは、真ん中より少し左へ向かう（右のオーバーゾーン側へは向かわない。左回転のベイは左右が逆）
            const wide = ratio > 0.55 && Math.random() < 0.45; // 回転が強いときは、ときどき広い角度で飛ぶ（凹みの向き＝真ん中が基本。広いときは左寄り）
            const lean = wide ? (0.35 + 0.85 * Math.random()) * ratio : 0, jit = (Math.random() + Math.random() - 1) * (wide ? 0.3 : 0.1);
            let dx = nx * 0.85 + tx * lean, dy = ny * 0.85 + ty * lean;
            { const cj = Math.cos(jit), sj = Math.sin(jit), ndx = dx * cj - dy * sj, ndy = dx * sj + dy * cj; dx = ndx; dy = ndy; }
            const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            // ちょうどオーバーゾーンに向かう角度は、たまにしか選ばれない（実際にはあるが、少ない）
            for (let tries = 0; tries < 3; tries++) {
              const pd = b.x * dx + b.y * dy, disc = pd * pd - (b.x * b.x + b.y * b.y - R * R);
              if (disc < 0) break;
              const sL = -pd + Math.sqrt(disc), qx = b.x + dx * sL, qy = b.y + dy * sL, landing = Math.abs(Math.atan2(qx, qy));
              if (Math.abs(landing - OVER_PHI) < EXIT_HALF + 0.06 && Math.random() < 0.85) {
                const j2 = (Math.random() + Math.random() - 1) * 0.16, cj = Math.cos(j2), sj = Math.sin(j2);
                dx = nx * cj - ny * sj; dy = nx * sj + ny * cj; // 真ん中へ向かう向きに、少しだけ揺らして、選び直す
              } else break;
            }
            const dashSpeed = (1500 + 200 * ratio) * t.dash * (0.4 + 0.6 * Math.pow(ratio, 1.4)); // 回転が落ちるとダッシュも弱くなる。凹みから中央へ戻るときは、勢いをつけすぎない
            b.vx = dx * dashSpeed; b.vy = dy * dashSpeed;
            b.riding = false;
            b.dashT = 0.4; b.coast = 1.0; b.calmT = 2.2; b.dashCd = (2 + Math.random() * 1.5) * t.dashCd; b.dashFx = 0.7;
            b.rideChance = 1; // 1回ダッシュしたら、斜めシュートでも水平と同じ（R/LRはここから何度もダッシュ）
            b.dashesLeft--;
            b.spin = Math.max(0, b.spin - b.spinMax * 0.05 * t.dashCost); // Xダッシュでも持久が削られる（回数が多いR/LRほど消耗する）
            { const w = window as unknown as { __dashes?: number[] }; (w.__dashes ??= [0, 0])[beys.indexOf(b)]++; } // 動作確認用のダッシュ回数カウンタ
            spark(b.x, b.y, 22);
          } else if (atTop && b.rideT > 0.05) { b.riding = false; b.dashCd = 1.2; // 回転が弱いときは、乗ってもダッシュできない：ぐるぐる回らずライン上でおりる
          } else if (b.rideT > 1.4) {
            b.riding = false; b.dashCd = 0.6;
          }
          continue;
        }
        if (b.spiralT > 0) { // 斜めシュートで壁に当たったあと：勢いよく戻らず、回りながらゆっくり真ん中へ寄っていく
          b.spiralT -= DT;
          const sd = Math.hypot(b.x, b.y) || 1;
          if (b.dashT > 0 || b.knockT > 0 || sd < 110) b.spiralT = 0;
          else {
            const tgx = (b.dir * b.y) / sd * 170 - (b.x / sd) * 48, tgy = (-b.dir * b.x) / sd * 170 - (b.y / sd) * 48;
            b.vx += (tgx - b.vx) * 3 * DT; b.vy += (tgy - b.vy) * 3 * DT;
            b.calmT = Math.max(b.calmT, 1);
          }
        }
        const damp = 1 - (0.08 + (1 - ratio) * 0.7 + (b.dashT > 0 ? 2.0 : 0) + (b.coast > 0 && b.dashT <= 0 ? 0.6 : 0) + 0) * DT; // ぶつかったあとも、急には減速しない（飛ぶ向き・量・角度は当たり所で変わる） // ダッシュ中は失速し、反対側のライン付近まで届く
        b.vx *= damp; b.vy *= damp;
        speed = Math.hypot(b.vx, b.vy);
        // 巡航：回転が残っている間は、止まらずに動き続ける（今の向きに沿って、目標の速さまで加速する）。回転が落ちるほど遅くなる
        { // 右回転は時計回り、左回転は反時計回りでは、リングのギアとビットのギアがかみ合わない：リングに当たると、こすれて、ゆっくりした動きになる（加速して真ん中へ戻ることはない）
          const rr1 = Math.hypot(b.x, b.y), wrong = (b.x * b.vy - b.y * b.vx) * b.dir > 0;
          if (wrong && b.dashT <= 0 && rr1 > ringRadiusAt(b.x, b.y) - 16 && speed > 40) {
            const k = 1 - 4.2 * DT; b.vx *= k; b.vy *= k;
            b.vx -= (b.x / (rr1 || 1)) * 90 * DT; b.vy -= (b.y / (rr1 || 1)) * 90 * DT; // ゆっくり内側へ
            b.calmT = Math.max(b.calmT, 2.5);
            speed = Math.hypot(b.vx, b.vy);
          }
        }
        if (b.dashT <= 0 && b.knockT <= 0) {
          // 回転が強いうちは動き回り、回転が弱まるにつれて、中央に寄り添ってゆっくり動く（回転が強いうちにぶつかると、弾ける向きがばらばらで、何度も続けて真ん中でぶつからない）
          const ageT = Math.max(0, Math.min(1, (0.68 - ratio) / 0.38)), ageF = 1 - 0.65 * ageT * ageT * (3 - 2 * ageT);
          const vt = t.cruise * ageF * (1 - 0.85 * Math.min(1, b.calmT / 2.5)) * (1 - (1 - (b.mode === 2 ? 0.2 : b.mode === 1 ? 0.5 : 1)) * wMode) * (0.2 + 0.8 * Math.sqrt(ratio));
          if (speed < vt) {
            const dx = speed > 15 ? b.vx / speed : Math.cos(b.angle), dy = speed > 15 ? b.vy / speed : Math.sin(b.angle);
            const acc = (vt - speed) * 2.5 * DT;
            b.vx += dx * acc; b.vy += dy * acc; speed = Math.hypot(b.vx, b.vy);
          }
          // ふらつき：実際のベイは、規則的な円を描かず、向きも速さもふらふらと不規則に変わる（動き回るビットほど大きい）
          // 進路のゆるやかなゆれ：ぶつかっていないのに、急にカクッと向きが変わることはない（なめらかに、少しずつ曲がる）。いびつなブレードほど大きい
          { const turn = 0.22 * Math.sqrt(t.mobility) * (0.5 + nrOf(t.bid)) * (Math.sin(b.age * 0.9 + b.ph0) + 0.6 * Math.sin(b.age * 2.1 + b.ph0 * 1.7)) * (0.4 + 0.6 * Math.sqrt(ratio)) * DT;
            const cs2 = Math.cos(turn), sn2 = Math.sin(turn), nvx = b.vx * cs2 - b.vy * sn2, nvy = b.vx * sn2 + b.vy * cs2; b.vx = nvx; b.vy = nvy; }
        }
        { const cap = b.dashT > 0 ? 2800 : 1800; if (speed > cap) { b.vx *= cap / speed; b.vy *= cap / speed; speed = cap; } } // ぶつかって飛ばされたあとは、反対側まで飛んでいかない // 速すぎて突き抜けないように上限
        b.x += b.vx * DT; b.y += b.vy * DT;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 14) b.trail.shift();
        b.spin = Math.max(0, b.spin - (4.5 + speed * 0.005) * t.decay * DT * 6);
        { // リングの外側を、時計回りなどで1周したら：上まで来たところで、真ん中へダッシュする／下のオーバー・エクストリームゾーンへ向かう／スタジアム内へ戻る、のどれかになる（ずっと回り続けない）
          const dd0 = Math.hypot(b.x, b.y), th0 = Math.atan2(b.y, b.x), rg0 = ringRadiusAt(b.x, b.y); // 凹みのところでは、リングの半径が小さくなるので、リングを基準に「ライン上にいるか」を決める
          if (dd0 > rg0 - 12 && !b.riding && b.dashT <= 0) {
            let dth = th0 - b.prevTh; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
            b.outAng += Math.abs(dth);
          } else if (dd0 < rg0 - 55) b.outAng = 0;
          b.prevTh = th0;
          const nearTop = Math.abs(Math.atan2(Math.sin(th0 + Math.PI / 2), Math.cos(th0 + Math.PI / 2))) < 0.4;
          if (b.outAng > Math.PI * 1.1 && (nearTop || b.outAng > Math.PI * 2.2) && dd0 > rg0 - 20) {
            b.outAng = 0;
            const nx0 = -b.x / dd0, ny0 = -b.y / dd0;
            // 右回転のベイは時計回りで、左回転のベイは反時計回りでは、エクストリームダッシュしない（回る向きと逆に動いているとき）
            const against = (b.x * b.vy - b.y * b.vx) * b.dir > 0;
            const rr = against ? (Math.random() < 0.7 ? 0.9 : 0.6) : Math.random();
            const dsp = (1500 + 200 * ratio) * t.dash * (0.4 + 0.6 * Math.pow(ratio, 1.4));
            let ax = nx0, ay = ny0, sp2 = against ? 520 : dsp;
            if (rr < 0.5) { // 真ん中へダッシュ
              const j0 = (Math.random() + Math.random() - 1) * 0.3; ax = nx0 * Math.cos(j0) - ny0 * Math.sin(j0); ay = nx0 * Math.sin(j0) + ny0 * Math.cos(j0);
            } else if (rr < 0.75) { // 下のオーバー／エクストリームゾーンへ
              const phi = Math.random() < 0.35 ? 0 : (Math.random() < 0.5 ? -OVER_PHI : OVER_PHI), qx = Math.sin(phi) * (R + 12) - b.x, qy = Math.cos(phi) * (R + 12) - b.y, ql = Math.hypot(qx, qy) || 1;
              ax = qx / ql; ay = qy / ql;
            } else { // スタジアム内へ戻る
              const tx2 = (Math.random() - 0.5) * R * 0.9, ty2 = (Math.random() - 0.5) * R * 0.9, ql = Math.hypot(tx2 - b.x, ty2 - b.y) || 1;
              ax = (tx2 - b.x) / ql; ay = (ty2 - b.y) / ql; sp2 = against ? 170 + 90 * Math.random() : 650 + 250 * Math.random(); b.calmT = 3;
            }
            b.vx = ax * sp2; b.vy = ay * sp2;
            if (rr < 0.75 && !against) { b.dashT = 0.4; b.coast = 1.0; b.dashFx = 0.7; b.spin = Math.max(0, b.spin - b.spinMax * 0.05 * t.dashCost); spark(b.x, b.y, 22); }
            speed = Math.hypot(b.vx, b.vy);
          }
        }
        { // エクストリームラインは1周ぐるっとあるので、乗り越える勢いがないと、リングの外には出ない
          const dn = Math.hypot(b.x, b.y), rr0 = ringRadiusAt(b.x, b.y);
          if (!b.riding && b.prevD > 0 && b.prevD <= rr0 && dn > rr0) {
            const ov = (b.vx * b.x + b.vy * b.y) / (dn || 1);
            const wrongL = (b.x * b.vy - b.y * b.vx) * b.dir > 0; // ギアがかみ合わない向き（右回転の時計回りなど）は、段を乗り越えにくい
            if (ov < 440 * TYPES[b.type].exitResist * (wrongL ? 1.4 : 1) && !endedRef.current === true) {
              b.vx -= 1.4 * ov * (b.x / dn); b.vy -= 1.4 * ov * (b.y / dn);
              b.x *= (rr0 - 0.5) / dn; b.y *= (rr0 - 0.5) / dn;
            }
          }
          // 中心の円の模様にも、少し段がある：外へ出るときは少し勢いをとられ、内へ入るときは少し落ちる
          if (!b.riding && b.prevD > 0 && b.dashT <= 0) {
            const cR = RING_R * 0.5, dn2 = Math.hypot(b.x, b.y);
            if ((b.prevD <= cR) !== (dn2 <= cR)) {
              const vr = (b.vx * b.x + b.vy * b.y) / (dn2 || 1), ux2 = b.x / (dn2 || 1), uy2 = b.y / (dn2 || 1);
              const dv = vr > 0 ? -Math.min(vr, 70) : 30; // 外向きなら減速、内向きなら少し加速
              b.vx += ux2 * dv; b.vy += uy2 * dv;
            }
          }
          b.prevD = Math.hypot(b.x, b.y);
        }
        { // リングよりも外側（壁との間）には、とどまれない：内側へ押し戻される（出口の手前は除く）
          const dd = Math.hypot(b.x, b.y);
          if (dd > ringRadiusAt(b.x, b.y) + 3 && !exitKind(b.x, b.y) && (b.vx * b.x + b.vy * b.y) / dd < 120 && b.spiralT <= 0) { // 壁へ向かって勢いよく飛んでいるあいだは押し戻さない（途中でふわっと減速せず、壁にガツンと当たって跳ね返る）
            // 時計回りなど、壁に沿って回り続けようとしても、強く内側へ押し戻される（リングの外側では、円を描いて回り続けられない）
            const f = Math.min(2, (dd - (ringRadiusAt(b.x, b.y) + 3)) / 5) * 3200 * DT;
            b.vx -= (b.x / dd) * f; b.vy -= (b.y / dd) * f;
          }
        }

        // 外周の壁：出口以外は弾き返す
        const lim = R - BEY_R * 0.3, s2 = sqn(b.x, b.y);
        // 四角い壁の、外向きの法線
        const gx = Math.sign(b.x) * Math.pow(Math.abs(b.x), WALL_N - 1), gy = Math.sign(b.y) * Math.pow(Math.abs(b.y), WALL_N - 1), gl = Math.hypot(gx, gy) || 1;
        const wnx = gx / gl, wny = gy / gl;
        const outSpeed = b.vx * wnx + b.vy * wny;
        const ek = exitKind(b.x, b.y);
        // 出口の手前には段があり、それを越える勢いがないと入れない（エクストリームは特に高い）
        const needOut = (ek === 'extreme' ? 440 : ek === 'over' ? 320 : 0) * TYPES[b.type].exitResist * (b.grace > 0 ? 9 : 1) * (endedRef.current ? 1e9 : 1); // 決着したあと、勝ったほうのベイは、場外へ出ない
        if (s2 > lim && (!ek || outSpeed < needOut)) {
          const nx = wnx, ny = wny;
          const outv = b.vx * nx + b.vy * ny;
          if (outv > 0 && b.diagShot && !b.softDone && b.knockT <= 0 && b.dashT <= 0 && outv < 600) {
            // 斜めシュートが自分で壁に当たったときは、勢いよく跳ね返らず、壁に沿って旋回しながらゆっくり真ん中へ戻る
            b.softDone = true; b.spiralT = 3.6; b.postT = 0;
            b.vx -= 1.05 * outv * nx; b.vy -= 1.05 * outv * ny;
            b.calmT = Math.max(b.calmT, 3.6);
          } else if (outv > 0) {
            b.vx -= 1.55 * outv * nx; b.vy -= 1.55 * outv * ny;
            { const inn = -(b.vx * nx + b.vy * ny); if (inn < 160) { b.vx -= nx * (160 - inn); b.vy -= ny * (160 - inn); } } // 壁に当たったら、必ずリング内へ戻る向きの速さが残る
            if (t.flat) { b.eAng = Math.random() * Math.PI; b.er = 0.35 + Math.random() * 0.25; } // 壁に当たると、楕円の向きが変わる（軌道が変わる）
            // 相手に強く飛ばされて壁に当たって戻ってくると、持久が少し削られる（自分でぶつかったときは削れない）
            if (outv > 150 && b.knockT > 0) { b.spin = Math.max(0, b.spin - 0.4 * outv); }
          }
          { const k = lim / s2; b.x *= k; b.y *= k; }
        }
      }

      { const w = window as unknown as { __trace?: number[][] }; if (w.__trace && phaseRef.current === 'battle') { tickRef.current++; if (tickRef.current % 8 === 0) w.__trace.push([beys[0].x, beys[0].y, beys[1].x, beys[1].y, beys[0].spin / beys[0].spinMax, beys[1].spin / beys[1].spinMax, beys[0].dashT > 0 || beys[0].riding ? 1 : 0, beys[1].dashT > 0 || beys[1].riding ? 1 : 0, beys[0].outT, beys[1].outT, endedRef.current ? 1 : 0, beys[1].dead ? 1 : 0, beys[1].out ? 1 : 0]); } } // 動作確認用：ベイの軌道の記録（15回/秒）
      { const w = window as unknown as { __maxd?: number }; for (const q of beys) { if (!Number.isFinite(q.x + q.y + q.spin)) (w as { __nan?: boolean }).__nan = true; } for (const q of beys) if (!q.out && q.outT <= 0 && !exitKind(q.x, q.y)) w.__maxd = Math.max(w.__maxd ?? 0, sqn(q.x, q.y)); } // 動作確認用：出口以外で壁の外に出た最大距離
      if (endedRef.current) return;

      // ベイ同士の衝突
      const [a, b] = beys;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const ta = TYPES[a.type], tb = TYPES[b.type];
      const phi = Math.atan2(dy, dx), tha = phi - a.angle, thb = phi + Math.PI - b.angle;
      const ra = shapeR(ta.bid, tha), rb = shapeR(tb.bid, thb); // 当たる場所での、それぞれの半径（丸くない）
      const pc = a.outT <= 0 && b.outT <= 0 && d < (SHAPES[ta.bid]?.mx ?? BEY_R) + (SHAPES[tb.bid]?.mx ?? BEY_R) + 1 ? polyContact(ta.bid, a.x, a.y, a.angle, tb.bid, b.x, b.y, b.angle) : null;
      if (pc) {
        // 当たった点の向き：外形どうしの、いちばん深く食い込んだ点での外形の向き。中心どうしを結ぶ向きからのずれは、最大約60度
        const cxl = dx / d, cyl = dy / d;
        let nx = cxl, ny = cyl;
        {
          const base = Math.atan2(cyl, cxl);
          let df = Math.atan2(pc.ny, pc.nx) - base; df = Math.atan2(Math.sin(df), Math.cos(df));
          df = Math.max(-1.05, Math.min(1.05, df + (Math.random() - 0.5) * 0.2)); // 当たり所の小さなばらつき
          nx = Math.cos(base + df); ny = Math.sin(base + df);
        }
        // とがったところで当たるほど強く飛ばす／いびつなブレードほど飛ばしやすい
        const ma0 = SHAPES[ta.bid]?.mean ?? BEY_R, mb0 = SHAPES[tb.bid]?.mean ?? BEY_R;
        const lobe = Math.pow(Math.min(1.25, Math.max(0.8, (ra / ma0 + rb / mb0) / 2)), 2) * (1 + 0.3 * (nrOf(ta.bid) + nrOf(tb.bid)) / 2);
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        // 斜めシュートで固定されている間は飛ばされにくい
        const hsA = heavySide(ta.bid, a.angle, nx, ny), hsB = heavySide(tb.bid, b.angle, -nx, -ny); // 重い側が相手に向いているか
        const ma = ta.mass * (a.holdT > 0 ? 2.2 : 1) * (1 + 0.35 * hsA), mb = tb.mass * (b.holdT > 0 ? 2.2 : 1) * (1 + 0.35 * hsB);
        // 当たった点が、中心（回転の軸）からどれだけ横にずれているか：0＝まっすぐ中心へ向かって当たる、1＝かすめるように当たる
        const rax = pc.cx - a.x, ray = pc.cy - a.y, rbx = pc.cx - b.x, rby = pc.cy - b.y, rla = Math.hypot(rax, ray) || 1, rlb = Math.hypot(rbx, rby) || 1;
        const levA = Math.min(1, Math.abs(rax * ny - ray * nx) / rla), levB = Math.min(1, Math.abs(rbx * ny - rby * nx) / rlb), scrape = 1 + 0.4 * (levA + levB) / 2;
        if (rel > 0) {
          for (const x of [a, b]) if (x.riding) {
            // エクストリームラインを駆け上がっているベイは勢いがあるので、止まっている相手に当たっても止まらない（そのままダッシュまで行く）。走っている同士の正面衝突だけは止まる
            const o = x === a ? b : a;
            if (!o.riding && x.spin / x.spinMax > 0.25 && Math.random() < 0.7) continue;
            x.riding = false; x.dashCd = Math.max(x.dashCd, 0.6);
          }
          // 回転しているベイは、ダッシュしていなくても当たれば相手を弾き飛ばせる
          const spinKick = 150 * ((a.spin / a.spinMax) * ta.atk + (b.spin / b.spinMax) * tb.atk) / 2;
          // 弾く力は、ぶつかった2つのベイの回転の強さで決まる。回転が落ちるほど、反発が小さくなる
          // （満タンの回転では係数4.6、回転が3割なら約1.8、1割なら約1.3）
          const spinPow = Math.pow((a.spin / a.spinMax + b.spin / b.spinMax) / 2, 1.3);
          const avgR = (a.spin / a.spinMax + b.spin / b.spinMax) / 2, hitVar = (0.6 + 0.95 * Math.random()) * (0.5 + 0.9 * Math.pow(avgR, 1.2)); // 回転が少ないと、あまり弾かない； // 当たり所（凹凸）によって、はじける距離が毎回ちがう
          const j = (hitVar * lobe * (1.1 + 3.5 * spinPow) * (rel + spinKick)) / (1 / ma + 1 / mb);
          const sa0 = Math.hypot(a.vx, a.vy), sb0 = Math.hypot(b.vx, b.vy);
          { // 当たった点での、回っているブレードの表面の動き：相手を横に引きずり、自分は反対向きに引かれる（かすめるほど、横に飛ぶ）
            const tnx = -ny, tny = nx;
            const sa = a.dir * (-ray * tnx + rax * tny) / rla, sb = b.dir * (-rby * tnx + rbx * tny) / rlb;
            const vA = 0.16 * j * (a.spin / a.spinMax) * sa, vB = 0.16 * j * (b.spin / b.spinMax) * sb;
            b.vx += tnx * vA / mb; b.vy += tny * vA / mb; a.vx -= tnx * vA / ma; a.vy -= tny * vA / ma;
            a.vx += tnx * vB / ma; a.vy += tny * vB / ma; b.vx -= tnx * vB / mb; b.vy -= tny * vB / mb;
            a.angle += (Math.random() - 0.5) * levA * 1.2; b.angle += (Math.random() - 0.5) * levB * 1.2; // 当たった点がずれるほど、ブレードの向きが変わる（次に当たる所が変わる）
          }
          a.vx -= (j / ma) * nx * ta.steady * tb.kick; a.vy -= (j / ma) * ny * ta.steady * tb.kick;
          b.vx += (j / mb) * nx * tb.steady * ta.kick; b.vy += (j / mb) * ny * tb.steady * ta.kick;
          // 当てられて速度が増したほう＝飛ばされたほう
          if (Math.hypot(a.vx, a.vy) > Math.max(250, sa0 * 1.15)) a.knockT = 1.2;
          if (Math.hypot(b.vx, b.vy) > Math.max(250, sb0 * 1.15)) b.knockT = 1.2;
          // ぶつかったあとは、ビットごとの円・楕円には戻らず、惰性で動く（しばらく、円や楕円の力を切る）
          a.postT = 4; b.postT = 4; a.calmT = Math.max(a.calmT, 2.5); b.calmT = Math.max(b.calmT, 2.5); // ぶつかったあと、真ん中へ戻るときも、勢いをつけない
          // Xダッシュ中の打撃は強い（Eビットはスマッシュ攻撃でさらに強い）
          const impact = Math.min(1, rel / 120) * rel * Math.max(a.dashT > 0 ? 1.5 * ta.smash : 1, b.dashT > 0 ? 1.5 * tb.smash : 1) * (0.45 + 0.55 * spinPow);
          // 反対回転どうしが当たると、接触面の動きが揃ってスピンの削れが少し減る
          const oppo = a.dir !== b.dir ? 0.6 : 1;
          // バースト：ラチェットにうまく強打が当たると一発で起こる。強く当たるほど・当てる側の回転が強いほど確率が高く、
          // 当てられる側の回転が弱いほど確率が下がる（回転が5分の1以下ならバーストしない）。ちょこちょこ当たるだけではバーストしない
          const tryBurst = (v: Bey, tv: typeof ta, att: Bey, tAtt: typeof ta) => {
            const sf = Math.max(0, (v.spin / v.spinMax - 0.2) / 0.8);
            const hardness = Math.min(1.5, Math.max(0, (impact - 300) / 450));
            const attSpin = Math.max(0.3, att.spin / att.spinMax);
            if (Math.random() < (0.13 * hardness * tAtt.atk * attSpin * sf * (1 + 0.3 * (att === a ? hsA : hsB))) / (tv.burstRes * (1 + 0.15 * (v === a ? hsA : hsB)))) v.burst = 100;
          };
          tryBurst(a, ta, b, tb);
          tryBurst(b, tb, a, ta);
          a.spin = Math.max(0, a.spin - (impact * tb.atk * 0.28 * oppo * scrape) / ta.def);
          b.spin = Math.max(0, b.spin - (impact * ta.atk * 0.28 * oppo * scrape) / tb.def);
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
          spark((a.x + b.x) / 2, (a.y + b.y) / 2, 8 + Math.floor(impact / 40), true);
          flashRef.current = Math.min(1, impact / 600);
          // 動き出す前に当てられたら、弾かれて進行方向が変わる（矢印の向きには戻らない）
          for (const x of [a, b]) {
            x.hit = true;
            x.rideChance = 1; // 当たったあとは水平シュートと同じ（リングに乗れる）
            if (x.holdT > 0) { x.holdT = 0; x.dashCd = Math.max(x.dashCd, 0.8); } x.spiralT = 0;
          }
        }
        const overlap = pc.pen + 0.3; // 食い込んだぶんだけ、外形の向きに押し出す
        const shareA = (1 / ma) / (1 / ma + 1 / mb);
        a.x -= pc.nx * overlap * shareA; a.y -= pc.ny * overlap * shareA;
        b.x += pc.nx * overlap * (1 - shareA); b.y += pc.ny * overlap * (1 - shareA);
      }

      // 決着判定
      const names = ['me', 'cpu'] as const;
      // 場外ポケットに入っているベイがいる間は、その行方が決まるまで待つ
      for (let i = 0; i < 2; i++) {
        const bey = beys[i];
        if (bey.outT <= 0) continue;
        bey.outT -= DT;
        if (bey.outT > 0) continue;
        if (bey.retPlan && bey.spin > 0) {
          // 回転が残っていた：スタジアムに戻ってくる（持久はだいぶ減る）
          const th = Math.atan2(bey.x, bey.y), rr = wallAt(th, R - BEY_R * 1.3);
          bey.x = Math.sin(th) * rr; bey.y = Math.cos(th) * rr;
          const ix = -Math.sin(th), iy = -Math.cos(th), lat = (Math.random() - 0.5) * 0.9;
          const sp2 = 650 + Math.random() * 250;
          bey.vx = (ix + -iy * lat) * sp2; bey.vy = (iy + ix * lat) * sp2;
          bey.spin = Math.max(1, bey.spin - bey.spinMax * (0.12 + Math.random() * 0.08));
          bey.retCount++; bey.grace = 1.2; bey.riding = false; bey.holdT = 0; bey.dashCd = Math.max(bey.dashCd, 0.8);
          bey.trail = [];
          { const w = window as unknown as { __ret?: number }; w.__ret = (w.__ret ?? 0) + 1; } // 動作確認用：場外から戻った回数
          spark(bey.x, bey.y, 16); flashRef.current = 0.5;
        } else { endRound(names[1 - i], bey.outKind); return; }
      }
      if (beys.some(x => x.outT > 0)) return;
      for (let i = 0; i < 2; i++) {
        const bey = beys[i];
        const other = names[1 - i];
        // 回転が5分の1以下になったベイはバーストしない
        if (bey.burst >= 100 && bey.spin / bey.spinMax > 0.2) { endRound(other, 'burst'); return; }
        if (sqn(bey.x, bey.y) > R && bey.grace <= 0) {
          const k = exitKind(bey.x, bey.y);
          if (k) {
            // 出口に入った。回転が強いほど（特に1-60・1-70・グローリーワルキューレ）戻ってきやすい。戻れるのは1回まで
            const ratio = bey.spin / bey.spinMax;
            const f = Math.max(0, Math.min(1, (ratio - 0.35) / 0.55));
            const pr = bey.retCount >= 1 ? 0 : Math.min(0.8, 0.28 * f * TYPES[bey.type].comeback);
            bey.outT = 0.9; bey.outKind = k; bey.outPhi = k === 'extreme' ? 0 : Math.sign(bey.x || 1) * OVER_PHI;
            bey.retPlan = Math.random() < pr;
            bey.vx *= 0.35; bey.vy *= 0.35; bey.riding = false; bey.holdT = 0;
            return;
          }
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
        ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,170,255,0.7)';
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
            ctx.strokeStyle = b.dashT > 0 || b.riding ? 'rgba(255,140,0,0.75)' : 'rgba(200,215,240,0.32)';
            ctx.lineWidth = b.dashT > 0 || b.riding ? 9 : 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(b.trail[0].x, b.trail[0].y);
            for (const q of b.trail) ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(3, 5, BEY_R, BEY_R * 0.85, 0, 0, Math.PI * 2); ctx.fill();
          drawBey(ctx, t.color, i === 0 ? '#38b6ff' : '#ff3ea5', b.angle, Math.max(0, b.spin / b.spinMax), i === 0 ? '#fff' : '#ffb4b4', t.blades, t.sprite, t.spinDir);
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
        if (diag) { // 矢印は斜めシュートだけ
        const ex = aim.x * (BEY_R + len), ey = aim.y * (BEY_R + len);
        ctx.beginPath(); ctx.moveTo(aim.x * BEY_R, aim.y * BEY_R); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(aim.y, aim.x));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -9); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
        ctx.restore(); }
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(label, 0, -BEY_R - 18);
        ctx.fillStyle = arrow; ctx.fillText(label, 0, -BEY_R - 18);
        ctx.textAlign = 'start';
        ctx.restore();
      };
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && dropRef.current && !(onlineRef.current && selfIdxRef.current !== 0) && (!seqRef.current || (phaseRef.current === 'launch' && placeStepRef.current === 0))) {
        const g = dropRef.current;
        const diag = modeRef.current === 'diag';
        drawGhost(g, aimRef.current ?? defaultAim(g.x, g.y, TYPES.me.spinDir), diag, TYPES.me.color, '#38b6ff', '#e8590c', `${namesRef.current.me}：${diag ? '斜めシュート' : '水平シュート'}`, TYPES.me.blades, TYPES.me.sprite, TYPES.me.spinDir);
      }
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && cpuPlanRef.current && !(onlineRef.current && selfIdxRef.current !== 1) && (vsRef.current === '2p' ? (!seqRef.current || (phaseRef.current === 'launch' && placeStepRef.current === 1)) : !hideOppRef.current)) {
        const c = cpuPlanRef.current;
        drawGhost(c, c.aim, c.diag, TYPES.cpu.color, '#ff3ea5', '#d81b8a', `${namesRef.current.cpu}：${c.diag ? '斜めシュート' : '水平シュート'}`, TYPES.cpu.blades, TYPES.cpu.sprite, TYPES.cpu.spinDir, vsRef.current === '2p');
      }
      // 相手の落とす位置を隠しているときのヒント：その位置にランチャーを置く（向きや打ち方は分からない）
      // オンライン対戦も同じ：相手が置き場所を迷って動かすと、ランチャーも動く
      const oRole = onlineRef.current;
      const oppP = oRole ? (selfIdxRef.current === 0 ? cpuPlanRef.current : dropRef.current) : vsRef.current === 'cpu' && hideOppRef.current ? cpuPlanRef.current : null;
      if (!((phaseRef.current === 'launch' || phaseRef.current === 'count') && oppP)) ghostDispRef.current = null;
      if ((phaseRef.current === 'launch' || phaseRef.current === 'count') && oppP) {
        const gd = ghostDispRef.current ?? (ghostDispRef.current = { x: oppP.x, y: oppP.y });
        gd.x += (oppP.x - gd.x) * 0.25; gd.y += (oppP.y - gd.y) * 0.25; // なめらかに動かす
        const c = gd, im = c.x < 0 ? LAUNCHERS.red : LAUNCHERS.black;
        if (im.complete && im.naturalWidth > 0) {
          // ランチャーは横向きのまま、落とせる半分（左右どちらか）の約3分の1を隠す大きさで置く。正確な位置は分からないように少しずらして描く
          // （同じ位置なら同じずれ方なので、ちらつかない）。落とせる半分と、すり鉢の外にははみ出さない
          const sd = c.x < 0 ? -1 : 1;
          const lw = 190, lh = (lw * im.naturalHeight) / im.naturalWidth;
          const hz = (k: number) => 0.5 * Math.sin(c.x * 0.011 * k + c.y * 0.017 + k * 1.7); // 位置になめらかに応じたずれ（動かしても急には飛ばない）
          const cx = sd * (R / 2 + hz(1) * 80), cy = Math.max(-150, Math.min(150, c.y * 0.5 + hz(2) * 160));
          ctx.save();
          ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.clip();
          ctx.beginPath(); ctx.rect(sd < 0 ? -R : 2, -R, R, R * 2); ctx.clip();
          ctx.translate(cx, cy);
          ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16;
          ctx.drawImage(im, -lw / 2, -lh / 2, lw, lh);
          ctx.restore();
        }
      }
      // バースト：パーツが飛び散る
      const parts = partsRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vx *= 0.985; p.vy *= 0.985; p.rot += p.vr / 60;
        // バーストで飛び散ったパーツも、壁の外には出ない（壁で跳ね返る）
        { const dd = Math.hypot(p.x, p.y), lp = R - 6;
          if (dd > lp) { const nx = p.x / dd, ny = p.y / dd, ov = p.vx * nx + p.vy * ny; p.x = nx * lp; p.y = ny * lp; if (ov > 0) { p.vx -= 1.6 * ov * nx; p.vy -= 1.6 * ov * ny; } } }
        { const w = window as unknown as { __maxp?: number }; w.__maxp = Math.max(w.__maxp ?? 0, Math.hypot(p.x, p.y)); } // 動作確認用
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      // 火花
      const sp = sparksRef.current;
      (window as unknown as { __sparks?: number }).__sparks = sp.length; // 動作確認用
      for (let i = sp.length - 1; i >= 0; i--) {
        const s = sp[i];
        s.life -= 1 / 60; s.x += s.vx / 60; s.y += s.vy / 60; if (!s.old) { s.vx *= 0.955; s.vy *= 0.955; }
        if (s.life <= 0) { sp.splice(i, 1); continue; }
        if (s.old) { ctx.fillStyle = `rgba(255,170,40,${Math.min(1, s.life * 2)})`; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); continue; }
        // 尾を引く火花：はじめは白っぽく明るく、だんだん橙になって消える
        const f = s.life / s.max, g = Math.round(150 + 105 * f), bl = Math.round(40 + 160 * f * f);
        const tx = s.x - s.vx * 0.05, ty = s.y - s.vy * 0.05;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(235,90,10,${Math.min(1, f * 1.6)})`; ctx.lineWidth = s.w * (1 + f) + 1.5; // 白いスタジアムでも見えるよう、橙色の縁を付ける
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = `rgba(255,${g},${bl},${Math.min(1, f * 1.8)})`; ctx.lineWidth = s.w * (0.5 + f);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
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

    // ゲスト：届いた動きを、少し遅らせて滑らかにつないで表示する
    const applyInterp = (now: number) => {
      const sn = snapsRef.current;
      if (!sn.length) return;
      if (!beysRef.current) beysRef.current = [makeBey('me', 0, 0, false, null, 0.85), makeBey('cpu', 0, 0, false, null, 0.85)];
      const target = now - 80;
      let ia = 0;
      for (let i = 0; i < sn.length; i++) if (sn[i].t <= target) ia = i;
      const A = sn[ia], B = sn[Math.min(ia + 1, sn.length - 1)];
      const al = B.t > A.t ? Math.max(0, Math.min(1, (target - A.t) / (B.t - A.t))) : 0;
      beysRef.current.forEach((b, i) => {
        const a = A.b[i], c = B.b[i];
        b.x = a[0] + (c[0] - a[0]) * al; b.y = a[1] + (c[1] - a[1]) * al; b.angle = a[2] + (c[2] - a[2]) * al;
        b.spin = c[3]; b.spinMax = c[4]; b.burst = c[5]; b.dashT = c[6]; b.dashFx = c[7];
        b.riding = !!(c[8] & 1); b.out = !!(c[8] & 2); b.dead = !!(c[8] & 4);
        b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 14) b.trail.shift();
      });
      flashRef.current = Math.max(flashRef.current, B.b[0][9] ?? 0);
    };
    const loop = (now: number) => {
      acc += Math.min(0.05, (now - last) / 1000) * timeScale;
      last = now;
      while (acc >= DT) { step(); acc -= DT; }
      if (onlineRef.current === 'guest') applyInterp(now);
      draw();
      // ホスト：ベイの動きをゲストに送る（約30回/秒）
      if (onlineRef.current === 'host' && beysRef.current && (phaseRef.current === 'battle' || phaseRef.current === 'result' || phaseRef.current === 'over') && now - lastSendRef.current >= 33) {
        lastSendRef.current = now;
        const r1 = (v: number) => Math.round(v * 10) / 10, r2 = (v: number) => Math.round(v * 100) / 100;
        linkRef.current?.send({ t: 's', b: beysRef.current.map(b => [r1(b.x), r1(b.y), r2(b.angle), Math.round(b.spin), Math.round(b.spinMax), Math.round(b.burst), r2(b.dashT), r2(b.dashFx), (b.riding ? 1 : 0) | (b.out ? 2 : 0) | (b.dead ? 4 : 0), r2(flashRef.current)]) });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endRound, canvasOn]);

  const humanCount = online ? 1 : gameMode === 'tournament' ? tHumans : vs === '2p' ? 2 : 1; // カスタマイズするプレイヤーの数

  // 3on3：他のベイで使っているパーツは選べない（公式ルール）
  const usedByOthers = (key: (typeof KEYS)[number]) => {
    if (key === 'ratchet' && isInt(custom)) return RATCHETS.map(r => r.id); // ラチェット一体型は選べない
    return mode === '3v3' ? curDeck.filter((c, i) => i !== slot && !(key === 'ratchet' && isInt(c))).map(c => c[key]) : [];
  };

  // ---------------- スマホ横画面用の見た目（枠のサイズ FW×FH に合わせる） ----------------
  const FW = frame.w, FH = frame.h;
  const sb = (active: boolean, color = '#ffd740'): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap',
    border: `2px solid ${active ? color : '#2a3566'}`, background: active ? '#14204f' : '#0a1030',
  });
  const yb: React.CSSProperties = { padding: '9px 24px', fontSize: 16, fontWeight: 800, borderRadius: 8, border: 'none', background: '#ffd740', color: '#04071a', cursor: 'pointer', whiteSpace: 'nowrap' };
  const row = (label: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>{label}</span>{children}
    </div>
  );
  const modeBtns = (cur: 'flat' | 'diag', onPick: (k: 'flat' | 'diag') => void, color: string) => (
    <div style={{ display: 'flex', gap: 3 }}>
      {([['flat', '水平'], ['diag', '斜め']] as const).map(([k, t]) => (
        <button key={k} onClick={() => onPick(k)} title={k === 'flat' ? 'すぐリングに乗ってダッシュ' : 'その場にとどまり、最初は飛ばされにくい'} style={{ ...sb(cur === k, color), flex: 1, padding: '3px 4px' }}>{t}</button>
      ))}
    </div>
  );
  const setMode2 = (k: 'flat' | 'diag') => { setShotMode2(k); if (cpuPlanRef.current) cpuPlanRef.current = { ...cpuPlanRef.current, diag: k === 'diag' }; };

  // ---- カスタマイズ（コンパクト）
  const myBey = buildBey(custom);
  const partPicker = (title: string, list: PartDef[], value: string, onPick: (id: string) => void, blocked: string[] = []) => {
    const sel = list.find(pt => pt.id === value) ?? list[0];
    const allBlocked = list.every(pt => blocked.includes(pt.id));
    return (
      <div style={{ flex: list.length > 6 && title === 'ブレード' ? 1.25 : 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {list.map(pt => {
            const bl = blocked.includes(pt.id);
            const on = value === pt.id && !allBlocked;
            return (
              <button key={pt.id} onClick={() => { if (!bl) onPick(pt.id); }} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 12, fontWeight: 700, fontSize: 12.5,
                cursor: bl ? 'not-allowed' : 'pointer', color: '#fff', opacity: bl ? 0.35 : 1, whiteSpace: 'nowrap',
                border: `2px solid ${on ? (pt.color ?? '#ffd740') : '#2a3566'}`, background: on ? '#14204f' : '#0a1030',
              }}>
                {pt.img && <img src={pt.img} alt="" width={16} height={16} />}
                <span style={{ color: pt.color ?? '#fff' }}>{pt.name}</span>
              </button>
            );
          })}
        </div>
        {/* 押した（選んだ）パーツの詳細 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 6px', borderRadius: 6, background: '#0a1030', border: '1px solid #2a3566', fontSize: 11.5, lineHeight: 1.35 }}>
          {allBlocked ? (
            <div style={{ opacity: 0.8 }}>ラチェット一体型のブレードなので、ラチェットは選べません。</div>
          ) : (
            <>
              <div style={{ fontWeight: 800, color: sel.color ?? '#fff', fontSize: 12.5 }}>{sel.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 7px' }}>
                {STAT_LABELS.filter(([k]) => sel.s[k] !== undefined).map(([k, label]) => <span key={k}>{label} <b>{sel.s[k]}</b></span>)}
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

  // ---- 対戦画面のレイアウト（左右の列 + 中央のスタジアム）
  const pad = 6;
  const sideMin = 128;
  const cW = Math.min(((FH - pad * 2) * W) / H, FW - pad * 2 - sideMin * 2 - 12);
  const cH = (cW * H) / W;
  const ov = Math.floor(cW * 0.11); // スタジアムの左右の余白（何も描かない部分）に、パネルをはみ出させて広くする
  const sideW = Math.floor((FW - pad * 2 - cW - 12) / 2) + ov;
  const cs = cH / 700; // スタジアムの文字の大きさの倍率
  const ents = {
    me: { name: nameMe, color: '#38b6ff', pt: score.me, bey: TYPES.me },
    cpu: { name: nameCpu, color: '#ff3ea5', pt: score.cpu, bey: TYPES.cpu },
  };
  const sideCol = (key: 'me' | 'cpu', side: 'left' | 'right') => {
    const ent = ents[key];
    const isLeftCol = side === 'left';
    const compact = sideW < 175; // 幅のせまい画面では、飾りを減らして収める
    let controls: React.ReactNode = null;
    const isSelf = !!online && selfIdx === (key === 'me' ? 0 : 1);
    if (phase === 'launch') {
      if (online) { // オンライン：自分のパネルだけ操作できる。相手の置き場所は、ランチャーでだいたいだけ分かる
        const placed = selfIdx === 0 ? hasDrop : hasDrop2;
        controls = isSelf ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{selfReady ? '相手を待っています…' : placed ? (shotMode === 'diag' ? 'ドラッグで向き → 「決定」' : '「決定」') : `${selfIdx === 0 ? '左' : '右'}半分をタップ`}</div>
            {!selfReady && (selfIdx === 0 ? modeBtns(shotMode, k => { setShotMode(k); modeRef.current = k; sendPlace(false); }, '#38b6ff') : modeBtns(shotMode2, k => { setMode2(k); sendPlace(false); }, '#ff3ea5'))}
            <button style={{ ...yb, opacity: placed && !selfReady ? 1 : 0.4 }} disabled={!placed || selfReady} onClick={decide}>決定</button>
          </>
        ) : <div style={{ fontSize: 12, opacity: 0.75 }}>相手が場所を決めています…</div>;
      } else if (vs === 'cpu' && key === 'me') {
        controls = (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{hasDrop ? (shotMode === 'diag' ? 'ドラッグで向きを決めて、スタート' : 'スタート') : `${side === 'left' ? '左' : '右'}半分をタップ${compact ? '' : 'して、落とす場所を決める'}`}</div>
            {modeBtns(shotMode, setShotMode, '#ffd740')}
            <button style={{ ...yb, opacity: hasDrop ? 1 : 0.4 }} disabled={!hasDrop} onClick={shoot}>スタート</button>
          </>
        );
      } else if (vs === '2p' && !seq) {
        controls = (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{(key === 'me' ? hasDrop : hasDrop2) ? ((key === 'me' ? shotMode : shotMode2) === 'diag' ? 'ドラッグで向き' : '向きはなし') : `${key === 'me' ? '左' : '右'}半分をタップ`}</div>
            {key === 'me' ? modeBtns(shotMode, setShotMode, '#5aabff') : modeBtns(shotMode2, setMode2, '#ff3ea5')}
          </>
        );
      } else if (seq && ((placeStep === 0 && key === 'me') || (placeStep === 1 && key === 'cpu'))) {
        controls = (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
              {key === 'me' ? (hasDrop ? (shotMode === 'diag' ? 'ドラッグで向き → 「決定」' : '「決定」') : '左半分をタップ（相手は見ないでね）') : (hasDrop2 ? (shotMode2 === 'diag' ? 'ドラッグで向き → 「スタート」' : '「スタート」') : '右半分をタップ')}
            </div>
            {key === 'me' ? modeBtns(shotMode, setShotMode, '#5aabff') : modeBtns(shotMode2, setMode2, '#ff3ea5')}
            {key === 'me'
              ? <button style={{ ...yb, opacity: hasDrop ? 1 : 0.4 }} disabled={!hasDrop} onClick={() => setPlaceStep(1)}>決定</button>
              : <button style={{ ...yb, opacity: hasDrop2 ? 1 : 0.4 }} disabled={!hasDrop2} onClick={shoot}>スタート</button>}
          </>
        );
      } else if (seq) {
        controls = <div style={{ fontSize: 12, opacity: 0.7 }}>{placeStep === 1 ? '（相手が場所を決めています）' : '待っててね'}</div>;
      }
    }
    // 試合の表示（ラベル）：トーナメントなら回戦、対戦なら 1on1 / 3on3
    const tm = tourMatchRef.current, tt = tourRef.current;
    const matchLabel = online ? onlineLabel || 'オンライン' : gameMode === 'tournament' && tm && tt ? roundLabel(tt.rounds[tm.r].length, tm.r) : `${mode === '3v3' ? `3on3・第${roundIdx + 1}戦${cycle > 0 ? `(${cycle + 1}周目)` : ''}` : '1on1'}`;
    return (
      // 中継画面のような表示：枠は自分が青、相手がピンク。大きな得点、ブレーダー名、下にベイの名前
      <div style={{
        width: sideW, height: cH, flex: '0 0 auto', position: 'relative', zIndex: 2, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 7px', textAlign: 'center',
        background: 'linear-gradient(180deg,#07102c,#030618)', border: `2px solid ${ent.color}`, borderRadius: 10, boxShadow: `0 0 14px ${ent.color}66, inset 0 0 18px ${ent.color}22`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85, letterSpacing: 1 }}>{isSelf ? '★あなた　' : ''}{isLeftCol ? `${WIN_POINTS}pt先取` : matchLabel}</div>
        <div style={{ fontSize: compact ? 36 : 52, fontWeight: 900, lineHeight: 1, color: '#fff', textShadow: `0 0 12px ${ent.color}` }}>{ent.pt}</div>
        {!compact && <div style={{ fontSize: 10, fontWeight: 700, color: ent.color, borderTop: `1px solid ${ent.color}88`, paddingTop: 2 }}>ブレーダー名</div>}
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 900, lineHeight: 1.15, padding: '3px 4px', border: `2px solid ${ent.color}`, borderRadius: 6, background: '#050b22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ent.name}</div>
        <div style={{ fontSize: 12, fontWeight: 900, padding: '4px 4px', borderRadius: 6, background: `linear-gradient(90deg,${ent.color}55,${ent.color}22)`, border: `1px solid ${ent.color}`, lineHeight: 1.2, wordBreak: 'keep-all' }}>{ent.bey.name}</div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 4, textAlign: 'left', fontSize: compact ? 11 : 12 }}>
          {controls}
          {isLeftCol && <button onClick={() => (online ? leaveOnline() : backToSelect())} style={{ ...sb(false), fontSize: 12, padding: '2px 8px', alignSelf: 'flex-start', marginTop: 'auto' }}>{gameMode === 'tournament' ? '← 表へ' : '← 戻る'}</button>}
        </div>
      </div>
    );
  };

  return (
    // スマホ実機：ページをスクロールできるようにして、Safariなどのメニューバーを隠せるようにする（隠れると画面が広がり、枠も追従する）
    <div style={frame.emulate
      ? { position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
      : { position: 'relative', background: '#000', minHeight: 'calc(100vh + 70px)', width: '100%' }}>
     <div style={frame.emulate
      ? { display: 'contents' }
      : { position: 'sticky', top: 0, left: 0, width: '100%', height: frame.h, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {frame.portrait && <div style={{ position: 'fixed', top: 6, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#ffd740', zIndex: 5 }}>スマホを横向きにすると、大きく遊べます</div>}
      <div style={{
        width: FW, height: FH, flex: '0 0 auto', transform: `scale(${frame.scale})`, position: 'relative', overflow: 'hidden', background: '#04071a', color: '#fff',
        borderRadius: frame.emulate ? 16 : 0, boxShadow: frame.emulate ? '0 0 0 6px #1b1f3a, 0 12px 48px rgba(0,0,0,0.8)' : 'none', fontFamily: 'sans-serif',
      }}>
        {phase === 'top' && (
          // ---- トップページ：対戦 / トーナメント
          <div style={{ position: 'absolute', inset: 0, padding: '6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 2 }}>BEYBLADE X BATTLE</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['versus', '対戦', '相手と戦う（CPU / 2人）'], ['tournament', 'トーナメント', '最大32人で勝ち抜き戦']] as const).map(([k, label, sub]) => (
                <button key={k} onClick={() => { setGameMode(k); setTopOnline(false); setLobbyMsg(''); }} style={{ ...sb(gameMode === k && !topOnline), padding: '5px 18px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{label}</div><div style={{ fontSize: 11.5, opacity: 0.85 }}>{sub}</div>
                </button>
              ))}
              <button onClick={() => { setTopOnline(true); setLobbyMsg(''); }} style={{ ...sb(topOnline), padding: '5px 18px', textAlign: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>オンライン</div><div style={{ fontSize: 11.5, opacity: 0.85 }}>部屋番号で2人対戦</div>
              </button>
            </div>
            {topOnline ? (
              // オンライン対戦：部屋を作る人と、番号を入れて入る人
              <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                <button style={yb} onClick={makeRoom}>部屋を作る</button>
                <div style={{ fontSize: 13, fontWeight: 700 }}>または</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={joinCode} inputMode="numeric" maxLength={4} placeholder="部屋番号" onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    style={{ width: 96, padding: '8px 8px', borderRadius: 8, border: '2px solid #2a3566', background: '#0a1030', color: '#fff', fontSize: 18, fontWeight: 800, textAlign: 'center', letterSpacing: 3 }} />
                  <button style={sb(true)} onClick={enterRoom}>入る</button>
                </div>
              </div>
            ) : gameMode === 'versus' ? (
              <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {row('相手', ([['cpu', 'CPU'], ['2p', '2人対戦']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { setVs(k); if (k === '2p') setMySide('left'); }} style={sb(vs === k)}>{l}</button>
                  )))}
                  {row('対戦', ([['1v1', '1on1'], ['3v3', '3on3']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { setMode(k); if (k === '3v3') setDecks(ds => ds.map(d => dedupeDeck(d))); }} style={sb(mode === k)}>{l}</button>
                  )))}
                </div>
                {vs === 'cpu' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {row('CPUの強さ', (['easy', 'normal', 'hard'] as const).map(k => <button key={k} onClick={() => setDiff(k)} style={sb(diff === k)}>{DIFF_INFO[k].label}</button>))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {row('対戦', ([['1v1', '1on1'], ['3v3', '3on3']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { setMode(k); if (k === '3v3') setDecks(ds => ds.map(d => dedupeDeck(d))); }} style={sb(mode === k)}>{l}</button>
                  )))}
                  {([['CPUの数', tCpu, (v: number) => setTCpu(Math.max(0, Math.min(32 - tHumans, v))), '#ef4444'], ['プレイヤーの数', tHumans, (v: number) => setTHumans(Math.max(0, Math.min(32 - tCpu, v))), '#5aabff']] as const).map(([label, val, set, color]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 66, textAlign: 'right', color }}>{label}</span>
                      <button style={{ ...sb(false), padding: '0 8px', fontSize: 14 }} onClick={() => set(val - 1)}>−</button>
                      <input type="range" min={0} max={32} value={val} onChange={e => set(Number(e.target.value))} style={{ width: 100 }} />
                      <button style={{ ...sb(false), padding: '0 8px', fontSize: 14 }} onClick={() => set(val + 1)}>＋</button>
                      <span style={{ fontSize: 15, fontWeight: 900, width: 24 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 230 }}>
                  {row('CPUの強さ', (['easy', 'normal', 'hard'] as const).map(k => <button key={k} onClick={() => setDiff(k)} style={sb(diff === k)}>{DIFF_INFO[k].label}</button>))}
                  <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4 }}>
                    参加：合計 <b>{tCpu + tHumans}</b> 人（最大32人）。立ち位置は試合ごとにランダム、試合前に相手の落とす位置は見えません。
                    {tCpu + tHumans < 2 && <div style={{ color: '#ff8b8b' }}>2人以上にしてください</div>}
                  </div>
                </div>
              </div>
            )}
            {lobbyMsg && <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb4b4' }}>{lobbyMsg}</div>}
            {!topOnline && <button style={{ ...yb, opacity: gameMode === 'tournament' && tCpu + tHumans < 2 ? 0.4 : 1 }} disabled={gameMode === 'tournament' && tCpu + tHumans < 2} onClick={() => { setWho(0); setSlot(0); setPhase('select'); }}>次へ（カスタマイズ）</button>}
            {!frame.emulate && <div style={{ fontSize: 11.5, color: '#ffd740' }}>↕ 画面を上にスクロールすると、ブラウザのメニューが消えて広く遊べます</div>}
            <div style={{ fontSize: 11, opacity: 0.55 }}>非公式のファンメイド作品です。ベイブレードX・各パーツの名称や画像の権利は各権利者に帰属します。</div>
          </div>
        )}

        {phase === 'lobby' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>部屋を作りました。この番号を相手に伝えてください</div>
            <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 10, color: '#ffd740', textShadow: '0 0 16px #ffd74088' }}>{roomCode}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>相手が入るのを待っています…</div>
            <button style={sb(false)} onClick={() => leaveOnline()}>キャンセル</button>
          </div>
        )}

        {phase === 'select' && (
          // ---- カスタマイズ画面
          <div style={{ position: 'absolute', inset: 0, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 26 }}>
              <button onClick={() => (online ? leaveOnline() : setPhase('top'))} style={sb(false)}>← トップ</button>
              <span style={{ fontSize: 12.5, opacity: 0.85, whiteSpace: 'nowrap' }}>
                {online ? `オンライン対戦（${online === 'host' ? 'ホスト・部屋' + roomCode : 'ゲスト'}）` : <>{gameMode === 'tournament' ? `トーナメント（CPU ${tCpu}・プレイヤー ${tHumans}）` : vs === 'cpu' ? 'CPU対戦' : '2人対戦'}・{mode === '3v3' ? '3on3' : '1on1'}</>}
              </span>
              {online === 'host' && (['1v1', '3v3'] as const).map(k => (
                <button key={k} onClick={() => { setMode(k); if (k === '3v3') setDecks(ds => ds.map(d => dedupeDeck(d))); }} style={sb(mode === k)}>{k === '1v1' ? '1on1' : '3on3'}</button>
              ))}
              {online === 'guest' && <span style={{ fontSize: 13, fontWeight: 800, color: '#ffd740' }}>{mode === '3v3' ? '3on3' : '1on1'}・あなたは{selfIdx === 0 ? '左' : '右'}側</span>}
              {humanCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700 }}>
                  名前
                  <input value={playerNames[who]} placeholder={defaultName(who)} maxLength={12}
                    onChange={e => setPlayerNames(ns => ns.map((n, i) => (i === who ? e.target.value : n)))}
                    style={{ padding: '2px 6px', borderRadius: 6, border: '2px solid #2a3566', background: '#0a1030', color: '#fff', fontSize: 13, width: 96 }} />
                </label>
              )}
              {humanCount > 1 && (
                <div style={{ display: 'flex', gap: 3, overflowX: 'auto', flex: 1, minWidth: 0 }}>
                  {Array.from({ length: humanCount }, (_, k) => {
                    const c = k === 0 ? '#5aabff' : k === 1 ? '#ef4444' : '#ffd740';
                    return <button key={k} onClick={() => { setWho(k); setSlot(0); }} style={sb(who === k, c)}>{playerName(k)}{gameMode === 'versus' ? (k === 0 ? '（左）' : '（右）') : ''}</button>;
                  })}
                </div>
              )}
            </div>
            {humanCount > 0 && mode === '3v3' && (
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <button key={i} onClick={() => setSlot(i)} style={{ ...sb(slot === i, buildBey(curDeck[i]).color), fontSize: 12, padding: '1px 8px' }}>
                    ベイ{i + 1}：<span style={{ color: buildBey(curDeck[i]).color }}>{buildBey(curDeck[i]).name}</span>
                  </button>
                ))}
              </div>
            )}
            {humanCount === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>プレイヤーがいないので、CPU同士のトーナメントを観戦します。</div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8 }}>
                <div style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 6, borderRadius: 10, background: '#0a1030', border: '2px solid #2a3566', overflow: 'hidden' }}>
                  <canvas ref={previewRef} width={170} height={170} style={{ width: 92, height: 92, flex: '0 0 auto' }} />
                  <div style={{ fontWeight: 900, fontSize: 13, color: myBey.color, textAlign: 'center', lineHeight: 1.2 }}>{myBey.name}</div>
                  <div style={{ width: '100%' }}>
                    {STAT_LABELS.map(([key, label]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 2 }}>
                        <span style={{ width: 70, whiteSpace: 'nowrap' }}>{label}</span>
                        <div style={{ flex: 1, height: 4, background: '#1b2551', borderRadius: 2 }}>
                          <div style={{ width: `${Math.min(100, (myBey.stats[key] / STAT_MAX[key]) * 100)}%`, height: '100%', borderRadius: 2, background: myBey.color }} />
                        </div>
                        <span style={{ width: 22, textAlign: 'right' }}>{myBey.stats[key]}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, textAlign: 'center' }}>{myBey.weight}g・高さ{myBey.height}・<span style={{ color: myBey.spinDir === -1 ? '#ffd740' : '#9fb2ff', fontWeight: 700 }}>{myBey.spinDir === -1 ? '左回転' : '右回転'}</span></div>
                </div>
                {partPicker('ブレード', BLADES, custom.blade, id => setCustom(c => ({ ...c, blade: id })), usedByOthers('blade'))}
                {partPicker('ラチェット', RATCHETS, custom.ratchet, id => setCustom(c => ({ ...c, ratchet: id })), usedByOthers('ratchet'))}
                {partPicker('ビット', BITS, custom.bit, id => setCustom(c => ({ ...c, bit: id })), usedByOthers('bit'))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start', minHeight: 30 }}>
              {/* 右下はNetlifyなどの表示とかぶるので、ボタンは左に寄せる */}
              {online === 'host' ? (
                <button style={{ ...yb, opacity: guestInfo ? 1 : 0.4 }} disabled={!guestInfo} onClick={startOnlineMatch}>バトル開始</button>
              ) : online === 'guest' ? (
                <button style={selfReady ? sb(true, '#4ade80') : yb} onClick={guestReady}>{selfReady ? '準備OK（解除）' : '準備OK'}</button>
              ) : (
                <button style={yb} onClick={gameMode === 'versus' ? startMatch : startTournament}>{gameMode === 'versus' ? 'バトル開始' : 'トーナメント開始'}</button>
              )}
              {online === 'host' && (
                <>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>あなたの立ち位置</span>
                  {([[true, '左'], [false, '右']] as const).map(([k, l]) => <button key={l} onClick={() => setHostLeft(k)} style={sb(hostLeft === k)}>{l}</button>)}
                </>
              )}
              {online === 'host' && <span style={{ fontSize: 12.5, fontWeight: 700, color: guestInfo ? '#4ade80' : '#ffd740' }}>{guestInfo ? `${guestInfo.name} が準備OK` : '相手の準備を待っています…'}</span>}
              {online === 'guest' && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ffd740' }}>{selfReady ? 'ホストが始めるのを待っています…' : 'ベイを決めたら「準備OK」'}</span>}
              {gameMode === 'versus' && vs === 'cpu' && (
                <>
                  <button onClick={() => setCpuOpen(o => !o)} style={sb(cpuOpen)}>CPUのベイ設定 {cpuOpen ? '▲' : '▼'}</button>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>立ち位置</span>
                  {([['left', '左'], ['right', '右']] as const).map(([k, l]) => <button key={k} onClick={() => setMySide(k)} style={sb(mySide === k)}>{l}</button>)}
                </>
              )}
            </div>
            {cpuOpen && gameMode === 'versus' && vs === 'cpu' && (
              // CPUのパーツ選択（選ばなければランダム）。3on3は3体ぶん
              <div style={{ position: 'absolute', left: 10, right: 10, bottom: 52, padding: 8, borderRadius: 10, background: '#101840', border: '2px solid #5a2a2a', maxHeight: FH - 90, overflowY: 'auto', zIndex: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {Array.from({ length: mode === '3v3' ? 3 : 1 }, (_, n) => (
                  <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#ef4444', fontSize: 13, minWidth: 74 }}>{mode === '3v3' ? `CPUのベイ${n + 1}` : 'CPUのベイ'}</span>
                    {([['ブレード', BLADES, 'blade'], ['ラチェット', RATCHETS, 'ratchet'], ['ビット', BITS, 'bit']] as const).map(([label, list, key]) => { const cpuInt = !!BLADES.find(b => b.id === cpuSels[n].blade)?.integrated; return (
                      <label key={key} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {label}
                        <select value={key === 'ratchet' && cpuInt ? '' : cpuSels[n][key]} disabled={key === 'ratchet' && cpuInt}
                          onChange={e => setCpuSels(cs => cs.map((c, i) => {
                            if (i !== n) return c;
                            const nc = { ...c, [key]: e.target.value };
                            if (key === 'blade' && BLADES.find(b => b.id === e.target.value)?.integrated) nc.ratchet = ''; // 一体型のブレードはラチェットなし
                            return nc;
                          }))}
                          style={{ padding: '2px 4px', borderRadius: 5, background: '#14204f', color: '#fff', border: '1px solid #2a3566', fontSize: 12.5, opacity: key === 'ratchet' && cpuInt ? 0.5 : 1 }}>
                          <option value="">{key === 'ratchet' && cpuInt ? 'なし（一体型）' : 'ランダム'}</option>
                          {list.map(pt => <option key={pt.id} value={pt.id} disabled={mode === '3v3' && cpuSels.some((c, i) => i !== n && c[key] === pt.id)}>{pt.name}</option>)}
                        </select>
                      </label>
                    ); })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'order' && (
          // ---- 3on3：出す順番を決める
          <div style={{ position: 'absolute', inset: 0, padding: '6px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 900, textAlign: 'center' }}>
              {vs === '2p' && !online ? `${orderWho === 0 ? nameMe : nameCpu}の番です：` : ''}{cycle > 0 ? `3体使い切りました。もう一度、順番を決めよう（${cycle + 1}周目）` : '出す順番を決めよう'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, textAlign: 'center' }}>出したい順に、ベイをタップ（1番手 → 3番手）。{WIN_POINTS}ポイント先取。点数は引き継ぎます。{vs === '2p' && !online && '相手に見えないように決めてね。'}</div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
              {(online ? selfIdx === 1 : vs === 'cpu' && mySide === 'right')
                ? <><span style={{ color: '#ff3ea5' }}>{score.cpu}</span><span style={{ opacity: 0.6 }}> - </span><span style={{ color: '#38b6ff' }}>{score.me}</span></>
                : <><span style={{ color: '#38b6ff' }}>{score.me}</span><span style={{ opacity: 0.6 }}> - </span><span style={{ color: '#ff3ea5' }}>{score.cpu}</span></>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {(online ? (selfIdx === 0 ? deck.me : deck.cpu) : vs === '2p' && orderWho === 1 ? deck.cpu : deck.me).map((c, i) => {
                const bey = buildBey(c), pos = orderPick.indexOf(i);
                return (
                  <button key={i} onClick={() => { if (pos < 0 && !selfReady) setOrderPick(o => [...o, i]); }} style={{
                    position: 'relative', width: Math.min(190, (FW - 60) / 3), padding: '6px 6px', borderRadius: 10, cursor: pos < 0 ? 'pointer' : 'default', color: '#fff',
                    border: `3px solid ${pos >= 0 ? bey.color : '#2a3566'}`, background: pos >= 0 ? '#14204f' : '#0a1030', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
                    {bey.sprite && <img src={bey.sprite.src} alt="" width={58} height={58} />}
                    <div style={{ fontWeight: 800, color: bey.color, textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>{bey.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>攻{bey.stats.atk} 防{bey.stats.def} 持{bey.stats.sta} ダ{bey.stats.dash} 耐{bey.stats.burst}</div>
                    {pos >= 0 && <div style={{ position: 'absolute', top: -9, left: -9, width: 26, height: 26, borderRadius: 13, background: '#ffd740', color: '#04071a', fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pos + 1}</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...yb, background: '#2a3566', color: '#fff' }} disabled={selfReady} onClick={() => setOrderPick([])}>やり直し</button>
              <button style={{ ...yb, opacity: orderPick.length === 3 && !selfReady ? 1 : 0.4 }} disabled={orderPick.length !== 3 || selfReady} onClick={confirmOrder}>{selfReady ? '相手を待っています…' : 'この順番で決定'}</button>
            </div>
            <button onClick={() => (online ? leaveOnline() : backToSelect())} style={{ ...sb(false), position: 'absolute', left: 6, bottom: 6, fontSize: 12, padding: '2px 6px' }}>{online ? '← 退出' : gameMode === 'tournament' ? '← 表へ' : '← 戻る'}</button>
          </div>
        )}

        {(phase === 'tbracket' || phase === 'tchamp') && (() => {
          // ---- トーナメント表 / 優勝
          const t = tourRef.current;
          if (!t) return null;
          const cur = t.cur ? t.rounds[t.cur.r][t.cur.i] : null;
          const curLabel = t.cur ? roundLabel(t.rounds[t.cur.r].length, t.cur.r) : '';
          const headH = 66;
          return (
            <div style={{ position: 'absolute', inset: 0, padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 }}>
                <span style={{ fontSize: 12.5, opacity: 0.85 }}>トーナメント（{t.entrants.length}人・{t.fmt === '3v3' ? '3on3' : '1on1'}）</span>
                <button style={sb(false)} onClick={() => { tourRef.current = null; setPhase('top'); }}>{phase === 'tchamp' ? 'トップへ' : '中断してトップへ'}</button>
              </div>
              {phase === 'tchamp' && t.champion !== null ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: headH - 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.85 }}>優勝</span>
                  <div style={{ color: '#ffd740', textShadow: '0 2px 10px #000' }}><NameBlock e={t.entrants[t.champion]} nameSize={24} catchSize={11} /></div>
                  <span style={{ fontSize: 12.5, opacity: 0.75 }}>{t.entrants.some(e => e.human) && (t.entrants[t.champion].human ? 'おめでとう！' : 'プレイヤーは敗退しました')}</span>
                </div>
              ) : cur ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '3px 10px', borderRadius: 10, border: '2px solid #ffd740', background: '#14204f', minHeight: headH - 12 }}>
                  <span style={{ fontSize: 12.5, opacity: 0.85 }}>次の試合：{curLabel}</span>
                  <NameBlock e={t.entrants[cur.a!]} nameSize={17} catchSize={9.5} color={t.entrants[cur.a!].human ? '#5aabff' : '#fff'} />
                  <span style={{ opacity: 0.6, fontWeight: 900 }}>vs</span>
                  <NameBlock e={t.entrants[cur.b!]} nameSize={17} catchSize={9.5} color={t.entrants[cur.b!].human ? '#5aabff' : '#fff'} />
                  <button style={yb} onClick={startTourMatch}>試合開始</button>
                </div>
              ) : null}
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex' }}>
                <BracketView t={t} availW={FW - 16} availH={FH - 16 - 22 - headH} />
              </div>
            </div>
          );
        })()}

        {canvasOn && (
          // ---- 対戦画面：左右の列（名前・点数・ベイ・操作）+ 中央のスタジアム
          <div style={{ position: 'absolute', inset: 0, padding: pad, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            {mySide === 'left' ? sideCol('me', 'left') : sideCol('cpu', 'left')}
            <div style={{ position: 'relative', width: cW, height: cH, flex: '0 0 auto', margin: `0 ${-ov}px` }}>
              <canvas
                ref={canvasRef} width={W} height={H}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                style={{ width: '100%', height: '100%', cursor: phase === 'launch' ? 'crosshair' : 'default', touchAction: 'none' }}
              />
              {phase === 'launch' && online && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '17%', textAlign: 'center', pointerEvents: 'none', fontSize: 34 * cs, fontWeight: 900, color: placeLeft <= 3 ? '#ff5a5a' : '#ffd740', textShadow: '0 2px 8px #000' }}>残り {placeLeft}秒</div>
              )}
              {phase === 'launch' && vs === '2p' && !seq && !online && (
                <button style={{ ...yb, position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)', opacity: hasDrop && hasDrop2 ? 1 : 0.4 }} disabled={!(hasDrop && hasDrop2)} onClick={shoot}>スタート</button>
              )}
              {count !== null && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontSize: (count === 0 ? 110 : 150) * cs, fontWeight: 900, color: count === 0 ? '#ffd740' : '#fff', textShadow: '0 4px 16px #000, 0 0 30px rgba(90,171,255,0.8)' }}>
                  {count === 0 ? (
                    <div style={{ textAlign: 'center', lineHeight: 1.1 }}>GO!<div style={{ fontSize: 64 * cs }}>シュート！</div></div>
                  ) : count}
                </div>
              )}
              {phase === 'battle' && message && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', fontSize: 34 * cs, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 12px #000' }}>
                  {FINISH_INFO[message.finish].label}!
                </div>
              )}
              {(phase === 'result' || phase === 'over') && message && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(4,7,26,0.62)' }}>
                  <div style={{ fontSize: 44 * cs, fontWeight: 900, color: '#ffd740', textShadow: '0 3px 12px #000', textAlign: 'center' }}>{FINISH_INFO[message.finish].label}!</div>
                  <div style={{ fontSize: 28 * cs, fontWeight: 700 }}>{message.winner === 'me' ? nameMe : nameCpu} +{FINISH_INFO[message.finish].points}pt</div>
                  {phase === 'over' ? (
                    <>
                      <div style={{ fontSize: 36 * cs, fontWeight: 900, color: message.winner === 'me' ? '#5aabff' : '#ef4444' }}>
                        {vs === '2p' || gameMode === 'tournament' ? `${message.winner === 'me' ? nameMe : nameCpu} の勝ち！` : message.winner === 'me' ? 'YOU WIN!' : 'YOU LOSE...'}
                      </div>
                      {online === 'guest' ? <div style={{ fontSize: 14 * cs + 4 }}>ホストの操作を待っています…</div>
                        : gameMode === 'tournament'
                        ? <button style={yb} onClick={() => finishTourMatch(message.winner)}>次へ（トーナメント表）</button>
                        : <button style={yb} onClick={() => { if (online) { sendOn({ t: 'toSelect' }); setGuestInfo(null); setSelfReady(false); } setPhase('select'); }}>もう一度</button>}
                    </>
                  ) : (
                    online === 'guest' ? <div style={{ fontSize: 14 * cs + 4 }}>ホストの操作を待っています…</div> : <button style={yb} onClick={nextRound}>次のラウンド</button>
                  )}
                </div>
              )}
            </div>
            {mySide === 'left' ? sideCol('cpu', 'right') : sideCol('me', 'right')}
          </div>
        )}
      </div>
     </div>
    </div>
  );
}
