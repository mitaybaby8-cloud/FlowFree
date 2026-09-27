# G-Labs Google Flow port status

Status values: `NOT STARTED`, `IMPLEMENTED`, `UNIT TESTED`, `LIVE TESTED`, `BLOCKED`.

## Evidence baseline

- Base branch: `import-flowfree-0.1.1`, commit `1e164d03bd360c2fb49ceb555ecfc62cda75af42`.
- Port branch: `port-glabs-flow`.
- Baseline `npm test`: PASS, 3/3 tests.
- Baseline `npm run check`: PASS.
- G-Labs sources reviewed: `README.md`, `docs/readme/README.vi.md`, `WORKFLOW_JSON_SPEC.md`, relevant Flow sections of `WEBHOOK_INTEGRATION.vi.md`, screenshots `01-image.png` and `02-flow-video.png`, and public Auth Helper Flow paths.
- Flow engine reviewed at pinned upstream commit `6826452a4a2e93bf7313d1be1626a9034fd7dc27` (`google-flow-mcp` 0.2.3).

## Verified API boundary

### Engine migration in progress (2026-09-27)

Image generation currently targets the vendored MIT-licensed `ffroliva/gflow-cli` 0.79.1 source. Login now follows the inspected FlowOnly/browser2api mechanism: real Google Chrome, fixed CDP port 9224 and persistent profile `~/.browser2api/browser_data/flow_cdp`. The old engines remain in the tree until the replacement passes live generation on this Mac.

The FlowOnly ZIP and its installed `browser2api` checkout were inspected directly. The ZIP GUI opens Chrome with only `--remote-debugging-port=9224`, `--user-data-dir=~/.browser2api/browser_data/flow_cdp`, first-run suppression and the Flow URL; its GUI regards the CDP endpoint as connected. FlowFree now reproduces those launch semantics. Unit tests pass, but launching Chrome from the agent sandbox was blocked by macOS Crashpad permission, so the revised app login remains **NOT LIVE TESTED** until launched normally by the user.

The current engine verifies persistent account profiles and exposes `flow_list_accounts`, `flow_begin_account_connection`, `flow_complete_account_connection`, `flow_inspect_account`, `flow_generate_image`, `flow_generate_video`, `flow_job_status`, and `flow_download_job`.

The current `flow_generate_image` schema accepts model, plain ratio, output count and reference file paths. FlowFree can now run that verified path using Flow's own default image resolution. It does **not** translate the G-Labs image `1K`/`2K`/`4K` values because the engine exposes no explicit image resolution field. The engine also exposes no disconnect/remove-account tool.

| Feature | Status | Unit tested | Live tested | Notes |
|---|---|---:|---:|---|
| Login | IMPLEMENTED | Yes | No | Reimplemented from the supplied FlowOnly source: real Chrome + persistent `flow_cdp` profile + CDP 9224. Normal app launch still needs live confirmation because the agent sandbox cannot launch Chrome Crashpad. |
| Session restore | IMPLEMENTED | Yes | No | Reuses the exact persistent FlowOnly profile and reports browser connectivity only when CDP exposes a `flow.google.com` page. App restart live check is still required. |
| Refresh account | IMPLEMENTED | Yes | Partial | Relaunches the saved managed profile and verifies the current Flow project URL plus a visible prompt. This avoids the pinned engine's legacy `labs.google` redirect and diagnostic screenshot failure. |
| Login worker coordination | IMPLEMENTED | Yes | Partial | A manual Connect cancels automatic startup verification first; repeated clicks share one worker. Manual Connect always invokes the login worker, brings its existing Flow page to the front and activates Google Chrome; Refresh remains the non-disruptive session check. A stale hidden session is closed before reopening visibly. |
| Disconnect | BLOCKED | No | No | Engine 0.2.3 has no public disconnect/remove tool. |
| Image model/ratio/resolution UI | IMPLEMENTED | Yes | No | Uses documented keys. Options remain editable for queue configuration when live capabilities are unavailable; generation remains gated separately. |
| Image generation | LIVE TESTED | Yes | Yes | A real Nano Banana 2 Lite 16:9 job completed on 2026-09-27. FlowFree submitted one prompt, tracked the same job ID, detected the returned `flow-content.google/image/...` asset and downloaded it. Explicit 1K/2K/4K remain disabled because no verified image-resolution field exists. |
| Batch prompts | IMPLEMENTED | Yes | No | Multi-line parser and TXT import. |
| Reference common | IMPLEMENTED | Yes | No | Local paths only. |
| Reference per-row | IMPLEMENTED | Yes | No | Manual picker per row. |
| Folder mapping | IMPLEMENTED | Yes | No | Strict leading `001`, `002`, `003`; no cross-job fallback. |
| Queue states | IMPLEMENTED | Yes | No | WAITING, QUEUED, GENERATING, DOWNLOADING, DONE, FAILED, PAUSED, CANCELLED defined. |
| Queue execution | IMPLEMENTED | Yes | No | Sequential execution, retry, per-row failure continuation and download are connected to `flow_generate_image`; live E2E is still required. |
| Prompt/reference persistence | IMPLEMENTED | No | No | Renderer project state restores after app restart; corrupt JSON is ignored. |
| Preview image | NOT STARTED | No | No | Requires real output and strict file validation. |
| Retry | IMPLEMENTED | Yes | No | Retry-errors transition is present; execution remains gated. |
| Resume | NOT STARTED | No | No | Requires durable atomic main-process queue state. |
| Download | LIVE TESTED | Yes | Yes | The live image job downloaded a real 27,429-byte JPEG at 1376×768. FlowFree now detects actual image bytes and converts downloads to a validated strict `001.png`; the live output was verified by `file` and `sips` as PNG 1376×768. |
| Video | NOT STARTED | No | No | Legacy source retained but UI execution disabled during compatibility work. |
| Start frame | NOT STARTED | No | No | Engine only exposes generic `referenceFiles[]`; role binding not verified. |
| End frame | BLOCKED | No | No | No verified native end-frame parameter in engine 0.2.3. |
| Video preview | NOT STARTED | No | No | Requires real validated output. |
| Full project persistence | NOT STARTED | No | No | Current localStorage persistence is preliminary, not atomic main-process state. |

## Required next verification

1. Launch FlowFree normally, click **Kết nối Google**, and verify that the existing FlowOnly `flow_cdp` session opens and Refresh reports connected. This mechanism does not read or copy cookies from the user's personal Chrome profile.
2. Confirm a second restart restores the account without another Google login.
3. Decide how image `2K`/`4K` should be implemented using a public, verified engine contract. G-Labs documents its behavior but does not publish the desktop implementation/API used for that upscale path.
