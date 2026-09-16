import React, { forwardRef, useImperativeHandle, useRef } from 'react';

/**
 * The in-race machine, built as a set of separate game objects (not a single
 * flat photo): a body shell, 4 independently spinning wheels, and 2
 * independently spinning stabilizer rollers ("other moving parts"). Each
 * part exposes its own DOM node so the race loop can drive position,
 * heading/drift and per-part spin every frame via direct style writes
 * (kept imperative for animation performance, matching the rest of the
 * race loop in Race.tsx).
 */
export interface RaceCarHandle {
  root: HTMLDivElement | null;
  bounce: HTMLDivElement | null;
  rotate: HTMLDivElement | null;
  wheels: SVGGElement[];
  rollers: SVGGElement[];
}

interface RaceCarProps {
  bodyId: string | null;
  isOut: boolean;
}

interface Livery {
  primary: string;
  secondary: string;
  accent: string;
  wheel: string;
  roller: string;
}

const LIVERY: Record<string, Livery> = {
  b_magnum: { primary: '#f2f5fa', secondary: '#1d4ed8', accent: '#dc2626', wheel: '#2f9e44', roller: '#ffd23f' },
  b_sonic: { primary: '#f2f5fa', secondary: '#dc2626', accent: '#0f7a4d', wheel: '#ffd23f', roller: '#2f9e44' },
  b_tridagger: { primary: '#1c1c22', secondary: '#dc2626', accent: '#f4a300', wheel: '#c0392b', roller: '#2563eb' },
};
const DEFAULT_LIVERY = LIVERY.b_magnum;

const Wheel: React.FC<{ innerRef: React.Ref<SVGGElement>; cx: number; cy: number; color: string }> = ({ innerRef, cx, cy, color }) => (
  <g ref={innerRef} className="mc-wheel-g">
    <circle cx={cx} cy={cy} r="17" fill="#161616" stroke="#000" strokeWidth="1.2" />
    <circle cx={cx} cy={cy} r="17" fill="none" stroke={color} strokeWidth="3" opacity="0.55" />
    {[0, 72, 144, 216, 288].map(rot => (
      <rect
        key={rot}
        x={cx - 1.8}
        y={cy - 17}
        width="3.6"
        height="10"
        rx="1.5"
        fill="#0a0a0a"
        transform={`rotate(${rot} ${cx} ${cy})`}
      />
    ))}
    <circle cx={cx} cy={cy} r="7.5" fill={color} />
    <circle cx={cx} cy={cy} r="3" fill="#2c2c2c" />
  </g>
);

const Roller: React.FC<{ innerRef: React.Ref<SVGGElement>; cx: number; cy: number; color: string }> = ({ innerRef, cx, cy, color }) => (
  <g ref={innerRef} className="mc-roller-g">
    <circle cx={cx} cy={cy} r="7.5" fill="#20232b" stroke="#000" strokeWidth="1" />
    <circle cx={cx} cy={cy} r="5.2" fill={color} />
    <rect x={cx - 1} y={cy - 6.5} width="2" height="13" fill="#0a0a0a" opacity="0.7" />
    <rect x={cx - 6.5} y={cy - 1} width="13" height="2" fill="#0a0a0a" opacity="0.7" />
  </g>
);

export const RaceCar = forwardRef<RaceCarHandle, RaceCarProps>(({ bodyId, isOut }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const bounceRef = useRef<HTMLDivElement>(null);
  const rotateRef = useRef<HTMLDivElement>(null);
  const wheelFT = useRef<SVGGElement>(null);
  const wheelFB = useRef<SVGGElement>(null);
  const wheelRT = useRef<SVGGElement>(null);
  const wheelRB = useRef<SVGGElement>(null);
  const rollerFront = useRef<SVGGElement>(null);
  const rollerRear = useRef<SVGGElement>(null);

  useImperativeHandle(ref, () => ({
    get root() { return rootRef.current; },
    get bounce() { return bounceRef.current; },
    get rotate() { return rotateRef.current; },
    get wheels() { return [wheelFT.current, wheelFB.current, wheelRT.current, wheelRB.current].filter(Boolean) as SVGGElement[]; },
    get rollers() { return [rollerFront.current, rollerRear.current].filter(Boolean) as SVGGElement[]; },
  }));

  const c = (bodyId && LIVERY[bodyId]) || DEFAULT_LIVERY;

  return (
    <div ref={rootRef} className="mc-root">
      <div ref={bounceRef} className="mc-bounce">
        <div className="mc-shadow" />
        <div ref={rotateRef} className={`mc-rotate${isOut ? ' is-out' : ''}`}>
          <svg viewBox="0 0 220 100" className="mc-svg">
            {/* front / rear stabilizer stalks connecting body to rollers */}
            <rect x="208" y="47" width="18" height="6" rx="2" fill="#3a3d44" />
            <rect x="-18" y="47" width="18" height="6" rx="2" fill="#3a3d44" />

            {/* rear wing */}
            <rect x="-8" y="22" width="24" height="56" rx="5" fill={c.secondary} stroke="#000" strokeWidth="1.5" />
            <rect x="-8" y="22" width="24" height="10" rx="4" fill="#000" opacity="0.18" />

            {/* body shell */}
            <path
              d="M214,49 C205,36 185,26 160,23 C130,20 105,20 82,24 C55,29 30,36 14,44 L14,56 C30,64 55,71 82,76 C105,80 130,80 160,77 C185,74 205,64 214,51 Z"
              fill={c.primary}
              stroke="#000"
              strokeWidth="2"
            />
            {/* nose accent */}
            <path d="M214,49 C207,40 194,32 178,27 L170,45 L170,55 L178,73 C194,68 207,60 214,51 Z" fill={c.secondary} opacity="0.92" />
            {/* side accent stripe */}
            <path d="M150,26 L172,50 L150,74 L120,64 L120,36 Z" fill={c.accent} opacity="0.88" />
            {/* cockpit canopy */}
            <ellipse cx="140" cy="50" rx="26" ry="15" fill="#151a24" stroke="#000" strokeWidth="1.5" />
            <ellipse cx="146" cy="45" rx="10" ry="5" fill="#7fb8ff" opacity="0.45" />
            {/* chassis centerline */}
            <line x1="20" y1="50" x2="205" y2="50" stroke="#000" strokeWidth="1" opacity="0.15" />

            <Roller innerRef={rollerFront} cx={224} cy={50} color={c.roller} />
            <Roller innerRef={rollerRear} cx={-14} cy={50} color={c.roller} />

            <Wheel innerRef={wheelFT} cx={165} cy={0} color={c.wheel} />
            <Wheel innerRef={wheelFB} cx={165} cy={100} color={c.wheel} />
            <Wheel innerRef={wheelRT} cx={55} cy={0} color={c.wheel} />
            <Wheel innerRef={wheelRB} cx={55} cy={100} color={c.wheel} />
          </svg>
        </div>
      </div>
    </div>
  );
});

RaceCar.displayName = 'RaceCar';
