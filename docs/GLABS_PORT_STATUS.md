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

The current engine verifies persistent account profiles and exposes `flow_list_accounts`, `flow_begin_account_connection`, `flow_complete_account_connection`, `flow_inspect_account`, `flow_generate_image`, `flow_generate_video`, `flow_job_status`, and `flow_download_job`.

The current `flow_generate_image` schema accepts model, plain ratio, output count and reference file paths. It does **not** accept the G-Labs image `upscale`/resolution values `2K` or `4K`. The engine also exposes no disconnect/remove-account tool. Generation remains blocked in the desktop IPC until a compatible image resolution API is verified; no G-Labs private endpoint or payload is guessed.

| Feature | Status | Unit tested | Live tested | Notes |
|---|---|---:|---:|---|
| Login | IMPLEMENTED | No | No | Existing two-step Flow Login Bridge retained with clearer UX. |
| Session restore | IMPLEMENTED | No | No | Engine persists account records and isolated Chromium profiles; app verifies workspace on launch. |
| Refresh account | IMPLEMENTED | No | No | Calls list + live inspect; does not show connected for an unavailable workspace. |
| Disconnect | BLOCKED | No | No | Engine 0.2.3 has no public disconnect/remove tool. |
| Image model/ratio/resolution UI | IMPLEMENTED | Yes | No | Uses documented keys; unavailable live model/ratio options are disabled. |
| Image generation | BLOCKED | Yes (gate) | No | Resolution/upscale image API is absent in engine 0.2.3. |
| Batch prompts | IMPLEMENTED | Yes | No | Multi-line parser and TXT import. |
| Reference common | IMPLEMENTED | Yes | No | Local paths only. |
| Reference per-row | IMPLEMENTED | Yes | No | Manual picker per row. |
| Folder mapping | IMPLEMENTED | Yes | No | Strict leading `001`, `002`, `003`; no cross-job fallback. |
| Queue states | IMPLEMENTED | Yes | No | WAITING, QUEUED, GENERATING, DOWNLOADING, DONE, FAILED, PAUSED, CANCELLED defined. |
| Queue execution | BLOCKED | No | No | Not connected to generation while compatibility gate is closed. |
| Prompt/reference persistence | IMPLEMENTED | No | No | Renderer project state restores after app restart; corrupt JSON is ignored. |
| Preview image | NOT STARTED | No | No | Requires real output and strict file validation. |
| Retry | IMPLEMENTED | Yes | No | Retry-errors transition is present; execution remains gated. |
| Resume | NOT STARTED | No | No | Requires durable atomic main-process queue state. |
| Download | BLOCKED | No | No | Must be live-tested with exact engine job identity and real files. |
| Video | NOT STARTED | No | No | Legacy source retained but UI execution disabled during compatibility work. |
| Start frame | NOT STARTED | No | No | Engine only exposes generic `referenceFiles[]`; role binding not verified. |
| End frame | BLOCKED | No | No | No verified native end-frame parameter in engine 0.2.3. |
| Video preview | NOT STARTED | No | No | Requires real validated output. |
| Full project persistence | NOT STARTED | No | No | Current localStorage persistence is preliminary, not atomic main-process state. |

## Required next verification

1. User connects a real Google account through Flow Login Bridge.
2. Confirm restart restores the account and `flow_inspect_account` reports a real workspace.
3. Decide how image `2K`/`4K` should be implemented using a public, verified engine contract. G-Labs documents its behavior but does not publish the desktop implementation/API used for that upscale path.
