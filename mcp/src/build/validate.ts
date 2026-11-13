/** kode_validate: static checks of a source project against the pinned SDK
 * contract and the catalogue rules that can be decided from source alone.
 *
 * This is not the manufacturer's tools/check_app.py and does not replace it.
 * Rules that need a build, a device or a reviewer are listed as not checked.
 */
import { createHash } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { KodeRefusal } from '../result.js';
import {
  APPDATA_LIMITS, ASSESSED_SDK_RELEASES, CATEGORIES, MANIFEST_LIMITS, PARTITION_TABLE_SETTING, PINNED,
  PROJECT_NAME_PATTERN, REQUIRED_CHIP, RESERVED_PROJECT_NAMES, SDK_DEPENDENCY, TEMPLATE_FILES, isAssessedSdkRelease,
} from '../registry/sdk-contract.js';
import type { TemplateManifest } from './scaffold.js';
import { readInside, readTextInside, requireProject, type HostConfig } from './workspace.js';

export type Finding = {
  rule: string;
  level: 'reject' | 'warn';
  status: 'pass' | 'fail';
  message: string;
};

/** Whether kode_build may execute this project's build scripts. Separate from
 * `verdict`: validation is a read and is safe on any project, while a build
 * runs the project's CMake. A build is allowed only when the build logic is
 * the pinned template's, with nothing added that could run at build time. */
export type BuildLogicCheck = {
  eligible: boolean;
  findings: Finding[];
};

export type ValidationOutcome = {
  projectName: string;
  stage: 'source_project';
  verdict: 'pass' | 'fail';
  buildLogic: BuildLogicCheck;
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

/** A value taken from a project file, capped before it is echoed in a message. */
const ECHO_LIMIT = 64;
export const echo = (value: string): string => {
  const clean = value.replace(/[^\x20-\x7e]/g, '?');
  return clean.length > ECHO_LIMIT ? `${clean.slice(0, ECHO_LIMIT)}...` : clean;
};

/** Remove CMake comments in one pass: `#` to end of line, and bracket comments
 * `#[[ ... ]]` (any number of `=`), neither of which counts inside a quoted
 * argument. A regex here would be either wrong (a bracket comment hides lines
 * from the rules) or quadratic on an unclosed construct. */
function stripCmakeComments(text: string): string {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      i += 1;
      while (i < n && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i += 1;
    } else if (c === '#') {
      parts.push(text.slice(start, i));
      let eq = i + 1;
      if (text[eq] === '[') {
        eq += 1;
        while (text[eq] === '=') eq += 1;
        if (text[eq] === '[') {
          const close = `]${'='.repeat(eq - i - 2)}]`;
          const end = text.indexOf(close, eq + 1);
          i = end < 0 ? n : end + close.length;
          start = i;
          parts.push(' ');
          continue;
        }
      }
      const newline = text.indexOf('\n', i);
      i = newline < 0 ? n : newline;
      start = i;
    } else {
      i += 1;
    }
  }
  parts.push(text.slice(start));
  return parts.join('');
}

/** Remove C and C++ comments in one pass, leaving string and character
 * literals alone so a "/*" inside a string does not hide the code after it.
 * An unclosed block comment runs to the end of the file, as it does for a
 * compiler. One pass, so its cost cannot depend on how comments are nested or
 * left open. */
function stripCComments(text: string): string {
  const parts: string[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === '\'') {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = Math.min(j + 1, n);
    } else if (c === '/' && text[i + 1] === '/') {
      parts.push(text.slice(start, i));
      const newline = text.indexOf('\n', i);
      i = newline < 0 ? n : newline;
      start = i;
    } else if (c === '/' && text[i + 1] === '*') {
      parts.push(text.slice(start, i), ' ');
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      start = i;
    } else {
      i += 1;
    }
  }
  parts.push(text.slice(start));
  return parts.join('');
}

/** Drop a YAML comment (a `#` at the start of the line or after whitespace).
 * indexOf-based: the `\s+#.*$` regex this replaces was quadratic on a long
 * run of spaces (a 512 KiB line froze the server for minutes). */
function withoutYamlComment(line: string): string {
  for (let at = line.indexOf('#'); at >= 0; at = line.indexOf('#', at + 1)) {
    const before = line[at - 1];
    if (at === 0 || before === ' ' || before === '\t') return line.slice(0, at).trimEnd();
  }
  return line;
}

function parseKconfig(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(CONFIG_[A-Z0-9_]+)=(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) map.set(match[1], match[2].trim());
  }
  return map;
}

type Dependency = { name: string; fields: Map<string, string> };

/** The block form rule B1 requires: a name at two spaces, its fields at four.
 * Keys may be quoted with " or ' and may have spaces before the colon: YAML
 * reads all of those as the same key, so the rule must too. Field names are
 * lower-cased so that no spelling of override_path goes unseen. */
function parseDependencies(text: string): Dependency[] {
  const dependencies: Dependency[] = [];
  let inside = false;
  let current: Dependency | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = withoutYamlComment(raw);
    if (line.trim() === '') continue;
    if (/^dependencies:\s*$/.test(line)) { inside = true; continue; }
    if (/^\S/.test(line)) { inside = false; current = undefined; continue; }
    if (!inside) continue;
    const entry = /^ {2}(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_./-]+)) *: *(.*)$/.exec(line);
    if (entry !== null) {
      current = { name: entry[1] ?? entry[2] ?? entry[3] ?? '', fields: new Map() };
      if (entry[4]) current.fields.set('_inline', entry[4]);
      dependencies.push(current);
      continue;
    }
    const field = /^ {4}(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_]+)) *: *(.*)$/.exec(line);
    if (field !== null && current) {
      current.fields.set((field[1] ?? field[2] ?? field[3] ?? '').toLowerCase(), (field[4] ?? '').trim().replace(/^["']|["']$/g, ''));
    }
  }
  return dependencies;
}

/** Rule C12: identifiers of the OTA, flash write/erase and NVS erase families,
 * matched whole and with or without a following "(", so a function pointer
 * (`(void*)esp_partition_erase_range`) is seen too. This is a SOURCE HEURISTIC:
 * token pasting (`a##b`), a macro that builds the name, assembly, or a
 * prebuilt library can all defeat it, and it is no substitute for checking the
 * built ELF's imports. A pass means only that none of these names appears. */
const FORBIDDEN_FLASH_NAMES = /\b(?:esp_ota_\w+|esp_partition_(?:write|erase)\w*|esp_flash_(?:write|erase)\w*|spi_flash_(?:write|erase)\w*|esp_rom_spiflash_\w*(?:write|erase)\w*|bootloader_flash_(?:write|erase)\w*|nvs_flash_erase\w*)/;
/** A file is binary (and skipped by C12) when a NUL byte is in its first 8 KiB. */
const BINARY_PROBE_BYTES = 8 * 1024;
const MANIFEST_EXTENSIONS = ['.c', '.h', '.cpp', '.hpp'];
const RAW_FLASH_COMMAND = /\b(write[-_]flash|erase[-_]flash)\b/i;
const SOURCE_LIMIT = 200;
const SOURCE_TREE_FILES = 500;
const SOURCE_TREE_DEPTH = 6;
/** No file this module parses may exceed these; checked before any regex runs. */
const PARSE_FILE_LIMIT = 64 * 1024;
const PARSE_LINE_LIMIT = 4096;

function exceedsParseBounds(text: string, fileLimit = PARSE_FILE_LIMIT): boolean {
  if (text.length > fileLimit) return true;
  let position = 0;
  for (;;) {
    const newline = text.indexOf('\n', position);
    const end = newline < 0 ? text.length : newline;
    if (end - position > PARSE_LINE_LIMIT) return true;
    if (newline < 0) return false;
    position = newline + 1;
  }
}

/** Every file under main/, whatever its extension, recursively and without following links. */
async function listSourceTree(mainDir: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;
  const visit = async (rel: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(rel === '' ? mainDir : join(mainDir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth >= SOURCE_TREE_DEPTH) truncated = true; else await visit(path, depth + 1);
      } else if (entry.isFile()) {
        if (files.length >= SOURCE_TREE_FILES) { truncated = true; return; }
        files.push(path);
      }
    }
  };
  await visit('', 1);
  return { files, truncated };
}

/** Whether the file looks binary: a NUL byte in its first 8 KiB. Reads only that prefix, so
 * an image of any size is classified without being loaded or parsed. */
async function looksBinary(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return false;
  }
  try {
    const buffer = Buffer.alloc(BINARY_PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_PROBE_BYTES, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/** Backslash-newline (also CRLF) is deleted before tokenising in C, so a name split
 * by one is still that name. Linear: one pass over a bounded file. */
const joinLineSplices = (text: string): string => text.replace(/\\\r?\n/g, '');

/** Includes whose path leaves main/ via "..": the target is not scanned. */
const PARENT_INCLUDE = /^[ \t]*#[ \t]*include[ \t]*["<]([^">\r\n]*)[">]/gm;

async function listFiles(dir: string, extensions: string[]): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile() && extensions.some(ext => entry.name.toLowerCase().endsWith(ext)))
      .map(entry => entry.name).sort().slice(0, SOURCE_LIMIT);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// The build-logic gate (review findings 1 and 5).
//
// `kode_build` runs `idf.py build`, which executes the project's CMake and
// imports a project `idf_ext.py`. Static rules cannot model arbitrary CMake, so
// this gate does not try to detect bad build logic. It admits only build logic
// that is byte-for-byte the pinned template's, plus one small strict grammar
// for the one file an app legitimately edits (main/CMakeLists.txt). When in
// doubt a project is not eligible. This narrows what a build can run; it does
// not bound what the SDK's own scripts or a tampered managed_components do.
// ---------------------------------------------------------------------------

const WALK_MAX_DEPTH = 6;
const WALK_MAX_ENTRIES = 5000;
const GATE_FILE_LIMIT = 64 * 1024;
/** A built project's sdkconfig is far larger than any file the gate hashes. */
const SDKCONFIG_LIMIT = 2 * 1024 * 1024;
const TEMPLATE_PROJECT_NAME = 'my_app';
const TEMPLATE_PROJECT_VER = '00.00.01';
const REGISTER_KEYWORDS: readonly string[] = ['SRCS', 'INCLUDE_DIRS', 'REQUIRES', 'PRIV_REQUIRES'];

const toLf = (text: string): string => text.replace(/\r\n/g, '\n');
const sha256Text = (text: string): string => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

function countOf(text: string, needle: string): number {
  let count = 0;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/** Undo the two edits kode_new_app makes to CMakeLists.txt, each exactly once.
 * Returns undefined when either anchor is not present exactly once. */
export function reverseRootCmake(text: string, projectName: string): string | undefined {
  let out = toLf(text);
  const project = `project(${projectName})`;
  if (countOf(out, project) !== 1) return undefined;
  const at = out.indexOf(project);
  out = out.slice(0, at) + `project(${TEMPLATE_PROJECT_NAME})` + out.slice(at + project.length);
  const marker = 'set(PROJECT_VER "';
  if (countOf(out, marker) !== 1) return undefined;
  const start = out.indexOf(marker) + marker.length;
  const end = out.indexOf('"', start);
  if (end < 0 || out[end + 1] !== ')' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(out.slice(start, end))) return undefined;
  return out.slice(0, start) + TEMPLATE_PROJECT_VER + out.slice(end);
}

/** Undo the one edit kode_new_app makes to main/idf_component.yml: the
 * `    version:` line moved to an assessed release goes back to the template's. */
export function reverseSdkPin(text: string): string | undefined {
  const lines = toLf(text).split('\n');
  const versionLines = lines.flatMap((line, index) => (line.startsWith('    version: ') ? [index] : []));
  if (versionLines.length !== 1) return undefined;
  const index = versionLines[0] as number;
  const rest = (lines[index] as string).slice('    version: '.length);
  const space = rest.indexOf(' ');
  const release = space < 0 ? rest : rest.slice(0, space);
  if (!isAssessedSdkRelease(release)) return undefined;
  lines[index] = `    version: ${SDK_DEPENDENCY.templateVersion}${rest.slice(release.length)}`;
  return lines.join('\n');
}

/** The grammar main/CMakeLists.txt must fit: one idf_component_register(...)
 * call with only the four keywords, quoted relative names after SRCS and
 * INCLUDE_DIRS, bare identifiers after the two REQUIRES keywords. Returns why
 * it does not fit, or undefined. No regex runs over the whole file. */
export function mainCmakeProblem(text: string): string | undefined {
  if (text.includes('[')) return 'it contains a bracket, which this grammar does not allow';
  const body = toLf(text).split('\n')
    .map(line => { const hash = line.indexOf('#'); return (hash < 0 ? line : line.slice(0, hash)).trim(); })
    .filter(line => line.length > 0).join(' ');
  const call = 'idf_component_register';
  if (!body.startsWith(call)) return 'it must consist of one idf_component_register(...) call and nothing else';
  const rest = body.slice(call.length).trimStart();
  if (!rest.startsWith('(') || !rest.endsWith(')')) return 'it must consist of one idf_component_register(...) call and nothing else';
  const inner = rest.slice(1, -1);
  if (inner.includes('(') || inner.includes(')')) return 'the call contains a nested parenthesis, so more than one command may be present';
  let section = '';
  const seen = new Set<string>();
  for (const token of inner.split(/\s+/).filter(item => item.length > 0)) {
    if (REGISTER_KEYWORDS.includes(token)) {
      if (seen.has(token)) return `${token} appears twice`;
      seen.add(token);
      section = token;
      continue;
    }
    if (section === '') return `an argument comes before any keyword (${echo(token)})`;
    if (section === 'SRCS' || section === 'INCLUDE_DIRS') {
      const quoted = /^"([A-Za-z0-9_./+-]+)"$/.exec(token)?.[1];
      const segments = quoted?.split('/') ?? [];
      if (quoted === undefined || segments.some(part => part === '' || part === '..')) {
        return `${section} takes quoted relative file or directory names without .. (found ${echo(token)})`;
      }
    } else if (!/^[A-Za-z0-9_.-]+$/.test(token)) {
      return `${section} takes bare component names (found ${echo(token)})`;
    }
  }
  return undefined;
}

/** A name as Windows resolves it: case-folded, trailing dots and spaces dropped. */
function canonicalName(name: string): string {
  let end = name.length;
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end -= 1;
  return name.slice(0, end).toLowerCase();
}

type WalkResult = { extra: string[]; links: string[]; boundExceeded: boolean };

/** Walk the project without following any link, skipping only the top-level
 * build/ and managed_components/. Bounded in depth and entry count. */
async function walkProject(dir: string): Promise<WalkResult> {
  const result: WalkResult = { extra: [], links: [], boundExceeded: false };
  let entries = 0;
  const visit = async (rel: string, depth: number): Promise<void> => {
    let children;
    try {
      children = await readdir(rel === '' ? dir : join(dir, rel), { withFileTypes: true });
    } catch {
      result.boundExceeded = true; // unreadable: the walk cannot vouch for it
      return;
    }
    if (depth > WALK_MAX_DEPTH) {
      if (children.length > 0) result.boundExceeded = true;
      return;
    }
    for (const child of children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      entries += 1;
      if (entries > WALK_MAX_ENTRIES) { result.boundExceeded = true; return; }
      const path = rel === '' ? child.name : `${rel}/${child.name}`;
      const canonical = canonicalName(child.name);
      const topSegment = canonicalName(path.split('/')[0] as string);
      if (child.isSymbolicLink() && (depth === 1 || topSegment === 'main' || topSegment === 'appdata')) {
        result.links.push(path);
      }
      if (depth === 1 && (canonical === 'build' || canonical === 'managed_components')) continue;
      const lowerPath = path.split('/').map(canonicalName).join('/');
      // Kconfig* files are refused as a PRECAUTION, not a demonstrated exploit: upstream
      // kconfiglib has a preprocessor with a shell function, and whether ESP-IDF's
      // variant runs it could not be checked (ESP-IDF was not installed). The official
      // template has no Kconfig file, so a project from it is unaffected.
      if (canonical === 'idf_ext.py' || canonical.endsWith('.cmake') || canonical.startsWith('sdkconfig.defaults.') ||
          (!child.isDirectory() && canonical.startsWith('kconfig')) ||
          (canonical === 'cmakelists.txt' && lowerPath !== 'cmakelists.txt' && lowerPath !== 'main/cmakelists.txt') ||
          (depth === 1 && canonical === 'components')) {
        result.extra.push(path);
      }
      if (child.isDirectory()) await visit(path, depth + 1);
      if (result.boundExceeded && entries > WALK_MAX_ENTRIES) return;
    }
  };
  await visit('', 1);
  return result;
}

/** Read a gate file within the gate's own bound; `tooBig` rather than a refusal. */
async function readGateFile(dir: string, rel: string, limit = GATE_FILE_LIMIT): Promise<{ text?: string; tooBig: boolean }> {
  try {
    const bytes = await readInside(dir, rel, limit);
    if (bytes === undefined) return { tooBig: false };
    const text = bytes.toString('utf8');
    return exceedsParseBounds(text, limit) ? { tooBig: true } : { text, tooBig: false };
  } catch (error) {
    if (error instanceof KodeRefusal && error.reasonCode === 'VALIDATION_FAILED') return { tooBig: true };
    throw error;
  }
}

/** The sdkconfig lines that set `key`, whichever spelling: a value or "is not set". */
function kconfigAssignments(text: string, key: string): string[] {
  return text.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .filter(line => line.startsWith(`${key}=`) || line === `# ${key} is not set`);
}

async function checkBuildLogic(dir: string, name: string, pinnedFiles: TemplateManifest): Promise<BuildLogicCheck> {
  const findings: Finding[] = [];
  const gate = (rule: string, ok: boolean, pass: string, fail: string) =>
    findings.push({ rule, level: 'reject', status: ok ? 'pass' : 'fail', message: ok ? pass : fail });
  const pinnedHash = (path: string) => pinnedFiles.find(file => file.path === path)?.sha256;

  // 1. Root CMakeLists.txt is the template's, once the scaffold edits are undone.
  const root = await readGateFile(dir, 'CMakeLists.txt');
  const rootReversed = root.text === undefined ? undefined : reverseRootCmake(root.text, name);
  const rootHash = pinnedHash('CMakeLists.txt');
  gate('BL-ROOT-CMAKE', rootReversed !== undefined && rootHash !== undefined && sha256Text(rootReversed) === rootHash,
    'CMakeLists.txt is the pinned template\'s apart from the project name and version.',
    root.tooBig ? `CMakeLists.txt is over ${GATE_FILE_LIMIT} bytes, so it is not the pinned template's.`
      : root.text === undefined ? 'CMakeLists.txt is missing.'
        : rootHash === undefined ? 'The pinned template list has no CMakeLists.txt to compare with.'
          : 'CMakeLists.txt differs from the pinned template\'s beyond the project name and version. A build runs it, so only the pinned file is built.');

  // 2. The SDK pin file is the template's, once the release line is undone.
  const yml = await readGateFile(dir, 'main/idf_component.yml');
  const ymlReversed = yml.text === undefined ? undefined : reverseSdkPin(yml.text);
  const ymlHash = pinnedHash('main/idf_component.yml');
  gate('BL-SDK-PIN', ymlReversed !== undefined && ymlHash !== undefined && sha256Text(ymlReversed) === ymlHash,
    'main/idf_component.yml is the pinned template\'s apart from an assessed release on the version line.',
    yml.tooBig ? `main/idf_component.yml is over ${GATE_FILE_LIMIT} bytes, so it is not the pinned template's.`
      : yml.text === undefined ? 'main/idf_component.yml is missing.'
        : 'main/idf_component.yml differs from the pinned template\'s beyond the assessed release on its version line.');

  // 3. main/CMakeLists.txt fits the strict grammar.
  const mainCmake = await readGateFile(dir, 'main/CMakeLists.txt');
  const mainProblem = mainCmake.text === undefined ? undefined : mainCmakeProblem(mainCmake.text);
  gate('BL-MAIN-CMAKE', mainCmake.text !== undefined && mainProblem === undefined,
    'main/CMakeLists.txt is one idf_component_register call with plain relative names.',
    mainCmake.tooBig ? `main/CMakeLists.txt is over ${GATE_FILE_LIMIT} bytes.`
      : mainCmake.text === undefined ? 'main/CMakeLists.txt is missing.'
        : `main/CMakeLists.txt is outside the allowed form: ${mainProblem}.`);

  // 4 and 6. Nothing else that a build would load, and no links.
  const walk = await walkProject(dir);
  gate('BL-EXTRA-BUILD-FILE', walk.extra.length === 0,
    'No idf_ext.py, .cmake file, Kconfig* file, extra CMakeLists.txt, components/ directory or per-target defaults file.',
    `These files would be loaded by a build and are not part of the pinned template: ${walk.extra.slice(0, 10).map(echo).join(', ')}${walk.extra.length > 10 ? ' and more' : ''}.`);
  gate('BL-LINK', walk.links.length === 0,
    'No top-level entry, and nothing in main/ or appdata/, is a link.',
    `Links are not allowed at the top level or in main/ and appdata/: ${walk.links.slice(0, 10).map(echo).join(', ')}.`);
  gate('BL-WALK-BOUND', !walk.boundExceeded,
    `The project was inspected completely (up to ${WALK_MAX_DEPTH} levels and ${WALK_MAX_ENTRIES} entries).`,
    `The project is deeper than ${WALK_MAX_DEPTH} levels, has more than ${WALK_MAX_ENTRIES} entries, or could not be read, so it could not be inspected completely.`);

  // 5. A root sdkconfig overrides sdkconfig.defaults; it must keep the app role and the chip.
  const sdkconfig = await readGateFile(dir, 'sdkconfig', SDKCONFIG_LIMIT);
  let sdkconfigOk = true;
  let sdkconfigWhy = '';
  if (sdkconfig.tooBig) {
    sdkconfigOk = false; sdkconfigWhy = `sdkconfig is over ${SDKCONFIG_LIMIT} bytes.`;
  } else if (sdkconfig.text !== undefined) {
    const text = sdkconfig.text;
    if (text.split('\n').some(line => line.length > 4096)) {
      sdkconfigOk = false; sdkconfigWhy = 'sdkconfig has a line over 4096 characters.';
    } else {
      const role = kconfigAssignments(text, 'CONFIG_KODEOS_BOOT_ROLE_APP');
      const chip = kconfigAssignments(text, 'CONFIG_IDF_TARGET');
      sdkconfigOk = role.length === 1 && role[0] === 'CONFIG_KODEOS_BOOT_ROLE_APP=y' &&
        chip.length === 1 && chip[0] === `CONFIG_IDF_TARGET="${REQUIRED_CHIP}"`;
      if (!sdkconfigOk) sdkconfigWhy = `sdkconfig must set CONFIG_KODEOS_BOOT_ROLE_APP=y and CONFIG_IDF_TARGET="${REQUIRED_CHIP}" exactly once each.`;
    }
  }
  gate('BL-SDKCONFIG', sdkconfigOk,
    sdkconfig.text === undefined ? 'There is no root sdkconfig to override sdkconfig.defaults.' : 'The root sdkconfig keeps the app role and the esp32p4 target.',
    sdkconfigWhy);

  // Not decidable here: say so, without making the project ineligible.
  for (const unverifiable of ['managed_components', 'dependencies.lock']) {
    let present = true;
    try { await lstat(join(dir, unverifiable)); } catch { present = false; }
    if (present) {
      findings.push({ rule: 'BL-UNVERIFIABLE', level: 'warn', status: 'fail',
        message: `${unverifiable} already exists. The server cannot verify what it holds, and a build uses it; delete it to have it fetched again from the pin.` });
    }
  }
  return { eligible: findings.every(finding => finding.level !== 'reject' || finding.status === 'pass'), findings };
}

export async function validateProject(config: HostConfig, projectName: unknown, pinnedFiles: TemplateManifest = TEMPLATE_FILES): Promise<ValidationOutcome> {
  const { dir, name } = await requireProject(config, projectName);
  const findings: Finding[] = [];
  const check = (rule: string, level: Finding['level'], ok: boolean, pass: string, fail: string) => {
    findings.push({ rule, level, status: ok ? 'pass' : 'fail', message: ok ? pass : fail });
    return ok;
  };
  // Every text file this module parses goes through here first: over the size or
  // line bound it is not parsed at all (no regex touches it) and CK-FILE-BOUND says so.
  const unparsed: string[] = [];
  const readParsed = async (rel: string): Promise<string | undefined> => {
    let text: string | undefined;
    try {
      text = await readTextInside(dir, rel, PARSE_FILE_LIMIT);
    } catch (error) {
      if (!(error instanceof KodeRefusal) || error.reasonCode !== 'VALIDATION_FAILED') throw error;
      if (!unparsed.includes(rel)) unparsed.push(rel);
      return undefined;
    }
    if (text !== undefined && exceedsParseBounds(text)) { if (!unparsed.includes(rel)) unparsed.push(rel); return undefined; }
    return text;
  };
  const outcome: ValidationOutcome = {
    projectName: name, stage: 'source_project', verdict: 'fail',
    buildLogic: { eligible: false, findings: [] },
    findings,
    rejectsFailed: 0, warnings: 0, rulesNotChecked: NOT_CHECKED,
  };

  // ---- CMakeLists.txt: identity, target and version ----
  const cmakeRaw = await readParsed('CMakeLists.txt');
  const cmake = stripCmakeComments(cmakeRaw ?? '');
  check('CK-FILES', 'reject', cmakeRaw !== undefined, 'CMakeLists.txt is present.', unparsed.includes('CMakeLists.txt') ? 'CMakeLists.txt is over the parse bounds and was not read.' : 'CMakeLists.txt is missing: this is not an ESP-IDF project.');
  const project = /\bproject\s*\(\s*([^\s)]+)/.exec(cmake);
  const projectIndex = project?.index ?? -1;
  const declared = project?.[1] ?? '';
  check('A2', 'reject',
    PROJECT_NAME_PATTERN.test(declared) && !(RESERVED_PROJECT_NAMES as readonly string[]).includes(declared) && declared === name,
    `project(${echo(declared)}) is a valid identity and matches the project directory.`,
    `project(<name>) must be 1 to 31 characters of a-z, 0-9 and _, not kodeos or c5_slave, and equal the directory name "${name}" (found "${echo(declared)}").`);
  // Every set(IDF_TARGET ...) counts, not only the first: a later one wins in CMake.
  const targets = [...cmake.matchAll(/\bset\s*\(\s*IDF_TARGET\s+"?([A-Za-z0-9_]+)"?\s*\)/gi)];
  const targetMentions = [...cmake.matchAll(/\bset\s*\(\s*IDF_TARGET\b/gi)].length;
  const first = targets[0];
  const otherTargets = [...new Set(targets.map(match => match[1] ?? '').filter(chip => chip !== REQUIRED_CHIP))];
  check('B2', 'reject', first !== undefined && targets.length === targetMentions && otherTargets.length === 0 &&
      projectIndex >= 0 && first.index < projectIndex,
    `set(IDF_TARGET ${REQUIRED_CHIP}) comes before project(), and no set(IDF_TARGET) names another chip.`,
    `set(IDF_TARGET ${REQUIRED_CHIP}) must come before project(), and every set(IDF_TARGET ...) must name it (found ${first === undefined ? 'no target' : otherTargets.length > 0 ? otherTargets.map(echo).join(', ') : targets.length !== targetMentions ? 'a form this check cannot read' : 'it after project()'}). The production Dot's main chip is an ESP32-P4.`);
  const version = /\bset\s*\(\s*PROJECT_VER\s+"([^"]*)"\s*\)/.exec(cmake);
  check('A6', 'reject', version !== null && /^\d+\.\d+\.\d+$/.test(version[1] ?? '') && projectIndex >= 0 && version.index < projectIndex,
    `PROJECT_VER "${echo(version?.[1] ?? '')}" is set before project().`,
    'CMakeLists.txt must set(PROJECT_VER "MAJOR.MINOR.PATCH") before project().');
  if (version?.[1]) outcome.version = version[1];
  check('B3-EXTRA', 'reject', !/\bEXTRA_COMPONENT_DIRS\b/.test(cmake),
    'The SDK is not pulled in through EXTRA_COMPONENT_DIRS.',
    'The SDK must come from the pin in main/idf_component.yml, never through EXTRA_COMPONENT_DIRS.');

  // ---- sdkconfig.defaults: role, partition table, radio trio ----
  const defaultsRaw = await readParsed('sdkconfig.defaults');
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
    `Per-target defaults files are not allowed: ${targetDefaults.slice(0, 10).map(echo).join(', ')}.`);

  // ---- main/idf_component.yml: the SDK pin ----
  const manifestYaml = await readParsed('main/idf_component.yml');
  const kodeDeps = parseDependencies(manifestYaml ?? '').filter(dep => dep.name.startsWith('kodediy/'));
  const sdkGits: readonly string[] = [SDK_DEPENDENCY.templateGit, SDK_DEPENDENCY.catalogueGit];
  const wellFormed = kodeDeps.length > 0 && kodeDeps.every(dep =>
    sdkGits.includes(dep.fields.get('git') ?? '') &&
    dep.fields.get('path') === `components/${dep.name.slice('kodediy/'.length)}` &&
    !dep.fields.has('override_path') && !dep.fields.has('_inline'));
  // Any spelling of override_path outside a comment rejects: a quoted or spaced
  // key is still that key. Comments are excluded because the official template's
  // own manifest explains override_path in one.
  const overridePresent = (manifestYaml ?? '').split(/\r?\n/)
    .some(line => withoutYamlComment(line).toLowerCase().includes('override_path'));
  const versions = new Set(kodeDeps.map(dep => dep.fields.get('version') ?? ''));
  const pinnedRelease = versions.size === 1 ? [...versions][0] ?? '' : '';
  check('B1', 'reject', wellFormed && !overridePresent && isAssessedSdkRelease(pinnedRelease),
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
  const tree = await listSourceTree(join(dir, 'main'));
  let manifests: RegExpMatchArray[] = [];
  const flashCallers: string[] = [];
  const unscanned: string[] = [];
  const leavingMain: string[] = [];
  for (const file of tree.files) {
    if (await looksBinary(join(dir, 'main', file))) continue;
    const raw = await readParsed(`main/${file}`);
    if (raw === undefined) { unscanned.push(file); continue; }
    const text = stripCComments(joinLineSplices(raw));
    if ([...text.matchAll(PARENT_INCLUDE)].some(match => (match[1] ?? '').includes('..'))) leavingMain.push(file);
    // The manifest macro is looked for where it always was: the top level of main/.
    if (!file.includes('/') && MANIFEST_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext))) {
      manifests = manifests.concat([...text.matchAll(/\bKODE_APP_MANIFEST\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/g)]);
    }
    if (FORBIDDEN_FLASH_NAMES.test(text)) flashCallers.push(file);
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
  const c12Caveat = 'This is a source heuristic: token pasting, a macro that builds the name or a prebuilt library can defeat it, and it does not replace checking the built ELF.';
  const c12Gaps = tree.truncated || unscanned.length > 0;
  check('C12', 'reject', flashCallers.length === 0 && !c12Gaps,
    `No OTA, flash write/erase or NVS erase identifier appears in the text file(s) under main/ (${tree.files.length} file(s) listed; binary files are skipped). ${c12Caveat}`,
    flashCallers.length > 0
      ? `OTA, flash write/erase and NVS erase identifiers are refused: ${flashCallers.slice(0, 10).map(echo).join(', ')}. ${c12Caveat}`
      : `main/ could not be scanned completely (${unscanned.length} file(s) over the parse bounds, or more than ${SOURCE_TREE_FILES} files or ${SOURCE_TREE_DEPTH} levels), so C12 cannot pass. ${c12Caveat}`);

  if (leavingMain.length > 0) {
    findings.push({ rule: 'C12-INCLUDE', level: 'warn', status: 'fail',
      message: `A source under main/ includes a path containing "..": ${leavingMain.slice(0, 10).map(echo).join(', ')}. Files outside main/ are not scanned by C12, so a flash call there would not be seen.` });
  }

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
  const licence = await readParsed('LICENSE');
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
    if (RAW_FLASH_COMMAND.test(await readParsed(file) ?? '')) rawFlashFiles.push(file);
  }
  if (rawFlashFiles.length > 0) {
    findings.push({ rule: 'CK-RAWFLASH', level: 'warn', status: 'fail',
      message: `Raw flash or erase commands appear in ${rawFlashFiles.slice(0, 10).map(echo).join(', ')}. Claude Kode never runs them; the template README's offset conflicts with the partition table.` });
  }

  for (const file of unparsed) {
    findings.push({ rule: 'CK-FILE-BOUND', level: 'reject', status: 'fail',
      message: `${echo(file)} is over ${PARSE_FILE_LIMIT} bytes or has a line over ${PARSE_LINE_LIMIT} characters, so it was not parsed.` });
  }
  outcome.buildLogic = await checkBuildLogic(dir, name, pinnedFiles);
  outcome.rejectsFailed = findings.filter(finding => finding.level === 'reject' && finding.status === 'fail').length;
  outcome.warnings = findings.filter(finding => finding.level === 'warn' && finding.status === 'fail').length;
  outcome.verdict = outcome.rejectsFailed === 0 ? 'pass' : 'fail';
  return outcome;
}
