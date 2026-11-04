# CK-R001: Production P4/C5 hardware and kodeOS contract audit

Date: 2026-11-04. Status: in progress; production loader and hardware qualification blocked on missing evidence. ADR-0004 and ADR-0009 are accepted; acceptance does not close this research.

## CK-R001 source register

| ID | Source and exact revision | Observed content | Evidence limit |
|---|---|---|---|
| S1 | claude-kode e345931f97719b00a97b788b174d22316c83304c; historical templates/app/platformio.ini and templates/app/boards/kode_dot.json | Arduino/PlatformIO, esp32s3 MCU, custom upload at 0x400000 | Source-verified legacy configuration; no P4 applicability |
| S2 | Merged PR #1 c2f7a4b2b18cbb95558a3cc3b78681860df189e7; ADR-0004, ADR-0009 and working-decisions Q03/Q07 | P4/C5 selected target; production loader unproven | Project requirements/proposals, not manufacturer or physical proof |
| S3 | https://github.com/kodediy/docs/tree/a55bd24d1f042ae397728ddb43935f8c1a7b56dc | en/introduction.mdx and en/kode-dot/esp32s3.mdx explicitly describe S3; current commit dated 2026-05-13 | Manufacturer documentation, generation-specific; retrieved 2026-11-04 |
| S4 | Same docs revision; en/kodeOS/apps.mdx | Upload then run/create app; manual name/category and microSD category-folder sharing | Documents a historical flow; does not establish production P4 ABI/image format |
| S5 | Same docs revision; en/kodeOS/firmware.mdx | kodeOS flash partition and desktop application/file-based recovery | No production-specific partition map or demonstrated recovery in this audit |
| S6 | https://github.com/kodediy/kodedot_examples at ab05927fb72bdef90f1e11e1913b2adb88e65103 | Remote HEAD obtained only | Contents/licence not inspected this run; no code copied |

A recursive textual search of S3's checked-out files, excluding SVG/JSON/lock files, found no ESP32-P4, ESP32-C5 or ESP-AMP references. This bounded search does not prove the manufacturer has no production SDK elsewhere. Product website claims and the ESP-AMP issue referenced in PR #1 have not been independently revalidated here.

## Contract matrix

| Contract | Status as of this audit | Missing evidence |
|---|---|---|
| Production P4/C5 support target | Selected project requirement; physical identity unverified | Production revision identifiers and matched hardware observation |
| Production pin/bus/power/module map | Unverified | Revision-specific schematic/pinout, electrical limits, component drivers |
| USB identity and non-mutating discovery | Unverified | Production descriptors and documented safe interrogation procedure |
| Production loader/ABI and app image | Unverified; historical docs insufficient | Supported production SDK/sample, image/ABI specification, compatibility rules |
| ESP-IDF build to kodeOS app without replacement | Not established | Reproducible supported package/load procedure and physical execution |
| Production partition protection and recovery | Unverified | Revision-specific map, recovery assets/procedure, authorised restore test |
| S3 template usable for production deployment | Ineligible on present evidence | Never transfer its flash offset or chip settings to P4/C5 |

## No-flash warning

Do not use historical S3 esptool/0x400000 settings on a production P4/C5 Dot. Earlier onboarding installed historical S3 tools; that work is not production readiness evidence. No flash or hardware operation was performed. The old template now lives at `archive/esp32-s3/app`; its custom upload recipe was removed and a pre-script rejects device/unknown targets. This guard covers the archived recipe only, not arbitrary shell access.

## Next evidence requests and blocked tests

1. Obtain manufacturer revision-specific P4/C5 board documentation, processor roles, pin/expansion map and electrical limits.
2. Obtain production kodeOS SDK/sample with source licence, exact toolchain and component versions, loader/image ABI and supported installation route.
3. Obtain production recovery assets with integrity checks, supported desktop tool version and documented preservation/restore steps.
4. With physical hardware available, record revision/firmware/USB identity using a reviewed procedure that does not reset or alter the device unintentionally.
5. Only after choosing a source-verified software target, pin an ESP-IDF toolchain and reproduce one build-only sample with source, dependency and output hashes. This P4 build has not been attempted; selecting an arbitrary target would not meet CK-R001.
6. Plan separately authorised physical tests for kodeOS preservation, approved app installation, observable execution and recovery. No physical tests can pass from this cloud source audit.

No manufacturer outreach has been sent. CK-R001 is initiated locally, not claimed/created as a remote GitHub issue. Remaining scope includes current production sources, module contracts, a justified P4 build-only sample and physical evidence. ADR acceptance is recorded separately; no production compatibility or deployment qualification is implied.

## Reproduction

From /workspace/claude-kode, `git fetch origin refs/pull/1/head:refs/remotes/origin/pr-1` and inspect the ADRs with `git show origin/pr-1:<path>`.

Manufacturer source audit: clone https://github.com/kodediy/docs.git into a temporary directory, verify/check out a55bd24d1f042ae397728ddb43935f8c1a7b56dc, read en/introduction.mdx, en/kode-dot/esp32s3.mdx, en/kodeOS/apps.mdx and en/kodeOS/firmware.mdx, then run `rg -n -i 'esp32.?p4|esp32.?c5|esp-amp'` over text sources. An empty search is an observation, not production incompatibility proof. Local audit copy: /tmp/ck-r001-manufacturer-docs. Preserve TLS verification and the supplied Git proxy authentication.

## Follow-up access checks (2026-11-04)

- `git ls-remote https://github.com/kodediy/kode_bsp.git HEAD` returned “Repository not found.” That does not prove the component does not exist: its location or access may differ. Do not substitute a similarly named unverified BSP.
- `git ls-remote https://github.com/espressif/esp-amp.git HEAD` returned `e1b48925e7ef0f214f5465c1a0a2cb43446a7ffc`. Contents were not inspected in this run; availability of this generic upstream does not establish Kode's released loader ABI.
- HTTPS access to `kode.diy/product/kode-dot` was denied by the configured proxy (CONNECT 403). The current primary product page has not been independently revalidated. Required additional research destinations are `kode.diy`, `docs.kode.diy`, and `timeline.kode.diy`; environment settings control access.
- GitHub GraphQL issue/PR access was previously denied. No CK-R001 GitHub issue was created or assigned. This checked-in dossier records local progress.

## Execution status

- Completed: merged proposal inspection, manufacturer docs source audit, dated contract matrix, legacy S3 quarantine, skill/command corrections.
- Not run: production P4 sample build, Windows installation, production USB discovery, physical app installation, recovery and five-module qualification.
- Blocked: selecting a production sample until its supported SDK and loading contract are established; physical observations until an identified production device and authorised procedure are available.
- Next: revalidate current product/engineering sources once accessible, locate the supported P4/C5 SDK and app sample, and retain exact source/licence/toolchain identifiers before a build-only experiment.
