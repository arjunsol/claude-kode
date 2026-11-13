/** kode_inspect_image: read a built image and its build metadata and say, with
 * the checks shown, which stage the artefact has actually reached.
 *
 * Stages are separate facts and are never inferred from one another:
 *   1. source project       - a project directory exists
 *   2. compiled image       - a well-formed ESP32-P4 image with the expected identity
 *   3. kodeOS-install compatible - app role, manifest, size and flash plan match
 *                             the pinned SDK contract (a source-level judgement)
 *   4. device verified      - never claimed here; needs a recorded L3 run
 */
import { createHash } from 'node:crypto';
import { KodeRefusal } from '../result.js';
import {
  CATALOGUE_IMAGE_MAX, CATEGORIES, CHIP_IDS, IMAGE, MAILBOX, MANIFEST_LIMITS, PARTITIONS, REQUIRED_CHIP,
} from '../registry/sdk-contract.js';
import { isSupportedIdf } from '../registry/policy.js';
import type { BuildDigests, BuildReceipts } from './receipts.js';
import { readInside, requireProject, type HostConfig } from './workspace.js';

export type ImageCheck = { id: string; pass: boolean; detail: string };

export type ImageInspection = {
  projectName: string;
  artefact: { path: string; sizeBytes: number; sha256: string };
  header: { chipId: number; chip: string; segments: number };
  appDescriptor?: { projectName: string; version: string; idfVersion: string; buildDate: string; buildTime: string };
  manifest?: { version: number; displayName: string; categories: string[] };
  buildMetadata: {
    bootRoleApp: boolean | null;
    configuredTarget: string | null;
    flashPlan: 'mailbox_only' | 'not_mailbox_only' | 'unreadable';
    flashEntries: Array<{ offset: string; file: string }>;
  };
  size: { mailboxMax: number; fitsMailbox: boolean; catalogueMax: number; fitsCatalogue: boolean; appsRegion: number };
  checks: ImageCheck[];
  stages: {
    sourceProject: true;
    compiledImage: boolean;
    kodeosInstallCompatible: boolean;
    deviceVerified: false;
  };
  stage: 'source_project' | 'compiled_image' | 'kodeos_install_compatible';
  deviceVerification: 'NOT TESTED';
  /** True only when this server process built exactly these bytes. Files under build/ can be
   * written by anything, so their presence alone is not evidence that a build ran. */
  buildObserved: boolean;
};

/** Larger than anything the apps region could hold: refuse before reading. */
const READ_LIMIT = 16 * 1024 * 1024;
const APPS_REGION = PARTITIONS.find(partition => partition.name === 'apps')?.size ?? 0;

function cString(bytes: Buffer, offset: number, length: number): string {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end < 0 ? slice.length : end).toString('latin1');
}

/** Strings taken from build metadata are echoed at most this long. */
const ECHO_MAX = 64;
/** At most this many flash entries are reported. */
const FLASH_ENTRIES_MAX = 16;
const clip = (text: string): string => text.length > ECHO_MAX ? `${text.slice(0, ECHO_MAX - 3)}...` : text;
/** Only `0x` followed by hex digits names an offset; the value is compared numerically. */
const HEX_OFFSET = /^0x[0-9a-fA-F]+$/;

const printable = (text: string): boolean => /^[\x20-\x7e]*$/.test(text);

export type ParsedImage = {
  chipId: number; chip: string; segments: number;
  appDescriptor?: NonNullable<ImageInspection['appDescriptor']>;
  manifest?: NonNullable<ImageInspection['manifest']>;
};

/** Parse the fixed-offset prefix of an ESP image. Throws IMAGE_MALFORMED when
 * the bytes are not an ESP image at all. */
export function parseImage(bytes: Buffer): ParsedImage {
  if (bytes.length < IMAGE.headerLength || bytes[0] !== IMAGE.magic) {
    throw new KodeRefusal('IMAGE_MALFORMED', 'The file does not start with an ESP image header.');
  }
  const chipId = bytes.readUInt16LE(IMAGE.chipIdOffset);
  const parsed: ParsedImage = {
    chipId, chip: CHIP_IDS[chipId] ?? `unknown(0x${chipId.toString(16)})`, segments: bytes[1] ?? 0,
  };
  if (bytes.length >= IMAGE.manifestOffset && bytes.readUInt32LE(IMAGE.idfDescOffset) === IMAGE.idfDescMagic) {
    const descriptor = {
      version: cString(bytes, IMAGE.versionOffset, IMAGE.versionLength),
      projectName: cString(bytes, IMAGE.projectNameOffset, IMAGE.projectNameLength),
      buildTime: cString(bytes, IMAGE.timeOffset, IMAGE.timeLength),
      buildDate: cString(bytes, IMAGE.dateOffset, IMAGE.dateLength),
      idfVersion: cString(bytes, IMAGE.idfVersionOffset, IMAGE.idfVersionLength),
    };
    if (Object.values(descriptor).every(printable)) parsed.appDescriptor = descriptor;
  }
  if (bytes.length >= IMAGE.manifestOffset + 8 && bytes.readUInt32LE(IMAGE.manifestOffset) === IMAGE.manifestMagic) {
    const version = bytes.readUInt32LE(IMAGE.manifestOffset + 4);
    const categoryLength = version === 1 ? IMAGE.manifestCategoryLengthV1 : IMAGE.manifestCategoryLengthV2;
    const nameOffset = IMAGE.manifestOffset + 8;
    if ((IMAGE.manifestKnownVersions as readonly number[]).includes(version) &&
        bytes.length >= nameOffset + IMAGE.manifestNameLength + categoryLength) {
      const displayName = cString(bytes, nameOffset, IMAGE.manifestNameLength);
      const category = cString(bytes, nameOffset + IMAGE.manifestNameLength, categoryLength);
      if (printable(displayName) && printable(category)) {
        parsed.manifest = {
          version, displayName,
          categories: category.toLowerCase().split(',').map(item => item.trim()).filter(Boolean),
        };
      }
    }
  }
  return parsed;
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function inspectImage(config: HostConfig, projectName: unknown, receipts?: BuildReceipts): Promise<ImageInspection> {
  return (await inspectImageWithDigests(config, projectName, receipts)).inspection;
}

const digestOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The inspection, and the digests of the three files it was judged from, so the
 * build can record exactly what it inspected. */
export async function inspectImageWithDigests(config: HostConfig, projectName: unknown, receipts?: BuildReceipts): Promise<{ inspection: ImageInspection; digests: BuildDigests }> {
  const { dir, name } = await requireProject(config, projectName);
  const relative = `build/${name}.bin`;
  let bytes: Buffer | undefined;
  try {
    bytes = await readInside(dir, relative, READ_LIMIT);
  } catch (error) {
    if (error instanceof KodeRefusal && error.reasonCode === 'VALIDATION_FAILED') {
      throw new KodeRefusal('IMAGE_TOO_LARGE', `${relative} is larger than ${READ_LIMIT} bytes; no app image can be that size.`);
    }
    throw error;
  }
  if (!bytes) {
    throw new KodeRefusal('IMAGE_NOT_FOUND', `${relative} does not exist. The project has not produced an image; nothing was built by this call.`, 'not_verified');
  }
  const parsed = parseImage(bytes);
  const checks: ImageCheck[] = [];
  const check = (id: string, pass: boolean, detail: string) => { checks.push({ id, pass, detail }); return pass; };

  // ---- Stage 2: a compiled image for the right chip with the expected identity ----
  const chipOk = check('image.chip', parsed.chip === REQUIRED_CHIP,
    `Image header chip id 0x${parsed.chipId.toString(16).padStart(4, '0')} is ${parsed.chip}; the production main chip is ${REQUIRED_CHIP}.`);
  const descriptorOk = check('image.app_descriptor', parsed.appDescriptor !== undefined,
    parsed.appDescriptor ? `ESP-IDF app descriptor found: project ${parsed.appDescriptor.projectName}, version ${parsed.appDescriptor.version}.`
      : 'No ESP-IDF app descriptor at offset 0x20.');
  const identityOk = check('image.identity', parsed.appDescriptor?.projectName === name,
    `The image names project "${parsed.appDescriptor?.projectName ?? ''}"; the project is "${name}".`);
  const idfOk = check('image.idf_version', parsed.appDescriptor !== undefined && isSupportedIdf(parsed.appDescriptor.idfVersion.replace(/-.*$/, '')),
    `The image was built with ESP-IDF "${parsed.appDescriptor?.idfVersion ?? 'unknown'}"; the pinned SDK builds with the v6.1 series.`);
  const compiledImage = chipOk && descriptorOk && identityOk;

  // ---- Stage 3: the kodeOS app contract, judged from source-level rules ----
  // A manifest that is present but empty, or names categories the catalogue
  // does not have, is not one the catalogue would accept.
  const manifestValid = parsed.manifest !== undefined &&
    parsed.manifest.displayName.trim().length >= 1 && parsed.manifest.displayName.length <= MANIFEST_LIMITS.displayNameMax &&
    parsed.manifest.categories.length >= 1 && parsed.manifest.categories.length <= MANIFEST_LIMITS.categoriesMax &&
    new Set(parsed.manifest.categories).size === parsed.manifest.categories.length &&
    parsed.manifest.categories.every(category => (CATEGORIES as readonly string[]).includes(category));
  const manifestOk = check('app.manifest', manifestValid,
    parsed.manifest ? `KODE_APP_MANIFEST v${parsed.manifest.version}: "${parsed.manifest.displayName}" in ${parsed.manifest.categories.join(', ') || 'no categories'}${manifestValid ? '.' : `; the catalogue needs a name of 1 to ${MANIFEST_LIMITS.displayNameMax} characters with at least one that is not a space, and 1 to ${MANIFEST_LIMITS.categoriesMax} different categories from ${CATEGORIES.join(', ')}.`}`
      : 'No readable KODE_APP_MANIFEST ("KAPD") at offset 0x120: kodeOS would treat the app as unmanifested.');
  const sdkconfigBytes = await readInside(dir, 'build/config/sdkconfig.json', 2 * 1024 * 1024);
  const sdkconfig = parseJson(sdkconfigBytes?.toString('utf8'));
  const bootRoleApp = sdkconfig ? sdkconfig.KODEOS_BOOT_ROLE_APP === true : null;
  const configuredTarget = sdkconfig && typeof sdkconfig.IDF_TARGET === 'string' ? clip(sdkconfig.IDF_TARGET) : null;
  const roleOk = check('app.boot_role', bootRoleApp === true,
    bootRoleApp === null ? 'build/config/sdkconfig.json is missing or unreadable, so the boot role is unknown.'
      : `The resolved configuration has KODEOS_BOOT_ROLE_APP=${bootRoleApp}.`);
  const targetOk = check('app.configured_target', configuredTarget === REQUIRED_CHIP,
    `The resolved configuration targets ${configuredTarget ?? 'unknown'}.`);
  // The static rules (D8, C2-WATCH) read sdkconfig.defaults, and a static reading of Kconfig input
  // is never complete; the resolved configuration is where the final value is known.
  const resolvedTrue = (key: string, meaning: string, id: string) => {
    const value = sdkconfig ? sdkconfig[key] : undefined;
    const seen = !sdkconfig ? 'is unknown because build/config/sdkconfig.json is missing or unreadable'
      : value === undefined ? 'is absent'
        : typeof value === 'boolean' ? `is ${value}` : 'is not a boolean';
    return check(id, value === true, `${key} in the resolved configuration ${seen}; it must be true (${meaning}).`);
  };
  const homeHoldOk = resolvedTrue('KODEOS_HOME_HOLD', 'holding BOT returns to kodeOS', 'app.home_hold');
  const aoWatchOk = resolvedTrue('KQP_AO_WATCH', 'the Active Object watchdog is on', 'app.ao_watchdog');

  const flasherBytes = await readInside(dir, 'build/flasher_args.json', 256 * 1024);
  const flasher = parseJson(flasherBytes?.toString('utf8'));
  const flashFiles = flasher?.flash_files;
  const allEntries = flashFiles !== null && typeof flashFiles === 'object' && !Array.isArray(flashFiles)
    ? Object.entries(flashFiles as Record<string, unknown>).map(([offset, file]) => ({ offset, file: String(file) }))
    : [];
  // The judgement uses the full values; only what is echoed is capped.
  const single = allEntries.length === 1 ? allEntries[0] : undefined;
  const mailboxOnly = single !== undefined && HEX_OFFSET.test(single.offset) &&
    Number.parseInt(single.offset.slice(2), 16) === MAILBOX.offset && single.file === `${name}.bin`;
  const flashEntries = allEntries.slice(0, FLASH_ENTRIES_MAX).map(entry => ({ offset: clip(entry.offset), file: clip(entry.file) }));
  const flashPlan: ImageInspection['buildMetadata']['flashPlan'] = !flasher ? 'unreadable' : mailboxOnly ? 'mailbox_only' : 'not_mailbox_only';
  const more = allEntries.length > FLASH_ENTRIES_MAX ? ` (${allEntries.length} entries were present; only the first ${FLASH_ENTRIES_MAX} are listed)` : '';
  const flashOk = check('app.flash_plan', mailboxOnly,
    !flasher ? 'build/flasher_args.json is missing or unreadable, so the generated flash plan was not checked.'
      : mailboxOnly ? `The generated flash plan writes only ${name}.bin at the app_pending offset 0x${MAILBOX.offset.toString(16)}.`
        : `The generated flash plan is not the single mailbox entry the app role produces: ${flashEntries.map(entry => `${entry.offset}=${entry.file}`).join(', ') || 'no entries'}${more}.`);
  const fitsMailbox = bytes.length <= MAILBOX.imageMax;
  const fitsCatalogue = bytes.length <= CATALOGUE_IMAGE_MAX;
  // The flash plan of an app-role build writes only the mailbox, so an image the
  // mailbox cannot hold is not installable by the route this inspection judges.
  const sizeOk = check('app.size', fitsCatalogue && bytes.length <= APPS_REGION && (!mailboxOnly || fitsMailbox),
    `The image is ${bytes.length} bytes. Catalogue limit ${CATALOGUE_IMAGE_MAX}; mailbox limit ${MAILBOX.imageMax}${fitsMailbox ? '' : ' (too large for the mailbox route the flash plan uses)'}.`);
  const kodeosInstallCompatible = compiledImage && idfOk && manifestOk && roleOk && targetOk && homeHoldOk && aoWatchOk && flashOk && sizeOk;

  const inspection: ImageInspection = {
    projectName: name,
    artefact: { path: relative, sizeBytes: bytes.length, sha256: digestOf(bytes) },
    header: { chipId: parsed.chipId, chip: parsed.chip, segments: parsed.segments },
    buildMetadata: { bootRoleApp, configuredTarget, flashPlan, flashEntries },
    size: { mailboxMax: MAILBOX.imageMax, fitsMailbox, catalogueMax: CATALOGUE_IMAGE_MAX, fitsCatalogue, appsRegion: APPS_REGION },
    checks,
    stages: { sourceProject: true, compiledImage, kodeosInstallCompatible, deviceVerified: false },
    stage: kodeosInstallCompatible ? 'kodeos_install_compatible' : compiledImage ? 'compiled_image' : 'source_project',
    deviceVerification: 'NOT TESTED',
    buildObserved: false,
  };
  const digests: BuildDigests = {
    image: inspection.artefact.sha256,
    sdkconfigJson: sdkconfigBytes ? digestOf(sdkconfigBytes) : null,
    flasherArgs: flasherBytes ? digestOf(flasherBytes) : null,
  };
  inspection.buildObserved = receipts?.observed(name, digests) ?? false;
  if (parsed.appDescriptor) inspection.appDescriptor = parsed.appDescriptor;
  if (parsed.manifest) inspection.manifest = parsed.manifest;
  return { inspection, digests };
}
