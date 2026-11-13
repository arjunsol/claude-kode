/** Facts read from the manufacturer's tagged releases on 13 November 2026.
 * Each constant names the upstream file it was read from. Nothing here was
 * observed on a device: these are source-level facts for the tags named below.
 *
 * kode-sdk, KodeOS and kode_slave_c5 are pinned at v0.1.1, the newest tags on
 * that date. v0.1.0 was read first and stays an assessed previous release: the
 * files behind every board and app-contract constant in this file are
 * byte-identical in both tags (see SDK_FILES_IDENTICAL_ACROSS_RELEASES).
 * kode-app-template and kode-apps have published v0.1.0 only.
 *
 * Values are facts about GPL-licensed upstream sources; no upstream code is
 * copied into this MIT package.
 */

export const PRODUCTION_PROFILE_ID = 'kode-dot-p4c5';
export const ARCHIVED_S3_PROFILE_ID = 'kode-dot-s3-prototype';

export const PINNED = {
  sdk: { repository: 'kodediy/kode-sdk', tag: 'v0.1.1', commit: '63af5e7cde8497eaf89618a047844de1be9a41a2' },
  kodeos: { repository: 'kodediy/KodeOS', tag: 'v0.1.1', commit: '209fd736844bfec3c97c641830fbad055865d154' },
  template: { repository: 'kodediy/kode-app-template', tag: 'v0.1.0', commit: '9cfaa43bcb95d3918be50fc5d68acc7fd7704379' },
  c5: { repository: 'kodediy/kode_slave_c5', tag: 'v0.1.1', commit: 'c1c9a22156f88df292bc9c6674456458a0ded477' },
  catalogue: { repository: 'kodediy/kode-apps', tag: 'v0.1.0', commit: '2f72a4c2cb41d402abfae74cc1c2d6a180847acc' },
  idf: { repository: 'espressif/esp-idf', tag: 'v6.1', commit: 'fff9895c82d744c7237be8847347bdd1b07c6643' },
} as const;

/** The release read before v0.1.1. Still assessed; no longer the default. */
export const PREVIOUS = {
  sdk: { repository: 'kodediy/kode-sdk', tag: 'v0.1.0', commit: '4c868b37a9474263c9a19e902f35827daaa0c9a9' },
  kodeos: { repository: 'kodediy/KodeOS', tag: 'v0.1.0', commit: '668aae9f459f7e4a162a5bd6effd8daeea85eb29' },
  c5: { repository: 'kodediy/kode_slave_c5', tag: 'v0.1.0', commit: 'd9dfa2fc4e7abe8e81649de79a47fecee8d18467' },
} as const;

/** Releases whose sources were read for this registry. Any other release,
 * including one published later, is refused until it has been audited. */
export const ASSESSED_SDK_RELEASES = ['v0.1.0', 'v0.1.1'] as const;
export const ASSESSED_KODEOS_RELEASES = ['v0.1.0', 'v0.1.1'] as const;
export const isAssessedSdkRelease = (release: string): boolean =>
  (ASSESSED_SDK_RELEASES as readonly string[]).includes(release);
export const isAssessedKodeosRelease = (release: string): boolean =>
  (ASSESSED_KODEOS_RELEASES as readonly string[]).includes(release);

/** kode-sdk files this registry reads whose git blobs are identical at v0.1.0
 * and v0.1.1 (compared on 13 November 2026). */
export const SDK_FILES_IDENTICAL_ACROSS_RELEASES = [
  'components/kbsp/partitions.csv', 'components/kbsp/project_include.cmake',
  'components/kbsp/check_mailbox_size.cmake', 'components/kbsp/sdkconfig.board',
  'components/kbsp/exp/include/kbsp_exp.h', 'components/kbsp/exp/src/kbsp_exp.c',
  'components/kbsp/board/include/kbsp_pins.h', 'components/kbsp/board/include/kbsp_identity.h',
  'components/kdrv/apps/include/kapp_desc.h', 'components/kdrv/apps/include/kapps_fmt.h',
  'components/kdrv/apps/include/kapp_cat.h', 'components/kdrv/apps/src/kdrv_kfw.c',
  'components/kdrv/ov5640/README.md', 'tests/target/ram_budget.txt', 'tools/check_ram.sh',
] as const;

/** What v0.1.1 changed in the files and behaviour this registry describes. */
export const RELEASE_DELTA_V0_1_1 = [
  'components/kbsp/board/include/kbsp_board.h: one comment changed (KBSP_SD_WIDTH is now "data lines the slot wires"); every value, including KBSP_BOARD_REV "DVT", is unchanged.',
  'components/kode/include/kode.h: new file, audio, BLE and Wi-Fi calls; the J3 pin, power and bus declarations are unchanged.',
  'NOTICE.md: adds Kody artwork under CC BY-SA 4.0 and a trademark clause under GPL section 7(e).',
  'New receive-only Wi-Fi frames service in the SDK and the C5 firmware.',
  'KodeOS tools/kcli.py: appdata handling refactored, so its digest changed; subcommands and install destinations are the same. tools/kpayload.py is unchanged.',
  'kodeOS behaviour per its release notes: About offers and installs a newer kodeOS; the microSD mounts on one data line; Remove takes every file of an app off the Dot.',
] as const;

/** ESP-IDF series the pinned SDK builds with (template README and CI container). */
export const IDF_SERIES = { major: 6, minor: 1 } as const;

/** esp_chip_id_t as stored at byte 12 of an ESP image header. kode-sdk
 * kdrv_kfw.c selects ESP_CHIP_ID_ESP32P4 for kodeOS and its apps and
 * ESP_CHIP_ID_ESP32C5 for the coprocessor; radio_verbs.c states 23 is a C5. */
export const CHIP_IDS: Readonly<Record<number, string>> = {
  0x0000: 'esp32', 0x0002: 'esp32s2', 0x0005: 'esp32c3', 0x0009: 'esp32s3',
  0x000c: 'esp32c2', 0x000d: 'esp32c6', 0x0010: 'esp32h2', 0x0012: 'esp32p4',
  0x0017: 'esp32c5',
};
export const REQUIRED_CHIP = 'esp32p4';

/** kode-sdk components/kbsp/partitions.csv, identical at v0.1.0 and v0.1.1. */
export const PARTITIONS = [
  { name: 'nvs', type: 'data', subtype: 'nvs', offset: 0xb000, size: 0x10000 },
  { name: 'otadata', type: 'data', subtype: 'ota', offset: 0x1b000, size: 0x2000 },
  { name: 'phy_init', type: 'data', subtype: 'phy', offset: 0x1d000, size: 0x1000 },
  { name: 'factory', type: 'app', subtype: 'factory', offset: 0x20000, size: 0x400000 },
  { name: 'ota_0', type: 'app', subtype: 'ota_0', offset: 0x420000, size: 0x400000 },
  { name: 'ota_1', type: 'app', subtype: 'ota_1', offset: 0x820000, size: 0x400000 },
  { name: 'coredump', type: 'data', subtype: 'coredump', offset: 0xc20000, size: 0x20000 },
  { name: 'apps', type: 'data', subtype: '0x40', offset: 0xc40000, size: 0xbc0000 },
  { name: 'storage', type: 'data', subtype: 'fat', offset: 0x1800000, size: 0x200000 },
  { name: 'app_pending', type: 'data', subtype: '0x41', offset: 0x1a00000, size: 0x600000 },
] as const;

/** kbsp/project_include.cmake KBSP_MAILBOX_IMAGE_MAX and kapps_fmt.h
 * KAPPS_PENDING_INTENT_OFF: the mailbox keeps its last sector for kodeOS. */
export const MAILBOX = { partition: 'app_pending', offset: 0x1a00000, imageMax: 0x5ff000 } as const;
/** kode-apps RULES.md B6: a catalogue app image is at most 8 MiB. */
export const CATALOGUE_IMAGE_MAX = 8 * 1024 * 1024;
/** Offset printed by the template README's manual esptool command. It does not
 * match MAILBOX.offset. Recorded so it can be recognised and refused, never used. */
export const TEMPLATE_README_RAW_OFFSET = 0x1c00000;

/** Image layout: kdrv/apps/include/kapp_desc.h, identical at v0.1.0 and v0.1.1. */
export const IMAGE = {
  magic: 0xe9,
  headerLength: 24,
  chipIdOffset: 12,
  idfDescOffset: 0x20,
  idfDescMagic: 0xabcd5432,
  // esp_app_desc_t fields relative to the image start (KAPP_IDF_DESC_OFF + field).
  versionOffset: 0x30, versionLength: 32,
  projectNameOffset: 0x50, projectNameLength: 32,
  timeOffset: 0x70, timeLength: 16,
  dateOffset: 0x80, dateLength: 16,
  idfVersionOffset: 0x90, idfVersionLength: 32,
  manifestOffset: 0x120,
  manifestMagic: 0x4450414b, // "KAPD"
  manifestNameLength: 32,
  manifestCategoryLengthV1: 16,
  manifestCategoryLengthV2: 64,
  manifestKnownVersions: [1, 2],
  prefixLength: 0x120 + 136,
} as const;

/** kode-apps categories.txt at v0.1.0 (RULES.md A3). */
export const CATEGORIES = ['ai', 'communication', 'games', 'media', 'tools', 'wireless'] as const;
export const MANIFEST_LIMITS = { displayNameMax: 31, categoriesMax: 4, categoryMax: 15 } as const;
/** KodeOS tools/kappdata.py LIMITS and RULES.md A4. */
export const APPDATA_LIMITS = { descriptionMax: 52, iconMax: 40, allowedKeys: ['kode', 'color', 'description', 'icon'] } as const;
/** RULES.md A2. */
export const PROJECT_NAME_PATTERN = /^[a-z0-9_]{1,31}$/;
export const RESERVED_PROJECT_NAMES = ['kodeos', 'c5_slave'] as const;

export const SDK_DEPENDENCY = {
  component: 'kodediy/kode',
  path: 'components/kode',
  // The SDK release the v0.1.0 template pins. The template README names the
  // `version:` line as the one edit that moves an app to a newer SDK.
  templateVersion: 'v0.1.0',
  // The template pins HTTPS; the catalogue's rule B1 (tools/kcheck/rules_b.py)
  // accepts only the SSH form. Both are recorded; see the conflicting claims.
  templateGit: 'https://github.com/kodediy/kode-sdk.git',
  catalogueGit: 'git@github.com:kodediy/kode-sdk.git',
} as const;

export const PARTITION_TABLE_SETTING = 'managed_components/kodediy__kbsp/partitions.csv';

/** kode-app-template v0.1.0 tree: git blob id, SHA-256 and size of each file
 * as stored in the tagged commit (LF line endings). kode_new_app refuses a
 * template checkout whose files do not match. */
export const TEMPLATE_FILES: ReadonlyArray<{ path: string; blob: string; sha256: string; size: number; binary: boolean }> = [
  { path: '.github/workflows/build.yml', blob: '777077083a686659cbc485d7b690880fa6378996', sha256: '4fd58d263fba307ad5b83e7d88ff8fbc4a6f92cf2a84c3c85f67a5f9d91f303a', size: 727, binary: false },
  { path: '.gitignore', blob: '2eed9d5f8bb128d69d19277d14e793dac884785b', sha256: '9d5767b983aec3c07110eb3e579a3b910ca1259a58ff8c1d7eae57c9e27f3e5f', size: 354, binary: false },
  { path: 'CMakeLists.txt', blob: '890eb247ec035bc278afa5442cf96eabe51ab0fa', sha256: '215d79e568194da2edeb6ebb173977af29e7cb6801df0233574ecb231cc5eae2', size: 3673, binary: false },
  { path: 'LICENSE', blob: 'f288702d2fa16d3cdf0035b15a9fcbc552cd88e7', sha256: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986', size: 35149, binary: false },
  { path: 'README.md', blob: '74dddc6c8b2857e97a74267c9fec64743e2a6eb0', sha256: 'd7d70f36efc38c1b364eee57cd3fd0e769ad942f41735b5040a36abf39f35b49', size: 6552, binary: false },
  { path: 'appdata/app.json', blob: '19ba0bc865083feddc8abe37b8db3a93c5e939c3', sha256: 'a1a74da6eb66a71e542ea333d60dd40cf6a0dd6b2fff9da492d9017c47daa661', size: 80, binary: false },
  { path: 'appdata/icon.png', blob: '2473212b7a087425d694625cb2e433dc8c1dcc45', sha256: 'ff2c5768c222fdd9b9904a38f07991a560f76aa77e987f65e02bdce6e225d333', size: 250, binary: true },
  { path: 'appdata/screenshots/1.png', blob: 'b180d67affeb2bc45908414f09f48cb5fe265c5a', sha256: 'fbf02adf3946847e32ab5fc25a9ba822bf065e9bcb5266503619defd2feb1b13', size: 1525, binary: true },
  { path: 'main/CMakeLists.txt', blob: '13656a69239ae0e6094673fcfd6711b54ab8fdd6', sha256: 'ec09187e103ed66a84e7921a727057a5649a0fb8af35b98c01035b7a7b714fbb', size: 98, binary: false },
  { path: 'main/app_ao.c', blob: '7a6e18cb97c4899ed2cfda442996f4e465bbe3dc', sha256: '753ef87bab70b0ac610af026a38f8d89b36a056635e59ce5467abd06edb66080', size: 4809, binary: false },
  { path: 'main/app_ao.h', blob: '4c9f658a7afd813808157887a59699992845ef8a', sha256: 'e4aa690007604bc169b8d1d339729183597a47ff1986b70859ed9cb04ae9d350', size: 705, binary: false },
  { path: 'main/app_main.c', blob: 'd3ca1e50778c4741993a6f7294bb81287ee8cfdf', sha256: 'f0f1e50d07b19e14b5317b51a9bf37fe197aa1c0d7e1409abf7dff15bb133f25', size: 551, binary: false },
  { path: 'main/idf_component.yml', blob: 'f56947c8cf079b494e34267292fa40ab1e1d655c', sha256: '5601d3e742ddabeaf427245632432622cda2d236ad18f6b85e1e48286e3c6f7d', size: 729, binary: false },
  { path: 'ram_budget.txt', blob: '972affc69115e6e7728dc8082e5e14b606f64123', sha256: '271f578884d6eda3535269af34717fff5d7bdbf3c0ac56e833ad5eb1ed7c1876', size: 2991, binary: false },
  { path: 'sdkconfig.defaults', blob: '7d8606630a8506918eb1393400440a1d8a4cf0fb', sha256: 'b797345f923725c164d26193ec331134517564f5684ea8b67e32905045d1d395', size: 1502, binary: false },
];

/** The upstream README carries a manual esptool command at an offset that
 * conflicts with the partition table, so a scaffold gets a generated README
 * instead of a copy of it. */
export const TEMPLATE_FILES_NOT_COPIED = ['README.md'] as const;

/** KodeOS console tools: SHA-256 of the files as stored in each tagged commit
 * (LF). A Windows checkout with core.autocrlf=true yields different bytes. */
const KPAYLOAD = { path: 'tools/kpayload.py', blob: 'dfa0db7aaeaf696c1f25cadcc6d509e586217930', sha256: '2d422a6982a9c3a7bb545bd53c55c3e77e02a9864b81bae095375007f1690d2e' } as const;
export const CONSOLE_TOOLS = {
  'v0.1.1': {
    kcli: { path: 'tools/kcli.py', blob: 'b7240dd5ccb9aa50b9de2fa45d7bcf915fd5871b', sha256: 'a8c65236b51a904ee879c4ee1776612065417fae45eb4d15dc367c0cb737bcca' },
    kpayload: KPAYLOAD,
  },
  'v0.1.0': {
    kcli: { path: 'tools/kcli.py', blob: 'af2c0c3cf560c39b7076cb6daeb21bb3475c3ce3', sha256: '8df04628aa2b2acf09bc60d42814a573e7545cdf99f07ad0318ca723d39ca750' },
    kpayload: KPAYLOAD,
  },
} as const;

/** kcli.py subcommands, the same at v0.1.0 and v0.1.1, classified by effect.
 * Only the first group is reachable through this MCP, and only as fixed verbs. */
export const KCLI_SURFACE = [
  { verb: 'ping', effect: 'D1', exposure: 'fixed tool kode_ping' },
  { verb: 'cmd boot_info', effect: 'D1', exposure: 'fixed tool kode_boot_info' },
  { verb: 'cmd app_list', effect: 'D1', exposure: 'fixed tool kode_list_apps' },
  { verb: 'screenshot', effect: 'D1', exposure: 'fixed tool kode_capture_screen' },
  { verb: 'cmd <line>', effect: 'D2', exposure: 'never exposed: arbitrary console line' },
  { verb: 'install --dst app', effect: 'D2', exposure: 'not implemented (F2, needs authorisation)' },
  { verb: 'install --dst pending', effect: 'D2', exposure: 'not implemented' },
  { verb: 'install --dst os', effect: 'D2', exposure: 'excluded from the ordinary toolset' },
  { verb: 'install --dst c5', effect: 'D2', exposure: 'excluded: production C5 boots only Kode-signed images' },
  { verb: 'assets-install', effect: 'D2', exposure: 'not implemented' },
  { verb: 'file-put', effect: 'D2', exposure: 'not implemented' },
  { verb: 'file-get', effect: 'D1', exposure: 'not implemented (F2)' },
  { verb: 'config', effect: 'D1', exposure: 'not implemented' },
  { verb: 'config-export', effect: 'D1', exposure: 'not implemented' },
  { verb: 'config-import', effect: 'D2', exposure: 'not implemented' },
  { verb: 'appdata', effect: 'D2', exposure: 'not implemented' },
] as const;

/** kbsp/exp/src/kbsp_exp.c and kbsp/board/include/kbsp_pins.h, identical at v0.1.0 and v0.1.1. */
export const J3_POSITIONS: ReadonlyArray<{ position: number; gpio: number; adc1Channel: number | null; lowPower: boolean }> = [
  { position: 1, gpio: 8, adc1Channel: null, lowPower: true },
  { position: 2, gpio: 9, adc1Channel: null, lowPower: true },
  { position: 3, gpio: 10, adc1Channel: null, lowPower: true },
  { position: 4, gpio: 11, adc1Channel: null, lowPower: true },
  { position: 5, gpio: 12, adc1Channel: null, lowPower: true },
  { position: 6, gpio: 13, adc1Channel: null, lowPower: true },
  { position: 7, gpio: 14, adc1Channel: null, lowPower: true },
  { position: 8, gpio: 21, adc1Channel: 5, lowPower: false },
  { position: 9, gpio: 19, adc1Channel: 3, lowPower: false },
  { position: 10, gpio: 20, adc1Channel: 4, lowPower: false },
  { position: 11, gpio: 17, adc1Channel: 1, lowPower: false },
  { position: 12, gpio: 18, adc1Channel: 2, lowPower: false },
  { position: 13, gpio: 15, adc1Channel: null, lowPower: true },
  { position: 14, gpio: 16, adc1Channel: 0, lowPower: false },
];

/** kbsp_exp.h: controllers an app may take for J3 when the console is USB. */
export const J3_CONTROLLERS = [
  { kind: 'i2c', idfId: 1, note: 'I2C_NUM_1; I2C0 is the board bus and belongs to kodeOS' },
  { kind: 'spi', idfId: 2, note: 'SPI3_HOST; SPI1 is the flash, SPI2 the NFC reader' },
  { kind: 'uart', idfId: 0, note: 'UART_NUM_0; free because the console is USB Serial/JTAG' },
  { kind: 'uart', idfId: 1, note: 'UART_NUM_1' },
  { kind: 'uart', idfId: 2, note: 'UART_NUM_2' },
  { kind: 'uart', idfId: 3, note: 'UART_NUM_3' },
  { kind: 'uart', idfId: 4, note: 'UART_NUM_4' },
] as const;

/** kbsp_pins.h: pins the board itself uses. An app must not drive them. */
export const BOARD_OWNED_PINS = [
  { function: 'system I2C SDA/SCL (400 kHz)', gpios: [4, 5] },
  { function: 'IO expander INT, display and touch reset', gpios: [6, 7] },
  { function: 'top button', gpios: [35] },
  { function: 'microSD (SDMMC slot 0) and card supply', gpios: [39, 40, 41, 42, 43, 44, 22] },
  { function: 'USB Serial/JTAG D-/D+', gpios: [24, 25] },
  { function: 'dock UART TX/RX (magnetic pads)', gpios: [26, 27] },
  { function: 'I2S audio (ES8311)', gpios: [36, 34, 33, 37, 38] },
  { function: 'NFC ST25R3916B SPI and IRQ', gpios: [28, 29, 30, 31, 32] },
  { function: 'RFID LF 125 kHz', gpios: [45, 46, 54, 47] },
  { function: 'ESP32-C5 enable, wake and SDIO', gpios: [23, 2, 49, 48, 53, 52, 50, 51] },
] as const;

/** kode-sdk examples/, the same seventeen at v0.1.0 and v0.1.1. Sources to read,
 * not proof of device behaviour. */
export const SDK_EXAMPLES = [
  'arduino_hello', 'audio', 'ble_peripheral', 'buttons_led', 'console_actions',
  'display_lvgl', 'exp_bus', 'expansion_io', 'haptic', 'imu', 'ir_remote', 'mqtt',
  'network', 'nfc_read', 'power', 'rfid_read', 'storage',
] as const;
