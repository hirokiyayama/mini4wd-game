import { forwardRef, useImperativeHandle, useRef } from 'react';
import { PARTS } from './data';

/**
 * The in-race machine. A real photo is a fixed 3/4-angle product shot, so
 * spinning the whole image to face the direction of travel never reads as
 * "driving" — it just looks like a picture rotating. Instead the race
 * object is an arrow-shaped livery icon (unambiguously forward-pointing at
 * any heading) colored to match the player's chosen body, with a small
 * non-rotating badge (photo thumbnail + name) hovering above it so it's
 * still clearly tied back to the machine they built in the garage. The
 * race loop drives position, heading, suspension bounce and cornering lean
 * every frame via direct style writes on the exposed refs (kept imperative
 * for animation performance).
 */
export interface RaceCarHandle {
  root: HTMLDivElement | null;
  bounce: HTMLDivElement | null;
  rotate: HTMLDivElement | null;
  trail: HTMLDivElement | null;
  special: HTMLDivElement | null;
}

interface RaceCarProps {
  bodyId: string | null;
  isOut: boolean;
  label?: string;
}

const DEFAULT_BODY_IMAGE = PARTS.find(p => p.id === 'b_magnum')!.image!;

function getCarImage(bodyId: string | null): string {
  return PARTS.find(p => p.id === bodyId)?.image ?? DEFAULT_BODY_IMAGE;
}

interface Livery {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

const LIVERY: Record<string, Livery> = {
  b_magnum: { primary: '#f2f5fa', secondary: '#1d4ed8', accent: '#dc2626', glow: '#5aabff' },
  b_sonic: { primary: '#f2f5fa', secondary: '#dc2626', accent: '#0f7a4d', glow: '#ff5a5a' },
  b_tridagger: { primary: '#20222b', secondary: '#dc2626', accent: '#f4a300', glow: '#ffb020' },
  b_spinaxe: { primary: '#1d3fae', secondary: '#f4a300', accent: '#f5f5f5', glow: '#5aabff' },
  b_beakspider: { primary: '#15171f', secondary: '#dc2626', accent: '#22d3ee', glow: '#22d3ee' },
  b_brockeng: { primary: '#c81e1e', secondary: '#15171f', accent: '#f4c430', glow: '#ff5a5a' },
  b_protosaberjb: { primary: '#1d2f8f', secondary: '#dc2626', accent: '#f4c430', glow: '#5aabff' },
  b_raystinger: { primary: '#c3c8d0', secondary: '#15171f', accent: '#dc2626', glow: '#e8ecf2' },
};
const DEFAULT_LIVERY = LIVERY.b_magnum;

export const RaceCar = forwardRef<RaceCarHandle, RaceCarProps>(({ bodyId, isOut, label }, ref) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const bounceRef = useRef<HTMLDivElement>(null);
  const rotateRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const specialRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    get root() { return rootRef.current; },
    get bounce() { return bounceRef.current; },
    get rotate() { return rotateRef.current; },
    get trail() { return trailRef.current; },
    get special() { return specialRef.current; },
  }));

  const c = (bodyId && LIVERY[bodyId]) || DEFAULT_LIVERY;

  return (
    <div ref={rootRef} className="mc-root">
      <div ref={bounceRef} className="mc-bounce">
        <div ref={specialRef} className="mc-special" />
        <div ref={trailRef} className="mc-trail" style={{ background: `radial-gradient(circle, ${c.glow}88, transparent 70%)` }} />
        <div className="mc-shadow" />

        {/* heading indicator: rotates every frame to actually face the direction of travel */}
        <div ref={rotateRef} className={`mc-rotate${isOut ? ' is-out' : ''}`}>
          <svg viewBox="0 0 120 60" className="mc-arrow-svg" style={{ filter: `drop-shadow(0 0 10px ${c.glow}99) drop-shadow(0 4px 6px rgba(0,0,0,0.7))` }}>
            <ellipse cx="34" cy="4" rx="9" ry="5" fill="#111" opacity="0.85" />
            <ellipse cx="34" cy="56" rx="9" ry="5" fill="#111" opacity="0.85" />
            <ellipse cx="86" cy="4" rx="7" ry="4" fill="#111" opacity="0.85" />
            <ellipse cx="86" cy="56" rx="7" ry="4" fill="#111" opacity="0.85" />
            <path d="M116,30 L80,8 L20,8 Q6,8 6,20 L6,40 Q6,52 20,52 L80,52 Z" fill={c.primary} stroke="#0a0a0a" strokeWidth="2.5" />
            <path d="M116,30 L90,15 L90,45 Z" fill={c.secondary} />
            <path d="M74,14 L58,30 L74,46 L44,36 L44,24 Z" fill={c.accent} opacity="0.92" />
            <circle cx="30" cy="30" r="9" fill="#151a24" stroke="#000" strokeWidth="1.5" />
          </svg>
        </div>

        {/* name/photo tag: stays upright regardless of heading */}
        <div className="mc-tag">
          <div className="mc-tag-photo"><img src={getCarImage(bodyId)} alt="" /></div>
          {label && <div className="mc-tag-name">{label}</div>}
        </div>
      </div>
    </div>
  );
});

RaceCar.displayName = 'RaceCar';
