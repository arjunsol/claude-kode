/** kode_validate: static checks of a source project against the pinned SDK
 * contract and the catalogue rules that can be decided from source alone.
 *
 * This is not the manufacturer's tools/check_app.py and does not replace it.
 * Rules that need a build, a device or a reviewer are listed as not checked.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APPDATA_LIMITS, ASSESSED_SDK_RELEASES, CATEGORIES, MANIFEST_LIMITS, PARTITION_TABLE_SETTING, PINNED,
  PROJECT_NAME_PATTERN, REQUIRED_CHIP, RESERVED_PROJECT_NAMES, SDK_DEPENDENCY, isAssessedSdkRelease,
} from '../registry/sdk-contract.js';
import { readTextInside, requireProject, type HostConfig } from './workspace.js';

export type Finding = {
  rule: string;
  level: 'reject' | 'warn';
  status: 'pass' | 'fail';
  message: string;
};

export type ValidationOutcome = {
  projectName: string;
  stage: 'source_project';
  verdict: 'pass' | 'fail';
  findings: Finding[];
  rejectsFailed: number;
  warnings: number;
  manifest?: { displayName: string; categories: string[] };
  version?: string;
  sdkRelease?: string;
  rulesNotChecked: string[];
};

/** Catalogue rules this static check cannot decide. */
const NOT_CHECKED = [
  'A1 (catalogue submodule placement)', 'A5 (full GPL text comparison)', 'B6 (image builds and is at most 8 MiB)',
  'B8 (RAM budget against the built ELF)', 'B9 (reviewer toolchain)', 'C1-C10 (run-time behaviour)',
  'C11 (secret scan of history)', 'D1-D9 (interface review and screenshots)', 'E1-E16 (code style)',
];

const stripCmakeComments = (text: string): string => text.replace(/#[^\n]*/g, '');
const stripCComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function parseKconfig(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(CONFIG_[A-Z0-9_]+)=(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) map.set(match[1], match[2].trim());
  }
  return map;
}

type Dependency = { name: string; fields: Map<string, string> };

/** The block form rule B1 requires: a name at two spaces, its fields at four. */
function parseDependencies(text: string): Dependency[] {
  const dependencies: Dependency[] = [];
  let inside = false;
  let current: Dependency | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\s*(#.*)?$/.test(line)) continue;
    if (/^dependencies:\s*$/.test(line)) { inside = true; continue; }
    if (/^\S/.test(line)) { inside = false; current = undefined; continue; }
    if (!inside) continue;
    const entry = /^ {2}([A-Za-z0-9_./-]+):\s*(.*)$/.exec(line);
    if (entry?.[1] !== undefined) {
      current = { name: entry[1], fields: new Map() };
      if (entry[2]) current.fields.set('_inline', entry[2]);
      dependencies.push(current);
      continue;
    }
    const field = /^ {4}([a-z_]+):\s*(.*)$/.exec(line);
    if (field?.[1] !== undefined && current) current.fields.set(field[1], (field[2] ?? '').replace(/^["']|["']$/g, ''));
  }
  return dependencies;
}

const FORBIDDEN_FLASH_CALLS = /\b(esp_ota_[a-z_]+|esp_partition_write|esp_partition_erase_range|esp_flash_write|esp_flash_erase_[a-z_]+|spi_flash_write|spi_flash_erase_[a-z_]+)\s*\(/;
const RAW_FLASH_COMMAND = /\b(write[-_]flash|erase[-_]flash)\b/i;
const SOURCE_LIMIT = 200;

async function listFiles(dir: string, extensions: string[]): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && extensions.some(ext => entry.name.toLowerCase().endsWith(ext)))
      .map(entry => entry.name).sort().slice(0, SOURCE_LIMIT);
  } catch {
    return [];
  }
}

export async function validateProject(config: HostConfig, projectName: unknown): Promise<ValidationOutcome> {
  const { dir, name } = await requireProject(config, projectName);
  const findings: Finding[] = [];
  const check = (rule: string, level: Finding['level'], ok: boolean, pass: string, fail: string) => {
    findings.push({ rule, level, status: ok ? 'pass' : 'fail', message: ok ? pass : fail });
    return ok;
  };
  const outcome: ValidationOutcome = {
    projectName: name, stage: 'source_project', verdict: 'fail', findings,
    rejectsFailed: 0, warnings: 0, rulesNotChecked: NOT_CHECKED,
  };

  // ---- CMakeLists.txt: identity, target and version ----
  const cmakeRaw = await readTextInside(dir, 'CMakeLists.txt');
  const cmake = stripCmakeComments(cmakeRaw ?? '');
  check('CK-FILES', 'reject', cmakeRaw !== undefined, 'CMakeLists.txt is present.', 'CMakeLists.txt is missing: this is not an ESP-IDF project.');
  const project = /\bproject\s*\(\s*([^\s)]+)/.exec(cmake);
  const projectIndex = project?.index ?? -1;
  const declared = project?.[1] ?? '';
  check('A2', 'reject',
    PROJECT_NAME_PATTERN.test(declared) && !(RESERVED_PROJECT_NAMES as readonly string[]).includes(declared) && declared === name,
    `project(${declared}) is a valid identity and matches the project directory.`,
    `project(<name>) must be 1 to 31 characters of a-z, 0-9 and _, not kodeos or c5_slave, and equal the directory name "${name}" (found "${declared}").`);
  const target = /\bset\s*\(\s*IDF_TARGET\s+"?([A-Za-z0-9_]+)"?\s*\)/.exec(cmake);
  check('B2', 'reject', target?.[1] === REQUIRED_CHIP && projectIndex >= 0 && target.index < projectIndex,
    `set(IDF_TARGET ${REQUIRED_CHIP}) comes before project().`,
    `set(IDF_TARGET ${REQUIRED_CHIP}) must come before project() (found ${target?.[1] ?? 'no target'}). The production Dot's main chip is an ESP32-P4.`);
  const version = /\bset\s*\(\s*PROJECT_VER\s+"([^"]*)"\s*\)/.exec(cmake);
  check('A6', 'reject', version !== null && /^\d+\.\d+\.\d+$/.test(version[1] ?? '') && projectIndex >= 0 && version.index < projectIndex,
    `PROJECT_VER "${version?.[1]}" is set before project().`,
    'CMakeLists.txt must set(PROJECT_VER "MAJOR.MINOR.PATCH") before project().');
  if (version?.[1]) outcome.version = version[1];
  check('B3-EXTRA', 'reject', !/\bEXTRA_COMPONENT_DIRS\b/.test(cmake),
    'The SDK is not pulled in through EXTRA_COMPONENT_DIRS.',
    'The SDK must come from the pin in main/idf_component.yml, never through EXTRA_COMPONENT_DIRS.');

  // ---- sdkconfig.defaults: role, partition table, radio trio ----
  const defaultsRaw = await readTextInside(dir, 'sdkconfig.defaults');
  const defaults = parseKconfig(defaultsRaw ?? '');
  check('B4', 'reject', defaults.get('CONFIG_KODEOS_BOOT_ROLE_APP') === 'y',
    'CONFIG_KODEOS_BOOT_ROLE_APP=y: the firmware takes the app role.',
    'sdkconfig.defaults must set CONFIG_KODEOS_BOOT_ROLE_APP=y. Without the app role, idf.py flash targets kodeOS\'s own slot.');
  check('B3', 'reject', defaults.get('CONFIG_PARTITION_TABLE_CUSTOM_FILENAME') === `"${PARTITION_TABLE_SETTING}"`,
    'The partition table comes from the fetched board support package.',
    `CONFIG_PARTITION_TABLE_CUSTOM_FILENAME must be "${PARTITION_TABLE_SETTING}".`);
  if (defaults.get('CONFIG_KODEOS_RADIO') === 'n') {
    check('B7', 'reject', defaults.get('CONFIG_ESP_HOSTED_ENABLED') === 'n' && defaults.get('CONFIG_BT_ENABLED') === 'n',
      'The radio is off together with esp-hosted and Bluetooth.',
      'CONFIG_KODEOS_RADIO=n must come with CONFIG_ESP_HOSTED_ENABLED=n and CONFIG_BT_ENABLED=n.');
  }
  check('D8', 'reject', defaults.get('CONFIG_KODEOS_HOME_HOLD') !== 'n',
    'Holding BOT still returns to kodeOS.', 'CONFIG_KODEOS_HOME_HOLD=n is refused: holding BOT must always return to kodeOS.');
  check('C2-WATCH', 'reject', defaults.get('CONFIG_KQP_AO_WATCH') !== 'n',
    'The Active Object watchdog is left on.', 'CONFIG_KQP_AO_WATCH=n is refused by the catalogue.');
  const rootFiles = await listFiles(dir, ['']);
  const targetDefaults = rootFiles.filter(file => /^sdkconfig\.defaults\..+/.test(file));
  check('B5', 'reject', targetDefaults.length === 0, 'Settings live in sdkconfig.defaults alone.',
    `Per-target defaults files are not allowed: ${targetDefaults.join(', ')}.`);

  // ---- main/idf_component.yml: the SDK pin ----
  const manifestYaml = await readTextInside(dir, 'main/idf_component.yml');
  const kodeDeps = parseDependencies(manifestYaml ?? '').filter(dep => dep.name.startsWith('kodediy/'));
  const sdkGits: readonly string[] = [SDK_DEPENDENCY.templateGit, SDK_DEPENDENCY.catalogueGit];
  const wellFormed = kodeDeps.length > 0 && kodeDeps.every(dep =>
    sdkGits.includes(dep.fields.get('git') ?? '') &&
    dep.fields.get('path') === `components/${dep.name.slice('kodediy/'.length)}` &&
    !dep.fields.has('override_path'));
  const versions = new Set(kodeDeps.map(dep => dep.fields.get('version') ?? ''));
  const pinnedRelease = versions.size === 1 ? [...versions][0] ?? '' : '';
  check('B1', 'reject', wellFormed && isAssessedSdkRelease(pinnedRelease),
    `Every kodediy dependency comes from kode-sdk at ${pinnedRelease}, an assessed release.`,
    `Every kodediy/* dependency must come from kode-sdk with path components/<name>, no override_path, all at one tag that this registry has assessed (${ASSESSED_SDK_RELEASES.join(' or ')}).`);
  if (pinnedRelease) outcome.sdkRelease = pinnedRelease;
  if (isAssessedSdkRelease(pinnedRelease) && pinnedRelease !== PINNED.sdk.tag) {
    findings.push({ rule: 'B1-RELEASE', level: 'warn', status: 'fail',
      message: `The project pins kode-sdk ${pinnedRelease}; ${PINNED.sdk.tag} is the newest assessed release. The catalogue accepts the newest release or the one before it.` });
  }
  if (kodeDeps.some(dep => dep.fields.get('git') === SDK_DEPENDENCY.templateGit)) {
    findings.push({ rule: 'B1-URL', level: 'warn', status: 'fail',
      message: 'The dependency uses the HTTPS URL the official template ships. The catalogue checker as coded accepts only the SSH URL; this upstream conflict is unresolved and matters only when publishing to the catalogue.' });
  }

  // ---- Sources: manifest and forbidden calls ----
  const sources = await listFiles(join(dir, 'main'), ['.c', '.h', '.cpp', '.hpp']);
  let manifests: RegExpMatchArray[] = [];
  const flashCallers: string[] = [];
  for (const file of sources) {
    const text = stripCComments(await readTextInside(dir, `main/${file}`) ?? '');
    manifests = manifests.concat([...text.matchAll(/\bKODE_APP_MANIFEST\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g)]);
    if (FORBIDDEN_FLASH_CALLS.test(text)) flashCallers.push(file);
  }
  const only = manifests.length === 1 ? manifests[0] : undefined;
  const displayName = only?.[1] ?? '';
  const categories = (only?.[2] ?? '').split(',').map(category => category.trim()).filter(Boolean);
  const manifestOk = only !== undefined && displayName.length >= 1 && displayName.length <= MANIFEST_LIMITS.displayNameMax &&
    categories.length >= 1 && categories.length <= MANIFEST_LIMITS.categoriesMax &&
    categories.every(category => category.length <= MANIFEST_LIMITS.categoryMax && (CATEGORIES as readonly string[]).includes(category));
  check('A3', 'reject', manifestOk,
    `KODE_APP_MANIFEST("${displayName}", "${categories.join(',')}") is declared once with catalogue categories.`,
    `Declare KODE_APP_MANIFEST("Name", "cat1,cat2") exactly once in main/: a name of up to ${MANIFEST_LIMITS.displayNameMax} characters and 1 to ${MANIFEST_LIMITS.categoriesMax} categories from ${CATEGORIES.join(', ')} (found ${manifests.length} declaration(s)).`);
  if (manifestOk) outcome.manifest = { displayName, categories };
  check('C12', 'reject', flashCallers.length === 0, 'No OTA call or direct flash write in main/.',
    `OTA calls and direct flash writes are refused: ${flashCallers.join(', ')}.`);

  // ---- appdata and licence ----
  const appJsonRaw = await readTextInside(dir, 'appdata/app.json', 16 * 1024);
  let appJsonOk = false;
  try {
    const parsed: unknown = JSON.parse(appJsonRaw ?? '');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      const value = (key: string) => (parsed as Record<string, unknown>)[key];
      appJsonOk = value('kode') === '1' &&
        entries.every(([key, item]) => (APPDATA_LIMITS.allowedKeys as readonly string[]).includes(key) &&
          typeof item === 'string' && /^[\x20-\x7e]*$/.test(item)) &&
        (value('description') === undefined || (value('description') as string).length <= APPDATA_LIMITS.descriptionMax) &&
        (value('color') === undefined || /^#[0-9a-fA-F]{6}$/.test(value('color') as string));
    }
  } catch { appJsonOk = false; }
  const icons = (await listFiles(join(dir, 'appdata'), ['.png', '.jpg']))
    .filter(file => file === 'icon.png' || file === 'icon.jpg');
  check('A4', 'reject', appJsonOk && icons.length > 0,
    'appdata/app.json is within its limits and an icon is present.',
    'appdata/app.json must hold "kode": "1" and only color, description and icon within their limits, and appdata/ must hold icon.png or icon.jpg.');
  const licence = await readTextInside(dir, 'LICENSE', 128 * 1024);
  check('A5-PRESENT', 'reject', licence !== undefined && /GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(licence),
    'LICENSE is a GNU GPL version 3 text (full-text comparison not performed).',
    'LICENSE must be the GNU GPL version 3: firmware built on the Kode SDK is GPL-3.0-or-later.');

  // ---- Claude Kode's own checks ----
  const hasPlatformio = rootFiles.includes('platformio.ini');
  const mentionsS3 = /esp32-?s3/i.test(cmake) || /esp32-?s3/i.test(defaultsRaw ?? '');
  check('CK-S3', 'reject', !hasPlatformio && !mentionsS3,
    'No ESP32-S3 prototype build files or targets.',
    'ESP32-S3 prototype material (platformio.ini or an esp32s3 target) must never be built for a production Dot.');
  const rawFlashFiles: string[] = [];
  for (const file of rootFiles.filter(candidate => /\.(md|txt|sh|ps1|cmd|bat|py)$/i.test(candidate) || candidate === 'Makefile')) {
    if (RAW_FLASH_COMMAND.test(await readTextInside(dir, file) ?? '')) rawFlashFiles.push(file);
  }
  if (rawFlashFiles.length > 0) {
    findings.push({ rule: 'CK-RAWFLASH', level: 'warn', status: 'fail',
      message: `Raw flash or erase commands appear in ${rawFlashFiles.join(', ')}. Claude Kode never runs them; the template README's offset conflicts with the partition table.` });
  }

  outcome.rejectsFailed = findings.filter(finding => finding.level === 'reject' && finding.status === 'fail').length;
  outcome.warnings = findings.filter(finding => finding.level === 'warn' && finding.status === 'fail').length;
  outcome.verdict = outcome.rejectsFailed === 0 ? 'pass' : 'fail';
  return outcome;
}
