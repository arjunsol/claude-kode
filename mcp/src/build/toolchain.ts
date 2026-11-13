/** kode_get_toolchain_status: what the host is configured with, read from
 * files only. No subprocess is started and no serial port is opened.
 */
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { consoleConfig } from '../kcli-readonly.js';
import { KodeRefusal } from '../result.js';
import { CONSOLE_TOOLS, IDF_SERIES, PINNED } from '../registry/sdk-contract.js';
import { loadPinnedTemplate } from './scaffold.js';
import type { HostConfig } from './workspace.js';

export type IdfStatus = {
  configured: boolean;
  version: string | null;
  seriesSupported: boolean;
  commit: string | null;
  /** null when the commit could not be read; a build is then not reproducibly pinned. */
  commitMatchesPin: boolean | null;
  pythonConfigured: boolean;
};

export type ToolchainStatus = {
  node: { version: string; supported: boolean };
  workspace: { configured: boolean; exists: boolean };
  template: { configured: boolean; matchesPinnedTag: boolean | null; detail: string };
  idf: IdfStatus;
  build: { enabled: boolean; ready: boolean; blockers: string[] };
  console: {
    readsEnabled: boolean; toolsConfigured: boolean;
    /** Which assessed kodeOS release the operator's kcli.py pin matches, if any. */
    cliPinMatchesRelease: string | null;
  };
  pinned: typeof PINNED;
};

async function isDirectory(path: string): Promise<boolean> {
  try { return isAbsolute(path) && (await stat(path)).isDirectory(); } catch { return false; }
}
async function isFile(path: string): Promise<boolean> {
  try { return isAbsolute(path) && (await stat(path)).isFile(); } catch { return false; }
}
async function readSmall(path: string): Promise<string | undefined> {
  try {
    if ((await stat(path)).size > 256 * 1024) return undefined;
    return await readFile(path, 'utf8');
  } catch { return undefined; }
}

/** ESP-IDF states its own version in tools/cmake/version.cmake. */
export async function readIdfVersion(idfPath: string): Promise<string | null> {
  const text = await readSmall(join(idfPath, 'tools', 'cmake', 'version.cmake'));
  if (!text) return null;
  const part = (name: string) => new RegExp(`set\\(\\s*IDF_VERSION_${name}\\s+(\\d+)\\s*\\)`).exec(text)?.[1];
  const major = part('MAJOR'), minor = part('MINOR'), patch = part('PATCH');
  return major !== undefined && minor !== undefined ? `${major}.${minor}.${patch ?? '0'}` : null;
}

/** The checked-out commit, from .git/HEAD and at most one loose ref. */
async function readGitHead(repository: string): Promise<string | null> {
  const head = (await readSmall(join(repository, '.git', 'HEAD')))?.trim();
  if (!head) return null;
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  const ref = /^ref: (refs\/[A-Za-z0-9._/-]+)$/.exec(head)?.[1];
  if (!ref || ref.split('/').includes('..')) return null;
  const value = (await readSmall(join(repository, '.git', ...ref.split('/'))))?.trim();
  return value && /^[a-f0-9]{40}$/.test(value) ? value : null;
}

export async function idfStatus(config: HostConfig): Promise<IdfStatus> {
  const configured = await isDirectory(config.idfPath);
  const version = configured ? await readIdfVersion(config.idfPath) : null;
  const commit = configured ? await readGitHead(config.idfPath) : null;
  const [major, minor] = (version ?? '').split('.').map(Number);
  return {
    configured, version,
    seriesSupported: major === IDF_SERIES.major && minor === IDF_SERIES.minor,
    commit,
    commitMatchesPin: commit === null ? null : commit === PINNED.idf.commit,
    pythonConfigured: await isFile(config.idfPython),
  };
}

export async function toolchainStatus(config: HostConfig, env: NodeJS.ProcessEnv = process.env): Promise<ToolchainStatus> {
  const workspaceExists = await isDirectory(config.workspaceRoot);
  let template: ToolchainStatus['template'];
  if (!config.templateDir) {
    template = { configured: false, matchesPinnedTag: null, detail: 'KODE_TEMPLATE_DIR is not set.' };
  } else {
    try {
      const check = await loadPinnedTemplate(config);
      template = { configured: true, matchesPinnedTag: true,
        detail: `Matches ${PINNED.template.repository} ${PINNED.template.tag}${check.lineEndingsNormalised ? ' after line-ending normalisation' : ''}.` };
    } catch (error) {
      template = { configured: true, matchesPinnedTag: false,
        detail: error instanceof KodeRefusal ? error.message : 'The template checkout could not be read.' };
    }
  }
  const idf = await idfStatus(config);
  const blockers: string[] = [];
  if (!config.buildEnabled) blockers.push('KODE_ENABLE_BUILD is not 1.');
  if (!workspaceExists) blockers.push('KODE_WORKSPACE_ROOT does not name an existing absolute directory.');
  if (!idf.configured) blockers.push('KODE_IDF_PATH does not name an ESP-IDF checkout.');
  else if (!idf.seriesSupported) blockers.push(`ESP-IDF ${idf.version ?? 'unknown'} is not the v${IDF_SERIES.major}.${IDF_SERIES.minor} series.`);
  if (!idf.pythonConfigured) blockers.push('KODE_IDF_PYTHON does not name the ESP-IDF Python interpreter.');

  const serial = consoleConfig(env);
  let cliPinMatchesRelease: string | null = null;
  for (const [release, tools] of Object.entries(CONSOLE_TOOLS)) {
    if (serial.cliSha256.toLowerCase() === tools.kcli.sha256) cliPinMatchesRelease = release;
  }
  const major = Number(process.versions.node.split('.')[0]);
  return {
    node: { version: process.versions.node, supported: major === 24 },
    workspace: { configured: config.workspaceRoot !== '', exists: workspaceExists },
    template, idf,
    build: { enabled: config.buildEnabled, ready: blockers.length === 0, blockers },
    console: {
      readsEnabled: serial.enabled,
      toolsConfigured: serial.toolsDir !== '' && serial.cliSha256 !== '' && serial.payloadSha256 !== '',
      cliPinMatchesRelease,
    },
    pinned: PINNED,
  };
}
