import { useEffect, useState } from 'react';
import { useGame, startMatch, quitMatch, nextPoint, pickShot, setSetting, dismissHowto, showHowto } from '../game.js';
import { SHOT_NAMES } from '../rules/engine.js';

const SHOTS = ['serve', 'smash', 'push', 'hook', 'neutral', 'lob', 'drop', 'block'];
const ICON_BG = { serve: '#FFD23F', smash: '#FF4D6D', push: '#FF9F1C', hook: '#D6264B', neutral: '#00C2B8', lob: '#0077B6', drop: '#2ECC71', block: '#5E6875' };
/* Simple shot glyphs (24×24) */
const GLYPH = {
  serve: 'M12 21V9M12 9l-4 4M12 9l4 4M8 5h8',
  smash: 'M13 3L6 13h5l-1 8 8-11h-5z',
  push: 'M4 12h14M13 7l5 5-5 5',
  hook: 'M6 18V10a5 5 0 0110 0v2M16 12l-3-3M16 12l3-3',
  neutral: 'M4 15c4-6 12-6 16 0M17 13l3 2-1 3',
  lob: 'M4 19C6 5 18 5 20 19M18 16l2 3 2-3',
  drop: 'M4 14c3-4 7-4 9 0M13 14v5M10 18l3 2 3-2',
  block: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
};
function Glyph({ id }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPH[id]} />
    </svg>
  );
}

function Seg({ label, k, opts }) {
  const v = useGame((s) => s.settings[k]);
  return (
    <div className="seg" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {opts.map(([id, name]) => (
          <button key={id} aria-pressed={v === id} onClick={() => setSetting(k, id)}>{name}</button>
        ))}
      </div>
    </div>
  );
}
function Settings() {
  return (
    <>
      <Seg label="Level" k="level" opts={[['beginner', 'Beginner'], ['intermediate', 'Inter'], ['advanced', 'Advanced'], ['pro', 'Pro']]} />
      <Seg label="Shots" k="pick" opts={[['choose', 'I choose'], ['auto', 'Auto-pick']]} />
      <Seg label="Timer" k="pace" opts={[['quick', 'Quick'], ['normal', 'Normal'], ['relaxed', 'Relaxed'], ['off', 'Off']]} />
      <Seg label="Wind" k="wind" opts={[['calm', 'Calm'], ['breezy', 'Breezy'], ['gusty', 'Gusty']]} />
      <Seg label="Graphics" k="fx" opts={[['high', 'High'], ['low', 'Battery saver']]} />
    </>
  );
}

function Lobby() {
  return (
    <div className="lobby">
      <div className="card">
        <p className="kicker">Beach Tennis University</p>
        <h1>Tactics 3D</h1>
        <p className="sub">Read the ball, pick the right shot, put it where they aren't.</p>
        <Settings />
        <button className="cta" onClick={startMatch}>Play</button>
        <button className="ghost" onClick={showHowto}>How to play</button>
        <small className="build">3D build 0.3 · first to 7, win by 2</small>
      </div>
    </div>
  );
}

function ClockBar() {
  const clock = useGame((s) => s.clock);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!clock) return undefined;
    let raf;
    const f = () => { tick((n) => n + 1); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [clock]);
  if (!clock) return null;
  const u = Math.min(1, (performance.now() - clock.t0) / (clock.secs * 1000));
  return <div className="clock"><i style={{ width: (1 - u) * 100 + '%' }} /></div>;
}

function Rail() {
  const rail = useGame((s) => s.rail);
  const phase = useGame((s) => s.phase);
  if (!rail) return null;
  /* Only show the rail while you decide, and after a point that has ✗/✓ marks */
  if (!(phase === 'SHOT' || phase === 'SERVE' || rail.x)) return null;
  const choosing = phase === 'SHOT' && !rail.sel;
  return (
    <div className={'rail' + (choosing ? ' choosing' : '')} role="group" aria-label="Your shot">
      {SHOTS.map((id) => {
        const off = phase === 'SERVE' ? id !== 'serve' : rail.mode !== 'shot' || !rail.legal[id];
        const cls = rail.x === id ? 'pk-x' : rail.ok === id ? 'pk-ok' : '';
        return (
          <button key={id} className={cls} disabled={off && !cls && rail.sel !== id} aria-pressed={rail.sel === id} onClick={() => pickShot(id)}>
            <span className="si" style={{ background: ICON_BG[id] }}><Glyph id={id} /></span>
            <small>{SHOT_NAMES[id]}</small>
          </button>
        );
      })}
    </div>
  );
}

/* What each shot does, in one line */
const TIPS = {
  smash: 'Hit down hard. Only from a high ball (above 2 m), close to the net.',
  push: 'Flat and fast at their feet. Needs the ball above the net.',
  hook: 'Overhead from behind your head, when they lob over you.',
  block: 'Soak up their smash or push and put it back.',
  neutral: 'Safe, medium height. Keeps the rally going from a low ball.',
  lob: 'High over them to the back. Great when they rush the net.',
  drop: 'Soft and short, just over the net. Great when they stay back.',
  serve: 'Start the point. Deep serves are safer; near the lines is bolder.',
};

function Steps({ now }) {
  return (
    <ol className="steps">
      <li className={now === 1 ? 'on' : now > 1 ? 'done' : ''}><i>1</i>Pick a shot</li>
      <li className={now === 2 ? 'on' : ''}><i>2</i>Tap their court</li>
    </ol>
  );
}

/* The coaching bar: tells you exactly what to do now, like the 2D game */
function CoachBar() {
  const phase = useGame((s) => s.phase);
  const rail = useGame((s) => s.rail);
  const pick = useGame((s) => s.settings.pick);
  if (phase === 'SERVE') return (
    <div className="coach"><b>Your serve</b><p>Tap a zone 1–5 on their court. Where you tap is where you aim: deep is safer, near the lines is bolder but misses more.</p></div>
  );
  if (phase === 'SHOT') {
    const sel = rail && rail.sel;
    return (
      <div className="coach">
        <Steps now={sel ? 2 : 1} />
        {sel
          ? <p><b>{SHOT_NAMES[sel]}:</b> {pick === 'auto' && rail.hint ? rail.hint + '. ' : ''}{TIPS[sel]} <em>Now tap where on their court.</em></p>
          : <p>Look at the ball height above, and where they're standing. Pick the shot on the left that fits. The wrong one loses the point.</p>}
      </div>
    );
  }
  return null;
}

function HowTo() {
  const open = useGame((s) => s.howto);
  if (!open) return null;
  return (
    <div className="howto" role="dialog" aria-label="How to play">
      <div className="card">
        <p className="kicker">How to play</p>
        <h2>Read it. Reach it. Place it.</h2>
        <ol>
          <li><span className="n" style={{ background: '#2ECC71' }}>1</span><div><b>Tap the ring</b><p>When they hit to your side, a ring shows where the ball will land. Tap it fast to run there. Green = early, red = too late.</p></div></li>
          <li><span className="n" style={{ background: '#00C2B8' }}>2</span><div><b>Pick your shot</b><p>The game slows down. Choose a shot on the left that suits the ball: high and close = smash, low = lob or drop.</p></div></li>
          <li><span className="n" style={{ background: '#FF9F1C' }}>3</span><div><b>Tap where to hit</b><p>Tap their court. Aim where they aren't. A wrong shot gets a ✗ and the right one a ✓, with the reason.</p></div></li>
        </ol>
        <p className="small">Your partner covers their side automatically. First to 7, win by 2.</p>
        <button className="cta" onClick={dismissHowto}>Let's play</button>
      </div>
    </div>
  );
}

function Wind() {
  const a = useGame((s) => s.windAngle), w = useGame((s) => s.settings.wind);
  if (w === 'calm') return null;
  /* world wind (X right, Z toward the camera) → screen arrow */
  const deg = (Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI;
  return (
    <div className="wind" title={'Wind: ' + w}>
      <svg viewBox="0 0 24 24" style={{ transform: `rotate(${deg}deg)` }}><path d="M3 12h15M13 6l6 6-6 6" fill="none" stroke="#0D1B2A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{w === 'gusty' ? 'Gusty' : 'Breezy'}</span>
    </div>
  );
}

function Result() {
  const r = useGame((s) => s.result);
  const [open, setOpen] = useState(false);
  if (!r) return null;
  return (
    <div className={'result ' + (r.won ? 'w' : 'l')}>
      <b>{r.head}</b>
      <p>{r.why}</p>
      {r.race && open && (
        <div className="race">
          <span><i style={{ width: '100%' }} />Ball {r.race.ball.toFixed(2)} s</span>
          <span className="late"><i style={{ width: Math.min(100, (r.race.you / Math.max(r.race.ball, r.race.you)) * 100) + '%' }} />You {r.race.you.toFixed(2)} s</span>
        </div>
      )}
      <div className="row">
        {r.race && <button className="ghost" onClick={() => setOpen(!open)}>{open ? 'Less' : 'Why?'}</button>}
        <button className="cta" onClick={() => { setOpen(false); nextPoint(); }}>{r.over ? 'See the result' : 'Next point'}</button>
      </div>
    </div>
  );
}

function Over() {
  const s = useGame((x) => x.score);
  const won = s.me > s.them;
  return (
    <div className="lobby">
      <div className="card">
        <p className="kicker">{won ? 'You win' : 'They win'}</p>
        <h1>{s.me} – {s.them}</h1>
        <button className="cta" onClick={startMatch}>Play again</button>
        <button className="ghost" onClick={quitMatch}>Back to menu</button>
      </div>
    </div>
  );
}

export default function Hud() {
  const screen = useGame((s) => s.screen);
  const score = useGame((s) => s.score);
  const phase = useGame((s) => s.phase);
  const prompt = useGame((s) => s.prompt);
  const odds = useGame((s) => s.odds);
  const [menu, setMenu] = useState(false);
  if (screen === 'lobby') return <><Lobby /><HowTo /></>;
  if (screen === 'over') return <Over />;
  return (
    <div className="hud">
      <header className="top">
        <button className="ic" aria-label="Settings" onClick={() => setMenu(!menu)}>⚙</button>
        <div className="score"><span className="you">You</span><b>{score.me}</b><em>–</em><b>{score.them}</b><span>Them</span></div>
        <button className="ic" aria-label="Quit" onClick={quitMatch}>✕</button>
      </header>
      {menu && <div className="pop-menu"><Settings /><button className="cta" onClick={() => setMenu(false)}>Done</button></div>}
      <ClockBar />
      {(phase || prompt || odds) && (
        <div className="prompt">
          {phase && <span className={'phase ph-' + phase}>{phase}</span>}
          <span>{odds && !phase ? `That shot: ${odds.win}% winner · ${odds.err}% error` : prompt}</span>
        </div>
      )}
      <CoachBar />
      <HowTo />
      <Wind />
      <Rail />
      <Result />
    </div>
  );
}
