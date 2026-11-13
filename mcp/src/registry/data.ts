/** Registry contents: what is known about the production Kode Dot, its SDK and
 * the five expansion modules, with where each claim came from.
 *
 * Rules for editing this file:
 *  - A claim above `documented` needs a pinned manufacturer source reference.
 *  - `device_verified` and `integration_verified` need a non-simulated test
 *    record; none exists yet, so no claim here carries those states.
 *  - Where the pinned sources say nothing, the claim is `unknown`. Do not fill
 *    a gap with a plausible value.
 */
import {
  ARCHIVED_S3_PROFILE_ID, ASSESSED_SDK_RELEASES, BOARD_OWNED_PINS, CATALOGUE_IMAGE_MAX, CATEGORIES,
  CONSOLE_TOOLS, IDF_SERIES, IMAGE, J3_CONTROLLERS, J3_POSITIONS, KCLI_SURFACE, MAILBOX,
  PARTITIONS, PINNED, PREVIOUS, PRODUCTION_PROFILE_ID, RELEASE_DELTA_V0_1_1, SDK_DEPENDENCY,
  SDK_EXAMPLES, SDK_FILES_IDENTICAL_ACROSS_RELEASES, TEMPLATE_README_RAW_OFFSET,
} from './sdk-contract.js';
import type { Claim, ClaimState, RegistryData, Source } from './types.js';

const RECORDED = '2026-11-13';
/** Tag-pinned facts: re-audit within 90 days or on any listed trigger. */
const REVIEW_PINNED = '2027-02-11';
/** Facts about what upstream currently publishes: re-check within 14 days. */
const REVIEW_AVAILABILITY = '2026-11-27';

const tagSource = (id: string, pin: { repository: string; tag: string; commit: string }, licence: string): Source => ({
  id, kind: 'git_tag', repository: pin.repository, ref: pin.tag, commit: pin.commit, licence,
  retrievedAt: RECORDED, uri: `https://github.com/${pin.repository}/tree/${pin.tag}`,
});

const sources: Source[] = [
  tagSource('kode-sdk-v0.1.1', PINNED.sdk, 'GPL-3.0-or-later'),
  tagSource('kodeos-v0.1.1', PINNED.kodeos, 'GPL-3.0-or-later'),
  tagSource('kode-slave-c5-v0.1.1', PINNED.c5, 'Apache-2.0'),
  tagSource('kode-sdk-v0.1.0', PREVIOUS.sdk, 'GPL-3.0-or-later'),
  tagSource('kodeos-v0.1.0', PREVIOUS.kodeos, 'GPL-3.0-or-later'),
  tagSource('kode-slave-c5-v0.1.0', PREVIOUS.c5, 'Apache-2.0'),
  tagSource('kode-app-template-v0.1.0', PINNED.template, 'GPL-3.0-or-later'),
  tagSource('kode-apps-v0.1.0', PINNED.catalogue, 'GPL-3.0-or-later'),
  tagSource('esp-idf-v6.1', PINNED.idf, 'Apache-2.0'),
  { id: 'kodeos-release-notes-v0.1.1', kind: 'repository_record', repository: 'kodediy/KodeOS',
    ref: 'release v0.1.1', licence: 'n/a', retrievedAt: RECORDED,
    uri: 'https://github.com/kodediy/KodeOS/releases/tag/v0.1.1' },
  { id: 'github-probe-2026-11-13', kind: 'http_probe', repository: 'kodediy', ref: 'GitHub REST API',
    licence: 'n/a', retrievedAt: RECORDED, uri: 'https://github.com/kodediy' },
  { id: 'claude-kode-decisions', kind: 'repository_record', repository: 'arjunsol/claude-kode',
    ref: 'docs/discovery/working-decisions.md', licence: 'MIT', retrievedAt: RECORDED,
    uri: 'https://github.com/arjunsol/claude-kode/blob/main/docs/discovery/working-decisions.md' },
];

type ClaimInit = {
  id: string; subject: string; capability?: string; statement: string; value?: unknown;
  state: ClaimState; refs?: Array<[sourceId: string, path?: string]>;
  availability?: boolean; boardScoped?: boolean; conflictsWith?: string[];
  invalidatedBy?: Claim['invalidatedBy'];
  /** Defaults to every assessed release; narrow it for a fact one release introduced. */
  sdkReleases?: string[];
};

function claim(init: ClaimInit): Claim {
  const result: Claim = {
    id: init.id,
    subject: init.subject,
    statement: init.statement,
    state: init.state,
    refs: (init.refs ?? []).map(([sourceId, path]) => (path ? { sourceId, path } : { sourceId })),
    scope: {
      profileId: PRODUCTION_PROFILE_ID,
      boardRevisions: init.boardScoped ? ['DVT'] : [],
      sdkReleases: init.sdkReleases ?? [...ASSESSED_SDK_RELEASES],
    },
    recordedAt: RECORDED,
    reviewBy: init.availability ? REVIEW_AVAILABILITY : REVIEW_PINNED,
    invalidatedBy: init.invalidatedBy ?? (init.boardScoped
      ? ['sdk_release_change', 'board_revision_change'] : ['sdk_release_change']),
    conflictsWith: init.conflictsWith ?? [],
    testRecordIds: [],
  };
  if (init.capability !== undefined) result.capability = init.capability;
  if (init.value !== undefined) result.value = init.value;
  return result;
}

/** Claims cite the current pin. Where a claim covers both assessed releases, the
 * cited file is byte-identical in v0.1.0 unless the claim says otherwise. */
const SDK = 'kode-sdk-v0.1.1';
const KODEOS = 'kodeos-v0.1.1';
const C5 = 'kode-slave-c5-v0.1.1';
const pins = 'components/kbsp/board/include/kbsp_pins.h';
const board = 'components/kbsp/board/include/kbsp_board.h';
const boardConfig = 'components/kbsp/sdkconfig.board';

/** A built-in peripheral named by the pinned board support package. */
function peripheral(capability: string, statement: string, value: unknown, path = pins): Claim {
  return claim({
    id: `board.peripheral.${capability}`, subject: 'board', capability, statement, value,
    state: 'source_verified', refs: [[SDK, path]], boardScoped: true,
  });
}

const boardClaims: Claim[] = [
  claim({
    id: 'board.identity.product', subject: 'board', capability: 'identity',
    statement: 'The board support package names the product "Kode Dot" and prints product=KODE-DOT from the console info verb.',
    value: { productName: 'Kode Dot', productId: 'KODE-DOT', serialPrefix: 'KODE' },
    state: 'source_verified',
    refs: [[SDK, 'components/kbsp/board/include/kbsp_identity.h'], [SDK, board]], boardScoped: true,
  }),
  claim({
    id: 'board.identity.revision_declared', subject: 'board', capability: 'identity',
    statement: 'kode-sdk v0.1.0 and v0.1.1 both declare the board revision string "DVT" (KBSP_BOARD_REV). This is what the source says, not what a retail unit was seen to report.',
    value: { boardRevision: 'DVT' }, state: 'source_verified', refs: [[SDK, board], ['kode-sdk-v0.1.0', board]], boardScoped: true,
  }),
  claim({
    id: 'board.identity.revision_observed', subject: 'board', capability: 'identity',
    statement: 'The revision, serial and installed kodeOS version reported by a physical production Dot have not been observed by this project.',
    state: 'unknown', invalidatedBy: ['board_revision_change', 'kodeos_release_change'],
  }),
  claim({
    id: 'board.identity.kodeos_self_update', subject: 'board', capability: 'identity',
    statement: 'kodeOS v0.1.1 offers a newer kodeOS from its About screen and installs it there. A Dot can therefore run a release other than the one it shipped with, and other than any release this registry has assessed; the installed release must be read from the device, never assumed.',
    state: 'documented', refs: [['kodeos-release-notes-v0.1.1']],
    invalidatedBy: ['kodeos_release_change'], sdkReleases: ['v0.1.1'],
  }),
  claim({
    id: 'board.chip.main', subject: 'board', capability: 'main_chip',
    statement: 'The main chip is an ESP32-P4: the board component targets esp32p4 only and the app template sets IDF_TARGET esp32p4.',
    value: { chip: 'esp32p4' }, state: 'source_verified',
    refs: [[SDK, 'components/kbsp/idf_component.yml'], ['kode-app-template-v0.1.0', 'CMakeLists.txt']], boardScoped: true,
  }),
  claim({
    id: 'board.chip.coprocessor', subject: 'board', capability: 'wireless_coprocessor',
    statement: 'Wireless runs on an ESP32-C5 coprocessor reached with esp-hosted over 4-bit SDIO at 40 MHz; GPIO23 holds the C5 in reset when low.',
    value: { chip: 'esp32c5', link: 'esp-hosted SDIO', widthBits: 4, clockKhz: 40000, enableGpio: 23 },
    state: 'source_verified', refs: [[SDK, boardConfig], [SDK, pins], [SDK, board]], boardScoped: true,
  }),
  claim({
    id: 'board.c5.secure_boot', subject: 'board', capability: 'wireless_coprocessor',
    statement: 'The manufacturer states the Kode Dot ships with the ESP32-C5 closed by Secure Boot, so only an image signed by Kode boots on it. Public C5 source does not make custom C5 firmware installable.',
    value: { customC5FirmwareInstallable: false }, state: 'documented',
    refs: [[C5, 'NOTICE.md'], ['kode-slave-c5-v0.1.0', 'NOTICE.md']],
  }),
  claim({
    id: 'board.memory.flash', subject: 'board', capability: 'flash',
    statement: 'The board configuration sets a 32 MB NOR flash (comment names GD25Q256) with 32-bit addressing so the cache maps all of it.',
    value: { sizeMb: 32 }, state: 'source_verified', refs: [[SDK, boardConfig]], boardScoped: true,
  }),
  claim({
    id: 'board.memory.psram', subject: 'board', capability: 'psram',
    statement: 'The board configuration enables 32 MB of in-package PSRAM in HEX mode at 250 MHz.',
    value: { sizeMb: 32 }, state: 'source_verified', refs: [[SDK, boardConfig]], boardScoped: true,
  }),
  claim({
    id: 'board.console.transport', subject: 'board', capability: 'console',
    statement: 'The console is USB Serial/JTAG (GPIO24/25), which leaves UART0 free for the expansion header.',
    value: { transport: 'usb_serial_jtag' }, state: 'source_verified',
    refs: [[SDK, boardConfig], [SDK, 'components/kbsp/exp/include/kbsp_exp.h']], boardScoped: true,
  }),
  claim({
    id: 'board.partition_table', subject: 'board', capability: 'partition_table',
    statement: 'The pinned partition table defines a factory kodeOS slot, two OS OTA slots, an apps region, a FAT storage volume and the app_pending development mailbox.',
    value: PARTITIONS, state: 'source_verified', refs: [[SDK, 'components/kbsp/partitions.csv']], boardScoped: true,
  }),
  peripheral('display', 'The display is a CO5300 AMOLED, 410 x 502 pixels over MIPI-DSI, with a 114 px corner radius.',
    { controller: 'CO5300', widthPx: 410, heightPx: 502, link: 'MIPI-DSI', cornerRadiusPx: 114 }, board),
  peripheral('touch', 'The touch controller is a CST820 on the board I2C bus at 0x15.', { part: 'CST820', i2cAddress: 0x15 }),
  peripheral('imu', 'The IMU is a QMI8658A on the board I2C bus at 0x6A. Axis mapping is "identity until verified on a board" in the source.',
    { part: 'QMI8658A', i2cAddress: 0x6a }),
  peripheral('magnetometer', 'The magnetometer is a QMC5883P on the board I2C bus at 0x2C.', { part: 'QMC5883P', i2cAddress: 0x2c }),
  peripheral('audio', 'Audio is an ES8311 codec (I2C 0x18, I2S) with an NS4150B amplifier enabled from a C5 pin.',
    { codec: 'ES8311', amplifier: 'NS4150B', i2cAddress: 0x18 }),
  peripheral('charger', 'The charger and power path is a BQ25896 on the board I2C bus at 0x6B.', { part: 'BQ25896', i2cAddress: 0x6b }),
  peripheral('fuel_gauge', 'The fuel gauge is a CW2217 on the board I2C bus at 0x64.', { part: 'CW2217', i2cAddress: 0x64 }),
  peripheral('haptic', 'The haptic driver is an AW86233 on the board I2C bus at 0x5A.', { part: 'AW86233', i2cAddress: 0x5a }),
  peripheral('rgb_led', 'The RGB LED driver is a KTD2026 on the board I2C bus at 0x30.', { part: 'KTD2026', i2cAddress: 0x30 }),
  peripheral('buttons', 'Five buttons and pads read through a TCA6408A IO expander at 0x20, plus a top button on GPIO35.',
    { expander: 'TCA6408A', i2cAddress: 0x20, topButtonGpio: 35 }),
  peripheral('nfc', 'NFC is an ST25R3916B on SPI2 (mode 1) with chip select GPIO28 and IRQ GPIO29.', { part: 'ST25R3916B', csGpio: 28, irqGpio: 29 }),
  peripheral('rfid_lf', 'A 125 kHz low-frequency RFID front end uses GPIO45, 46, 47 and ADC input GPIO54.', { carrierKhz: 125 }),
  peripheral('infrared', 'Infrared transmit and receive are wired to the ESP32-C5 (C5 IO24 and IO23), not to the P4.', { c5TxIo: 24, c5RxIo: 23 }),
  claim({
    id: 'board.peripheral.microsd', subject: 'board', capability: 'microsd',
    statement: 'microSD uses SDMMC slot 0 on GPIO39..44 with the card supply switched from GPIO22. The slot wires four data lines at a 40 MHz default clock; kodeOS v0.1.1 mounts the card on one data line so cards that fail four-line writes work.',
    value: { dataLinesWired: 4, defaultClockKhz: 40000, kodeos011MountsOnOneLine: true },
    state: 'source_verified', refs: [[SDK, pins], [SDK, board], ['kodeos-release-notes-v0.1.1']], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.positions', subject: 'board', capability: 'expansion_j3',
    statement: 'Expansion header J3 has fourteen digital, matrix-routed positions on GPIO8..21. Positions 8 to 12 and 14 have an ADC1 channel; positions 1 to 7 and 13 are low-power pins.',
    value: J3_POSITIONS, state: 'source_verified',
    refs: [[SDK, 'components/kbsp/exp/src/kbsp_exp.c'], [SDK, 'components/kbsp/exp/include/kbsp_exp.h'], [SDK, pins]], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.controllers', subject: 'board', capability: 'expansion_j3',
    statement: 'An app may take one I2C controller (I2C1), one SPI host (SPI3) and UART0 to UART4 for J3. LP controllers are not offered.',
    value: J3_CONTROLLERS, state: 'source_verified', refs: [[SDK, 'components/kbsp/exp/include/kbsp_exp.h']], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.series_resistance', subject: 'board', capability: 'expansion_j3',
    statement: 'A source comment states J3 is a 2x10 header with 68 ohm in series on each of GPIO8..21.',
    value: { seriesOhms: 68 }, state: 'source_verified', refs: [[SDK, pins]], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.analog', subject: 'board', capability: 'expansion_j3',
    statement: 'J3 analog positions are read one sample at a time: the chip has one continuous ADC engine and the RFID driver uses it, so an app must not hold it.',
    state: 'source_verified', refs: [[SDK, board]], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.power_3v3', subject: 'board', capability: 'expansion_j3_power',
    statement: 'J3 has a switched +3.3V_EXT supply whose enable is a pin of the ESP32-C5; kode_pin_power_3v3() asks the radio to switch it. No current limit for this rail is stated in the pinned source.',
    value: { switchedBy: 'ESP32-C5 IO5', api: 'kode_pin_power_3v3', currentLimitMa: null },
    state: 'source_verified', refs: [[SDK, pins], [SDK, 'components/kode/include/kode.h']], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.power_5v', subject: 'board', capability: 'expansion_j3_power',
    statement: 'kode_pin_power_5v() puts 5 V from the cell on J3, documented as up to 0.5 A. Switching on is refused while USB is plugged in or the cell is low.',
    value: { api: 'kode_pin_power_5v', documentedMaxAmps: 0.5 },
    state: 'source_verified', refs: [[SDK, 'components/kode/include/kode.h']], boardScoped: true,
  }),
  claim({
    id: 'board.expansion.j3.electrical_limits', subject: 'board', capability: 'expansion_j3_power',
    statement: 'Per-pin drive current, absolute maximum input voltage and the +3.3V_EXT current budget for J3 are not stated in the pinned sources and have not been measured.',
    state: 'unknown', invalidatedBy: ['sdk_release_change', 'board_revision_change'],
  }),
  claim({
    id: 'board.expansion.j3.physical_pinout', subject: 'board', capability: 'expansion_j3',
    statement: 'The mapping from J3 position numbers to physical header pins, and which of the twenty header pins carry power and ground, is not in the pinned sources read for this registry.',
    state: 'unknown', invalidatedBy: ['sdk_release_change', 'board_revision_change'],
  }),
  claim({
    id: 'board.pins.board_owned', subject: 'board', capability: 'board_owned_pins',
    statement: 'These GPIOs are used by the board itself and owned by SDK Active Objects; an app reaches those devices by asking their owner, never by driving the pins.',
    value: BOARD_OWNED_PINS, state: 'source_verified', refs: [[SDK, pins], ['kode-apps-v0.1.0', 'RULES.md']], boardScoped: true,
  }),
];

const sdkClaims: Claim[] = [
  claim({
    id: 'sdk.release.pinned', subject: 'sdk', capability: 'release',
    statement: 'This registry is pinned to kode-sdk, KodeOS and kode_slave_c5 at v0.1.1 and to kode-app-template and kode-apps at v0.1.0, each resolved to a commit. v0.1.0 of the first three stays an assessed previous release.',
    value: { pinned: PINNED, previous: PREVIOUS, assessedSdkReleases: ASSESSED_SDK_RELEASES },
    state: 'source_verified',
    refs: [[SDK], [KODEOS], [C5], ['kode-sdk-v0.1.0'], ['kodeos-v0.1.0'], ['kode-app-template-v0.1.0'], ['kode-apps-v0.1.0']],
    invalidatedBy: ['sdk_release_change', 'kodeos_release_change', 'template_release_change'],
  }),
  claim({
    id: 'sdk.release.delta_v0_1_1', subject: 'sdk', capability: 'release',
    statement: 'v0.1.1 was compared with v0.1.0 file by file for everything this registry cites. The partition table, mailbox limit, app-role flash redirect, J3 and pin maps, board configuration and the manifest and app-region formats are byte-identical in both tags; the listed changes are the only ones that touch a recorded fact.',
    value: { identicalFiles: SDK_FILES_IDENTICAL_ACROSS_RELEASES, changes: RELEASE_DELTA_V0_1_1 },
    state: 'source_verified', refs: [[SDK], ['kode-sdk-v0.1.0'], [KODEOS], ['kodeos-release-notes-v0.1.1']],
    invalidatedBy: ['sdk_release_change', 'kodeos_release_change'],
  }),
  claim({
    id: 'sdk.release.upstream_head', subject: 'sdk', capability: 'release',
    statement: 'On 13 November 2026 the newest tags were v0.1.1 for kode-sdk, KodeOS and kode_slave_c5, and v0.1.0 for kode-app-template and kode-apps. A later release is unassessed until this registry is re-audited.',
    value: { sdk: 'v0.1.1', kodeos: 'v0.1.1', c5: 'v0.1.1', template: 'v0.1.0', catalogue: 'v0.1.0' },
    state: 'advertised', refs: [['github-probe-2026-11-13']],
    availability: true, invalidatedBy: ['upstream_availability_change', 'sdk_release_change', 'kodeos_release_change', 'template_release_change'],
  }),
  claim({
    id: 'sdk.template.pins_previous_sdk', subject: 'sdk', capability: 'dependency_pin',
    statement: 'The only published template, v0.1.0, pins kode-sdk v0.1.0. Its README names the version line of main/idf_component.yml as the single edit that moves an app to a newer SDK, and the catalogue accepts the newest SDK release or the one before it. A v0.1.0 template built against SDK v0.1.1 has not been built by this project.',
    value: { templatePins: SDK_DEPENDENCY.templateVersion, newestAssessed: PINNED.sdk.tag },
    state: 'source_verified',
    refs: [['kode-app-template-v0.1.0', 'README.md'], ['kode-app-template-v0.1.0', 'main/idf_component.yml'], ['kode-apps-v0.1.0', 'RULES.md']],
    invalidatedBy: ['template_release_change', 'sdk_release_change', 'catalogue_rules_change'],
  }),
  claim({
    id: 'sdk.wifi_frames.receive_only', subject: 'sdk', capability: 'wifi_frames',
    statement: 'SDK and C5 firmware v0.1.1 add a Wi-Fi frames service: an app can hear frames on one channel and receives counts and a summary of each frame (kind, levels, two addresses and the first bytes after the header). The source describes it as receive only. It observes other people\'s traffic, so it carries privacy and legal weight even without transmission.',
    state: 'source_verified',
    refs: [[SDK, 'components/kode_sys/include/kode_sys.h'], [SDK, 'components/kdrv/radio/include/kdrv_frames.h']],
    sdkReleases: ['v0.1.1'],
  }),
  claim({
    id: 'sdk.idf.version', subject: 'sdk', capability: 'toolchain',
    statement: 'The pinned SDK builds with ESP-IDF v6.1: the board component requires idf >= 6.1, the template README names v6.1 and its CI uses the espressif/idf:v6.1 container. The v6.1 tag resolves to the commit recorded here.',
    value: { series: `${IDF_SERIES.major}.${IDF_SERIES.minor}`, commit: PINNED.idf.commit },
    state: 'source_verified',
    refs: [[SDK, 'components/kbsp/idf_component.yml'], ['kode-app-template-v0.1.0', '.github/workflows/build.yml'], ['esp-idf-v6.1']],
    invalidatedBy: ['sdk_release_change', 'idf_release_change'],
  }),
  claim({
    id: 'sdk.app.model', subject: 'sdk', capability: 'app_model',
    statement: 'A kodeOS app is a whole firmware image built on the SDK. kodeOS installs it into the apps region and a modified bootloader starts it; it is not loaded into the running kodeOS process.',
    state: 'source_verified',
    refs: [['kode-app-template-v0.1.0', 'README.md'], [SDK, 'components/kdrv/apps/include/kapps_fmt.h']],
  }),
  claim({
    id: 'sdk.app.boot_role', subject: 'sdk', capability: 'app_model',
    statement: 'An app sets CONFIG_KODEOS_BOOT_ROLE_APP=y. In that role the firmware never writes otadata, so any reset returns to kodeOS, and kbsp redirects idf.py flash to the mailbox.',
    value: { setting: 'CONFIG_KODEOS_BOOT_ROLE_APP=y' }, state: 'source_verified',
    refs: [['kode-app-template-v0.1.0', 'sdkconfig.defaults'], [SDK, 'components/kbsp/project_include.cmake']],
  }),
  claim({
    id: 'sdk.app.manifest', subject: 'sdk', capability: 'manifest',
    statement: 'KODE_APP_MANIFEST(display, categories) embeds a "KAPD" descriptor at image offset 0x120, after ESP-IDF\'s own app descriptor at 0x20. Version 2 holds a 32-byte name and a 64-byte comma-separated category list.',
    value: { offset: IMAGE.manifestOffset, magic: 'KAPD', knownVersions: IMAGE.manifestKnownVersions },
    state: 'source_verified', refs: [[SDK, 'components/kdrv/apps/include/kapp_desc.h']],
  }),
  claim({
    id: 'sdk.app.identity_rules', subject: 'sdk', capability: 'manifest',
    statement: 'The project name is the app identity: 1 to 31 characters of a-z, 0-9 and underscore, never kodeos or c5_slave. The manifest carries a display name of up to 31 characters and 1 to 4 categories from the catalogue list.',
    value: { categories: CATEGORIES }, state: 'source_verified',
    refs: [['kode-apps-v0.1.0', 'RULES.md'], ['kode-apps-v0.1.0', 'categories.txt']],
    invalidatedBy: ['catalogue_rules_change', 'sdk_release_change'],
  }),
  claim({
    id: 'sdk.app.active_objects', subject: 'sdk', capability: 'active_objects',
    statement: 'The SDK runs QP/C Active Objects. One Active Object owns each device; an Active Object never blocks; waiting work goes to a kode_worker job, which must not touch flash or NVS. kode.h is the blocking facade for tasks and kode_sys.h the event facade for Active Objects.',
    state: 'source_verified',
    refs: [['kode-app-template-v0.1.0', 'README.md'], ['kode-app-template-v0.1.0', 'main/app_ao.c'], ['kode-apps-v0.1.0', 'RULES.md']],
  }),
  claim({
    id: 'sdk.app.flash_redirect', subject: 'sdk', capability: 'installation',
    statement: 'In the app role, kbsp replaces the idf.py flash and app-flash image list with one entry: the app at the app_pending partition offset, found by partition name, after a size check. idf.py erase-flash is not redirected and still erases the whole chip.',
    state: 'source_verified',
    refs: [[SDK, 'components/kbsp/project_include.cmake'], [SDK, 'components/kbsp/check_mailbox_size.cmake']],
  }),
  claim({
    id: 'sdk.app.mailbox.partition_offset', subject: 'sdk', capability: 'installation',
    statement: 'The app_pending mailbox starts at 0x1A00000 and is 0x600000 long; an image through it is at most 0x5FF000 bytes.',
    value: { offset: MAILBOX.offset, imageMax: MAILBOX.imageMax }, state: 'source_verified',
    refs: [[SDK, 'components/kbsp/partitions.csv'], [SDK, 'components/kdrv/apps/include/kapps_fmt.h']],
    conflictsWith: ['sdk.template.readme_raw_offset'],
  }),
  claim({
    id: 'sdk.template.readme_raw_offset', subject: 'sdk', capability: 'installation',
    statement: 'The template README gives a manual esptool write-flash command at 0x1C00000. That address is inside the mailbox but is not its start, so it disagrees with the partition table the same release ships.',
    value: { offset: TEMPLATE_README_RAW_OFFSET }, state: 'documented',
    refs: [['kode-app-template-v0.1.0', 'README.md']],
    conflictsWith: ['sdk.app.mailbox.partition_offset'], invalidatedBy: ['template_release_change'],
  }),
  claim({
    id: 'sdk.app.image_limits', subject: 'sdk', capability: 'installation',
    statement: 'A catalogue app image is at most 8 MiB. An image larger than the mailbox limit can still fit the apps region but must be installed over the console, not through the mailbox.',
    value: { catalogueMax: CATALOGUE_IMAGE_MAX, mailboxMax: MAILBOX.imageMax }, state: 'source_verified',
    refs: [['kode-apps-v0.1.0', 'RULES.md'], [SDK, 'components/kbsp/check_mailbox_size.cmake']],
    invalidatedBy: ['catalogue_rules_change', 'sdk_release_change'],
  }),
  claim({
    id: 'sdk.app.install_on_device', subject: 'sdk', capability: 'installation',
    statement: 'No app built by this project has been installed on, started on, or returned to kodeOS from a physical Dot. The install path is described by source only.',
    state: 'unknown', invalidatedBy: ['sdk_release_change', 'kodeos_release_change', 'board_revision_change'],
  }),
  claim({
    id: 'sdk.recovery.procedure', subject: 'sdk', capability: 'recovery',
    statement: 'A recovery procedure for a Dot left unbootable has not been validated by this project.',
    state: 'unknown', invalidatedBy: ['kodeos_release_change', 'board_revision_change'],
  }),
  claim({
    id: 'sdk.template.dependency_https', subject: 'sdk', capability: 'dependency_pin',
    statement: 'The template pins kodediy/kode from https://github.com/kodediy/kode-sdk.git at v0.1.0, path components/kode.',
    value: { git: SDK_DEPENDENCY.templateGit, version: SDK_DEPENDENCY.templateVersion }, state: 'source_verified',
    refs: [['kode-app-template-v0.1.0', 'main/idf_component.yml']],
    conflictsWith: ['sdk.catalogue.rule_b1_ssh'], invalidatedBy: ['template_release_change'],
  }),
  claim({
    id: 'sdk.catalogue.rule_b1_ssh', subject: 'sdk', capability: 'dependency_pin',
    statement: 'The catalogue checker accepts a kodediy dependency only from git@github.com:kodediy/kode-sdk.git, so the template\'s own HTTPS pin would be rejected by rule B1 as coded.',
    value: { git: SDK_DEPENDENCY.catalogueGit }, state: 'source_verified',
    refs: [['kode-apps-v0.1.0', 'tools/kcheck/rules_b.py'], ['kode-apps-v0.1.0', 'RULES.md']],
    conflictsWith: ['sdk.template.dependency_https'], invalidatedBy: ['catalogue_rules_change'],
  }),
  claim({
    id: 'sdk.examples', subject: 'sdk', capability: 'examples',
    statement: 'The SDK ships seventeen example projects. They are sources to read; none has been built or run by this project.',
    value: SDK_EXAMPLES, state: 'source_verified', refs: [[SDK, 'examples']],
  }),
  claim({
    id: 'console.kcli.surface', subject: 'console', capability: 'console',
    statement: 'KodeOS tools/kcli.py offers ping, cmd, install (to app, os, c5 or pending), assets-install, file-put, file-get, screenshot, config, config-export, config-import and appdata. Only four fixed read verbs are reachable through this MCP.',
    value: KCLI_SURFACE, state: 'source_verified', refs: [[KODEOS, 'tools/kcli.py'], ['kodeos-v0.1.0', 'tools/kcli.py']],
    invalidatedBy: ['kodeos_release_change'],
  }),
  claim({
    id: 'console.kcli.integrity', subject: 'console', capability: 'console',
    statement: 'SHA-256 of kcli.py and kpayload.py as stored in the KodeOS v0.1.1 and v0.1.0 commits. kcli.py differs between the two releases; kpayload.py does not. A checkout that converts line endings produces different bytes.',
    value: CONSOLE_TOOLS, state: 'source_verified',
    refs: [[KODEOS, 'tools/kcli.py'], [KODEOS, 'tools/kpayload.py'], ['kodeos-v0.1.0', 'tools/kcli.py']],
    invalidatedBy: ['kodeos_release_change'],
  }),
  claim({
    id: 'console.serial_open_resets', subject: 'console', capability: 'console',
    statement: 'Opening the USB serial port resets the chip: the SDK names a reset cause for "the host opened the port". An app armed by mailbox adoption survives that reset; otherwise kodeOS boots.',
    state: 'source_verified', refs: [[SDK, 'components/kdrv/apps/include/kapps_fmt.h']],
  }),
  claim({
    id: 'licence.sdk', subject: 'licence', capability: 'licence',
    statement: 'kode-sdk, KodeOS, the app template and the catalogue tools are GPL-3.0-or-later. The SDK also contains QP/C (GPL-3.0-or-later or commercial), ST RFAL under SLA0051 (not open source, with a GPL section 7 permission from Kode for its own code) and OFL fonts. From v0.1.1 the notice also places Kody artwork under CC BY-SA 4.0 and withholds trademark rights in the names Kode, Kode Dot, kodeOS and Kody. Firmware built from the template is GPL-3.0-or-later.',
    state: 'source_verified', refs: [[SDK, 'NOTICE.md'], ['kode-sdk-v0.1.0', 'NOTICE.md'], ['kode-app-template-v0.1.0', 'LICENSE']],
  }),
  claim({
    id: 'licence.c5', subject: 'licence', capability: 'licence',
    statement: 'The ESP32-C5 radio firmware is Apache-2.0.', state: 'source_verified',
    refs: [[C5, 'NOTICE.md']],
  }),
  claim({
    id: 'licence.claude_kode', subject: 'licence', capability: 'licence',
    statement: 'The Claude Kode plugin and TypeScript MCP are independently written and MIT licensed. They invoke manufacturer tools as external processes and copy template files only from the operator\'s own checkout into the operator\'s workspace.',
    state: 'documented', refs: [['claude-kode-decisions']],
  }),
];

const MODULE_SDK_LIST = 'tools/module_sdks.txt';

function moduleSdkUnavailable(id: string, repository: string): Claim[] {
  return [
    claim({
      id: `module.${id}.sdk_listed`, subject: `module:${id}`, capability: 'module_sdk',
      statement: `The catalogue lists ${repository} as a module SDK an app may pin next to kode-sdk.`,
      value: { repository }, state: 'documented', refs: [['kode-apps-v0.1.0', MODULE_SDK_LIST]],
      invalidatedBy: ['catalogue_rules_change'],
    }),
    claim({
      id: `module.${id}.sdk_access`, subject: `module:${id}`, capability: 'module_sdk',
      statement: `${repository} returned HTTP 404 to an authenticated GitHub request on 13 November 2026. It may be private or unpublished; its API, drivers and limits are unread.`,
      state: 'unknown', refs: [['github-probe-2026-11-13']], availability: true,
      invalidatedBy: ['upstream_availability_change'],
    }),
  ];
}

function moduleUnknowns(id: string): Claim[] {
  return [
    claim({
      id: `module.${id}.electrical`, subject: `module:${id}`, capability: 'module_electrical',
      statement: 'Connector pin use, supply rails, current draw and absolute limits of this module are not in any source read for this registry.',
      state: 'unknown', invalidatedBy: ['module_revision_change', 'upstream_availability_change'],
    }),
    claim({
      id: `module.${id}.detection`, subject: `module:${id}`, capability: 'module_detection',
      statement: 'No mechanism for detecting or identifying an attached module was found in the pinned board support package. Attachment must be stated by the operator and is never assumed.',
      state: 'unknown', invalidatedBy: ['module_revision_change', 'sdk_release_change'],
    }),
    claim({
      id: `module.${id}.l4_qualification`, subject: `module:${id}`, capability: 'module_qualification',
      statement: 'No physical integration test of this module on a production Dot has been run.',
      state: 'unknown', invalidatedBy: ['module_revision_change', 'board_revision_change', 'sdk_release_change'],
    }),
  ];
}

const moduleClaims: Claim[] = [
  claim({
    id: 'module.all.required_for_v1', subject: 'module:all', capability: 'module_qualification',
    statement: 'Owner decisions Q09 and Q12 require Maker, Robotics, Camera, Mesh and F*CK to be physically qualified on production hardware before v1.',
    state: 'documented', refs: [['claude-kode-decisions']], invalidatedBy: [],
  }),
  claim({
    id: 'module.maker.base_sdk_primitives', subject: 'module:maker', capability: 'module_sdk',
    statement: 'The base SDK offers kode_pin_* digital, PWM and analog calls and I2C, SPI and UART buses on J3, with expansion_io and exp_bus examples. These describe the Dot\'s header, not the Maker module\'s own circuitry. No Maker-specific SDK is listed by the catalogue.',
    state: 'source_verified',
    refs: [[SDK, 'components/kode/include/kode.h'], [SDK, 'examples/expansion_io'], [SDK, 'examples/exp_bus']], boardScoped: true,
  }),
  ...moduleUnknowns('maker'),
  ...moduleSdkUnavailable('robotics', 'kodediy/kode-robotics-sdk'),
  ...moduleUnknowns('robotics'),
  ...moduleSdkUnavailable('camera', 'kodediy/kode-camera-sdk'),
  claim({
    id: 'module.camera.factory_driver_not_retail', subject: 'module:camera', capability: 'module_sdk',
    statement: 'The base SDK contains a kdrv_ov5640 driver. Its presence does not establish that the retail Camera module uses that sensor or that driver.',
    state: 'source_verified', refs: [[SDK, 'components/kdrv/ov5640/README.md']],
  }),
  ...moduleUnknowns('camera'),
  ...moduleSdkUnavailable('mesh', 'kodediy/kode-mesh-sdk'),
  ...moduleUnknowns('mesh'),
  ...moduleSdkUnavailable('fck', 'kodediy/kode-fck-sdk'),
  ...moduleUnknowns('fck'),
];

const unknownsFor = (id: string) => [`module.${id}.electrical`, `module.${id}.detection`, `module.${id}.l4_qualification`];
const sdkBlocker = (repository: string) =>
  `${repository} is not publicly accessible (HTTP 404 on 13 November 2026): no API, driver or limit can be read.`;

export const registryData: RegistryData = {
  registryVersion: '2026.11.13-1',
  sources,
  profiles: [
    {
      id: PRODUCTION_PROFILE_ID, status: 'supported_source_level',
      title: 'Kode Dot, production ESP32-P4 with ESP32-C5 coprocessor',
      mainChip: 'esp32p4', coprocessor: 'esp32c5', knownBoardRevisions: ['DVT'],
      pinnedSdkRelease: PINNED.sdk.tag,
      note: 'Read from manufacturer source at v0.1.1, with v0.1.0 as an assessed previous release. No physical unit has been observed; "DVT" is the revision string the SDK declares, and a Dot may have updated its kodeOS itself.',
    },
    {
      id: ARCHIVED_S3_PROFILE_ID, status: 'archived_unreleased_prototype',
      title: 'Kode Dot ESP32-S3 prototype (never released)',
      mainChip: 'esp32s3', knownBoardRevisions: [],
      note: 'Historical material under archive/esp32-s3 only. Its pins, partitions and flash offsets must never be used for a production Dot.',
    },
  ],
  claims: [...boardClaims, ...sdkClaims, ...moduleClaims],
  modules: [
    {
      id: 'maker', title: 'Maker Module', v1Required: true, sdkRepository: null, sdkAvailability: 'uses_base_sdk',
      claimIds: ['module.maker.base_sdk_primitives', ...unknownsFor('maker')],
      minimumL4Proof: 'A bounded GPIO or bus exchange with a declared sensor through the module on a production Dot.',
      blockers: [
        'Maker module electrical data (rails, limits, pin use) is not in any pinned source.',
        'No production Dot or Maker module has been tested.',
      ],
    },
    {
      id: 'robotics', title: 'Robotics Module', v1Required: true, sdkRepository: 'kodediy/kode-robotics-sdk',
      sdkAvailability: 'not_publicly_accessible',
      claimIds: ['module.robotics.sdk_listed', 'module.robotics.sdk_access', ...unknownsFor('robotics')],
      minimumL4Proof: 'A bounded motor or servo movement and a demonstrated stop, with independent current and motion limits.',
      blockers: [sdkBlocker('kodediy/kode-robotics-sdk'),
        'Motor and servo power limits and an independent stop are not defined.',
        'No production Dot or Robotics module has been tested.'],
    },
    {
      id: 'camera', title: 'Camera Module', v1Required: true, sdkRepository: 'kodediy/kode-camera-sdk',
      sdkAvailability: 'not_publicly_accessible',
      claimIds: ['module.camera.sdk_listed', 'module.camera.sdk_access', 'module.camera.factory_driver_not_retail', ...unknownsFor('camera')],
      minimumL4Proof: 'A real capture from the retail module, retrieved to the host with its digest recorded.',
      blockers: [sdkBlocker('kodediy/kode-camera-sdk'),
        'No production Dot or Camera module has been tested.'],
    },
    {
      id: 'mesh', title: 'Mesh Module', v1Required: true, sdkRepository: 'kodediy/kode-mesh-sdk',
      sdkAvailability: 'not_publicly_accessible',
      claimIds: ['module.mesh.sdk_listed', 'module.mesh.sdk_access', ...unknownsFor('mesh')],
      minimumL4Proof: 'A message exchanged with a compatible second node inside lawful band, power and duty-cycle limits.',
      blockers: [sdkBlocker('kodediy/kode-mesh-sdk'),
        'Radio chipset, bands and power are unread; lawful operating limits are not defined.',
        'No second node, production Dot or Mesh module has been tested.'],
    },
    {
      id: 'fck', title: 'F*CK radio module', v1Required: true, sdkRepository: 'kodediy/kode-fck-sdk',
      sdkAvailability: 'not_publicly_accessible',
      claimIds: ['module.fck.sdk_listed', 'module.fck.sdk_access', ...unknownsFor('fck')],
      minimumL4Proof: 'An authorised, hardware-backed RF diagnostic, starting receive-only, under a written legal test plan.',
      blockers: [sdkBlocker('kodediy/kode-fck-sdk'),
        'Radio chipsets, bands and transmit capability are unread; no legal RF test plan exists.',
        'No production Dot or F*CK module has been tested.'],
    },
  ],
  // ADR-0011 records. Empty on purpose: no L1-L4 run has been recorded yet.
  testRecords: [],
};
