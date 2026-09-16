// Course definitions shared by CircuitScene (drawing) and Race (car path
// sampling), so both always agree on where the track actually is.
//
// All geometry lives in the same 1600x900 local space that CircuitScene's
// <svg viewBox="0 0 1600 900"> backdrop uses, so both course shapes sit in
// the same world.

export type CourseId = 'oval' | 'figure8';

export interface CourseDef {
  id: CourseId;
  name: string;
  description: string;
}

export interface CourseSample {
  x: number;
  y: number;
  angle: number;
  isCorner: boolean;
}

export const COURSES: CourseDef[] = [
  { id: 'oval', name: 'スピードウェイ・オーバル', description: '定番の楕円コース' },
  { id: 'figure8', name: 'ジャパンカップJr.サーキット', description: 'ウェーブ×4 ＆ ネストしたヘアピンの本格コース' },
];

export const VIEWBOX_W = 1600;
export const VIEWBOX_H = 900;
// Shared center used by the oval (matches the hardcoded cx/cy of its
// <ellipse> elements in CircuitScene.tsx).
export const TRACK_CENTER_X = 800;
export const TRACK_CENTER_Y = 690;

// ── Oval ──────────────────────────────────────────────
// A "bowtie hexagon" figure-8: two diamond-shaped wings (each 3 straight
// edges + rounded corners) sharing a crossing junction at the origin,
// where the two diagonal edges (L3→R1 and R3→L1) cross each other. Built
// from straights + arcs (like the old hexagon oval) instead of a smooth
// curve, so it both crosses itself AND has real straight sections.
export const OVAL_ZOOM = 0.56;
export const OVAL_TRACK_WIDTH = 104;

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

const OVAL_CORNER_R = 70;
const OVAL_W = 280;
const OVAL_H = 200;

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
    return { x, y, angle, isCorner: false };
  }

  const theta = seg.thetaStart + u * (seg.thetaEnd - seg.thetaStart);
  const hdir = Math.sign(seg.thetaEnd - seg.thetaStart);
  const x = seg.hx + seg.r * Math.cos(theta);
  const y = seg.hy + seg.r * Math.sin(theta);
  const angle = (Math.atan2(Math.cos(theta) * hdir, -Math.sin(theta) * hdir) * 180) / Math.PI;
  return { x, y, angle, isCorner: true };
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
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angle, isCorner: local.isCorner };
  }

  const local = sampleOvalHexLocal(p);
  const s = OVAL_ZOOM * laneMul;
  const x = TRACK_CENTER_X + local.x * s;
  const y = TRACK_CENTER_Y + local.y * s;
  return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angleDeg, isCorner: local.isCorner };
}
