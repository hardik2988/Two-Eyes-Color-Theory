# Two Eyes — Delivery Outcomes & Completion Record

## 1. Character & Perspective Migration (Jack & John)
- [x] Sibling renaming: Aria → **Jack** (male, normal trichromat) and Kai → **John** (male, deuteranope).
- [x] Updated in TypeScript source, HUD, UI labels, tutorials, dialogues, localisation (`en.json`, `zh-CN.json`), and tests.
- [x] Schema migration to `version: 2` in `save.ts` preserving backwards-compatibility with existing saved preferences.
- [x] Respectful, non-stereotypical framing: John's deuteranopia is described as an illustrative simulation, highlighting pattern/shape sensitivity.

## 2. Luxury Website & UI Palette Redesign (EyeSee Light Palette)
- [x] Dominant base background: **Papaya Whip (`#FDF0D5`)** across all website surfaces, menus, HUD panels, and modals.
- [x] Typography & headings: **Deep Space Blue (`#003049`)**.
- [x] Primary calls to action: **Brick Red (`#C1121F`)**.
- [x] Restrained accents & active states: **Molten Lava (`#780000`)**.
- [x] Secondary controls & information tags: **Steel Blue (`#669BBC`)**.
- [x] Architectural museum aesthetic: refined serif titles, clear sans-serif body typography, restrained shadows, clean borders.

## 3. Single-Room Daylight Architectural Studio
- [x] Replaced dark night procedural room with a bright, luxury architectural daylight art studio.
- [x] Floor-to-ceiling glass daylight windows looking out toward garden daylight.
- [x] Light oak plank flooring with procedural natural woodgrain texture.
- [x] Warm travertine stone wall textures, cream and ivory architectural partitions.
- [x] Realistic furniture: solid wood mixing bench, brass-trimmed value easel, South gallery wall, architectural storage shelves, decorative botanical plants (Fiddle Leaf Fig & Monstera).
- [x] PBR materials with physically based roughness, metalness, directional sunlight, and ambient daylight hemisphere fill.

## 4. Four Interactive Colour-Theory Puzzles
- [x] **Puzzle 01 — Paint Mixing Bench**: Subtractive pigment synthesis. Jack discriminates hues; John identifies shape marks (Circle ● for Ultramarine, Triangle ▲ for Cadmium Lemon). Blending produces Viridian Leaf Green and unlocks Installation 02.
- [x] **Puzzle 02 — The Value Easel**: Distinguishing Tint (hue + white), Tone (hue + grey), and Shade (hue + black). Matching Tone at luminance ~0.48 unlocks Installation 03.
- [x] **Puzzle 03 — Gallery Wall Harmonies**: Interactive ordering of 4 gallery masterworks into Monochromatic, Analogous, Complementary, and Split-Complementary harmonic chords. Unlocks power to the Exhibition Vault keypad.
- [x] **Puzzle 04 — The Exit Vault Climax**: Dual-perspective clue synthesis. Jack reads chromatic red-on-green digits (`4829`); John reads hatch pattern symbols determining digit sequence order. Entering `4829` activates pneumatic bolt opening sequence.

## 5. 15-Minute Countdown Timer & Soundscape
- [x] 15:00 countdown clock displayed in HUD with warning states when low.
- [x] Tab visibility-aware: pauses when tab is hidden or game is paused.
- [x] Untimed accessibility mode option in Settings.
- [x] Dynamic soundscape: walking footsteps, paint fluid mixing, frame positioning, mechanical vault bolts, chimes for success/error.

## 6. Ending Screen & Verification
- [x] Final completion screen with the exact required design principle:
  > *"Colour is only one part of communication. Great design works for everyone."*
- [x] Performance metrics, remaining time, and restart button.
- [x] Automated test suites verified:
  - `pnpm test`: 10 test suites, 56 unit and preview tests passing (100%).
  - `pnpm typecheck`: Strict TypeScript check with zero errors.
  - `pnpm build`: Vite production build within bundle size budgets.
  - `pnpm smoke`: Full Playwright desktop & mobile E2E test passing.
