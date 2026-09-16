---
status: accepted
---

# Build against app_name only; flag the kodeOS manifest gap rather than invent one

kodeOS's real app-manifest/lifecycle format - icon, launcher category, lifecycle hooks - isn't publicly documented as of 2026-09-16; `docs.kode.diy/en/kodeOS/apps.md` describes only the user-facing upload/rename/categorize flow, and a re-check found no change. The only confirmed-real field is `app_name` in `platformio.ini`. This project builds and ships against that field now rather than waiting on kodediy to document more (no ETA), and explicitly surfaces the gap wherever a feature would need icon/category/lifecycle data instead of inventing a schema to fill it. If kodediy publishes a real manifest format later, expect `/new-kode-app` and its templates to need updating to match it.
