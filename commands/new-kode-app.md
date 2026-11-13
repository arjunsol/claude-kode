---
description: Scaffold a production Kode Dot app using the published kode-sdk v0.1.0 template, without flashing hardware
argument-hint: [app-name]
---

Use the `kode-dot-dev` skill and its production-workflow reference. The
manufacturer released a real P4/C5 app template and SDK on 9 November 2026:
`https://github.com/kodediy/kode-app-template` at tag `v0.1.0` and
`https://github.com/kodediy/kode-sdk` at tag `v0.1.0`.

For `$ARGUMENTS`:

1. Validate an explicit, filesystem-safe project name (1–31 lowercase ASCII
   letters, numbers or underscores; reject shell metacharacters). If absent,
   ask for a name. Choose the destination in the user's app workspace; never
   overwrite any existing file or scaffold into the plugin's archive.
2. Check ESP-IDF v6.1 availability and the official template's release/tag
   and GPL-3.0-or-later licence. If source or toolchain is unavailable, report
   what cannot be verified; do not substitute a guessed scaffold.
3. Scaffold a **new project** from the official tagged template, preserving its
   SDK dependency declaration, CMake board bootstrap, `sdkconfig.defaults`,
   app-owned Active Object/worker and app presentation assets. Do not vendor
   the entire SDK into this MIT plugin.
4. Set `project(<name>)`, `PROJECT_VER`,
   `KODE_APP_MANIFEST("Display name", "category")`, and relevant
   `appdata/app.json` fields. Follow the upstream catalogue naming/categories
   and RAM-budget rules. Handle user-supplied names as data, never shell code.
5. Write an initial sample behaviour tailored to the request. Active Objects
   cannot block; ordinary tasks may call the blocking `kode.h` facade, while
   event-driven code uses `kode_sys.h`/the worker.
6. Build-only with `idf.py build` if a compatible pinned toolchain exists;
   record output provenance and tests actually run. Do not invoke `flash`,
   raw `esptool`, `install`, `erase`, serial ports or radio/actuator commands.
7. Report the repository path, licences, sources, build evidence and precise
   remaining device qualification gates. Q09/Q12 still require all five modules.

The archived S3 app under `archive/esp32-s3/` must never be used on production
P4/C5. The official template's manual raw flashing offset conflicts with the
released partition table; do not echo it as a recommended command. Initial
MCP capabilities are read-only diagnostics only.
