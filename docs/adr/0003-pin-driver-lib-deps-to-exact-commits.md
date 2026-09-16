---
status: accepted
---

# Pin driver lib_deps to exact commit SHAs, not upstream main

kodediy's driver-component repos aren't published to the PlatformIO registry with semantic versions; the real PlantMonitor example points `lib_deps` at bare GitHub URLs with no ref, which tracks each repo's default branch. That ecosystem moves fast (several driver repos were updated within a day of this being written), so an unpinned template can start failing to build, or behave differently, with no corresponding change in this repo - hard to diagnose. Templates here pin each driver dependency to an exact commit SHA instead, trading "always latest" for reproducibility; bumping a pin is a deliberate, visible change rather than something that happens silently upstream.
