// Course definitions shared by CircuitScene (drawing) and Race (car path
// sampling), so both always agree on where the track actually is.
//
// All geometry lives in the same 1600x900 local space that CircuitScene's
// <svg viewBox="0 0 1600 900"> stadium backdrop uses, so both course
// shapes sit inside the same venue artwork.

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
  { id: 'figure8', name: 'ジャパンカップJr.サーキット', description: 'S字ウェーブ＆クロスブリッジの本格コース' },
];

export const VIEWBOX_W = 1600;
export const VIEWBOX_H = 900;
export const TRACK_CENTER_X = 800;
export const TRACK_CENTER_Y = 690;

// ── Oval ──────────────────────────────────────────────
export const OVAL_LANE_RX = (740 + 430) / 2;
export const OVAL_LANE_RY = (205 + 112) / 2;
const OVAL_START_T = 0;

// ── Figure-8 (ジャパンカップJr.サーキット) ──────────────
// A lemniscate (x = A sin t, y = (B/2) sin 2t) naturally crosses itself
// once at the center per lap — exactly the "cross bridge" the real Japan
// Cup Jr. Circuit set uses — while still being one smooth closed loop.
export const FIG8_A = 600;
export const FIG8_B = 260;
const FIG8_ZOOM = 0.82;
const FIG8_START_T = 1.65;

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
    const t = FIG8_START_T + p;
    const A = FIG8_A * FIG8_ZOOM * laneMul;
    const B = FIG8_B * FIG8_ZOOM * laneMul;
    const x = TRACK_CENTER_X + A * Math.sin(t);
    const y = TRACK_CENTER_Y + B * Math.sin(t) * Math.cos(t);
    const dx = A * Math.cos(t);
    const dy = B * Math.cos(2 * t);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const isCorner = Math.abs(Math.cos(t)) < 0.35;
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle, isCorner };
  }

  const t = OVAL_START_T + p;
  const rx = OVAL_LANE_RX * laneMul;
  const ry = OVAL_LANE_RY * laneMul;
  const x = TRACK_CENTER_X + rx * Math.cos(t);
  const y = TRACK_CENTER_Y + ry * Math.sin(t);
  const dx = -rx * Math.sin(t);
  const dy = ry * Math.cos(t);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const isCorner = Math.abs(Math.cos(t)) > 0.8;
  return { x: offsetX + x * scale, y: offsetY + y * scale, angle, isCorner };
}
