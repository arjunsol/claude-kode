---
name: kode-dot-dev
description: Use when developing firmware for the Kode Dot (kodeOS, ESP32-S3) - setting up Arduino IDE or PlatformIO board config, working with kode dot pin mappings and driver components, or figuring out what kodeOS app packaging actually requires.
version: 0.1.0
---

# Kode Dot development

Reference knowledge for building apps that run under kodeOS on the Kode Dot
(pocket ESP32-S3 device, 2.13" AMOLED, 500mAh battery, 9-axis IMU, mic,
microSD, speaker, rear magnetic connector). Facts below were verified
directly against the `kodediy` GitHub org and `docs.kode.diy` on 2026-09-16 -
re-check anything marked "unverified" before relying on it, since this
device shipped to backers only recently and things are still moving.

## Toolchains

**Arduino IDE** - no separate Kode board package. Install the standard
`esp32` boards package (Espressif core) via Boards Manager, then select
`Tools > Board > esp32 > Kode Dot`.

**PlatformIO** - this is the toolchain with the most verified detail. A
Kode Dot project needs:
- `platform = https://github.com/pioarduino/platform-espressif32/releases/download/stable/platform-espressif32.zip`
  (the `pioarduino` fork, not upstream `platformio/platform-espressif32`)
- `board = kode_dot`, resolved against a `boards/kode_dot.json` file placed
  in the project itself (PlatformIO custom-board convention) - see
  `templates/app/boards/kode_dot.json` in this repo.
- `framework = arduino`
- A custom `upload_protocol` that calls `esptool write-flash` directly at
  offset `0x400000`, so the app binary lands in the `app` partition without
  touching kodeOS's own bootloader/launcher region. See
  `templates/app/partitions_app.csv` for the full partition table.
- An `app_name` key in the `[env]` block. This is the only manifest-like
  field found anywhere in the toolchain - see "kodeOS app packaging" below.

**ESP-IDF** - vanilla ESP32-S3 IDF. No unified Kode SDK component; use the
individual driver components listed below directly.

## kodeOS app packaging (confirmed: there is no manifest)

Confirmed by direct investigation (2026-09-17), not just absence of docs -
see ADR-0002. kodeOS's launcher is **closed-source** (recovered only via a
closed-source desktop app per `docs.kode.diy/en/kodeOS/firmware.md`), despite
`docs.kode.diy/en/faq.md` claiming it's "completely free and open source" -
that claim is unsupported by anything discoverable, worth flagging plainly
rather than repeating it at face value.

There is **no manifest, icon field, or lifecycle hook of any kind**. An
app's identity is just:
- **name** - typed by the user in the on-device "create application" flow
  (the `app_name` PlatformIO field only sets the flashed binary's filename
  via `rename_bin.py`; it is not read by the launcher as a display name)
- **category** - literally the folder on the microSD card the app's files
  live in (default: General/Hacking/GPIO/USB/Games, user-creatable);
  sharing an app means copying files between category folders by hand

Both are assigned on-device, after flashing, by the user - not by anything
this toolchain writes. Do not invent a manifest format or automate
name/category assignment: there is nothing on the wire to automate against.
Tell the user this is a manual, on-device step if it matters for what
they're building, and re-check `docs.kode.diy` in case kodediy ever
open-sources the launcher or documents something more.

## Pin map

Verified against `kodediy/kodedot_examples` (`PlantMonitor/lib/kodedot_bsp/include/kodedot/pin_config.h`).
See `templates/app/include/kode_pins.h` in this repo for the full,
commented header. Headline facts:

- Display: 410x502 AMOLED over QSPI (SCLK=17, SDIO0-3=15/14/16/10, RST=8,
  CS=9) on `SPI3_HOST` - this is why the driver is `esp_lcd_co5300`
  (QSPI AMOLED controller), not ST7789 as one early press writeup claimed.
- Touch + IO expander share an I2C bus: SCL=47, SDA=48. IO expander is a
  TCA9555 at address `0x20`, INT on GPIO18.
- Top button is a raw GPIO (`GPIO0`, doubles as BOOT). Bottom button and the
  D-pad are **not raw GPIOs** - they're bits on the TCA9555 IO expander.
- microSD is 1-bit SDMMC: CMD=5, CLK=6, D0=7. Card-detect is also on the IO
  expander.
- Mic is I2S: SCK=38, WS=45, DIN=21.
- Single WS2812-style NeoPixel on GPIO4.
- Fuel-gauge I2C address in the verified header is `0x36` (MAX17048-style),
  which is inconsistent with the `kode_BQ27220` driver repo existing in the
  org - **unverified which fuel gauge chip is actually on current hardware**,
  check before depending on either address.

## Driver components (kodediy org, all Apache-2.0 - safe to pull via `lib_deps`)

- `esp_lcd_co5300` - display driver
- `esp_lcd_touch_cst820` - touch driver
- `kode_lsm6dsox` - IMU (accel/gyro)
- `kode_lis2mdl` - magnetometer
- `kode_bq25896` - charger/PMIC
- `kode_BQ27220` / `kode_bq27220-idf` - fuel gauge
- `kode_MAX31329` / `kode_max31329-idf` - RTC
- `kode_audio` - audio

## Licensing note - do not vendor the examples repo

`kodediy/kodedot_examples` and `kodedot_SharedExamples` have **no LICENSE
file**, so their code is all-rights-reserved by default even though it's
public. That includes the `kodedot_bsp` convenience library (its
`DisplayManager`/`LEDManager` C++ implementations) bundled inside each
example project - only its `pin_config.h` *facts* (pin numbers, bus
config) were re-derived into this repo's own template, not its source.
When scaffolding new apps, prefer the Apache-2.0 driver components above
over copying anything from the examples repos. If a user explicitly wants
the BSP convenience classes, point them at the upstream repo to copy
themselves rather than having this plugin do it.

## Docs and sources

- https://docs.kode.diy - official docs (Quickstart, ESP32-S3, IO Expander,
  Display/LVGL, Audio, IMU, RTC, Power, Connectors, KodeOS Apps/Firmware)
- https://github.com/kodediy - org root
- https://github.com/kodediy/kodedot_examples and `kodedot_SharedExamples` -
  real example apps (PlantMonitor, Doom, Camera, GuitarHero, AirMouse, etc.)
