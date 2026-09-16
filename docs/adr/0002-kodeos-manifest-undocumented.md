---
status: accepted
---

# There is no kodeOS app manifest to target - build against app_name and category folders only

Confirmed by direct investigation (2026-09-17), not just absence of docs: kodeOS has **no manifest file or icon mechanism at all**, and its launcher is genuinely closed-source. `docs.kode.diy/en/kodeOS/firmware.md` describes recovering kodeOS only via a closed-source desktop app that flashes a downloadable `.bin` with no published source - despite `docs.kode.diy/en/faq.md` claiming kodeOS is "completely free and open source," a claim nothing discoverable supports. No repo in the `kodediy` GitHub org contains the launcher; the `docs` repo is only the Mintlify docs site source.

What actually identifies an app, per `apps.md`'s full text: a **name**, typed by the user in the on-device "create application" flow, and a **category**, which is literally the folder on the microSD card the app's files live in (default categories: General, Hacking, GPIO, USB, Games; user-creatable). Both are assigned *after* flashing, on-device, by the user - not by anything this toolchain writes. Sharing an app with someone else means copying files between category folders on the SD card by hand. No icon field exists anywhere in the documented flow.

Given that, this project builds against exactly what's real: the `app_name` PlatformIO field (which becomes the flashed binary's filename via `rename_bin.py`) is the whole of what a template can set. `/new-kode-app` and its docs should say plainly that naming and categorizing an app is a manual, on-device step the user does after flashing - not something to build automation around, since there's nothing on the wire to automate against. If kodediy ever open-sources the launcher or documents a real manifest format, this whole ADR is void and `/new-kode-app` should be revisited.
