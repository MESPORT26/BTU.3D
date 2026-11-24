# Beach Tennis University — 3D Tactics Game Spec

Hand this file to the builder (Claude Code, or a developer) together with the current `index.html` from the 2D app. The 2D app is the **source of truth for the rules**; this spec explains how to carry them into 3D.

---

## 1. Goal

A browser 3D version of the Tactics ("Beat") mode. Doubles beach tennis, you and an AI partner against two AI opponents. Players look athletic and move naturally (run, shuffle, split-step, dive). The game **pauses at each decision** (slow motion, not a hard freeze) so the player can choose a shot and a target, then plays out at full speed.

Teaching first: every point ends with a short explanation of why it was won or lost.

## 2. Tech stack

- **three.js** (MIT licence) for rendering, loaded as ES modules. No game engine.
- **Vite** for local dev and build (`npm create vite@latest`, vanilla JS).
- Characters as **GLB** files, animated with `THREE.AnimationMixer`.
- Deployed to **Vercel** from the GitHub repo, the same as the 2D app.
- Must run at 60 fps on a mid-range phone. Portrait and landscape.

Suggested folder layout:

```
/src
  main.js          boot, renderer, resize, loop
  rules/           pure JS game logic, NO three.js imports
    constants.js   every number in section 5
    resolve.js     bResolve, bErr, bPress, bSD, bWind, bAim
    shots.js       bDefault (best shot + acceptable shots), bOptions
    ai.js          AI shot choice and covering
    match.js       scoring, serve rotation, point flow state machine
  world/
    court.js       sand, lines, net, posts, sky, lighting
    ball.js        ball mesh, shadow, trail, arc flight
    player.js      character, animation state machine, locomotion
    camera.js      camera rigs and transitions
  ui/
    hud.js         score, shot rail, shot clock, wind badge, prompts
    target.js      landing-spot ring (green → yellow → orange → red)
    result.js      point-end card with the explanation
/public/models     player GLBs
/public/anims      animation GLBs
```

**Key rule:** `rules/` must be pure logic, ported from the 2D app, with unit tests. The 3D layer only *shows* what the rules decide. This keeps the gameplay identical and testable.

## 3. Court and coordinates

- Court 16 m long × 8 m wide; net at the middle, **1.70 m** high (`NET_H = 1.7`).
- The 2D engine uses an **own-frame** coordinate per team: `x` = metres from the net (0–8), `y` = metres across (0–8).
- World mapping in three.js (Y up): `worldZ = (team===0 ? +x : -x)`, `worldX = y - 4`, `worldY = height`. Our team is on +Z, the camera behind us.
- Sand: a soft beige plane with subtle normal-map ripples; court lines as thin blue strips (tape look); posts and net with a slight sag.

## 4. Point flow (state machine)

```
SERVE → (ball flies) → THEY_RECEIVE → THEY_HIT → WE_RECEIVE (tap landing spot)
      → RUN_TO_BALL → OUR_SHOT (decision: slow-mo) → (ball flies) → MOVE (reposition) → ...
      → POINT_END (result card) → next SERVE
```

- **Decision moments** (serve, our shot, move): the world drops to `timeScale = 0.08` over 250 ms, the camera eases in, the HUD appears. After the choice, it ramps back to 1.0 over 200 ms. Keep subtle idle motion during slow-mo (breathing, weight shift) so it never looks frozen.
- **Receive moment:** the ball's landing spot appears as a ring that shrinks and changes colour green → yellow → orange → red over the receive window. Tap it to run. Our partner auto-takes balls on their side (never run across your partner).
- **Shot clock** per level: beginner 15 s, intermediate 14, advanced 11, pro 9, multiplied by the timer setting (quick 0.7, normal 1, relaxed 1.6, off).

## 5. Rules and numbers (port exactly from the 2D app)

Shots: `smash, push, hook, block, neutral, lob, drop, serve`.

| Shot | Speed v (m/s) | Hang (s) | Scatter sd | Min contact height | Net risk netK |
|---|---|---|---|---|---|
| smash | 17 | 0 | 0.55 | 2.1 | 0.9 |
| push | 12.5 | 0.05 | 0.5 | 1.5 | 0.6 |
| hook | 13 | 0.1 | 0.55 | 1.9 | 0.7 |
| block | 8.5 | 0.15 | 0.45 | 0 | 0 |
| neutral | 9 | 0.3 | 0.45 | 0 | 0 |
| lob | 6.5 | 0.95 | 0.5 | 0 | 0 |
| drop | 6 | 0.35 | 0.4 | 0 | 0 |
| serve | 11 | 0.25 | 0.6 | 0 | 0 |

- **Ball flight time:** `tBall = distance / v + hang`.
- **Reach limits (BMAXD, metres):** smash 2.0, push 2.5, hook 2.5, block 3.5, drop 3.5, neutral 4.0, serve 4.0, lob 6.5. For fast shots arriving in under 1.2 s, a ball further away than this is a winner.
- **Player stats** from skill 0–1: `react 0.30-0.10s`, `run 4.0+1.2s m/s`, `back 0.62+0.1s` (backwards running multiplier), `reach 1.35+0.15s m`, `errBase 0.028-0.016s`.
- **Receive race:** `a = 0.4*tapFraction + travelTime / (tBall * hang)`, where hang is lob 1.5 deep (lands >5 m) or 1.25 short, neutral/drop 1.1, else 1. `s = 1 - a`. Too late if `s < -0.22`. `s` also sets contact height and timing (early ≥0.4, on ≥0.12, else late).
- **Errors:** net chance from contact height below the shot's minimum × netK; frame error = `errBase × risk × 4 × pressure`.
- **Pressure** `bPress`: 0.55 × stretch + 0.35 if late + 0.9 × max(0, 0.75 − balance) + 0.35 if the incoming ball was a smash/push/hook.
- **Scatter:** sd = pressure × (shot sd / 0.5) × risk × player. Aiming is otherwise exact on the tapped spot.
- **Wind drift (m) by shot:** lob 1.3, neutral 0.55, drop 0.4, serve 0.45, block 0.2, push 0.15, smash 0.05, hook 0.1; × calm 0 / breezy 0.5 / gusty 1.
- **Risk levels:** safe (pace 0.88, margin 1.4 m, error 0.6×), normal, bold (pace 1.12, margin 0.45 m, error 1.8×).

### Best shot + acceptable shots (`bDefault`)

| Situation | Best | Also OK |
|---|---|---|
| They smashed it | block | — |
| Lobbed over you, ball ≥1.9 m | hook | push |
| High ≥2.1 m, within 3 m of net | smash | push |
| High ≥2.1 m, deeper | push | hook, neutral |
| Just above the net (≥1.7 m) | push | neutral |
| They hit it short | drop | lob |
| Low <1.2 m, within 3 m, they're at the net | lob | — |
| Low, within 3 m, they're back / opening | drop | lob |
| Low, within 3 m, otherwise | lob | drop, neutral |
| Low and deep, they're at the net | lob | neutral |
| Low and deep | neutral | lob |
| Just below the net | neutral | lob, drop |

**Shot modes:** *I choose* (default: nothing pre-selected) and *Auto-pick*. A shot not in the OK list **loses the point**: into the net (always if attacking from below the net), out, or the opponents put it away. The shot rail then shows ✗ on the chosen shot (greyed) and ✓ in green on the best shot, and the result card explains why.

## 6. Characters and animation

**Look:** athletic, beach outfits (shorts, rash vests, caps, sunglasses), barefoot. 4 players visible; at least 6 skin/hair/outfit variants. Stylised-realistic, not chibi.

**Required animation clips** (names the code expects):

| Clip | Use |
|---|---|
| `idle_ready` | athletic ready stance, slight bounce |
| `split_step` | tiny hop as opponent hits |
| `run_fwd`, `run_back`, `shuffle_left`, `shuffle_right` | locomotion, blended by velocity |
| `sprint` | long chase (lobs) |
| `forehand_neutral`, `backhand_neutral` | neutral / block |
| `lob` | open-face lift |
| `drop` | soft touch |
| `push` | flat drive at shoulder height |
| `smash_setup`, `smash` | turn side-on, racket back, then overhead |
| `hook` | overhead behind the head, chasing a lob |
| `serve` | overhead serve |
| `dive` | lunge/dive on sand for a ball out of reach |
| `celebrate`, `disappointed` | point end |

**Natural movement:**
- Locomotion is a **blend tree**: speed and direction pick between run/shuffle/back-pedal; crossfade 0.15–0.25 s. Never snap between clips.
- **Root motion off**; the code moves the player along a path with acceleration (about 6 m/s²) and deceleration, so starts and stops look human.
- Shots are **one-shot clips** timed so the contact frame lines up with the ball: start the clip at `contactTime − clipContactOffset`. Store each clip's contact frame in a JSON file.
- Players face the ball while shuffling; turn the hips for run-backs.
- Split-step every time an opponent hits.
- Feet: optional simple foot IK or foot-lock to stop sliding; sand puffs and footprints that fade.
- **Partner AI** covers the other half and moves to the right depth (net 2.4 m, mid 3.8 m, deep 5.2 m from the net).

## 7. Ball

- Yellow felt ball with a shadow on the sand (the shadow is the key depth cue).
- Arc: parabola from contact height to landing, peak height by shot (lob very high, smash downward).
- Thin fading trail; small sand burst on landing; net shake on a net ball.

## 8. Camera

- **Default:** behind and above our baseline, looking down the court (like TV broadcast but lower), smooth follow of the ball's X.
- **Decision:** ease 15% closer over our player's shoulder during slow-mo.
- **Lob chase:** pull back to show the ball's height.
- Portrait phones: higher and tighter so the whole court fits.

## 9. HUD (reuse the 2D app's look)

Palette: coral `#FF4D6D`, coral button `#D6264B`, mango `#FF9F1C`, sun `#FFD23F`, turquoise `#00C2B8`, ocean `#0077B6`, navy `#0D1B2A`, palm green `#2ECC71`, accent `#00A79E`, muted `#5E6875`. Font: **Montserrat**.

- Score bar on top (avatars, score, point dots), timer button, quit.
- Shot rail on the left (icon + name), ✗ / ✓ marks as above.
- Shot clock bar (green → red).
- Wind badge with an arrow.
- Phase pill: SERVE / RETURN / SHOT / MOVE.
- Target zones over the opponents' court: 3 depths (0–3, 3–6, 6–8 m) × 3 lanes; you can tap anywhere for an exact aim.
- Result card: headline (Winner! / Their winner / Too late / Into the net…), one-line why, expandable details.

## 10. Settings (persist in localStorage)

Level (beginner, intermediate, advanced, pro), Shots (I choose, Auto-pick), Timer (quick, normal, relaxed, off), Wind (calm, breezy, gusty), Sound on/off, Graphics (low/high: shadows, sand detail).

## 11. Milestones (build in this order, test each on a phone)

1. Court, lighting, camera, ball flying a scripted arc with shadow.
2. One player with idle + run, moving to a tapped spot naturally.
3. Port `rules/` with unit tests that match the 2D outputs.
4. Full point loop with 4 capsule placeholders (no animation) using the real rules.
5. Swap capsules for animated characters; time shots to contact frames.
6. HUD, shot rail, target ring, result card, settings.
7. Slow-mo decision moments, split-steps, dives, sand effects, sound.
8. Performance pass on phone (draw calls, shadow map size, texture sizes ≤1024).

## 12. Asset licences

- three.js: MIT.
- Characters/animations: use **CC0** packs (e.g. Quaternius) or **Mixamo** (free with an Adobe ID, royalty-free in games, but raw files must not be redistributed). Keep a `CREDITS.md` listing every asset and its licence. Do not commit raw Mixamo FBX files to a public repo; commit only the converted, game-ready GLBs.
