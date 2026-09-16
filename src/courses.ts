// Course definitions shared by CircuitScene (drawing) and Race (car path
// sampling), so both always agree on where the track actually is.
//
// All geometry lives in the same 1600x900 local space that CircuitScene's
// <svg viewBox="0 0 1600 900"> backdrop uses, so both course shapes sit in
// the same world.

export type CourseId = 'oval' | 'figure8' | 'hill' | 'grand';

export interface CourseDef {
  id: CourseId;
  name: string;
  description: string;
}

export interface CourseSample {
  x: number;
  y: number;
  angle: number;
  /** 見た目上カーブしている区間か（車体を傾ける演出に使用） */
  isCorner: boolean;
  /** コースアウト判定の対象になる「本当に危険な」区間か。緩いスイーパーは
   * isCorner=trueでも cornerRisk=false になりうる（パワーヒルウェイ）。 */
  cornerRisk: boolean;
  /** 1 = 上り区間, -1 = 下り区間, 0 = 平坦（パワーヒルウェイ専用。他コースは常に0）*/
  slope: 1 | -1 | 0;
}

export const COURSES: CourseDef[] = [
  { id: 'oval', name: 'スピードウェイ・オーバル', description: '定番の楕円コース' },
  { id: 'figure8', name: 'ジャパンカップJr.サーキット', description: 'ウェーブ×4 ＆ ネストしたヘアピンの本格コース' },
  { id: 'hill', name: 'パワーヒルウェイ', description: '上り×下りの超ロングストレート。パワーが物を言う長距離コース' },
  { id: 'grand', name: 'グランドサーキット', description: '直線・ウェーブ・坂を凝縮した歴代最長のロングコース' },
];

export const VIEWBOX_W = 1600;
export const VIEWBOX_H = 900;
// Shared center used by the oval (matches the hardcoded cx/cy of its
// <ellipse> elements in CircuitScene.tsx).
export const TRACK_CENTER_X = 800;
// Vertical center of the 1600x900 viewBox (rather than sitting low like
// the old ellipse did) so the much bigger figure-8 below has full head
// and leg room to grow both taller and wider.
export const TRACK_CENTER_Y = 450;

// ── Oval ──────────────────────────────────────────────
// A "bowtie hexagon" figure-8: two diamond-shaped wings (each 3 straight
// edges + rounded corners) sharing a crossing junction at the origin,
// where the two diagonal edges (L3→R1 and R3→L1) cross each other. Built
// from straights + arcs (like the old hexagon oval) instead of a smooth
// curve, so it both crosses itself AND has real straight sections. Sized
// to fill most of the 1600x900 viewBox in both directions.
export const OVAL_ZOOM = 0.62;
export const OVAL_TRACK_WIDTH = 120;

interface Vec { x: number; y: number; }
const vAdd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const vSub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const vScale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const vLen = (a: Vec): number => Math.hypot(a.x, a.y);
const vNorm = (a: Vec): Vec => { const l = vLen(a) || 1; return { x: a.x / l, y: a.y / l }; };
const vLeftNormal = (a: Vec): Vec => ({ x: -a.y, y: a.x });
const vDot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
const vCross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;

interface PolyStraightSeg { type: 'straight'; from: Vec; to: Vec; }
interface PolyArcSeg { type: 'arc'; center: Vec; r: number; thetaStart: number; thetaEnd: number; }
type PolySeg = PolyStraightSeg | PolyArcSeg;

const OVAL_CORNER_R = 130;
const OVAL_W = 560;
const OVAL_H = 560;

// Left wing tip / outer / tip, then right wing tip / outer / tip — the
// two "crossing" edges (index 2→3 and 5→0) each pass through the origin.
const ovalVerts: Vec[] = [
  { x: -OVAL_W, y: -OVAL_H },
  { x: -2 * OVAL_W, y: 0 },
  { x: -OVAL_W, y: OVAL_H },
  { x: OVAL_W, y: -OVAL_H },
  { x: 2 * OVAL_W, y: 0 },
  { x: OVAL_W, y: OVAL_H },
];

/** Builds a rounded polygon from arbitrary (possibly self-intersecting) vertices, handling both left and right turns at each corner. */
function buildRoundedPolygon(verts: Vec[], cornerR: number): PolySeg[] {
  const n = verts.length;
  const vertexGeoms = verts.map((cur, i) => {
    const prev = verts[(i - 1 + n) % n];
    const next = verts[(i + 1) % n];
    const dirIn = vNorm(vSub(cur, prev));
    const dirOut = vNorm(vSub(next, cur));
    const signedAngle = Math.atan2(vCross(dirIn, dirOut), vDot(dirIn, dirOut));
    const tangentLen = cornerR * Math.tan(Math.abs(signedAngle) / 2);
    const tIn = vSub(cur, vScale(dirIn, tangentLen));
    const tOut = vAdd(cur, vScale(dirOut, tangentLen));
    const normal = signedAngle >= 0 ? vLeftNormal(dirIn) : vScale(vLeftNormal(dirIn), -1);
    const center = vAdd(tIn, vScale(normal, cornerR));
    const thetaStart = Math.atan2(tIn.y - center.y, tIn.x - center.x);
    const thetaEnd = thetaStart + signedAngle;
    return { tIn, tOut, center, thetaStart, thetaEnd };
  });

  const segs: PolySeg[] = [];
  for (let i = 0; i < n; i++) {
    const prevG = vertexGeoms[(i - 1 + n) % n];
    const curG = vertexGeoms[i];
    segs.push({ type: 'straight', from: prevG.tOut, to: curG.tIn });
    segs.push({ type: 'arc', center: curG.center, r: cornerR, thetaStart: curG.thetaStart, thetaEnd: curG.thetaEnd });
  }
  return segs;
}

function polySegLength(seg: PolySeg): number {
  return seg.type === 'straight' ? vLen(vSub(seg.to, seg.from)) : Math.abs(seg.thetaEnd - seg.thetaStart) * seg.r;
}

function polySegFractions(segs: PolySeg[]): number[] {
  const lens = segs.map(polySegLength);
  const total = lens.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (const len of lens) {
    acc += len / total;
    out.push(acc);
  }
  return out;
}

export const ovalSegments: PolySeg[] = buildRoundedPolygon(ovalVerts, OVAL_CORNER_R);
export const ovalSegFractions: number[] = polySegFractions(ovalSegments);

interface LocalSample { x: number; y: number; angleDeg: number; isCorner: boolean; }

/** Samples the figure-8 oval in unstretched local units (crossing at the origin). */
export function sampleOvalHexLocal(pRaw: number): LocalSample {
  const s = (((pRaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);

  let segIndex = ovalSegFractions.findIndex(f => s < f);
  if (segIndex === -1) segIndex = ovalSegments.length - 1;
  const segStart = segIndex === 0 ? 0 : ovalSegFractions[segIndex - 1];
  const segEnd = ovalSegFractions[segIndex];
  const u = (s - segStart) / (segEnd - segStart);
  const seg = ovalSegments[segIndex];

  if (seg.type === 'straight') {
    const x = seg.from.x + (seg.to.x - seg.from.x) * u;
    const y = seg.from.y + (seg.to.y - seg.from.y) * u;
    const angleDeg = (Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * 180) / Math.PI;
    return { x, y, angleDeg, isCorner: false };
  }

  const theta = seg.thetaStart + u * (seg.thetaEnd - seg.thetaStart);
  const hdir = Math.sign(seg.thetaEnd - seg.thetaStart) || 1;
  const x = seg.center.x + seg.r * Math.cos(theta);
  const y = seg.center.y + seg.r * Math.sin(theta);
  const angleDeg = (Math.atan2(Math.cos(theta) * hdir, -Math.sin(theta) * hdir) * 180) / Math.PI;
  return { x, y, angleDeg, isCorner: true };
}

// The Jr. circuit uses its own (smaller, higher-up) center so it can be
// more compact without having to match the oval's placement.
export const JCUP_CENTER_X = 800;
export const JCUP_CENTER_Y = 480;

// ── ジャパンカップJr.サーキット (figure8 id kept for compatibility) ──────
// A 4-row "boustrophedon" serpentine: wavy straights snake back and forth
// (row0 →, row1 ←, row2 →, row3 ←) joined by tight hairpins that alternate
// sides, and the loop-closing hairpin (row3 → row0) nests around the
// smaller row1→row2 hairpin on the same side — much closer to the real
// set's dense, nested-hairpin layout than a simple 2-lane stadium.
export const JCUP_ROWS = 4;
export const JCUP_HALF_W = 380;
export const JCUP_ROW_GAP = 130;
export const JCUP_WAVE_AMP = 24;
export const JCUP_WAVE_CYCLES = 2;
export const JCUP_TRACK_WIDTH = 96;

export interface StraightSeg {
  type: 'straight';
  y: number;
  dir: 1 | -1;
  len: number;
}
export interface HairpinSeg {
  type: 'hairpin';
  hx: number;
  hy: number;
  r: number;
  thetaStart: number;
  thetaEnd: number;
}
export type Seg = StraightSeg | HairpinSeg;

const rowYs: number[] = Array.from({ length: JCUP_ROWS }, (_, i) => (
  JCUP_CENTER_Y - ((JCUP_ROWS - 1) * JCUP_ROW_GAP) / 2 + i * JCUP_ROW_GAP
));

export const jcupSegments: Seg[] = [];
for (let i = 0; i < JCUP_ROWS; i++) {
  const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
  jcupSegments.push({ type: 'straight', y: rowYs[i], dir, len: JCUP_HALF_W * 2 });

  const next = (i + 1) % JCUP_ROWS;
  const isRight = dir === 1;
  const startIsTop = rowYs[i] < rowYs[next];
  const hx = JCUP_CENTER_X + (isRight ? JCUP_HALF_W : -JCUP_HALF_W);
  const hy = (rowYs[i] + rowYs[next]) / 2;
  const r = Math.abs(rowYs[next] - rowYs[i]) / 2;
  const hdir = isRight === startIsTop ? 1 : -1;
  const apex = isRight ? 0 : Math.PI;
  const thetaStart = apex - 0.5 * Math.PI * hdir;
  const thetaEnd = apex + 0.5 * Math.PI * hdir;
  jcupSegments.push({ type: 'hairpin', hx, hy, r, thetaStart, thetaEnd });
}

function segLength(seg: Seg): number {
  return seg.type === 'straight' ? seg.len : Math.abs(seg.thetaEnd - seg.thetaStart) * seg.r;
}

const jcupSegLens = jcupSegments.map(segLength);
const jcupTotalLen = jcupSegLens.reduce((a, b) => a + b, 0);
export const jcupSegFractions: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const len of jcupSegLens) {
    acc += len / jcupTotalLen;
    out.push(acc);
  }
  return out;
})();

function waveOffset(u: number): number {
  // Amplitude tapers to 0 at both ends (u=0,1) so the straight meets the
  // hairpins smoothly instead of kinking sideways into them.
  return JCUP_WAVE_AMP * Math.sin(u * JCUP_WAVE_CYCLES * Math.PI * 2) * Math.sin(u * Math.PI);
}

function waveSlope(u: number): number {
  const a = JCUP_WAVE_CYCLES * Math.PI * 2;
  const b = Math.PI;
  return JCUP_WAVE_AMP * (a * Math.cos(u * a) * Math.sin(u * b) + b * Math.sin(u * a) * Math.cos(u * b));
}

/** Samples the Japan Cup Jr. circuit in LOCAL (unscaled) course units. */
export function sampleJCupLocal(pRaw: number): CourseSample {
  const s = (((pRaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);

  let segIndex = jcupSegFractions.findIndex(f => s < f);
  if (segIndex === -1) segIndex = jcupSegments.length - 1;
  const segStart = segIndex === 0 ? 0 : jcupSegFractions[segIndex - 1];
  const segEnd = jcupSegFractions[segIndex];
  const u = (s - segStart) / (segEnd - segStart);
  const seg = jcupSegments[segIndex];

  if (seg.type === 'straight') {
    const x0 = seg.dir === 1 ? JCUP_CENTER_X - JCUP_HALF_W : JCUP_CENTER_X + JCUP_HALF_W;
    const x = x0 + seg.dir * u * seg.len;
    const y = seg.y + waveOffset(u);
    const angle = (Math.atan2(waveSlope(u), seg.dir * seg.len) * 180) / Math.PI;
    return { x, y, angle, isCorner: false, cornerRisk: false, slope: 0 };
  }

  const theta = seg.thetaStart + u * (seg.thetaEnd - seg.thetaStart);
  const hdir = Math.sign(seg.thetaEnd - seg.thetaStart);
  const x = seg.hx + seg.r * Math.cos(theta);
  const y = seg.hy + seg.r * Math.sin(theta);
  const angle = (Math.atan2(Math.cos(theta) * hdir, -Math.sin(theta) * hdir) * 180) / Math.PI;
  return { x, y, angle, isCorner: true, cornerRisk: true, slope: 0 };
}

// ── パワーヒルウェイ ─────────────────────────────────────
// スタート/フィニッシュ直線とクレスト（頂上）遷移直線が交差する「8の字」型。
// 交差の片側は、ぐるぐると大きく回り込む長いロングヒル（上り）のループ。
// 交差を抜けた後は下り区間の途中でカーブ、続けて反対向きのカーブ（S字）を
// 挟んでからスタート/フィニッシュ直線に戻る。slope: 1=上り, -1=下り, 0=平坦。
export const HILL_ZOOM = 0.42;
// 縦に長いコースの上端がリーダーボードUIの裏に隠れないよう、オーバルより
// 下寄りに中心を置く（表示上の調整のみ。周回距離はズームに依存しない）。
export const HILL_CENTER_Y = 520;
export const HILL_TRACK_WIDTH = 100;

interface HillStraightSeg { type: 'straight'; from: Vec; to: Vec; slope: 1 | -1 | 0; }
interface HillArcSeg { type: 'arc'; center: Vec; r: number; thetaStart: number; thetaEnd: number; }
export type HillSeg = HillStraightSeg | HillArcSeg;

// 9頂点の自己交差ポリゴン。v0→v1a→v1b→v1c→v2 がぐるぐる回り込む
// ロングヒル（上り）のループ、v2→v3 がクレスト遷移直線、v3→v4a→v4b→v5 が
// 下り区間＋S字カーブ、v5→v0 がスタート/フィニッシュ直線。
// v2→v3（クレスト遷移）と v5→v0（スタート/フィニッシュ直線）が交差する。
const hillVerts: Vec[] = [
  { x: -250, y: -700 }, // v0: 上りループ入口（スタート/フィニッシュ直線から）
  { x: -560, y: -420 }, // v1a: ループ膨らみ
  { x: -720, y: 0 },    // v1b: ループ最遠点（ぐるぐる回る頂点）
  { x: -560, y: 420 },  // v1c: ループ膨らみ
  { x: -250, y: 700 },  // v2: 上りループ出口（クレスト遷移へ）
  { x: 250, y: -350 },  // v3: 下り区間の入口
  { x: 500, y: -210 },  // v4a: 下り途中のカーブ
  { x: 600, y: 210 },   // v4b: 反対向きのカーブ（S字）
  { x: 250, y: 350 },   // v5: スタート/フィニッシュ直線へ
];
// edgeSlopes[i] = 頂点i→頂点i+1の区間の傾斜。スタート/フィニッシュ直線
// （v5→v0）も上りにして、スタートから最初のカーブ（v0）までずっと上り坂に
// なるようにし、そのままループの上りに繋がる分、上り区間を大幅に延長した。
const hillEdgeSlopes: (1 | -1 | 0)[] = [1, 1, 1, 1, 0, -1, -1, -1, 1];
// 頂点ごとのコーナー半径。ループの膨らみは広いスイーパー、S字の2つは
// タイトな本当に危険なコーナーにして、コースアウトの緊張感をS字に集中させる。
const hillCornerRs: number[] = [100, 110, 120, 110, 100, 85, 60, 65, 100];
// この半径以下のコーナーだけが本当に危険（コースアウト判定の対象）。
// 広いループのスイーパーは見た目には曲がっていてもコースアウトしない安全
// 区間にして、コーナー数が増えても単純にコースアウト頻度が跳ね上がらない
// ようにする（危険区間はS字カーブの2箇所のみ）。
const HILL_DANGER_CORNER_MAX_R = 80;

/** Like buildRoundedPolygon, but carries a slope tag per straight edge and allows a per-vertex corner radius. */
function buildHillPolygon(verts: Vec[], edgeSlopes: (1 | -1 | 0)[], cornerRs: number[]): HillSeg[] {
  const n = verts.length;
  const vertexGeoms = verts.map((cur, i) => {
    const prev = verts[(i - 1 + n) % n];
    const next = verts[(i + 1) % n];
    const dirIn = vNorm(vSub(cur, prev));
    const dirOut = vNorm(vSub(next, cur));
    const signedAngle = Math.atan2(vCross(dirIn, dirOut), vDot(dirIn, dirOut));
    const cornerR = cornerRs[i];
    const tangentLen = cornerR * Math.tan(Math.abs(signedAngle) / 2);
    const tIn = vSub(cur, vScale(dirIn, tangentLen));
    const tOut = vAdd(cur, vScale(dirOut, tangentLen));
    const normal = signedAngle >= 0 ? vLeftNormal(dirIn) : vScale(vLeftNormal(dirIn), -1);
    const center = vAdd(tIn, vScale(normal, cornerR));
    const thetaStart = Math.atan2(tIn.y - center.y, tIn.x - center.x);
    const thetaEnd = thetaStart + signedAngle;
    return { tIn, tOut, center, thetaStart, thetaEnd, r: cornerR };
  });

  const segs: HillSeg[] = [];
  for (let i = 0; i < n; i++) {
    const prevG = vertexGeoms[(i - 1 + n) % n];
    const curG = vertexGeoms[i];
    const edgeIdx = (i - 1 + n) % n;
    segs.push({ type: 'straight', from: prevG.tOut, to: curG.tIn, slope: edgeSlopes[edgeIdx] });
    segs.push({ type: 'arc', center: curG.center, r: curG.r, thetaStart: curG.thetaStart, thetaEnd: curG.thetaEnd });
  }
  return segs;
}

export const hillSegments: HillSeg[] = buildHillPolygon(hillVerts, hillEdgeSlopes, hillCornerRs);

function hillSegLength(seg: HillSeg): number {
  return seg.type === 'straight' ? vLen(vSub(seg.to, seg.from)) : Math.abs(seg.thetaEnd - seg.thetaStart) * seg.r;
}

const hillSegLens = hillSegments.map(hillSegLength);
const hillTotalLen = hillSegLens.reduce((a, b) => a + b, 0);
export const hillSegFractions: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const len of hillSegLens) {
    acc += len / hillTotalLen;
    out.push(acc);
  }
  return out;
})();

interface HillLocalSample { x: number; y: number; angleDeg: number; isCorner: boolean; cornerRisk: boolean; slope: 1 | -1 | 0; }

/** Samples パワーヒルウェイ in origin-centered local units (like the oval). */
export function sampleHillLocal(pRaw: number): HillLocalSample {
  const s = (((pRaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);

  let segIndex = hillSegFractions.findIndex(f => s < f);
  if (segIndex === -1) segIndex = hillSegments.length - 1;
  const segStart = segIndex === 0 ? 0 : hillSegFractions[segIndex - 1];
  const segEnd = hillSegFractions[segIndex];
  const u = (s - segStart) / (segEnd - segStart);
  const seg = hillSegments[segIndex];

  if (seg.type === 'straight') {
    const x = seg.from.x + (seg.to.x - seg.from.x) * u;
    const y = seg.from.y + (seg.to.y - seg.from.y) * u;
    const angleDeg = (Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * 180) / Math.PI;
    return { x, y, angleDeg, isCorner: false, cornerRisk: false, slope: seg.slope };
  }

  const theta = seg.thetaStart + u * (seg.thetaEnd - seg.thetaStart);
  const hdir = Math.sign(seg.thetaEnd - seg.thetaStart) || 1;
  const x = seg.center.x + seg.r * Math.cos(theta);
  const y = seg.center.y + seg.r * Math.sin(theta);
  const angleDeg = (Math.atan2(Math.cos(theta) * hdir, -Math.sin(theta) * hdir) * 180) / Math.PI;
  return { x, y, angleDeg, isCorner: true, cornerRisk: seg.r <= HILL_DANGER_CORNER_MAX_R, slope: 0 };
}

// ── グランドサーキット ─────────────────────────────────────
// 「直線・カーブ・坂」の3コースを1つに凝縮した、歴代最長のロングコース。
// 自己交差はしないシンプルな1周ループだが、①長い直線（オーバル風）、
// ②きつめのジグザグが3連続するウェーブ区間（ジャパンカップJr.風）、
// ③上り・下りの長いストレート（パワーヒルウェイ風）を1周に全部詰め込む。
// コース・マシンとも縮小表示してよいとのことなので、ズームは歴代最小。
export const GRAND_ZOOM = 0.3;
export const GRAND_CENTER_X = TRACK_CENTER_X;
// 上端がリーダーボードUIの裏に隠れないよう、下寄りに中心を置く
export const GRAND_CENTER_Y = 560;
export const GRAND_TRACK_WIDTH = 100;

// v0→v1 が長いスタート/フィニッシュ直線（平坦）、v3→v4→v5→v6→v7 が
// きつめのジグザグ×3のウェーブ区間、v8→v9 が上りの長いストレート、
// v10→v11 が下りの長いストレート。
const grandVerts: Vec[] = [
  { x: -800, y: 1000 },  // v0: 左下、スタート/フィニッシュ直線の始点
  { x: 800, y: 1000 },   // v1: 右下 — スタート/フィニッシュ直線（平坦・長い）
  { x: 1200, y: 500 },   // v2: コーナー
  { x: 1200, y: 100 },   // v3: ウェーブ前の右側直線（平坦）
  { x: 950, y: -50 },    // v4: ジグザグ1
  { x: 1200, y: -250 },  // v5: ジグザグ2（逆方向）
  { x: 950, y: -450 },   // v6: ジグザグ3（逆方向）
  { x: 1200, y: -800 },  // v7: ウェーブ後のコーナー
  { x: 800, y: -1150 },  // v8: 上り区間へのコーナー
  { x: -800, y: -1150 }, // v9: 上りの長いストレート
  { x: -1200, y: -700 }, // v10: コーナー
  { x: -1200, y: 500 },  // v11: 下りの長いストレート
];
const grandEdgeSlopes: (1 | -1 | 0)[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, -1, 0];
// ウェーブ区間（ジグザグ3つ）だけタイトな本当に危険なコーナーにして、
// それ以外の広いコーナーは見た目には曲がっていても安全にする
const grandCornerRs: number[] = [130, 110, 100, 70, 65, 65, 70, 100, 110, 100, 110, 130];
const GRAND_DANGER_CORNER_MAX_R = 80;

export const grandSegments: HillSeg[] = buildHillPolygon(grandVerts, grandEdgeSlopes, grandCornerRs);

const grandSegLens = grandSegments.map(hillSegLength);
const grandTotalLen = grandSegLens.reduce((a, b) => a + b, 0);
export const grandSegFractions: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const len of grandSegLens) {
    acc += len / grandTotalLen;
    out.push(acc);
  }
  return out;
})();

/** Samples グランドサーキット in origin-centered local units (like the hill course). */
export function sampleGrandLocal(pRaw: number): HillLocalSample {
  const s = (((pRaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);

  let segIndex = grandSegFractions.findIndex(f => s < f);
  if (segIndex === -1) segIndex = grandSegments.length - 1;
  const segStart = segIndex === 0 ? 0 : grandSegFractions[segIndex - 1];
  const segEnd = grandSegFractions[segIndex];
  const u = (s - segStart) / (segEnd - segStart);
  const seg = grandSegments[segIndex];

  if (seg.type === 'straight') {
    const x = seg.from.x + (seg.to.x - seg.from.x) * u;
    const y = seg.from.y + (seg.to.y - seg.from.y) * u;
    const angleDeg = (Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x) * 180) / Math.PI;
    return { x, y, angleDeg, isCorner: false, cornerRisk: false, slope: seg.slope };
  }

  const theta = seg.thetaStart + u * (seg.thetaEnd - seg.thetaStart);
  const hdir = Math.sign(seg.thetaEnd - seg.thetaStart) || 1;
  const x = seg.center.x + seg.r * Math.cos(theta);
  const y = seg.center.y + seg.r * Math.sin(theta);
  const angleDeg = (Math.atan2(Math.cos(theta) * hdir, -Math.sin(theta) * hdir) * 180) / Math.PI;
  return { x, y, angleDeg, isCorner: true, cornerRisk: seg.r <= GRAND_DANGER_CORNER_MAX_R, slope: 0 };
}

function getScreenTransform(viewportWidth: number, viewportHeight: number) {
  const scale = Math.max(viewportWidth / VIEWBOX_W, viewportHeight / VIEWBOX_H);
  const offsetX = (viewportWidth - VIEWBOX_W * scale) / 2;
  const offsetY = viewportHeight - VIEWBOX_H * scale;
  return { scale, offsetX, offsetY };
}

/**
 * Samples a course at raw progress `p` (accumulated by the race loop,
 * wraps at 2π = one lap) for the given lane (a small multiplier used to
 * visually separate racers so they don't fully overlap) and window size.
 * Returns on-screen pixel coordinates + heading, replicating the same
 * viewBox scaling CircuitScene's <svg> uses so the car always matches the
 * drawn track.
 */
export function sampleCourse(
  courseId: CourseId,
  p: number,
  viewportWidth: number,
  viewportHeight: number,
  laneMul = 1
): CourseSample {
  const { scale, offsetX, offsetY } = getScreenTransform(viewportWidth, viewportHeight);

  if (courseId === 'figure8') {
    const local = sampleJCupLocal(p);
    const x = JCUP_CENTER_X + (local.x - JCUP_CENTER_X) * laneMul;
    const y = JCUP_CENTER_Y + (local.y - JCUP_CENTER_Y) * laneMul;
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angle, isCorner: local.isCorner, cornerRisk: local.isCorner, slope: 0 };
  }

  if (courseId === 'hill') {
    const local = sampleHillLocal(p);
    const s = HILL_ZOOM * laneMul;
    const x = TRACK_CENTER_X + local.x * s;
    const y = HILL_CENTER_Y + local.y * s;
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angleDeg, isCorner: local.isCorner, cornerRisk: local.cornerRisk, slope: local.slope };
  }

  if (courseId === 'grand') {
    const local = sampleGrandLocal(p);
    const s = GRAND_ZOOM * laneMul;
    const x = GRAND_CENTER_X + local.x * s;
    const y = GRAND_CENTER_Y + local.y * s;
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angleDeg, isCorner: local.isCorner, cornerRisk: local.cornerRisk, slope: local.slope };
  }

  const local = sampleOvalHexLocal(p);
  const s = OVAL_ZOOM * laneMul;
  const x = TRACK_CENTER_X + local.x * s;
  const y = TRACK_CENTER_Y + local.y * s;
  return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angleDeg, isCorner: local.isCorner, cornerRisk: local.isCorner, slope: 0 };
}
