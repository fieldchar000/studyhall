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
- Background agents: `src/main/roamies/agents.mjs` (the agents manager and their news; Studyhall changes: the folder
  is Documents\Nova Agents and the names), `agentrun.mjs` (one agent in its own process), `claudecode.mjs` and
  `agentstream.mjs` (running an agent through Claude Code) and `activity.mjs`, copied from Roamies 0.1.41; they use
  Ken Kai's GG framework packages `@kenkaiiii/gg-agent`, `gg-ai` and `gg-core` (AGPL-3.0-only). The agents' corner:
  `src/renderer/src/lib/jarvis/roamies/agent-home.js`, `minis.js`, `glass.js`, `agent-panel.js`, `markdown.js` and
  `sfx.js`, copied from Roamies 0.1.41 and recoloured to Studyhall's blue. `src/main/ggweb.ts` stands in for GG
  Coder's web tools with Nova's own.
- The character on screen: `src/renderer/src/lib/jarvis/roamies/agent.js` (its speech, listening and thinking bubbles, the task
  tag, and the pen it turns into to draw while it explains), `agent-tools.js` (a little performance for each tool),
  `agent-cards.js` (the step trail) and `pen.js` (your Ctrl+Alt pen trail), copied from Roamies 0.1.41 and recoloured;
  `src/main/novaStage.ts` ports Roamies' tool-to-performance map and step trail, and `src/renderer/src/lib/jarvis/nova.ts`
  its host (host.js). `src/main/penTrail.ts` rewrites its Windows pen helper's loop detection (voice-win ink.rs).
- `native/roamies-hands`: Roamies' Windows hands helper (Rust: UI Automation, Windows OCR, screenshots, clicking and
  typing), copied unchanged and built on GitHub Actions.
- Nova's brain follows Roamies' design. It makes one fast Claude call with Nova's own tools and
  plays short filler lines ("beats") the moment something slow starts. It speaks each sentence as it
  streams in, keeps the conversation as memory, and keeps promises and facts it can be asked to forget.

## Speech models

- NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0), via sherpa-onnx (Apache-2.0)
- Kokoro 82M (Apache-2.0)
