---
status: accepted
---

# Don't vendor code from kodedot_examples / kodedot_SharedExamples

`kodediy/kodedot_examples` and `kodedot_SharedExamples` carry no LICENSE file, so their code (including the `kodedot_bsp` convenience library bundled in each example project - `DisplayManager`, `LEDManager`, etc.) is all-rights-reserved by default despite being public. Templates in this repo only reuse *facts* re-derived from reading that code (pin numbers, board config, which driver class is actually instantiated), and depend on kodediy's individually Apache-2.0-licensed driver-component repos (`esp_lcd_co5300`, `kode_lsm6dsox`, etc.) via `lib_deps` instead of copying anything from the examples repos. A future contributor tempted to copy a convenience class from an example project should stop and use the equivalent Apache-2.0 driver component directly, or write it fresh.
