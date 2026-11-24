/*
 * Own-frame [x, y] (x = metres from the net, y = metres across) to world [X, Z].
 * Three.js is Y-up. Your team (0) is on +Z, nearest the camera; the opponents (1) on -Z.
 */
export const toWorld = (team, p) => [p[1] - 4, team === 0 ? p[0] : -p[0]];
export const fromWorld = (team, X, Z) => [team === 0 ? Z : -Z, X + 4];

/* A ball flight: parabola from `from` to `to` ([X, Y, Z]) peaking `apex` metres above the higher end */
export function ballAt(f, t) {
  const u = Math.max(0, Math.min(1, (t - f.t0) / f.dur));
  const X = f.from[0] + (f.to[0] - f.from[0]) * u;
  const Z = f.from[2] + (f.to[2] - f.from[2]) * u;
  const y0 = f.from[1], y1 = f.to[1];
  const top = Math.max(y0, y1) + (f.apex || 0);
  /* quadratic through y0 at 0, y1 at 1 and peak height `top` */
  const a = f.apex > 0 ? apexCurve(y0, y1, top, u) : y0 + (y1 - y0) * u;
  return [X, a, Z, u];
}
function apexCurve(y0, y1, top, u) {
  /* Bezier with control point chosen so the curve reaches `top` */
  const c = 2 * top - (y0 + y1) / 2;
  return (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * c + u * u * y1;
}
