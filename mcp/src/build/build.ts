/** kode_build: run the one fixed ESP-IDF command that compiles a project.
 *
 * Build only. The argument vector is a constant shape: the IDF Python
 * interpreter, idf.py, the project and build directories, and the verb
 * `build`. No caller text reaches it, no shell is involved, and there is no
 * code path that appends another verb. A build runs the project's and the
 * SDK's CMake code and fetches the pinned SDK over the network; it is not a
 * sandbox.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { KodeRefusal } from '../result.js';
import { IDF_SERIES, PINNED } from '../registry/sdk-contract.js';
import { inspectImage, type ImageInspection } from './image.js';
import { idfStatus } from './toolchain.js';
import { validateProject, type ValidationOutcome } from './validate.js';
import { requireProject, type HostConfig } from './workspace.js';

export type BuildProcessResult = { exitCode: number | null; timedOut: boolean; output: string };
export type BuildRunner = (
  program: string, args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<BuildProcessResult>;

/** The only verb this service can ever pass to idf.py. */
const BUILD_VERB = 'build';
const OUTPUT_TAIL = 6000;

export function buildArguments(idfPath: string, projectDir: string): string[] {
  return [join(idfPath, 'tools', 'idf.py'), '-C', projectDir, '-B', join(projectDir, 'build'), BUILD_VERB];
}

/** Runs without a shell, keeps only the tail of the output, and kills the
 * process at the deadline. Never retries. */
export const systemBuildRunner: BuildRunner = (program, args, options) => new Promise((resolve, reject) => {
  const child = spawn(program, [...args], {
    cwd: options.cwd, env: options.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let timedOut = false;
  const collect = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-OUTPUT_TAIL * 4); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => { clearTimeout(timer); resolve({ exitCode: code, timedOut, output: output.slice(-OUTPUT_TAIL) }); });
});

export type BuildOutcome = {
  projectName: string;
  stage: ImageInspection['stage'];
  command: { program: 'KODE_IDF_PYTHON'; arguments: string[] };
  toolchain: { idfVersion: string; idfCommit: string | null; idfCommitMatchesPin: boolean | null; sdkRelease: string | null };
  /** True only when the ESP-IDF commit was read and equals the pinned v6.1 commit. */
  reproduciblyPinned: boolean;
  validation: { verdict: ValidationOutcome['verdict']; warnings: number };
  inspection: ImageInspection;
  logTail: string;
  evidence: { level: 'L1'; result: 'passed'; note: string };
};

export async function buildApp(config: HostConfig, projectName: unknown, run: BuildRunner = systemBuildRunner): Promise<BuildOutcome> {
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
  const validation = await validateProject(config, name);
  if (validation.verdict !== 'pass') {
    const failed = validation.findings.filter(finding => finding.level === 'reject' && finding.status === 'fail')
      .map(finding => `${finding.rule}: ${finding.message}`);
    throw new KodeRefusal('VALIDATION_FAILED', `The project fails validation, so it was not built. ${failed.join(' ')}`);
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
    throw new KodeRefusal('BUILD_TIMEOUT', `The build exceeded ${config.buildTimeoutMs / 1000} s and was stopped. Nothing was retried.`, 'failed');
  }
  if (result.exitCode !== 0) {
    throw new KodeRefusal('BUILD_FAILED', `idf.py build exited with ${result.exitCode}. Log tail:\n${result.output}`, 'failed');
  }
  let inspection: ImageInspection;
  try {
    inspection = await inspectImage(config, name);
  } catch (error) {
    if (error instanceof KodeRefusal && error.reasonCode === 'IMAGE_NOT_FOUND') {
      throw new KodeRefusal('BUILD_OUTPUT_MISSING', `idf.py build exited 0 but build/${name}.bin is missing, so no image exists to report.`, 'failed');
    }
    throw error;
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
    inspection,
    logTail: result.output,
    evidence: {
      level: 'L1', result: 'passed',
      note: 'A build was observed on this host. This is build evidence only: it is not simulation, device or module evidence and authorises no installation.',
    },
  };
}
