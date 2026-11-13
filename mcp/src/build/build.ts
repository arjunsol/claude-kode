/** kode_build: run the one fixed ESP-IDF command that compiles a project.
 *
 * What this module guarantees, and what it does not.
 * Guaranteed: the argument vector is a constant shape (the IDF Python
 * interpreter, idf.py, the project and build directories, and the verb
 * `build`); no caller text reaches it, no shell is involved, and the server
 * never passes another verb. It builds only a project whose build logic matches
 * the pinned template (validate.ts `buildLogic`), and only when the project's
 * build, managed_components and sdkconfig entries are real entries inside it.
 * Not guaranteed: a build executes CMake and Python from the SDK, from ESP-IDF
 * and from fetched components, and this server cannot constrain what those
 * scripts do, nor detect a tampered pre-existing managed_components directory.
 * The argument vector is therefore not a sandbox. Build with no Dot attached.
 */
import { execFile, spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { KodeRefusal } from '../result.js';
import type { BuildDigests, BuildReceipts } from './receipts.js';
import type { TemplateManifest } from './scaffold.js';
import { IDF_SERIES, PINNED } from '../registry/sdk-contract.js';
import { inspectImageWithDigests, type ImageInspection } from './image.js';
import { idfStatus } from './toolchain.js';
import { validateProject, type ValidationOutcome } from './validate.js';
import { assertRealEntry, requireProject, type HostConfig } from './workspace.js';

export type BuildProcessResult = {
  exitCode: number | null; timedOut: boolean; output: string;
  /** Set only when the deadline fired: whether the operating system reported that the build
   * process and the processes still attached to it were ended. A process that detached itself
   * (its parent already gone) is not reached by that and is not tracked, so this is not a
   * statement that nothing is still running. */
  attachedTreeEnded?: boolean;
};
export type BuildRunner = (
  program: string, args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<BuildProcessResult>;

/** The only verb this service can ever pass to idf.py. */
const BUILD_VERB = 'build';
const OUTPUT_TAIL = 6000;
/** Entries whose pre-existence makes a build refuse (see buildApp). */
const BUILD_STATE_ENTRIES = ['build', 'sdkconfig', 'sdkconfig.old'] as const;

export function buildArguments(idfPath: string, projectDir: string): string[] {
  return [join(idfPath, 'tools', 'idf.py'), '-C', projectDir, '-B', join(projectDir, 'build'), BUILD_VERB];
}

/** End a process and the processes still attached to it. On Windows that is
 * `taskkill /T /F` against the PID this module spawned (never an image name),
 * which follows parent links, so a process that detached itself and whose parent
 * already exited is not reached; elsewhere the child leads its own process group
 * and the group is signalled, which a process that started its own group escapes.
 * Node cannot place a child in a Windows Job Object without a native module.
 * Resolves true only when the operating system reported success. */
function killTree(pid: number | undefined): Promise<boolean> {
  if (pid === undefined) return Promise.resolve(false);
  if (process.platform === 'win32') {
    return new Promise(resolve => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15_000 }, error => resolve(error === null));
    });
  }
  try {
    process.kill(-pid, 'SIGKILL');
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

/** Runs without a shell, keeps only the tail of the output, and ends the build process and
 * what is still attached to it at the deadline. Never retries. */
export const systemBuildRunner: BuildRunner = (program, args, options) => new Promise((resolve, reject) => {
  const child = spawn(program, [...args], {
    cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  let timedOut = false;
  let settled = false;
  const finish = (result: BuildProcessResult) => {
    if (settled) return;
    settled = true;
    resolve({ ...result, output: output.slice(-OUTPUT_TAIL) });
  };
  const collect = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-OUTPUT_TAIL * 4); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const timer = setTimeout(() => {
    timedOut = true;
    // A descendant that outlives the kill can hold the pipes open, so do not
    // wait for 'close' once the kill has been attempted.
    void killTree(child.pid).then(attachedTreeEnded => {
      child.stdout.destroy();
      child.stderr.destroy();
      finish({ exitCode: null, timedOut: true, output: '', attachedTreeEnded });
    });
  }, options.timeoutMs);
  child.on('error', error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
  child.on('close', code => { clearTimeout(timer); if (!timedOut) finish({ exitCode: code, timedOut: false, output: '' }); });
});

export type BuildOutcome = {
  projectName: string;
  stage: ImageInspection['stage'];
  command: { program: 'KODE_IDF_PYTHON'; arguments: string[] };
  toolchain: { idfVersion: string; idfCommit: string | null; idfCommitMatchesPin: boolean | null; sdkRelease: string | null };
  /** True only when the ESP-IDF commit was read and equals the pinned v6.1 commit. */
  reproduciblyPinned: boolean;
  validation: { verdict: ValidationOutcome['verdict']; warnings: number };
  /** Build-logic warnings (for example a pre-existing managed_components, which cannot be verified), as `rule: message`. */
  buildLogicWarnings: string[];
  inspection: ImageInspection;
  logTail: string;
  evidence: { level: 'L1'; result: 'passed'; note: string };
};

export type BuildOptions = {
  run?: BuildRunner;
  /** Where to record the digests of the outputs this call produced. */
  receipts?: BuildReceipts;
  /** The template manifest the build gate compares the project against. */
  pinnedFiles?: TemplateManifest;
};

export async function buildApp(config: HostConfig, projectName: unknown, options: BuildOptions = {}): Promise<BuildOutcome> {
  const run = options.run ?? systemBuildRunner;
  if (!config.buildEnabled) {
    throw new KodeRefusal('BUILD_NOT_ENABLED',
      'Builds are off. A build executes project and SDK build scripts on this host; the operator enables it with KODE_ENABLE_BUILD=1.');
  }
  const { dir, name } = await requireProject(config, projectName);
  const idf = await idfStatus(config);
  if (!idf.configured || !idf.pythonConfigured || idf.version === null) {
    throw new KodeRefusal('TOOLCHAIN_NOT_CONFIGURED',
      'Set KODE_IDF_PATH to an ESP-IDF v6.1 checkout and KODE_IDF_PYTHON to its Python interpreter, and start the server from an activated ESP-IDF environment.');
  }
  if (!idf.seriesSupported) {
    throw new KodeRefusal('TOOLCHAIN_VERSION_MISMATCH',
      `ESP-IDF ${idf.version} is configured; the pinned Kode SDK builds with the v${IDF_SERIES.major}.${IDF_SERIES.minor} series (commit ${PINNED.idf.commit.slice(0, 12)}).`);
  }
  // idf.py writes through these entries, so a link here would put build output
  // (or a configuration it then reads) outside the workspace.
  await assertRealEntry(dir, 'build', 'directory');
  await assertRealEntry(dir, 'managed_components', 'directory');
  await assertRealEntry(dir, 'sdkconfig', 'file');
  // Every build is a clean build. Generated state that exists before the build
  // starts cannot be told apart from planted state: a CMakeCache.txt can pull in
  // project CMake, a junction inside build/ can send output outside the workspace,
  // and a root sdkconfig overrides sdkconfig.defaults, the only file the static
  // rules read. So refuse before validation is used and before any process starts.
  // The server never deletes these: it removes nothing it did not create in the call.
  const present: string[] = [];
  for (const entry of BUILD_STATE_ENTRIES) {
    try { await lstat(join(dir, entry)); present.push(entry); } catch { /* absent */ }
  }
  if (present.length > 0) {
    throw new KodeRefusal('BUILD_STATE_PRESENT',
      `${present.join(', ')} already exist${present.length === 1 ? 's' : ''} in the project, so it was not built. Generated state that exists before a build cannot be told apart from planted state, so every build starts clean. Remove ${present.join(', ')} yourself and build again; call kode_inspect_image first if you still need the existing build output. The server deletes nothing.`);
  }
  const validation = await validateProject(config, name, options.pinnedFiles);
  if (validation.verdict !== 'pass') {
    const failed = validation.findings.filter(finding => finding.level === 'reject' && finding.status === 'fail')
      .map(finding => `${finding.rule}: ${finding.message}`);
    throw new KodeRefusal('VALIDATION_FAILED', `The project fails validation, so it was not built. ${failed.join(' ')}`);
  }

  // Validation is a read and safe on any project; a build runs the project's
  // CMake, so it needs the stricter gate: build logic identical to the template's.
  if (!validation.buildLogic.eligible) {
    // Only the rules that made it ineligible: a warning is not a reason for refusal.
    const failed = validation.buildLogic.findings
      .filter(finding => finding.level === 'reject' && finding.status === 'fail')
      .map(finding => `${finding.rule}: ${finding.message}`);
    throw new KodeRefusal('BUILD_LOGIC_NOT_PINNED',
      `The project's build logic is not the pinned template's, so it was not built. ${failed.join(' ')}`);
  }

  const args = buildArguments(config.idfPath, dir);
  let result: BuildProcessResult;
  try {
    result = await run(config.idfPython, args, {
      cwd: dir, timeoutMs: config.buildTimeoutMs, env: { ...process.env, IDF_PATH: config.idfPath },
    });
  } catch {
    throw new KodeRefusal('BUILD_FAILED', 'The build process could not be started. Nothing was retried.', 'failed');
  }
  if (result.timedOut) {
    const limit = `The build exceeded ${config.buildTimeoutMs / 1000} s.`;
    throw new KodeRefusal('BUILD_TIMEOUT', result.attachedTreeEnded === true
      ? `${limit} The build process and the processes still attached to it were ended. A process that detached itself cannot be tracked and may still be running on this host. Nothing was retried.`
      : `${limit} Ending the build process and the processes attached to it was not confirmed, so they, and any process that detached itself, may still be running on this host. Nothing was retried.`, 'failed');
  }
  if (result.exitCode !== 0) {
    throw new KodeRefusal('BUILD_FAILED', `idf.py build exited with ${result.exitCode}. Log tail:\n${result.output}`, 'failed');
  }
  let inspection: ImageInspection;
  let digests: BuildDigests;
  try {
    ({ inspection, digests } = await inspectImageWithDigests(config, name, options.receipts));
  } catch (error) {
    if (error instanceof KodeRefusal && error.reasonCode === 'IMAGE_NOT_FOUND') {
      throw new KodeRefusal('BUILD_OUTPUT_MISSING', `idf.py build exited 0 but build/${name}.bin is missing, so no image exists to report.`, 'failed');
    }
    throw error;
  }
  // The build just produced these bytes: record them, so a later inspection of
  // the same unchanged image can say a build this server ran made it.
  if (options.receipts) {
    options.receipts.record(name, digests);
    inspection.buildObserved = true;
  }
  return {
    projectName: name,
    stage: inspection.stage,
    command: { program: 'KODE_IDF_PYTHON', arguments: args },
    toolchain: {
      idfVersion: idf.version, idfCommit: idf.commit, idfCommitMatchesPin: idf.commitMatchesPin,
      sdkRelease: validation.sdkRelease ?? null,
    },
    reproduciblyPinned: idf.commitMatchesPin === true,
    validation: { verdict: validation.verdict, warnings: validation.warnings },
    buildLogicWarnings: validation.buildLogic.findings
      .filter(finding => finding.level === 'warn' && finding.status === 'fail')
      .map(finding => `${finding.rule}: ${finding.message}`),
    inspection,
    logTail: result.output,
    evidence: {
      level: 'L1', result: 'passed',
      note: 'A build was observed on this host. This is build evidence only: it is not simulation, device or module evidence and authorises no installation.',
    },
  };
}
