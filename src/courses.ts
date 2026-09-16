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
// Shrunk to roughly match the Jr. circuit's footprint (see OVAL_ZOOM,
// applied to both the car path here and the drawn ellipses in
// CircuitScene.tsx so the two courses read as similarly "small").
export const OVAL_LANE_RX = (740 + 430) / 2;
export const OVAL_LANE_RY = (205 + 112) / 2;
export const OVAL_ZOOM = 0.68;

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

  const rx = OVAL_LANE_RX * OVAL_ZOOM * laneMul;
  const ry = OVAL_LANE_RY * OVAL_ZOOM * laneMul;
  const x = TRACK_CENTER_X + rx * Math.cos(p);
  const y = TRACK_CENTER_Y + ry * Math.sin(p);
  const dx = -rx * Math.sin(p);
  const dy = ry * Math.cos(p);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const isCorner = Math.abs(Math.cos(p)) > 0.8;
  return { x: offsetX + x * scale, y: offsetY + y * scale, angle, isCorner };
}
