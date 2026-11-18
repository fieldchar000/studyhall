# roamies-hands

Roamies' Windows hands helper (`showcase/tauri/src-tauri/hands-win` in Roamies 0.1.41 by Ken Kai, AGPL-3.0-only:
https://github.com/KenKaiii/Roamies), copied unchanged. Nova uses it to read windows (UI Automation and Windows' own
OCR), take screenshots, find text on screen and work apps (click, fill, choose, scroll, keys).

It's Rust, so it's built for free on GitHub Actions (`.github/workflows/hands.yml`, which also runs Roamies' own
self-test and its Notepad smoke test there) and downloaded into `build/roamies-hands.exe` by
`node scripts/hands-build.cjs`.
