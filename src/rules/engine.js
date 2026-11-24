/*
 * Beach Tennis University — tactics rules engine.
 * Ported from the 2D app (bt-playbook/index.html). Pure JS: no three.js, no React.
 *
 * Coordinates are "own frame" per team: x = metres from the net (0–8), y = metres across (0–8).
 * Team 0 is you and your partner, team 1 the opponents.
 */

export const NET_H = 1.7;
export const WIN_AT = 7;

export const BSHOT = {
  smash: { v: 17, hang: 0, sd: 0.55, hmin: 2.1, netK: 0.9 },
  push: { v: 12.5, hang: 0.05, sd: 0.5, hmin: 1.5, netK: 0.6 },
  neutral: { v: 9, hang: 0.3, sd: 0.45, hmin: 0, netK: 0 },
  lob: { v: 6.5, hang: 0.95, sd: 0.5, hmin: 0, netK: 0 },
  drop: { v: 6, hang: 0.35, sd: 0.4, hmin: 0, netK: 0 },
  block: { v: 8.5, hang: 0.15, sd: 0.45, hmin: 0, netK: 0 },
  serve: { v: 11, hang: 0.25, sd: 0.6, hmin: 0, netK: 0 },
  hook: { v: 13, hang: 0.1, sd: 0.55, hmin: 1.9, netK: 0.7 },
};
/* Contact height by timing [early, on, late] */
export const BHCON = {
  smash: [1.0, 0.7, 0.35], push: [1.5, 1.1, 0.6], block: [2.0, 1.4, 0.8], neutral: [2.1, 1.5, 0.9],
  drop: [0.9, 0.55, 0.25], lob: [3.0, 2.3, 1.2], serve: [1.7, 1.2, 0.8], hook: [1.3, 0.9, 0.5],
};
export const BTIM = { early: { need: 0.4 }, on: { need: 0.12 }, late: { need: -0.15 } };
export const BRISK = {
  safe: { pace: 0.88, margin: 1.4, sdm: 0.85, err: 0.6 },
  normal: { pace: 1, margin: 1.0, sdm: 1, err: 1 },
  bold: { pace: 1.12, margin: 0.45, sdm: 1.15, err: 1.8 },
};
export const BDEPTH = { short: 1.8, mid: 4.2, deep: 6.6 };
export const BLANES = [1.2, 4, 6.8];
export const BHOMEX = { net: 2.4, mid: 3.8, deep: 5.2 };
export const BBAND = { short: [0, 3], mid: [3, 6], deep: [6, 8] };
export const BMAXD = { smash: 2.0, push: 2.5, hook: 2.5, block: 3.5, drop: 3.5, neutral: 4.0, serve: 4.0, lob: 6.5 };
export const BWD = { lob: 1.3, neutral: 0.55, drop: 0.4, serve: 0.45, block: 0.2, push: 0.15, smash: 0.05, hook: 0.1 };
export const WINDK = { calm: 0, breezy: 0.5, gusty: 1 };
export const BCLOCK = { beginner: 15, intermediate: 14, advanced: 11, pro: 9 };
export const BPACE = { quick: 0.7, normal: 1, relaxed: 1.6, off: 1.6 };
export const BSLOW = { beginner: 3.2, intermediate: 2.7, advanced: 2.3, pro: 1.9 };
export const BFLOOR = { beginner: 1.3, intermediate: 1.05, advanced: 0.9, pro: 0.75 };
export const SHOT_NAMES = {
  smash: 'Smash', push: 'Push', hook: 'Hook', block: 'Block', neutral: 'Neutral', lob: 'Lob', drop: 'Drop', serve: 'Serve',
};
export const ATTACK = { smash: 1, push: 1, hook: 1 };

const BCOV = [];
['net', 'mid', 'deep'].forEach((d) => [0, 1, 2].forEach((l) => BCOV.push({ d, l })));
export { BCOV };

export const dst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function toward(p, q, maxD) {
  const d = dst(p, q);
  if (d <= maxD || d < 1e-6) return [q[0], q[1]];
  const k = maxD / d;
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
}
export function gauss() {
  const u = Math.random() || 1e-9, v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Player stats from skill 0–1 */
export function makePlayer(skill) {
  return {
    react: 0.3 - 0.1 * skill, run: 4.0 + 1.2 * skill, back: 0.62 + 0.1 * skill, reach: 1.35 + 0.15 * skill,
    sdm: 1.35 - 0.6 * skill, errBase: 0.028 - 0.016 * skill, read: skill, iq: skill,
  };
}

export function hCon(shot, k, lx) {
  const b = BHCON[shot][k];
  if (shot === 'smash' || shot === 'push') return b;
  if (shot === 'lob') return lx < 5.5 ? b + 0.35 * (5.5 - lx) : b - 0.25 * (lx - 5.5);
  return b + (lx < 4 ? 0.15 * (4 - lx) : -0.18 * (lx - 4));
}
export function covPt(c, i) {
  return [{ net: 1.9, mid: 4.3, deep: 6.4 }[c.d], i === 0 ? [1.1, 2.6, 3.0][c.l] : [5.0, 5.4, 6.9][c.l]];
}

/* Pressure on the hitter: stretched, late, off balance, or facing a hard ball */
export function press(st, inShot) {
  let p = 0.55 * (st.stretch || 0);
  if (st.timing === 'late') p += 0.35;
  p += Math.max(0, 0.75 - st.B) * 0.9;
  if (ATTACK[inShot]) p += 0.35;
  return p;
}
export function err(st, hp, c, inShot) {
  const S = BSHOT[c.shot], below = Math.max(0, S.hmin - st.h);
  return {
    net: Math.min(0.95, S.netK * below) + (c.shot === 'drop' && st.h > 2.2 ? 0.05 : 0),
    frame: hp.errBase * BRISK[c.risk].err * 4 * press(st, inShot),
  };
}
export function scatter(st, hp, c, inShot) {
  const p = press(st, inShot);
  return p <= 0 ? 0 : p * (BSHOT[c.shot].sd / 0.5) * BRISK[c.risk].sdm * hp.sdm;
}
/* Wind drift on the far side, metres. windV is a unit vector in the hitter's own frame */
export function windDrift(shot, wind, windV) {
  const k = (WINDK[wind] || 0) * (BWD[shot] || 0.3);
  return k ? [windV[0] * k, windV[1] * k] : [0, 0];
}
export function aim(c) {
  if (c.x != null && c.y != null) return [c.x, c.y];
  const R = BRISK[c.risk];
  let tx = BDEPTH[c.d], ty = BLANES[c.l];
  if (c.d === 'deep') tx = 8 - R.margin;
  if (c.d === 'short') tx = Math.max(0.8, R.margin + 0.6);
  if (c.l === 0) ty = R.margin;
  if (c.l === 2) ty = 8 - R.margin;
  return [tx, ty];
}

/*
 * Resolve a shot: st = hitter state {pos, h, B, timing, stretch}, hp = hitter stats,
 * c = choice {shot, d, l, risk, x?, y?}, defs = defender positions (their own frame), dps = defender stats,
 * covers = where each defender is covering. Returns {end: 'err'|'winner'|null, ...}.
 */
export function resolve(st, hp, c, defs, dps, covers, ctx = {}) {
  const S = BSHOT[c.shot], R = BRISK[c.risk], E = err(st, hp, c, ctx.inShot);
  if (Math.random() < E.net) return { end: 'err', why: 'net' };
  if (Math.random() < E.frame) return { end: 'err', why: 'frame' };
  const a = aim(c), sd = scatter(st, hp, c, ctx.inShot);
  const land = [a[0] + gauss() * sd, a[1] + gauss() * sd];
  const wd = windDrift(c.shot, ctx.wind, ctx.windV || [0, 0]);
  land[0] += wd[0]; land[1] += wd[1];
  if (land[0] < 0.15 || land[0] > 8 || land[1] < 0 || land[1] > 8) return { end: 'err', why: 'out', land };
  let v = S.v * R.pace;
  if (c.shot === 'smash' || c.shot === 'push')
    v *= Math.max(0.75, Math.min(1.25, 1 + 0.25 * (st.h - 2))) * Math.max(0.6, Math.min(1.1, 1.15 - 0.08 * st.pos[0]));
  const tBall = Math.hypot(st.pos[0] + land[0], st.pos[1] - land[1]) / v + S.hang;
  let best = null;
  defs.forEach((p, i) => {
    const dp = dps[i], cp = covPt(covers[i], i), pre = toward(p, cp, 1.6);
    const readOK = dst(cp, land) < 2.2;
    const dd = dst(pre, land);
    const d = dd > (BMAXD[c.shot] || 4) ? 99 : Math.max(0, dd - dp.reach);
    const bw = land[0] > pre[0] + 0.5;
    const tNeed = d > 0 ? (readOK ? dp.react * 0.5 : dp.react + 0.12) + d / (dp.run * (bw ? dp.back : 1)) : 0.05;
    const m = tBall - tNeed;
    if (!best || m > best.m) best = { i, m, tNeed, readOK, pre };
  });
  const m = best.m;
  const base = { land, m, i: best.i, tBall, tNeed: best.tNeed, readOK: best.readOK, pre: best.pre };
  if (m < -0.25 || (m < 0 && Math.random() < -m / 0.25)) return { ...base, end: 'winner' };
  const B = Math.max(0, Math.min(1, m / 0.6));
  let tim = ['early', 'on', 'late'].filter((k) => m >= BTIM[k].need);
  if (!tim.length) tim = ['late'];
  let BB = B;
  if (c.shot === 'lob' && land[0] - best.pre[0] > (best.readOK ? 3 : 1.5)) { tim = ['late']; BB *= 0.6; }
  return { ...base, end: null, B: BB, tim };
}

export function options(inShot) {
  const o = [];
  ['smash', 'push', 'neutral', 'lob', 'drop', 'block', 'hook'].forEach((s) => {
    if (s === 'block' && !(inShot === 'smash' || inShot === 'push')) return;
    if (s === 'hook' && inShot !== 'lob') return;
    ['short', 'mid', 'deep'].forEach((d) => {
      if (s === 'drop' && d !== 'short') return;
      if (s === 'lob' && d === 'short') return;
      if (s === 'block' && d === 'deep') return;
      if (s === 'hook' && d === 'short') return;
      [0, 1, 2].forEach((l) => ['safe', 'normal', 'bold'].forEach((r) => o.push({ shot: s, d, l, risk: r })));
    });
  });
  return o;
}
export function legalShots(inShot) {
  const L = {};
  options(inShot).forEach((o) => { L[o.shot] = 1; });
  return L;
}

/* Value of an outcome for the hitter */
function val(r, inShot) {
  if (r.end === 'winner') return 1;
  if (r.end === 'err') return -1;
  const hb = Math.max(...r.tim.map((k) => hCon(inShot, ['early', 'on', 'late'].indexOf(k), r.land[0])));
  return 0.55 * (0.6 - r.B) - 0.45 * Math.max(0, Math.min(1.2, hb - 1.9)) + 0.15 * Math.max(0, Math.min(1, 1.6 - hb));
}
function evalChoice(st, hp, c, defs, dps, guess, N, ctx) {
  let v = 0;
  for (let n = 0; n < N; n++) v += val(resolve(st, hp, c, defs, dps, guess[(Math.random() * guess.length) | 0], ctx), c.shot);
  return v / N;
}

/* Habits: each side remembers where the other covers / hits, by ball height band */
export const band = (h) => (h < 1.3 ? 0 : h < 2.1 ? 1 : 2);
export function remember(store, bk, idx) {
  store[bk] = store[bk] || [];
  store[bk][idx] = (store[bk][idx] || 0) * 0.9 + 1;
}
function pickHabit(store, bk, read, n) {
  const M = store && store[bk];
  if (!M || Math.random() > read) return (Math.random() * n) | 0;
  let tot = 0; const w = [];
  for (let i = 0; i < n; i++) { w[i] = Math.pow(M[i] || 0, 2); tot += w[i]; }
  if (!tot) return (Math.random() * n) | 0;
  let x = Math.random() * tot;
  for (let i = 0; i < n; i++) { x -= w[i]; if (x <= 0) return i; }
  return n - 1;
}
export const covIdx = (c) => Math.max(0, BCOV.findIndex((b) => b.d === c.d && b.l === c.l));
export const landIdx = (land) => (land[0] < 3.1 ? 0 : land[0] < 4.5 ? 1 : 2) * 3 + (land[1] < 2.7 ? 0 : land[1] < 5.3 ? 1 : 2);
export function aiCover(team, defP, bk) { return BCOV[pickHabit(team.landMem, bk, defP.read * 0.9, 9)]; }
export function guessCovers(opp, readerP, bk) {
  const g = [];
  for (let k = 0; k < 6; k++) g.push([BCOV[pickHabit(opp.covMem, bk, readerP.read, 9)], BCOV[pickHabit(opp.covMem, bk, readerP.read, 9)]]);
  return g;
}
/* laneBias (optional, in ctx): extra value per lane [0,1,2], e.g. to aim more at one player */
export function aiShot(st, hp, defs, dps, inShot, guess, ctx) {
  const N = hp.iq > 0.7 ? 10 : hp.iq > 0.3 ? 6 : 3;
  let best = null, bv = -9;
  options(inShot).forEach((c) => {
    const v = evalChoice(st, hp, c, defs, dps, guess, N, { ...ctx, inShot }) + gauss() * 0.35 * (1 - hp.iq) + ((ctx && ctx.laneBias && ctx.laneBias[c.l]) || 0);
    if (v > bv) { bv = v; best = c; }
  });
  return best;
}

/*
 * The coach: best shot for this ball, why, and the other shots that also work.
 * st = your state, inShot = their last shot, opp = opponents' positions (their frame), inLand = where their ball landed (x).
 */
export function coach(st, inShot, opp, inLand) {
  const h = st.h, x = st.pos[0], ox = (opp[0][0] + opp[1][0]) / 2;
  const atNet = ox < 3, back = ox > 5, open = Math.abs(opp[0][1] - opp[1][1]) > 5, inShort = inLand != null && inLand < 3;
  if (inShot === 'smash') return ['block', 'They smashed it: block', ['block']];
  if (inShot === 'lob' && h >= 1.9) return ['hook', 'Lobbed over you: hook it', ['hook', 'push']];
  if (h >= 2.1 && x <= 3) return ['smash', 'High ball inside 3 m: smash', ['smash', 'push']];
  if (h >= 2.1) return ['push', 'High but deep: push it', ['push', 'hook', 'neutral']];
  if (h >= NET_H) return ['push', 'Just above the net: push', ['push', 'neutral']];
  if (inShort) return ['drop', 'They hit it short: drop it back', ['drop', 'lob']];
  if (h < 1.2 && x <= 3)
    return atNet ? ['lob', "Low, and they're at the net: lob", ['lob']]
      : back || open ? ['drop', back ? "Low, and they're back: drop" : 'Low, with an opening: drop', ['drop', 'lob']]
        : ['lob', 'Low ball: lob', ['lob', 'drop', 'neutral']];
  if (h < 1.2) return atNet ? ['lob', "Low, and they're at the net: lob", ['lob', 'neutral']] : ['neutral', 'Low and deep: neutral', ['neutral', 'lob']];
  return ['neutral', 'Just below the net: neutral', ['neutral', 'lob', 'drop']];
}

/*
 * Your race to their ball. tapFrac = how much of the receive window you used before tapping (0–1).
 * Returns s (>0 in time; < -0.22 too late) and contact height / timing / balance.
 */
export function receiveRace({ shot, land, tBall, from, player, tapFrac }) {
  const d = Math.max(0, dst(from, land) - player.reach);
  const bw = land[0] > from[0] + 0.5;
  const trav = d / (player.run * (bw ? player.back : 1));
  const hang = shot === 'lob' ? (land[0] > 5 ? 1.5 : 1.25) : shot === 'neutral' || shot === 'drop' ? 1.1 : 1;
  const a = 0.4 * tapFrac + trav / (tBall * hang);
  let s = 1 - a, capd = false;
  if ({ smash: 1, push: 1, hook: 1, block: 1 }[shot] && tBall < 1.2 && dst(from, land) > BMAXD[shot] + (tapFrac < 0.3 ? 0.5 : 0)) { s = -1; capd = true; }
  const late = s < -0.22;
  const K = [hCon(shot, 0, land[0]), hCon(shot, 1, land[0]), hCon(shot, 2, land[0])];
  let hh;
  if (s >= 0.4) hh = K[0];
  else if (s >= 0.15) hh = K[1] + ((K[0] - K[1]) * (s - 0.15)) / 0.25;
  else if (s >= 0) hh = K[2] + ((K[1] - K[2]) * s) / 0.15;
  else hh = Math.max(0.25, K[2] * 0.6);
  hh = Math.max(0.2, hh * 1.15 * (1 + 0.05 * gauss()));
  const timing = s >= 0.4 ? 'early' : s >= 0.12 ? 'on' : 'late';
  const B = Math.max(0.15, Math.min(1, 0.35 + s * 1.3));
  const contact = [Math.max(0.7, Math.min(8, land[0] - (timing === 'early' ? 1.0 : timing === 'on' ? 0.4 : -0.2))), land[1]];
  const stretch = Math.max(0, Math.min(1, (dst(from, land) - 1) / ((BMAXD[shot] || 4) - 1)));
  return { s, late, capd, trav, need: a * tBall, h: hh, timing, B, contact, stretch };
}

/* Receive window in ms */
export function receiveWindow(shot, land, tBall, level, pace) {
  const cap = shot === 'lob' ? (land[0] > 5 ? 4800 : 4000) : 3200;
  return Math.round(Math.min(cap, Math.max((BFLOOR[level] || 1.05) * 1000, tBall * (BSLOW[level] || 2.7) * 1000)) * (BPACE[pace] || 1));
}
