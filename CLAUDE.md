## Agent skills

### Issue tracker

Issues live in GitHub Issues (github.com/arjunsol/claude-kode). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Production Kode Dot SDK and MCP (13 November 2026)

Read `skills/kode-dot-dev/SKILL.md` and `docs/development/f1-capability-evidence-build.md` before working on firmware or hardware. The pin is kode-sdk, kodeOS and C5 firmware v0.1.1 (v0.1.0 stays an assessed previous release; any other is refused); kode-app-template v0.1.0 is its only release. The S3 and old no-manifest claims are historical. The `mcp/` server (0.2.0) has 17 tools: a simulated fixture, four console reads (off unless `KODE_ENABLE_CONSOLE_READS=1`; opening USB serial can reset the Dot), eight capability, evidence and contract tools, and the build pipeline `kode_new_app`, `kode_validate`, `kode_build`, `kode_inspect_image`. The pipeline needs `KODE_WORKSPACE_ROOT`, `KODE_TEMPLATE_DIR`, `KODE_ENABLE_BUILD=1` and an ESP-IDF v6.1 environment. `kode_build` passes only the build verb and builds only a project whose build logic is the pinned template's, but a build still runs build scripts and is not a sandbox: do not add `idf_ext.py`, extra CMake or a `components/` directory to a project, and build with no Dot attached. Nothing has run on a physical Dot. There is no install, flash, erase, OS or C5 update, radio or actuator tool. **Never invoke a raw esptool write-flash offset**; the template README's offset conflicts with the partition table. On a refusal, report the `reasonCode` and missing evidence and stop. Accepted ADRs remain controlling until explicitly superseded.
