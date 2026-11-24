/* Shared game clock. The world runs on sim time so decisions can slow everything down (slow motion). */
export const TIME = { sim: 0, scale: 1, target: 1, boost: 1 };
export function setSlowMo(on) { TIME.target = on ? 0.08 : 1; }
export function stepTime(dt) {
  TIME.scale += (TIME.target - TIME.scale) * Math.min(1, dt * (TIME.target < TIME.scale ? 9 : 12));
  const d = Math.min(dt * TIME.boost, 0.1 * TIME.boost) * TIME.scale;
  TIME.sim += d;
  return d;
}
