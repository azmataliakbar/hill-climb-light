# Hill Climb Light — Neon Hill Run

A neon 2D hill-climb driving game. Drive a two-wheel car over procedural hills, collect coins, and don't flip.

## Run

Double-click `start.bat`, or run:

```bash
npm start          # serves http://localhost:8080
npm test           # runs the unit tests (Node 18+)
```

Open http://localhost:8080. ES modules need HTTP, so opening `index.html` directly from disk won't work.

## Controls

- Keyboard: `W` / `↑` gas, `S` / `↓` brake, `A` / `←` tilt back, `D` / `→` tilt forward. `P` or `Esc` pauses.
- Touch: **GAS** and **BRAKE** pedals, with **Tilt** buttons underneath. Keyboard and touch work together, and multi-touch is supported.

## Layout

- 270px and up: a square arena with the pedals underneath.
- 1024px and up: a horizontal console with speed and RPM dials on the left and run stats and the top-10 board on the right.

## Architecture

| Area | Files | Notes |
|------|-------|-------|
| Terrain | `src/physics/terrain.js` | Sum of sine waves. Infinite, seeded, with an analytic slope. |
| Car | `src/physics/vehicle.js` | Rigid chassis, two wheels on body-frame springs (Hooke's law with damping), ground penalty contact, friction cap. |
| Run | `src/game/run.js` | Coins, distance, crash state. Deterministic for a seed. |
| Engine sound | `src/audio/engine-sound.js` | Sawtooth oscillator through a lowpass. Pitch follows RPM from speed, gear, and throttle. No audio files. |
| Loop | `src/engine/loop.js` | `requestAnimationFrame` with a fixed 1/240 s physics step. |
| Rendering | `src/engine/renderer.js`, `src/ui/dial.js` | Canvas: terrain, vector car with spinning wheels, coins, dashboard dials. |
| Input | `src/input/input.js` | Keyboard and pedals share one state. Each pointer is tracked by ID. |
| Commands | `src/router/commands.js` | `game.start`, `game.saveCoins`, `game.saveHighScore`. |
| Storage | `src/storage/save.js` | localStorage under the namespace `hcl.v1.`. |

## Notes

- Physics runs in metres and seconds. Mass is 300 kg, and the suspension stiffness is 20 kN/m.
- The car is driven from the rear wheel. Traction is capped by friction, so wheelspin is limited.
- A roof touching the ground ends the run.
