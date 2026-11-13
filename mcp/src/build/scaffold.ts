/** kode_new_app: create a project from the operator's own checkout of the
 * official app template, after proving that checkout matches the pinned tag.
 *
 * Template files are GPL-3.0-or-later and are copied from the operator's
 * checkout into the operator's workspace at run time; none are stored in this
 * MIT package. The result is a source project and nothing more.
 */
import { createHash } from 'node:crypto';
import { mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { KodeRefusal } from '../result.js';
import {
  APPDATA_LIMITS, ASSESSED_SDK_RELEASES, CATEGORIES, MANIFEST_LIMITS, PINNED, SDK_DEPENDENCY,
  TEMPLATE_FILES, TEMPLATE_FILES_NOT_COPIED, isAssessedSdkRelease,
} from '../registry/sdk-contract.js';
import { locateProject, readInside, type HostConfig } from './workspace.js';

export type NewAppInput = {
  projectName: string;
  displayName: string;
  categories: string[];
  version?: string;
  description?: string;
  /** The kode-sdk release to pin. Defaults to the newest assessed release. */
  sdkRelease?: string;
};

export type ScaffoldedFile = { path: string; sha256: string; origin: 'template' | 'template_edited' | 'generated' };

export type NewAppOutcome = {
  projectName: string;
  stage: 'source_project';
  licence: 'GPL-3.0-or-later';
  template: { repository: string; tag: string; commit: string; lineEndingsNormalised: boolean };
  sdk: { release: string; templatePinned: string; pinChanged: boolean; note: string };
  files: ScaffoldedFile[];
  notCopied: string[];
  manifest: { displayName: string; categories: string[]; version: string };
};

const displayPattern = /^[A-Za-z0-9][A-Za-z0-9 ._\-+!#&():,']*$/;
const versionPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const descriptionPattern = /^[\x20-\x7e]*$/;
const DEFAULT_VERSION = '00.00.01';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function assertManifestInput(input: NewAppInput): { displayName: string; categories: string[]; version: string; description?: string } {
  const { displayName, categories } = input;
  if (displayName.length > MANIFEST_LIMITS.displayNameMax || !displayPattern.test(displayName)) {
    throw new KodeRefusal('MANIFEST_INPUT_INVALID',
      `A display name is 1 to ${MANIFEST_LIMITS.displayNameMax} characters, starts with a letter or digit, and uses letters, digits, spaces and . _ - + ! # & ( ) : , ' only.`);
  }
  if (categories.length < 1 || categories.length > MANIFEST_LIMITS.categoriesMax ||
      new Set(categories).size !== categories.length ||
      categories.some(category => !(CATEGORIES as readonly string[]).includes(category))) {
    throw new KodeRefusal('MANIFEST_INPUT_INVALID',
      `Give 1 to ${MANIFEST_LIMITS.categoriesMax} distinct categories from the catalogue list: ${CATEGORIES.join(', ')}.`);
  }
  const version = input.version ?? DEFAULT_VERSION;
  if (!versionPattern.test(version)) {
    throw new KodeRefusal('MANIFEST_INPUT_INVALID', 'A version is MAJOR.MINOR.PATCH in digits, for example 0.1.0.');
  }
  const result: { displayName: string; categories: string[]; version: string; description?: string } = { displayName, categories, version };
  if (input.description !== undefined) {
    if (input.description.length > APPDATA_LIMITS.descriptionMax || !descriptionPattern.test(input.description) ||
        /["\\]/.test(input.description)) {
      throw new KodeRefusal('MANIFEST_INPUT_INVALID',
        `A description is at most ${APPDATA_LIMITS.descriptionMax} printable ASCII characters without quotes or backslashes.`);
    }
    result.description = input.description;
  }
  return result;
}

export type TemplateCheck = { files: Map<string, Buffer>; lineEndingsNormalised: boolean };
/** The pinned file list. Tests pass a stand-in so no GPL template is vendored here. */
export type TemplateManifest = typeof TEMPLATE_FILES;

/** Read the template checkout and compare every file with the pinned tag.
 * A text file checked out with CRLF line endings is accepted once converted
 * back to the tagged LF bytes; anything else that differs is refused. */
export async function loadPinnedTemplate(config: HostConfig, pinnedFiles: TemplateManifest = TEMPLATE_FILES): Promise<TemplateCheck> {
  if (!config.templateDir || !isAbsolute(config.templateDir)) {
    throw new KodeRefusal('TEMPLATE_NOT_CONFIGURED',
      `Set KODE_TEMPLATE_DIR to an absolute checkout of ${PINNED.template.repository} at ${PINNED.template.tag}.`);
  }
  let base: string;
  try {
    base = await realpath(config.templateDir);
    if (!(await stat(base)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new KodeRefusal('TEMPLATE_NOT_CONFIGURED', 'KODE_TEMPLATE_DIR does not name an existing directory.');
  }
  const files = new Map<string, Buffer>();
  const mismatched: string[] = [];
  let lineEndingsNormalised = false;
  for (const expected of pinnedFiles) {
    const raw = await readInside(base, expected.path, 1024 * 1024);
    if (!raw) { mismatched.push(expected.path); continue; }
    if (sha256(raw) === expected.sha256) { files.set(expected.path, raw); continue; }
    if (!expected.binary) {
      const normalised = Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      if (sha256(normalised) === expected.sha256) {
        files.set(expected.path, normalised);
        lineEndingsNormalised = true;
        continue;
      }
    }
    mismatched.push(expected.path);
  }
  if (mismatched.length > 0) {
    throw new KodeRefusal('TEMPLATE_INTEGRITY_MISMATCH',
      `The template checkout does not match ${PINNED.template.repository} ${PINNED.template.tag} (${PINNED.template.commit.slice(0, 12)}): ${mismatched.join(', ')}. Nothing was written.`);
  }
  return { files, lineEndingsNormalised };
}

function replaceOnce(text: string, from: string, to: string, file: string): string {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + from.length) >= 0) {
    throw new KodeRefusal('INTERNAL_ERROR', `The pinned template's ${file} no longer has the expected single anchor.`, 'failed');
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function generatedReadme(name: string, manifest: { displayName: string }, sdkRelease: string): string {
  return [
    `# ${manifest.displayName}`,
    '',
    `A kodeOS app for the production Kode Dot (ESP32-P4), scaffolded by Claude Kode from ${PINNED.template.repository} ${PINNED.template.tag} (commit ${PINNED.template.commit}) and pinned to kode-sdk ${sdkRelease} in \`main/idf_component.yml\`.`,
    '',
    '## Licence',
    '',
    'GPL-3.0-or-later, like the Kode SDK this firmware links. See `LICENSE`. The SDK also brings QP/C and ST RFAL under their own terms; read the SDK\'s `NOTICE.md` before distributing a build.',
    '',
    '## Building',
    '',
    `Build with ESP-IDF v6.1 (\`idf.py build\`). The image is \`build/${name}.bin\`. A successful build is build evidence only.`,
    '',
    '## Installing',
    '',
    'Claude Kode does not install apps yet. The upstream template README of this release prints a manual esptool command whose flash offset disagrees with the partition table the same release ships, so that README was not copied here and the command must not be used. Install only through a route that has been verified on your device.',
    '',
    '## Writing the app',
    '',
    'An Active Object never blocks; waiting work goes to its `kode_worker` job, and a job never touches flash or NVS. Subscribe first, then ask an owner for its state. See the upstream template and the catalogue rules for the full list.',
    '',
  ].join('\n');
}

export async function newApp(config: HostConfig, input: NewAppInput, pinnedFiles: TemplateManifest = TEMPLATE_FILES): Promise<NewAppOutcome> {
  const location = await locateProject(config, input.projectName);
  const manifest = assertManifestInput(input);
  const sdkRelease = input.sdkRelease ?? PINNED.sdk.tag;
  if (!isAssessedSdkRelease(sdkRelease)) {
    throw new KodeRefusal('SDK_RELEASE_NOT_ASSESSED',
      `kode-sdk ${sdkRelease} has not been audited; a project can be pinned to ${ASSESSED_SDK_RELEASES.join(' or ')} only.`,
      'refused', [`Audit kode-sdk ${sdkRelease} against the registry.`]);
  }
  const pinChanged = sdkRelease !== SDK_DEPENDENCY.templateVersion;
  if (location.exists) {
    throw new KodeRefusal('PROJECT_EXISTS', `A project named ${location.name} already exists. Existing files are never overwritten.`);
  }
  const template = await loadPinnedTemplate(config, pinnedFiles);
  const name = location.name;

  const planned: Array<{ path: string; bytes: Buffer; origin: ScaffoldedFile['origin'] }> = [];
  for (const expected of pinnedFiles) {
    if ((TEMPLATE_FILES_NOT_COPIED as readonly string[]).includes(expected.path)) continue;
    const bytes = template.files.get(expected.path);
    if (!bytes) throw new KodeRefusal('INTERNAL_ERROR', 'A verified template file went missing.', 'failed');
    let text: string | undefined;
    if (expected.path === 'CMakeLists.txt') {
      text = replaceOnce(bytes.toString('utf8'), 'project(my_app)', `project(${name})`, expected.path);
      text = replaceOnce(text, 'set(PROJECT_VER "00.00.01")', `set(PROJECT_VER "${manifest.version}")`, expected.path);
    } else if (expected.path === 'main/app_main.c') {
      text = replaceOnce(bytes.toString('utf8'), 'KODE_APP_MANIFEST("My app", "tools");',
        `KODE_APP_MANIFEST("${manifest.displayName}", "${manifest.categories.join(',')}");`, expected.path);
    } else if (expected.path === 'main/idf_component.yml' && pinChanged) {
      // The one edit the template README names for moving to a newer SDK.
      text = replaceOnce(bytes.toString('utf8'), `    version: ${SDK_DEPENDENCY.templateVersion}`, `    version: ${sdkRelease}`, expected.path);
    } else if (expected.path === 'ram_budget.txt') {
      text = replaceOnce(bytes.toString('utf8'), 'build/my_app.elf', `build/${name}.elf`, expected.path);
    } else if (expected.path === 'appdata/app.json' && manifest.description !== undefined) {
      text = replaceOnce(bytes.toString('utf8'), '"description": "An empty app to start from."',
        `"description": "${manifest.description}"`, expected.path);
    }
    planned.push(text === undefined
      ? { path: expected.path, bytes, origin: 'template' }
      : { path: expected.path, bytes: Buffer.from(text, 'utf8'), origin: 'template_edited' });
  }
  planned.push({ path: 'README.md', bytes: Buffer.from(generatedReadme(name, manifest, sdkRelease), 'utf8'), origin: 'generated' });

  // The directory is created by this call (it did not exist), so a failed
  // write can remove it without touching anything that was there before.
  await mkdir(location.dir);
  try {
    for (const file of planned) {
      const target = join(location.dir, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { flag: 'wx' });
    }
  } catch (error) {
    await rm(location.dir, { recursive: true, force: true });
    if (error instanceof KodeRefusal) throw error;
    throw new KodeRefusal('INTERNAL_ERROR', 'Writing the project failed; the partial project directory was removed.', 'failed');
  }

  return {
    projectName: name,
    stage: 'source_project',
    licence: 'GPL-3.0-or-later',
    template: { ...PINNED.template, lineEndingsNormalised: template.lineEndingsNormalised },
    sdk: {
      release: sdkRelease, templatePinned: SDK_DEPENDENCY.templateVersion, pinChanged,
      note: pinChanged
        ? `The template pins kode-sdk ${SDK_DEPENDENCY.templateVersion}; the version line was moved to ${sdkRelease}, the edit its README names. This combination has not been built by Claude Kode: treat the first build as the test.`
        : `The template's own kode-sdk ${SDK_DEPENDENCY.templateVersion} pin was kept. ${PINNED.sdk.tag} is the newest assessed release.`,
    },
    files: planned.map(file => ({ path: file.path, sha256: sha256(file.bytes), origin: file.origin })),
    notCopied: [...TEMPLATE_FILES_NOT_COPIED],
    manifest: { displayName: manifest.displayName, categories: manifest.categories, version: manifest.version },
  };
}
