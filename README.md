# Two Eyes — Stage 3

Two Eyes is a colour-theory learning experience built in Three.js. Stage 3 builds on the playable, single-room night studio: switch between Aria's standard-colour view and Kai's illustrative deuteranopia simulation with **Tab** on desktop or the **VIEW** button on touch screens. The one continuous Three.js scene and renderer stay in use; one blendable colour-matrix shader pass simulates Kai's view and sanitizes non-finite HDR values before optional bloom. The camera eases between their eye-height/side-offset viewpoints, and the HUD clearly names the active sibling and states that the view is illustrative, since individual colour-vision experiences vary.

The studio uses Rapier collision-aware first-person movement: WASD, mouse look, E to examine, H to show or hide the guide, Shift to move faster, and Escape to pause. Four paint tins are distinguished by circle, triangle, square and diamond marks, so the introductory interaction does not depend on colour alone. The touch layout includes a virtual stick, look drag, examine, hint and sibling-view controls. Low, Medium, High and Ultra quality choices remain available.

The room is assembled from procedural placeholder geometry as requested; no GLB/glTF models have been supplied. It uses PBR-style Three.js materials, warm practical lights, a procedural `RoomEnvironment` image-based-lighting approximation (not a supplied HDRI), ACES filmic tone mapping, soft shadows, bloom and dust. The colour-vision effect uses the same scene and is tested at Low and High quality.

Stage 3 does **not** yet include the four ordered colour-theory puzzles, the 15-minute countdown, CC0 ambient/interaction audio, or the completed-game end message. Remaining visual polish includes a true HDRI source, SSAO, depth of field, film grain, vignette and measured 60-fps performance; those remain outstanding. The actual original course-site HTML/CSS/JS files were not present in the workspace or uploaded attachment, so the Learn and Colour Blind pages remain provisional standalone content rather than a verified integration of or preservation of the original website.

## Run on Windows

For development, from this project folder:

```powershell
pnpm install --frozen-lockfile
pnpm dev -- --host 127.0.0.1 --strictPort
```

Open `http://127.0.0.1:5173/` (Vite's default port; strict-port mode will fail rather than silently choose another port if it is occupied).

The packaged ZIP contains the production `dist/` build, so it can also be previewed without installing dependencies: extract it, enter `two-eyes-game`, and run:

```powershell
node serve-preview.mjs
```

The static archive server binds to `127.0.0.1:4173` by default. Node.js is required for this archive preview.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Move | W, A, S, D | Left virtual stick |
| Look | Mouse (click the canvas if needed to recapture it) | Drag on the right side |
| Examine | E | Examine button |
| Walk faster | Shift | — |
| Show/hide controls | H | Hint button |
| Switch sibling view | Tab | VIEW button |
| Pause | Escape | Pause button |

## Checks

```powershell
pnpm build     # strict TypeScript check, Vite production build and bundle-size budget
pnpm test      # all unit, localization, tuning, shader and Rapier movement/collision tests
pnpm smoke     # production desktop + mobile walkthrough (after build)
```

The Stage 3 smoke suite checks the Learn, Colour Blind and Play tabs, sibling controls briefing, quality selector, room entry, Kai/Aria transition, camera offset, single-scene/single-shader invariants, paint-tin examination, H hint, WASD movement, Rapier wall collision, mobile view and touch controls, viewport overflow, and browser errors. It passed against both the production build and the current Session Preview. Screenshots are in `.work/previews/` and `.work/previews/stage3-session/`.

To target an already-running Session Preview instead of the bundled production preview, set `SMOKE_URL` to that Preview's origin before running `pnpm smoke`. The smoke script does not start or stop the external server.

## Project map

| Path | Role |
| --- | --- |
| `src/game/studio-world.ts` | One procedural studio, lighting/IBL, PBR props, dust, interaction targets and room colliders |
| `src/game/first-person.ts` | Rapier capsule controller, look/collision-aware walking and eased sibling camera offsets |
| `src/game/game.ts` | Studio lifecycle, fixed-step input, target raycast, examination and Aria/Kai perspective state |
| `src/engine/physics.ts` | Rapier initialization, world and collision helpers |
| `src/engine/renderer.ts` | WebGL, ACES, quality presets, soft shadows, single vision shader pass and bloom |
| `src/engine/color-vision.ts` | Deuteranopia matrix shader and testable CPU reference transform |
| `src/engine/input.ts` / `src/ui/touch.ts` | Keyboard, mouse, pointer lock, mobile movement/actions and view switching |
| `src/ui/ui.ts`, `src/styles/main.css` | Learn/Colour Blind/Play shell, menus, sibling HUD, touch UI and responsive styling |
| `src/i18n/en.json`, `src/i18n/zh-CN.json` | Matched player-facing text; app currently starts in English |
| `src/game/tuning.ts` | The game's existing Preview Tweak parameter manager |

## Preview Tweak integration

Keep the single game-owned parameter manager and the development-only registration in `main.ts`; do not add a competing store. Tweak Apply changes preview state only, source defaults remain in `DEFAULT_CONFIG`, and only parameters with actual gameplay consumers should be exposed. Preserve stable IDs, activation boundaries, and the unranked-run guard; development bridge code must stay out of production builds.

## Credits

Fonts: ManusCC0 and ManusCC0 Sans CJK SC (CC0 1.0; see `public/fonts/ManusCC0-LICENSE.txt`). Libraries: Three.js (MIT), Rapier (Apache-2.0).
