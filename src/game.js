/*
 * The point loop: serve → their return → your tap on the landing spot → your shot (slow motion) → ...
 * The rules engine decides every outcome; the 3D world only shows it.
 */
import { create } from 'zustand';
import * as R from './rules/engine.js';
import { toWorld, ballAt } from './world/coords.js';
import { TIME, setSlowMo } from './time.js';

const load = (k, d) => { try { const v = localStorage.getItem('btu3d-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('btu3d-' + k, JSON.stringify(v)); } catch { /* private mode */ } };

export const KEYS = ['me', 'mate', 'opp0', 'opp1'];
const keyOf = (team, i) => (team === 0 ? (i === 0 ? 'me' : 'mate') : i === 0 ? 'opp0' : 'opp1');

export const useGame = create(() => ({
  screen: 'lobby', // lobby | play | over
  settings: {
    level: load('level', 'intermediate'),
    pick: load('pick', 'choose'),
    pace: load('pace', 'normal'),
    wind: load('wind', 'breezy'),
    fx: load('fx', 'high'),
  },
  score: { me: 0, them: 0 },
  phase: '', // SERVE | RETURN | PARTNER | SHOT | ''
  prompt: '',
  rail: null, // {legal, sel, mode, x, ok}
  targets: null, // {serve:boolean}
  ring: null, // {pos:[X,Z], W, t0, auto}
  clock: null, // {t0, secs}
  result: null, // {won, head, why, odds}
  windAngle: 0,
  actors: {},
  ball: { mode: 'hidden', n: 0 },
  odds: null,
  pops: [],
}));

const set = (p) => useGame.setState(p);
const get = () => useGame.getState();

/* ---------- Sim-time scheduler (slow motion slows the game too) ---------- */
let timers = [];
let epoch = 0;
export function after(sec, fn) { const e = epoch; timers.push({ at: TIME.sim + sec, fn: () => { if (e === epoch) fn(); } }); }
export function tickGame() {
  if (!timers.length) return;
  const due = timers.filter((t) => t.at <= TIME.sim);
  if (!due.length) return;
  timers = timers.filter((t) => t.at > TIME.sim);
  due.forEach((t) => t.fn());
}
/* Real-time timeouts (shot clock, receive window) */
let realTO = [];
const realAfter = (ms, fn) => { const e = epoch; const id = setTimeout(() => { if (e === epoch) fn(); }, ms); realTO.push(id); return id; };
const clearReal = () => { realTO.forEach(clearTimeout); realTO = []; };

/* ---------- Settings ---------- */
export function setSetting(k, v) {
  const s = { ...get().settings, [k]: v };
  save(k, v);
  set({ settings: s });
}

/* ---------- Actors (players) ---------- */
const LOOKS = {
  me: { skin: '#C68642', shirt: '#FF4D6D', shorts: '#0D1B2A', cap: '#FFD23F', hair: '#3b2414' },
  mate: { skin: '#F1C27D', shirt: '#00C2B8', shorts: '#0077B6', cap: '#FFFFFF', hair: '#a36a2c' },
  opp0: { skin: '#8D5524', shirt: '#FF9F1C', shorts: '#2b2b2b', cap: '#0D1B2A', hair: '#1a1a1a' },
  opp1: { skin: '#E0AC69', shirt: '#2ECC71', shorts: '#1d3557', cap: '#FF4D6D', hair: '#5a3a1a' },
};
function actor(key, team, p, extra = {}) {
  const a = get().actors[key] || {};
  const w = toWorld(team, p);
  return { ...a, key, team, look: LOOKS[key], target: w, ...extra };
}
function moveActor(team, i, p, extra = {}) {
  const k = keyOf(team, i);
  const actors = { ...get().actors, [k]: actor(k, team, p, { ...extra, speed: BT ? BT.teams[team].p[i].run * 0.9 : 4.5 }) };
  set({ actors });
}
function actorEvent(team, i, ev) {
  const k = keyOf(team, i);
  const a = get().actors[k];
  set({ actors: { ...get().actors, [k]: { ...a, ...ev } } });
}
function teamEvent(team, ev) { actorEvent(team, 0, ev); actorEvent(team, 1, ev); }
function placeAll(snap) {
  const actors = {};
  for (let t = 0; t < 2; t++) for (let i = 0; i < 2; i++) {
    const k = keyOf(t, i);
    actors[k] = actor(k, t, BT.pos[t][i], { snap: snap ? (get().actors[k]?.snap || 0) + 1 : get().actors[k]?.snap || 0, speed: BT.teams[t].p[i].run * 0.9, swing: null, dive: null, mood: null });
  }
  set({ actors });
}
const swingKind = (shot, h, y, team) => (shot === 'smash' || shot === 'hook' || shot === 'serve' || (shot === 'push' && h > 1.9) ? 'over' : (team === 0 ? y < 4 : y > 4) ? 'bh' : 'fh');

/* ---------- Ball ---------- */
const APEX = { lob: 6.2, neutral: 2.2, drop: 1.9, push: 0.5, smash: 0, hook: 0.7, serve: 1.3, block: 1.2 };
let flight = null;
function fly(from, to, apex, dur, then) {
  flight = { from, to, apex, t0: TIME.sim, dur: Math.max(0.25, dur) };
  set({ ball: { mode: 'flight', flight, n: get().ball.n + 1 } });
  if (then) after(flight.dur, then);
}
function ballNow() { return flight ? ballAt(flight, TIME.sim) : [0, 1, 0]; }
function freeBall(vel) {
  const p = ballNow();
  set({ ball: { mode: 'free', pos: [p[0], Math.max(0.12, p[1]), p[2]], vel, n: get().ball.n + 1 } });
}
function holdBall(pos) { flight = null; set({ ball: { mode: 'held', pos, n: get().ball.n + 1 } }); }
const w3 = (team, p, h) => { const w = toWorld(team, p); return [w[0], h, w[1]]; };

/* ---------- Pops (floating labels) ---------- */
let popN = 0;
function pop(team, p, text, color) {
  const w = toWorld(team, p), id = ++popN;
  set({ pops: [...get().pops, { id, pos: [w[0], 1.2, w[1]], text, color }] });
  setTimeout(() => set({ pops: get().pops.filter((x) => x.id !== id) }), 1500);
}

/* ---------- Match ---------- */
let BT = null;
let MATCH = null;

export function startMatch() {
  MATCH = { points: 0, me: 0, them: 0, landMem: [{}, {}], covMem: [{}, {}] };
  set({ screen: 'play', score: { me: 0, them: 0 }, result: null, windAngle: Math.random() * Math.PI * 2 });
  newPoint();
}
export function quitMatch() { epoch++; timers = []; clearReal(); setSlowMo(false); set({ screen: 'lobby', phase: '', rail: null, targets: null, ring: null, clock: null, result: null, ball: { mode: 'hidden', n: get().ball.n + 1 } }); }

const oppSkill = { beginner: 0.35, intermediate: 0.55, advanced: 0.72, pro: 0.88 };
function windV(team) {
  const a = get().windAngle;
  /* world wind (X, Z) → hitter's own frame: x away from the net into the far court, y across */
  const wx = Math.cos(a), wz = Math.sin(a);
  return team === 0 ? [-wz, wx] : [wz, wx];
}
const ctx = (team, inShot) => ({ wind: get().settings.wind, windV: windV(team), inShot });

function newPoint() {
  epoch++; timers = []; clearReal(); setSlowMo(false);
  const sk = oppSkill[get().settings.level] || 0.55;
  BT = {
    teams: [
      { p: [R.makePlayer(0.6), R.makePlayer(0.72)], landMem: MATCH.landMem[0], covMem: MATCH.covMem[0] },
      { p: [R.makePlayer(sk), R.makePlayer(sk)], landMem: MATCH.landMem[1], covMem: MATCH.covMem[1] },
    ],
    pos: null, st: null, inShot: null, inLand: null, hit: null, touch: 0,
  };
  const srv = Math.floor(MATCH.points / 2) % 2; // you serve the first two points
  BT.srv = srv;
  BT.pos = srv === 0
    ? [[[7.9, 2.2], [2.4, 6.0]], [[5.4, 2.4], [5.4, 5.6]]]
    : [[[5.4, 2.4], [5.4, 5.6]], [[7.9, 5.8], [2.4, 2.0]]];
  placeAll(true);
  set({ result: null, ring: null, rail: null, targets: null, clock: null, odds: null, phase: '', prompt: '' });
  if (srv === 0) {
    holdBall(w3(0, BT.pos[0][0], 1.0));
    after(0.6, askServe);
  } else {
    holdBall(w3(1, BT.pos[1][0], 1.0));
    set({ prompt: 'They serve' });
    after(1.4, () => {
      const c = { shot: 'serve', d: 'deep', l: (Math.random() * 3) | 0, risk: Math.random() < 0.25 ? 'bold' : Math.random() < 0.5 ? 'safe' : 'normal' };
      BT.st = { pos: BT.pos[1][0], h: 2.6, B: 1, timing: 'on' };
      BT.hit = [1, 0];
      BT.inShot = null;
      hitThen(1, 0, 'serve', () => receive(c));
    });
  }
}

/* Start the swing, then the ball leaves the racket at contact */
function hitThen(team, i, shot, fn) {
  const p = BT.st.pos;
  actorEvent(team, i, { swing: { kind: swingKind(shot, BT.st.h, p[1], team), at: TIME.sim } });
  after(0.32, fn);
}

function startClock(onTimeout) {
  const s = get().settings;
  if (s.pace === 'off') { set({ clock: null }); return; }
  const secs = Math.round((R.BCLOCK[s.level] || 14) * (R.BPACE[s.pace] || 1));
  set({ clock: { t0: performance.now(), secs } });
  realAfter(secs * 1000, onTimeout);
}

/* ---------- Your serve ---------- */
function askServe() {
  set({ phase: 'SERVE', prompt: 'Your serve · tap where to aim', rail: { legal: { serve: 1 }, sel: 'serve', mode: 'serve' }, targets: { serve: true } });
  startClock(() => commitServe({ shot: 'serve', d: 'deep', l: 1, risk: 'safe' }));
}
export function commitServe(c) {
  if (get().phase !== 'SERVE') return;
  clearReal();
  set({ phase: '', targets: null, clock: null, rail: { ...get().rail, mode: 'idle' } });
  BT.st = { pos: BT.pos[0][0], h: 2.6, B: 1, timing: 'on' };
  BT.hit = [0, 0];
  BT.inShot = null;
  BT.wrong = null;
  hitThen(0, 0, 'serve', () => reveal({ ...c, shot: 'serve', risk: c.risk || 'normal' }));
}

/* ---------- Your (or your partner's) shot crosses to them ---------- */
function reveal(choice) {
  const T = BT.teams, hI = BT.hit[1], hp = T[0].p[hI], bk = R.band(BT.st.h);
  const covers = [R.aiCover(T[0], T[1].p[0], bk), R.aiCover(T[0], T[1].p[1], bk)];
  R.remember(T[1].covMem, bk, R.covIdx(covers[0]));
  R.remember(T[1].covMem, bk, R.covIdx(covers[1]));
  const cx = ctx(0, BT.inShot);
  let odds = null;
  if (hI === 0 && choice.shot !== 'serve') {
    const o = { err: 0, win: 0, n: 300 };
    for (let k = 0; k < o.n; k++) { const q = R.resolve(BT.st, hp, choice, BT.pos[1], T[1].p, covers, cx); if (q.end === 'err') o.err++; else if (q.end === 'winner') o.win++; }
    odds = { err: Math.round((o.err / o.n) * 100), win: Math.round((o.win / o.n) * 100) };
  }
  let r = R.resolve(BT.st, hp, choice, BT.pos[1], T[1].p, covers, cx);
  /* Wrong shot for the situation: into the net, out, or it sits up for their winner */
  if (hI === 0 && BT.wrong) {
    odds = null;
    const W0 = BT.wrong, a0 = R.aim(choice), roll = Math.random();
    if ((R.ATTACK[choice.shot] && BT.st.h < R.NET_H) || roll < 0.34) r = { end: 'err', why: 'net', wrong: W0 };
    else if (roll < 0.67) r = { end: 'err', why: 'out', wrong: W0, land: Math.random() < 0.5 ? [8.6, a0[1]] : [Math.min(8.4, a0[0] + 1.2), a0[1] < 4 ? -0.5 : 8.5] };
    else {
      BT.punish = W0;
      const land = a0, d = R.dst(BT.pos[1][0], land) < R.dst(BT.pos[1][1], land) ? 0 : 1;
      r = { end: null, land, i: d, tBall: 1.1, tNeed: 0.6, B: 1, tim: ['early'], wrong: W0 };
    }
    BT.wrong = null;
  }
  set({ odds });
  BT.touch++;
  if (r.land) R.remember(T[0].landMem, bk, R.landIdx(r.land));
  teamEvent(1, { hop: TIME.sim });
  /* defenders step toward their cover */
  for (let i = 0; i < 2; i++) { BT.pos[1][i] = R.toward(BT.pos[1][i], R.covPt(covers[i], i), r.end === 'winner' ? 1.2 : 1.6); moveActor(1, i, BT.pos[1][i]); }
  /* your side recovers: close the net after a lob or attack, otherwise hold the middle */
  const home = choice.shot === 'lob' || R.ATTACK[choice.shot] ? R.BHOMEX.net : choice.shot === 'serve' ? R.BHOMEX.mid + 0.6 : R.BHOMEX.mid;
  BT.pos[0][0] = [home, 2.5]; BT.pos[0][1] = [home, 5.5];
  after(0.35, () => { moveActor(0, 0, BT.pos[0][0]); moveActor(0, 1, BT.pos[0][1]); });

  const from = w3(0, BT.st.pos, Math.max(0.5, BT.st.h));
  const dur = Math.max(0.55, (r.tBall || 0.9) * 1.25);
  if (r.end === 'err' && r.why !== 'out') {
    /* into the net: stops at the net and drops */
    const nx = toWorld(0, [0.05, BT.st.pos[1]]);
    fly(from, [nx[0], 0.9, nx[1]], 0.15, 0.55, () => { freeBall([0, -1, 0.8]); after(0.9, () => pointEnd(false, r, choice, 0)); });
    return;
  }
  const to = w3(1, r.land, 0.07);
  if (r.end) {
    fly(from, to, APEX[choice.shot] ?? 1.5, dur, () => {
      freeBall([((to[0] - from[0]) / dur) * 0.5, 2.2, ((to[2] - from[2]) / dur) * 0.5]);
      after(0.8, () => pointEnd(r.end === 'winner', r, choice, 0));
    });
    if (r.end === 'winner' && r.i != null) { moveActor(1, r.i, R.toward(BT.pos[1][r.i], r.land, 2)); after(dur * 0.6, () => actorEvent(1, r.i, { dive: TIME.sim })); }
    return;
  }
  /* They meet it */
  const rp = T[1].p[r.i];
  let timing = r.tim.indexOf('early') >= 0 && R.hCon(choice.shot, 0, r.land[0]) >= 1.8 ? 'early' : r.tim.indexOf('on') >= 0 ? 'on' : 'late';
  if (rp.iq < 0.3 && Math.random() < 0.4) timing = r.tim[r.tim.length - 1];
  const h = Math.max(0.3, R.hCon(choice.shot, ['early', 'on', 'late'].indexOf(timing), r.land[0]) * (1 + 0.06 * R.gauss()));
  const contact = [Math.max(0.7, Math.min(8, r.land[0] - (timing === 'early' ? 1.0 : timing === 'on' ? 0.4 : -0.2))), r.land[1]];
  BT.pos[1][r.i] = contact;
  after(dur * 0.25, () => moveActor(1, r.i, contact));
  const meet = Math.max(0.45, dur * (timing === 'early' ? 0.85 : timing === 'on' ? 0.95 : 1));
  /* the ball goes to their contact point instead of the sand */
  fly(from, w3(1, contact, h), APEX[choice.shot] ?? 1.5, meet);
  BT.st = { pos: contact, B: r.B, h, timing };
  BT.hit = [1, r.i];
  BT.inShot = choice.shot;
  BT.inLand = r.land[0];
  after(meet, () => {
    if (BT.punish) {
      /* They put away your wrong shot into the open court */
      const P = BT.punish; BT.punish = null;
      const cand = [[7.2, 0.6], [7.2, 7.4], [1.2, 0.8], [1.2, 7.2], [4, 4], [6, 4]];
      let best = cand[0], bd = -1;
      cand.forEach((c) => { const d = Math.min(R.dst(c, BT.pos[0][0]), R.dst(c, BT.pos[0][1])); if (d > bd) { bd = d; best = c; } });
      const putAway = { shot: BT.st.h >= 1.9 ? 'smash' : 'push' };
      hitThen(1, r.i, putAway.shot, () => {
        const f = w3(1, BT.st.pos, h), t = w3(0, best, 0.07);
        teamEvent(0, { hop: TIME.sim });
        fly(f, t, APEX[putAway.shot], 0.6, () => {
          const near = R.dst(BT.pos[0][0], best) < R.dst(BT.pos[0][1], best) ? 0 : 1;
          actorEvent(0, near, { dive: TIME.sim });
          freeBall([(t[0] - f[0]) * 0.6, 2, (t[2] - f[2]) * 0.6]);
          after(0.8, () => pointEnd(false, { end: 'winner', why: 'wrongshot', wrong: P }, putAway, 1));
        });
      });
      return;
    }
    const g = R.guessCovers(T[0], rp, R.band(h));
    const c2 = R.aiShot(BT.st, rp, BT.pos[0], T[0].p, BT.inShot, g, ctx(1, BT.inShot));
    hitThen(1, r.i, c2.shot, () => receive(c2));
  });
}

/* ---------- Their shot to you: tap where it will land ---------- */
function receive(choice) {
  const T = BT.teams, hI = BT.hit[1], hp = T[1].p[hI];
  const cv = [{ d: 'mid', l: 1 }, { d: 'mid', l: 1 }];
  const r = R.resolve(BT.st, hp, choice, BT.pos[0], T[0].p, cv, ctx(1, BT.inShot));
  BT.touch++;
  const bk = R.band(BT.st.h);
  if (r.land) R.remember(T[1].landMem, bk, R.landIdx(r.land));
  teamEvent(0, { hop: TIME.sim });
  const from = w3(1, BT.st.pos, Math.max(0.5, BT.st.h));
  if (r.end === 'err') {
    set({ prompt: 'Them: ' + R.SHOT_NAMES[choice.shot] });
    if (r.why === 'out') {
      const to = w3(0, r.land, 0.07);
      fly(from, to, APEX[choice.shot] ?? 1.5, 1.1, () => { freeBall([(to[0] - from[0]) * 0.4, 2, (to[2] - from[2]) * 0.4]); after(0.8, () => pointEnd(true, r, choice, 1)); });
    } else {
      const nx = toWorld(1, [0.05, BT.st.pos[1]]);
      fly(from, [nx[0], 0.9, nx[1]], 0.15, 0.55, () => { freeBall([0, -1, -0.8]); after(0.9, () => pointEnd(true, r, choice, 1)); });
    }
    return;
  }
  const land = r.land, tB = r.tBall, s = get().settings;
  const me = 0, onMate = land[1] >= 4, ri = onMate ? 1 : me, auto = ri !== me;
  let W = R.receiveWindow(choice.shot, land, tB, s.level, s.pace);
  if ((load('taught', 0) || 0) < 3) W = Math.round(W * 1.5);
  const lw = toWorld(0, land);
  /* their team recovers */
  const home = R.BHOMEX[choice.shot === 'lob' || R.ATTACK[choice.shot] ? 'net' : 'mid'];
  for (let i = 0; i < 2; i++) { BT.pos[1][i] = R.toward(BT.pos[1][i], [home, i === 0 ? 2.5 : 5.5], 3); moveActor(1, i, BT.pos[1][i]); }
  fly(from, w3(0, land, 0.07), APEX[choice.shot] ?? 1.5, W / 1000);
  const t0 = performance.now();
  let done = false;
  set({ ring: { pos: lw, W, t0, auto, n: Math.random() }, phase: auto ? 'PARTNER' : 'RETURN', prompt: auto ? "Partner's ball" : 'Tap where it lands!' });
  const go = () => {
    if (done) return; done = true; clearReal();
    const tt = Math.min(1, (performance.now() - t0) / W);
    const rr = R.receiveRace({ shot: choice.shot, land, tBall: tB, from: BT.pos[0][ri], player: T[0].p[ri], tapFrac: tt });
    set({ ring: null, phase: '' });
    if (!auto && !rr.late) save('taught', (load('taught', 0) || 0) + 1);
    if (rr.late) {
      const reach = R.toward(BT.pos[0][ri], land, Math.max(0, R.dst(BT.pos[0][ri], land) - 0.5));
      moveActor(0, ri, reach);
      after(Math.max(0.2, (W / 1000) * (1 - tt) - 0.25), () => actorEvent(0, ri, { dive: TIME.sim }));
      after(Math.max(0.5, (W / 1000) * (1 - tt) + 0.3), () => {
        pop(0, land, 'Too late', '#D6264B');
        freeBall([0, 2.2, 1.4]);
        after(0.8, () => pointEnd(false, { end: 'winner', why: 'late', capd: rr.capd, tBall: tB, tNeed: rr.need, mate: auto }, choice, 1));
      });
      return;
    }
    BT.pos[0][ri] = rr.contact;
    moveActor(0, ri, rr.contact);
    BT.pos[0][1 - ri] = R.toward(BT.pos[0][1 - ri], [3.8, ri === 0 ? 5.5 : 2.5], 2);
    moveActor(0, 1 - ri, BT.pos[0][1 - ri]);
    BT.st = { pos: rr.contact, B: rr.B, h: rr.h, timing: rr.timing, stretch: rr.stretch };
    BT.hit = [0, ri];
    BT.inShot = choice.shot;
    BT.inLand = land[0];
    const mv = Math.max(0.45, Math.min(1.2, rr.trav * (R.BSLOW[s.level] || 2.7)));
    const cur = ballNow();
    fly([cur[0], cur[1], cur[2]], w3(0, rr.contact, rr.h), 0.3, mv, () => {
      const lab = (rr.timing === 'early' ? 'Early! ' : rr.timing === 'late' ? 'Late · ' : '') + rr.h.toFixed(1) + ' m';
      pop(0, rr.contact, lab, rr.h >= R.NET_H ? '#00A79E' : rr.h >= 1 ? '#FF9F1C' : '#D6264B');
      holdBall(w3(0, rr.contact, rr.h));
      if (!auto) { askShot(); return; }
      const g = R.guessCovers(T[1], T[0].p[ri], R.band(BT.st.h));
      const c2 = R.aiShot(BT.st, T[0].p[ri], BT.pos[1], T[1].p, BT.inShot, g, ctx(0, BT.inShot));
      BT.wrong = null;
      after(0.25, () => hitThen(0, ri, c2.shot, () => reveal(c2)));
    });
  };
  BT.tapGo = go;
  if (auto) realAfter(W * (0.05 + 0.12 * Math.random()), go);
  realAfter(W + 150, () => {
    if (done) return; done = true;
    set({ ring: null, phase: '' });
    actorEvent(0, ri, { dive: TIME.sim });
    pop(0, land, 'Missed it', '#D6264B');
    after(0.6, () => pointEnd(false, { end: 'winner', why: 'late', tBall: tB, tNeed: tB * 1.3, mate: auto }, choice, 1));
  });
}
export function tapLanding() { if (BT && BT.tapGo) BT.tapGo(); }

/* ---------- Your shot: pick it, then tap where to aim (slow motion) ---------- */
function askShot() {
  const st = BT.st, legal = R.legalShots(BT.inShot);
  let [best, why, ok] = R.coach(st, BT.inShot, BT.pos[1], BT.inLand);
  if (!legal[best]) { best = 'neutral'; why = 'Neutral'; ok = ['neutral']; }
  BT.coach = { best, why, ok };
  const choose = get().settings.pick === 'choose';
  setSlowMo(true);
  set({
    phase: 'SHOT',
    prompt: 'Your shot · ball at ' + st.h.toFixed(1) + ' m, ' + (st.h >= R.NET_H ? 'above' : 'below') + ' the net',
    rail: { legal, sel: choose ? null : best, mode: 'shot', hint: choose ? null : why },
    targets: choose ? null : { serve: false },
  });
  startClock(() => {
    const sel = get().rail?.sel || best;
    commitShot({ shot: sel, d: sel === 'drop' ? 'short' : sel === 'lob' ? 'deep' : 'mid', l: (Math.random() * 3) | 0, risk: 'safe' });
  });
}
export function pickShot(shot) {
  const g = get();
  if (g.phase !== 'SHOT' || !g.rail.legal[shot]) return;
  set({ rail: { ...g.rail, sel: shot, hint: shot === BT.coach.best && g.settings.pick === 'auto' ? BT.coach.why : null }, targets: { serve: false } });
}
/* x, y in the opponents' own frame */
export function aimAt(x, y) {
  const g = get();
  if (g.phase === 'SERVE') { commitServe({ shot: 'serve', x: Math.max(4.5, x), y, d: 'deep', l: 1, risk: 'normal' }); return; }
  if (g.phase !== 'SHOT' || !g.rail.sel) return;
  const shot = g.rail.sel;
  const d = x < 3 ? 'short' : x < 6 ? 'mid' : 'deep';
  commitShot({ shot, d, l: y < 2.7 ? 0 : y < 5.3 ? 1 : 2, risk: 'normal', x: shot === 'drop' ? Math.min(x, 3) : shot === 'lob' ? Math.max(x, 3.5) : x, y });
}
function commitShot(c) {
  if (get().phase !== 'SHOT') return;
  clearReal();
  setSlowMo(false);
  const ok = BT.coach.ok;
  BT.wrong = ok.indexOf(c.shot) < 0 ? { shot: c.shot, best: BT.coach.best, why: BT.coach.why } : null;
  set({
    phase: '', targets: null, clock: null, prompt: R.SHOT_NAMES[c.shot],
    rail: { ...get().rail, sel: c.shot, mode: 'idle', x: BT.wrong ? c.shot : null, ok: BT.wrong ? BT.coach.best : null },
  });
  hitThen(0, 0, c.shot, () => reveal(c));
}

/* ---------- Point end ---------- */
function pointEnd(won, r, choice, hT) {
  clearReal(); setSlowMo(false);
  if (won) MATCH.me++; else MATCH.them++;
  MATCH.points++;
  set({ score: { me: MATCH.me, them: MATCH.them }, ring: null, targets: null, clock: null, phase: '', prompt: '' });
  teamEvent(won ? 0 : 1, { mood: 'happy', moodAt: TIME.sim });
  const you = hT === 0, mine = you && BT.hit && BT.hit[1] === 0;
  const head = r.why === 'wrongshot' ? 'Their winner.' : r.why === 'late' ? (r.mate ? 'Your partner was too late.' : 'Too late.') : r.end === 'winner' ? (won ? 'Winner!' : 'Their winner.')
    : r.why === 'net' ? (you ? (mine ? 'Into the net.' : 'Your partner netted it.') : 'They netted it.')
      : r.why === 'out' ? (you ? (mine ? 'Out.' : 'Your partner hit it out.') : 'They hit it out.')
        : you ? (mine ? 'Mishit.' : 'Your partner mishit.') : 'They mishit.';
  const h = BT.st ? BT.st.h : 1.5;
  const why = r.wrong ? '✗ ' + R.SHOT_NAMES[r.wrong.shot] + " doesn't work here. ✓ " + R.SHOT_NAMES[r.wrong.best] + ': ' + r.wrong.why.split(': ')[0] + '.'
    : r.why === 'late' && r.mate ? 'Their ' + R.SHOT_NAMES[choice.shot].toLowerCase() + ' beat your partner. Fast balls to their side are hard to cover from deep.'
    : r.why === 'late' ? (r.capd ? 'A fast ' + R.SHOT_NAMES[choice.shot].toLowerCase() + " that far away can't be reached. Stand closer to where they attack." : "You didn't reach it before it hit the sand. Tap the landing spot sooner, or start closer to where they like to hit.")
      : r.end === 'winner' ? (won ? 'It landed where they weren\'t covering.' : 'It landed where you weren\'t covering.')
        : !you ? 'Good pressure. They made the error.'
          : r.why === 'net' && !mine ? 'Your partner went for it and found the net.'
          : r.why === 'net' ? (R.ATTACK[choice.shot] && h < R.NET_H ? 'Hitting down from ' + h.toFixed(1) + ' m, below the net, mostly finds the net. Lift it instead.' : 'Under pressure, the net comes into play.')
            : r.why === 'out' ? 'Aims near the lines, and the wind, push balls out.' : 'Off balance, the error chance goes up.';
  const over = (MATCH.me >= R.WIN_AT || MATCH.them >= R.WIN_AT) && Math.abs(MATCH.me - MATCH.them) >= 2;
  set({ odds: null, result: { won, head, why, over, race: r.tBall && r.why === 'late' && !r.mate ? { ball: r.tBall, you: r.tNeed } : null } });
}
export function nextPoint() {
  if (get().result?.over) { set({ screen: 'over' }); return; }
  set({ rail: null });
  newPoint();
}

/* Lobby: everyone in a ready stance on court */
export function initLobby() {
  const P = [[[5.4, 2.5], [2.6, 5.5]], [[5.4, 2.5], [2.6, 5.5]]];
  const actors = {};
  for (let t = 0; t < 2; t++) for (let i = 0; i < 2; i++) { const k = keyOf(t, i); actors[k] = { ...actor(k, t, P[t][i]), snap: 1, speed: 4.5 }; }
  set({ actors });
}
initLobby();

/* Test hook for automated checks */
if (typeof window !== 'undefined') window.BTU = { TIME, get, aimAt, tapLanding, pickShot, nextPoint, startMatch };
