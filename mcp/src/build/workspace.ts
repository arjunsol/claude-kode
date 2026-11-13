/** Host configuration and the workspace boundary.
 *
 * Tools never accept a filesystem path. They accept a project name, and the
 * only directory a tool may read or write is `<workspace root>/<project name>`,
 * where the root comes from operator configuration. Every access is checked
 * after symlinks and junctions are resolved.
 */
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { KodeRefusal } from '../result.js';
import { PROJECT_NAME_PATTERN, RESERVED_PROJECT_NAMES } from '../registry/sdk-contract.js';

export type HostConfig = {
  workspaceRoot: string;
  templateDir: string;
  buildEnabled: boolean;
  idfPath: string;
  idfPython: string;
  buildTimeoutMs: number;
};

const DEFAULT_BUILD_TIMEOUT_S = 1800;

export function hostConfig(env: NodeJS.ProcessEnv = process.env): HostConfig {
  const seconds = Number(env.KODE_BUILD_TIMEOUT_S);
  const bounded = Number.isInteger(seconds) && seconds >= 60 && seconds <= 7200 ? seconds : DEFAULT_BUILD_TIMEOUT_S;
  return {
    workspaceRoot: env.KODE_WORKSPACE_ROOT ?? '',
    templateDir: env.KODE_TEMPLATE_DIR ?? '',
    buildEnabled: env.KODE_ENABLE_BUILD === '1',
    idfPath: env.KODE_IDF_PATH ?? '',
    idfPython: env.KODE_IDF_PYTHON ?? '',
    buildTimeoutMs: bounded * 1000,
  };
}

export function assertProjectName(name: unknown): string {
  if (typeof name !== 'string' || !PROJECT_NAME_PATTERN.test(name) ||
      (RESERVED_PROJECT_NAMES as readonly string[]).includes(name)) {
    throw new KodeRefusal('PROJECT_NAME_INVALID',
      'A project name is 1 to 31 characters of a-z, 0-9 and underscore, and is never kodeos or c5_slave.');
  }
  return name;
}

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** True when `child` is `parent` or lies beneath it. Both must be resolved paths. */
export function isInside(parent: string, child: string): boolean {
  if (samePath(parent, child)) return true;
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..');
}

export async function resolveWorkspaceRoot(config: HostConfig): Promise<string> {
  if (!config.workspaceRoot || !isAbsolute(config.workspaceRoot)) {
    throw new KodeRefusal('WORKSPACE_NOT_CONFIGURED',
      'Set KODE_WORKSPACE_ROOT to an absolute directory the operator has set aside for Kode app projects.');
  }
  try {
    const root = await realpath(config.workspaceRoot);
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory');
    return root;
  } catch {
    throw new KodeRefusal('WORKSPACE_NOT_CONFIGURED', 'KODE_WORKSPACE_ROOT does not name an existing directory.');
  }
}

export type ProjectLocation = { root: string; dir: string; name: string; exists: boolean };

/** Locate a project by name. A project directory that is a link, or that
 * resolves anywhere but directly under the root, is refused. */
export async function locateProject(config: HostConfig, projectName: unknown): Promise<ProjectLocation> {
  const name = assertProjectName(projectName);
  const root = await resolveWorkspaceRoot(config);
  const dir = join(root, name);
  let info;
  try {
    info = await lstat(dir);
  } catch {
    return { root, dir, name, exists: false };
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new KodeRefusal('WORKSPACE_ESCAPE', 'The project path is a link or not a directory; only real directories inside the workspace are used.');
  }
  const resolved = await realpath(dir);
  if (!samePath(resolved, dir)) {
    throw new KodeRefusal('WORKSPACE_ESCAPE', 'The project directory resolves outside the configured workspace.');
  }
  return { root, dir, name, exists: true };
}

export async function requireProject(config: HostConfig, projectName: unknown): Promise<ProjectLocation> {
  const location = await locateProject(config, projectName);
  if (!location.exists) {
    throw new KodeRefusal('PROJECT_NOT_FOUND', `No project named ${location.name} exists in the workspace.`);
  }
  return location;
}

/** Read one file beneath `base`, refusing links that leave it and oversized files.
 * Returns undefined when the file does not exist. */
export async function readInside(base: string, relativePath: string, maxBytes: number): Promise<Buffer | undefined> {
  const target = join(base, relativePath);
  if (!isInside(base, target)) {
    throw new KodeRefusal('WORKSPACE_ESCAPE', 'A file path left its permitted directory.');
  }
  let resolved: string;
  try {
    resolved = await realpath(target);
  } catch {
    return undefined;
  }
  if (!isInside(base, resolved)) {
    throw new KodeRefusal('WORKSPACE_ESCAPE', `${relativePath} resolves outside its permitted directory.`);
  }
  const info = await stat(resolved);
  if (!info.isFile()) return undefined;
  if (info.size > maxBytes) {
    throw new KodeRefusal('VALIDATION_FAILED', `${relativePath} is larger than the ${maxBytes} byte limit for this check.`);
  }
  return readFile(resolved);
}

export async function readTextInside(base: string, relativePath: string, maxBytes = 512 * 1024): Promise<string | undefined> {
  const bytes = await readInside(base, relativePath, maxBytes);
  return bytes?.toString('utf8');
}
