# Credits

Studyhall is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`),
because Nova uses code from Roamies.

## Roamies, by Ken Kai (AGPL-3.0-only)

https://github.com/KenKaiii/Roamies

- `src/renderer/src/lib/jarvis/roamies/core.js` and `jarvis.js` are copied unchanged from Roamies 0.1.41, and
  `10-dither.js` nearly so. They provide the JARVIS globe, the LED pixel dither renderer and the movement.
  Studyhall adds its own colours and behaviour around them (`src/renderer/src/lib/jarvis/nova.ts`). Since v0.79
  `10-dither.js` also accepts Studyhall's own "neural" look (`src/renderer/src/lib/jarvis/neural.ts`, Studyhall's code:
  a hollow globe of nodes and links), drawn the way the JARVIS look is, and since v0.82 its "orbit" look (`src/renderer/src/lib/jarvis/orbit.ts`,
  Studyhall's code: the JARVIS globe with orbit rings, a ring round its heart and sparks).
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
  Studyhall changes: `pen.js` can undo the last mark (right-click), and `ink.js` shows pictures of your own slides
  as they are (no dither) and stops a drawing still being narrated when you ask something new (`halt`).
- Reading what you marked: `src/main/roamies/marks.mjs` (describing pen marks on a screenshot), copied from Roamies
  0.1.41 and recoloured to Studyhall's blue.
- `src/main/roamies/tools.mjs` also takes a picture fetcher (`photoFetch`), so slide pictures from Nova's lesson reader
  show on its photo cards.
- Studyhall changes since v0.69: `tools.mjs` takes `aroundShot` (Nova's overlay is hidden for the moment of its own
  screenshots while a tutor lesson is recorded) and offers `pageTurned`/`screenCount` (marks on the screen fade when the
  page under them changes). `ink.js` draws cards above screen marks and slides a card off a mark that lands under it,
  lays the study board out with your slide big and the linked ones small (click to swap), adds to a board that's up,
  shows what it says in Nova's bubble unless captions are on, and reports where its screen marks are. Since v0.71 the board numbers its notes and letters its links (short arrows between slides, lit one at a time) instead of long arrows, fills in slide pictures as they come, and shows every photo as it is (not as LED dots); a card that doesn't fit beside a board opens smaller. `agentrun.mjs`
  passes its unused callbacks so the build keeps Nova's own calls to them.
- Studyhall changes since v0.73: in tutor mode the drawing goes over Studyhall's lesson window. `tools.mjs` finds words
  on its slide from the file (`lessonWords`), keeps cards off the slides (`lessonArea`) and gives each spoken step its
  line number; `ink.js` draws each step when the voice starts its line, at a slower hand's pace, with a small pen of its
  own while the globe (the Nova that talks) glides beside what's being taught, clear of the slide and the cards.
  Since v0.75 a card's tie in the lesson window runs under the ringed words to the gap beside the slide, cards are no
  wider than the card column there, and the Clear all chip isn't shown in it.
  Since v0.77.1 a card and the words it explains share a small number there, and the line between them fades after
  it's drawn.
- `native/roamies-hands`: Roamies' Windows hands helper (Rust: UI Automation, Windows OCR, screenshots, clicking and
  typing), copied unchanged and built on GitHub Actions.
- Nova's brain follows Roamies' design. It makes one fast Claude call with Nova's own tools and
  plays short filler lines ("beats") the moment something slow starts. It speaks each sentence as it
  streams in, keeps the conversation as memory, and keeps promises and facts it can be asked to forget.
- Studyhall changes to `draw.mjs`, `tools.mjs` and `ink.js` (all AGPL-3.0-only, like the rest of Roamies' code): the
  scene card, figure credits, cards placed on a screenshot's empty space, and Commons figures shown undithered.

## Pictures Nova shows

- **Figure cards** come from [Wikimedia Commons](https://commons.wikimedia.org). Only freely licensed files are used
  (public domain, CC0 or Creative Commons with attribution). Each card shows its author and licence.
- **Scene cards** are built from [Bioicons](https://bioicons.com) by Simon Dürr and contributors, which includes
  Servier Medical Art (CC BY 3.0/4.0). Each drawing's licence is CC0, MIT or Creative Commons; a CC BY drawing's
  author and licence show on the card. Drawings are fetched when first used and kept on your PC; none are bundled.

## Speech models

- NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0), via sherpa-onnx (Apache-2.0)
- Kokoro 82M (Apache-2.0)
