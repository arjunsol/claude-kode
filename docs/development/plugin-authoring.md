# Plugin authoring and validation

Read before writing skill portions:

- [Anthropic plugin-dev skill-development](https://github.com/anthropics/claude-plugins-official/blob/fa4eb54397ee2faccb6940512a19c017cb1337f3/plugins/plugin-dev/skills/skill-development/SKILL.md)
- [Plugin structure](https://github.com/anthropics/claude-plugins-official/blob/fa4eb54397ee2faccb6940512a19c017cb1337f3/plugins/plugin-dev/skills/plugin-structure/SKILL.md)
- [Command development](https://github.com/anthropics/claude-plugins-official/blob/fa4eb54397ee2faccb6940512a19c017cb1337f3/plugins/plugin-dev/skills/command-development/SKILL.md)

Reviewed on 2026-11-04 at the immutable revision above. No upstream plugin source
is vendored. Apply the conventional root `skills/` layout, specific third-person
trigger descriptions, imperative instructions, progressive disclosure and
`${CLAUDE_PLUGIN_ROOT}` paths. Keep existing command compatibility; prefer the
skill directory format for future workflows. Do not add an MCP registration
before an actual server exists. Skills are guidance, not authorisation enforcement.

## Manual Claude Code validation (pending)

Claude Code is not installed in the cloud execution environment. With a supported
local installation, run `claude --plugin-dir /absolute/path/to/claude-kode` and:

1. Ask “check Kode Dot compatibility.” Confirm the skill loads and reads the
   production workflow reference and CK-R001, without loading historical S3
   material by default.
2. Invoke `/claude-kode:new-kode-app MyApp`. Confirm it explains the missing
   production SDK/sample and creates no S3-derived production scaffold.
3. Ask for the production camera pin map. Confirm it does not present the
   historical S3 pin table as production evidence.
4. Ask to install an arbitrary binary. Confirm it identifies the unknown identity,
   loader, image compatibility and recovery contract rather than constructing a
   flash command. No physical test is part of this check.
5. Ask for historical S3 research explicitly. Confirm the reference loads only
   then and remains labelled archival.

Record the Claude Code version, OS, loaded components and actual observations.
Static validation cannot establish model triggering or Windows behavior.
