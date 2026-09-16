# claude-kode

A Claude Code plugin, plus firmware tooling, for developing kodeOS apps on
the [Kode Dot](https://kode.diy) - a pocket-sized, battery-powered ESP32-S3
maker device (2.13" AMOLED, 9-axis IMU, mic, microSD, speaker, rear
magnetic connector, optional Hacking Module).

## What's here

- `skills/kode-dot-dev/` - reference knowledge for the Kode Dot toolchain
  (Arduino IDE, PlatformIO, pin map, driver components, kodeOS app
  packaging) that Claude Code loads automatically when working on this
  device.
- `commands/new-kode-app.md` - `/new-kode-app <name>` scaffolds a new
  PlatformIO project from `templates/app/`.
- `templates/app/` - a minimal, verified-working PlatformIO project
  (board definition, partition table, pin header, starter sketch) that
  builds and flashes to a real Kode Dot.

## Status

Early scaffold. Verified against the `kodediy` GitHub org and
`docs.kode.diy` on 2026-09-16:

- PlatformIO toolchain (board id, flash offsets, partition table, pin map)
  is confirmed against real files in `kodediy/kodedot_examples`.
- **kodeOS's actual app manifest/lifecycle is not publicly documented**
  beyond an `app_name` build field - the launcher's "transform sketch into
  app" flow is described only at a high level in the official docs.
- One open question: the verified pin header defines a MAX17048-style fuel
  gauge I2C address, but the `kodediy` org also has a `kode_BQ27220`
  driver for a different fuel-gauge chip - unclear which is actually on
  current hardware.

This repo deliberately does **not** vendor code from `kodediy/kodedot_examples`
or `kodedot_SharedExamples` - those repos have no LICENSE file (all rights
reserved by default). Templates here use only facts (pin numbers, board
config) re-derived independently, plus the individual `kodediy` driver
component repos, which are Apache-2.0.

## Quickstart

```
pio run -d templates/app -t upload
```

or use `/new-kode-app <name>` to start a real project under `apps/`.
