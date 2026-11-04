# Unreleased ESP32-S3 prototype archive

This directory preserves historical project-authored material. It is not a
production Kode Dot template. Production work targets P4/C5 (ADR-0004).
Do not apply its pins, partition table, board JSON or offsets to production hardware.

The former `templates/app` lives at `app/`. Its custom flash command has been
removed. A PlatformIO pre-script rejects device and unknown targets; it allows
only local build/inspection targets. This is a recipe guard, not a host security
boundary. Do not bypass it with direct device tools.

For explicit historical build research only, with PlatformIO installed:

```sh
pio run -d archive/esp32-s3/app -j 4
```

That command produces a generic historical S3 binary, not a verified kodeOS app.
The platform URL and NeoPixel dependency remain unpinned historical inputs;
a build is not reproducible production evidence. No successful archive firmware
build is claimed by this change. The former cloud setup also stopped at registry
network access. Production setup must follow CK-R001, not reuse that setup script.

`toolchain-notes.md` preserves historical findings, including ADR-0002's S3-era
scope. Production loader format, lifecycle and recovery remain unverified.
