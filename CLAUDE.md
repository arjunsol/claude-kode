## Agent skills

### Issue tracker

Issues live in GitHub Issues (github.com/arjunsol/claude-kode). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Production Kode Dot SDK and MCP (13 November 2026)

Read `skills/kode-dot-dev/SKILL.md` and `docs/development/production-sdk-readonly-mcp.md` before working on firmware or hardware. Official kodeOS/kode-sdk/app-template v0.1.0 are public; the S3 and old no-manifest claims are historical. Initial `mcp/` tools are read-only observations **with explicit opt-in**, and opening USB serial can reset the Dot. **Never invoke a raw esptool write-flash offset**, or install/erase/update OS or C5 through these tools. Accepted ADRs remain controlling until explicitly superseded.
