# Beach Tennis University — Tactics 3D

A 3D version of the BTU Tactics game: React + Vite + three.js (React Three Fiber, drei, Rapier physics, postprocessing).
The rules engine in `src/rules/engine.js` is ported from the 2D app, so shots, reach, errors, wind and the coach's
"right shot" work exactly the same.

## Put it on GitHub and Vercel (no terminal needed)

1. On GitHub, create a new repository, e.g. `btu-3d`.
2. Click **Add file → Upload files** and drag in everything from this folder **except** `node_modules` and `dist`
   (they are not in the zip). That is about 20 files, so one upload is enough. Keep the folders (`src/…`).
3. On Vercel: **Add New → Project**, pick `btu-3d`, and click **Deploy**. Vercel sees Vite and runs
   `npm install` and `npm run build` for you. No settings to change.

## Run it on your own computer (optional)

```bash
npm install
npm run dev      # opens http://localhost:5173
npm test         # checks the rules engine
npm run build    # production build in dist/
```

## How it's organised

```
src/
  rules/engine.js     the game rules (pure JS, no 3D) + tests
  game.js             the point loop: serve → return → tap the landing spot → your shot (slow motion) → result
  time.js             game clock with slow motion
  world/Court.jsx     sand, lines, net, posts, sky, ocean, physics floor and net
  world/Ball.jsx      ball: exact arcs during play, Rapier physics (with CCD) after the point
  world/Player.jsx    procedural athletes: run / shuffle / back-pedal blending, split-step, swings, dives
  world/CameraRig.jsx broadcast camera that eases in when you decide
  world/Overlays.jsx  aim zones, landing ring (green → yellow → orange → red), floating labels
  ui/Hud.jsx          score, shot rail with ✗/✓ marks, shot clock, wind, result card, settings
```

## Next steps

- Swap the procedural players for rigged GLB characters (Mixamo or Quaternius) — keep `Player.jsx`'s props.
- Add the "Move" phase (position yourself after your shot) and the "Cover" read from the 2D app.
- Sound: hits, crowd, beach ambience.

See `GAME-SPEC-3D.md` for the full plan and `CREDITS.md` for licences.
