# Credits

Studyhall is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`),
because Nova uses code from Roamies.

## Roamies, by Ken Kai (AGPL-3.0-only)

https://github.com/KenKaiii/Roamies

- `src/renderer/src/lib/jarvis/roamies/core.js`, `jarvis.js` and `10-dither.js` are copied unchanged from
  Roamies 0.1.41. They provide the JARVIS globe, the LED pixel dither renderer and the movement.
  Studyhall adds its own colours and behaviour around them (`src/renderer/src/lib/jarvis/nova.ts`).
- Drawn explainers: `src/renderer/src/lib/jarvis/roamies/ink.js`, `ink3d.js` and `world.js` (the drawing overlay, its
  3D models and its world map; ink.js recoloured to Studyhall's blue), and `src/main/roamies/draw.mjs` and `countries.mjs`
  (checking and laying out each drawing), copied unchanged from Roamies 0.1.41. `src/main/roamies/safety.mjs` holds
  Roamies' web address check (`checkUrl`), copied unchanged.
- Nova's tools for your PC: `src/main/roamies/tools.mjs` (act_in_app, read_window, take_screenshot, list_windows, open,
  files, search, run_command, draw, see_photo, web tools, promises, plan steps, focus), `safety.mjs` (the safety rules),
  `store.mjs` and `snooze.mjs` (promises and facts), `pointing.mjs`, `intro.mjs`, `speech.mjs`, `reply.mjs` and
  `platform.mjs`, copied unchanged from Roamies 0.1.41. `src/main/roamiesTools.ts` connects them to Nova.
  `src/main/novaMemory.ts` holds Roamies' memory instructions and checks (from brain.mjs).
- `native/roamies-hands`: Roamies' Windows hands helper (Rust: UI Automation, Windows OCR, screenshots, clicking and
  typing), copied unchanged and built on GitHub Actions.
- Nova's brain follows Roamies' design. It makes one fast Claude call with Nova's own tools and
  plays short filler lines ("beats") the moment something slow starts. It speaks each sentence as it
  streams in, keeps the conversation as memory, and keeps promises and facts it can be asked to forget.

## Speech models

- NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0), via sherpa-onnx (Apache-2.0)
- Kokoro 82M (Apache-2.0)
