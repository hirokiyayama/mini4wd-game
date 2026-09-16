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
  { id: 'figure8', name: 'ジャパンカップJr.サーキット', description: 'S字ウェーブ＆ヘアピンの本格コース' },
];

export const VIEWBOX_W = 1600;
export const VIEWBOX_H = 900;
export const TRACK_CENTER_X = 800;
export const TRACK_CENTER_Y = 690;

// ── Oval ──────────────────────────────────────────────
export const OVAL_LANE_RX = (740 + 430) / 2;
export const OVAL_LANE_RY = (205 + 112) / 2;

// ── ジャパンカップJr.サーキット (figure8 id kept for compatibility) ──────
// A "stadium" serpentine: two long wavy straights connected by tight
// hairpin turns at both ends, mirroring the real Japan Cup Jr. circuit set
// (ストレート + ウェーブ + カーブ×hairpins) far more closely than a smooth
// oval/lemniscate would.
export const JCUP_HALF_W = 480;
export const JCUP_ROW_GAP = 230;
export const JCUP_HAIRPIN_R = JCUP_ROW_GAP / 2;
export const JCUP_WAVE_AMP = 42;
export const JCUP_WAVE_CYCLES = 2;

const JCUP_STRAIGHT_LEN = JCUP_HALF_W * 2;
const JCUP_HAIRPIN_LEN = Math.PI * JCUP_HAIRPIN_R;
const JCUP_TOTAL_LEN = JCUP_STRAIGHT_LEN * 2 + JCUP_HAIRPIN_LEN * 2;
export const JCUP_F1 = JCUP_STRAIGHT_LEN / JCUP_TOTAL_LEN;
export const JCUP_F2 = JCUP_F1 + JCUP_HAIRPIN_LEN / JCUP_TOTAL_LEN;
export const JCUP_F3 = JCUP_F2 + JCUP_STRAIGHT_LEN / JCUP_TOTAL_LEN;

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
  const cx = TRACK_CENTER_X;
  const cy = TRACK_CENTER_Y;
  const topY = cy - JCUP_HAIRPIN_R;
  const botY = cy + JCUP_HAIRPIN_R;

  if (s < JCUP_F1) {
    const u = s / JCUP_F1;
    const x = cx - JCUP_HALF_W + u * JCUP_STRAIGHT_LEN;
    const y = topY + waveOffset(u);
    const angle = (Math.atan2(waveSlope(u), JCUP_STRAIGHT_LEN) * 180) / Math.PI;
    return { x, y, angle, isCorner: false };
  }
  if (s < JCUP_F2) {
    const u = (s - JCUP_F1) / (JCUP_F2 - JCUP_F1);
    const theta = -Math.PI / 2 + u * Math.PI;
    const hx = cx + JCUP_HALF_W;
    const x = hx + JCUP_HAIRPIN_R * Math.cos(theta);
    const y = cy + JCUP_HAIRPIN_R * Math.sin(theta);
    const angle = (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI;
    return { x, y, angle, isCorner: true };
  }
  if (s < JCUP_F3) {
    const u = (s - JCUP_F2) / (JCUP_F3 - JCUP_F2);
    const x = cx + JCUP_HALF_W - u * JCUP_STRAIGHT_LEN;
    const y = botY + waveOffset(u);
    const angle = (Math.atan2(waveSlope(u), -JCUP_STRAIGHT_LEN) * 180) / Math.PI;
    return { x, y, angle, isCorner: false };
  }
  const u = (s - JCUP_F3) / (1 - JCUP_F3);
  const theta = Math.PI / 2 + u * Math.PI;
  const hx = cx - JCUP_HALF_W;
  const x = hx + JCUP_HAIRPIN_R * Math.cos(theta);
  const y = cy + JCUP_HAIRPIN_R * Math.sin(theta);
  const angle = (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI;
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
    const x = TRACK_CENTER_X + (local.x - TRACK_CENTER_X) * laneMul;
    const y = TRACK_CENTER_Y + (local.y - TRACK_CENTER_Y) * laneMul;
    return { x: offsetX + x * scale, y: offsetY + y * scale, angle: local.angle, isCorner: local.isCorner };
  }

  const rx = OVAL_LANE_RX * laneMul;
  const ry = OVAL_LANE_RY * laneMul;
  const x = TRACK_CENTER_X + rx * Math.cos(p);
  const y = TRACK_CENTER_Y + ry * Math.sin(p);
  const dx = -rx * Math.sin(p);
  const dy = ry * Math.cos(p);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const isCorner = Math.abs(Math.cos(p)) > 0.8;
  return { x: offsetX + x * scale, y: offsetY + y * scale, angle, isCorner };
}
