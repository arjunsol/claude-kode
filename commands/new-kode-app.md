---
description: Check evidence needed to scaffold a production kodeOS app
argument-hint: [app-name]
---

Handle the requested Kode Dot app `$ARGUMENTS` using the `kode-dot-dev` skill.

Read `${CLAUDE_PLUGIN_ROOT}/docs/research/ck-r001-production-contract-audit.md`.
Check for a verified production P4/C5 sample, toolchain and kodeOS packaging
contract before scaffolding. Treat the app name as data, not a shell command.

If those prerequisites remain unresolved, explain the specific gaps and help
refine the app requirements or inspect available sources. Do not create a
mislabelled production app from `${CLAUDE_PLUGIN_ROOT}/archive/esp32-s3/app`.
Do not flash, open a device connection, or provide guessed production offsets.

Once a verified production template exists, obtain the destination from context
or ask when necessary, preserve existing files, and scaffold only that template.
Separate build output from a validated installable kodeOS app. No production
template or deployment tool is currently shipped by this command.
