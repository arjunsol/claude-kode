# claude-kode — domain vocabulary

A Claude Code plugin and TypeScript MCP for production **ESP32-P4 / ESP32-C5**
Kode Dot development. Personal-first, public-ready. Q01–Q12 are the product
requirements; only explicitly accepted ADRs are architecturally binding.

**Kode Dot:** The shipping ESP32-P4/C5 device. The ESP32-S3 was an unreleased
prototype, preserved only under `archive/esp32-s3/`.

**kodeOS:** Public-source GPL-licensed firmware providing the UI, console,
application installer, OS OTA and bootloader integration. An installed app is
**another complete firmware**; it does not run inside kodeOS as a dynamically
loaded library. kodeOS and app start on separate boots.

**App:** A P4 ESP-IDF firmware image compatible with kodeOS's app/boot contract.
Contains an ESP-IDF project name/version and can embed a `KODE_APP_MANIFEST`
(display name and categories). Separate `appdata` assets carry the icon,
colour and description. A generic P4 build does not by itself prove device
installation safety.

**Category:** One or more catalogue categories declared in the embedded
`KODE_APP_MANIFEST` for the production P4. Not merely an S3-era microSD folder.

**Template:** A copyable starting app project. The supported production source
is `kodediy/kode-app-template` at a verified release tag. Its generated code
links to the GPL kode SDK; it is **not MIT firmware**. The archived S3 files are
not production templates.

**Example:** A sample application used for local dogfooding/validation,
distinct from the general template and from another user's app repository.

**SDK:** The GPL-3.0-or-later `kodediy/kode-sdk` (`v0.1.0` baseline). It exposes
`kode.h` blocking APIs for tasks and `kode_sys.h` event-based facilities for
Active Objects, owns peripherals through QP/C and supplies canonical P4 board
settings from `kbsp`. The SDK embeds third-party QP/C and RFAL with separate
licensing/notice requirements.

**Firmware roles:** `kodeOS` system firmware, kodeOS-installed user **app**,
C5 radio firmware and isolated standalone firmware are distinct artefact and
permission classes. The MCP does not expose any firmware-changing action yet.

**Console observation:** An allowed query through KodeOS's pinned GPL
`kcli.py` script over an operator-selected serial port. It may reset the Dot
when the port opens. Source-described commands are not device verification.

**Module:** Maker, Robotics, Camera, Mesh or F*CK. All five are owner-required
v1 hardware qualification gates. Never assume a specialised module is
supported simply because the base SDK has a similarly named peripheral.
