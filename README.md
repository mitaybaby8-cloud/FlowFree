# FlowFree 0.1.0 — Mac ARM64

Desktop wrapper around `miyakejima/google-flow-mcp`.

## What is implemented
- Connect Google through the repo's Flow Login Bridge workflow.
- Live account capability inspection; UI fills image/video models, ratios and durations from Flow.
- IMAGE tab: batch prompts, shared reference images, strict `001 → 001.png` naming, retry and resume state.
- VIDEO tab: text→video, image→video (`001.png → 001.mp4`), Start+End compatibility mode, live Veo/Omni model selection, retry/resume.
- Uses the engine's persistent Flow job IDs and exact generated asset download logic. FlowFree never chooses assets by gallery position.
- State files `.flowfree-image-state.json` and `.flowfree-video-state.json` allow resume after app restart.

## Build on Apple Silicon
1. Install Node.js 20+ and Chrome/Chromium.
2. Run `./scripts/build-mac-arm64.sh`.
3. DMG/ZIP will be created under `dist/`.
4. Load the bundled Flow Login Bridge extension once in Chrome (`chrome://extensions` → Developer mode → Load unpacked → choose the app's `extension` folder or the vendored engine extension).

## Important current limitation
Upstream engine 0.2.3 exposes `referenceFiles[]`, not separate `startFrame` / `endFrame` parameters. FlowFree Start+End mode sends exactly two references in start/end order and injects an explicit start/end instruction. This needs a live Flow E2E test on the target account before calling it native Start+End support.
