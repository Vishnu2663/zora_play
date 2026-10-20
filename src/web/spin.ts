// The flat buddy's turn on the spot. Every part that sits on the round head or body rides a circle round it (a point on a
// sphere turning about the vertical axis only moves sideways, on a circle whose radius depends on how high up it sits).
// That keeps the ears, cheeks, tail and wings attached to the body at every angle, and makes the turn read as a body
// turning, not as a card flipping. All numbers are in the buddy's 600 x 640 drawing.

export interface Orbit { cx: number; r: number; a0: number; /** x the part is scaled about (its own root) */ root: number }

/** Parts on the head (about 36-45 degrees up from the face) and on the cheeks (a little below it). */
export const EAR_L: Orbit = { cx: 300, r: 118, a0: -0.8, root: 190 };
export const EAR_R: Orbit = { cx: 300, r: 118, a0: 0.8, root: 410 };
export const HORN_L: Orbit = { cx: 300, r: 125, a0: -0.72, root: 208 };
export const HORN_R: Orbit = { cx: 300, r: 125, a0: 0.72, root: 392 };
export const CHEEK_L: Orbit = { cx: 300, r: 155, a0: -0.83, root: 185 };
export const CHEEK_R: Orbit = { cx: 300, r: 155, a0: 0.83, root: 415 };
/** Parts on the back of the body: the tail low down, the wings higher up. Azimuth 180 degrees is straight behind. */
export const TAIL: Orbit = { cx: 300, r: 141, a0: 2.5, root: 388 };
export const WING_L: Orbit = { cx: 300, r: 118, a0: -2.65, root: 245 };
export const WING_R: Orbit = { cx: 300, r: 118, a0: 2.65, root: 355 };

/** Where the part's root is on the screen at this turn angle. */
export function orbitX(o: Orbit, spin: number): number { return o.cx + o.r * Math.sin(o.a0 + spin); }
/** Sideways shift of the part from its resting place. */
export function orbitDx(o: Orbit, spin: number): number { return o.r * (Math.sin(o.a0 + spin) - Math.sin(o.a0)); }
/** How wide the part looks compared with rest: foreshortened as it nears the edge, mirrored once it is on the other side. */
export function orbitScale(o: Orbit, spin: number, lateral = false, max = 1.3): number {
  const k = lateral ? Math.sin(o.a0 + spin) / Math.sin(o.a0) : Math.cos(o.a0 + spin) / Math.cos(o.a0);
  const m = Math.max(-max, Math.min(max, k));
  return Math.abs(m) < 0.05 ? 0.05 * (m < 0 ? -1 : 1) : m;
}
/** True while the part faces the viewer (used for things that vanish behind the head, like the cheeks). */
export function orbitFront(o: Orbit, spin: number): boolean { return Math.cos(o.a0 + spin) > 0.05; }

/** SVG transform text that moves a part round its orbit and squeezes / mirrors it about its root. */
export function orbitTransform(o: Orbit, spin: number, lateral = false, max = 1.3): string {
  return `translate(${orbitDx(o, spin).toFixed(1)} 0) translate(${o.root} 0) scale(${orbitScale(o, spin, lateral, max).toFixed(3)} 1) translate(${-o.root} 0)`;
}
