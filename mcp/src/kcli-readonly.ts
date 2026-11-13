/** Read-only bridge to the operator-pinned official kodeOS console client
 * (v0.1.1, or the previous assessed release v0.1.0).
 * No raw console input, installer, flashing, radio, or actuator command is exposed.
 */
import { execFile, type ExecFileOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export type KodeReadOperation = 'ping' | 'boot_info' | 'app_list' | 'screenshot';
export type ConsoleConfig = {
  enabled: boolean;
  toolsDir: string;
  cliSha256: string;
  payloadSha256: string;
  port: string;
  python: string;
};
export type RunProcess = (program: string, args: string[], options: ExecFileOptions) =>
  Promise<{ stdout: string; stderr: string }>;

export class KodeConsoleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'KodeConsoleError';
  }
}

export function consoleConfig(env: NodeJS.ProcessEnv = process.env): ConsoleConfig {
  return {
    enabled: env.KODE_ENABLE_CONSOLE_READS === '1',
    toolsDir: env.KODE_TOOLS_DIR ?? '',
    cliSha256: env.KODE_CLI_SHA256 ?? '',
    payloadSha256: env.KODE_PAYLOAD_SHA256 ?? '',
    port: env.KODE_PORT ?? '',
    python: env.KODE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
  };
}

const allowed = new Set<KodeReadOperation>(['ping', 'boot_info', 'app_list', 'screenshot']);
const hexSha = /^[a-f0-9]{64}$/i;
const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maximumScreenshotBytes = 4 * 1024 * 1024;

// Windows is the only qualified host for this initial connection. No dynamic port scan.
export function canonicalPort(port: string): string {
  const match = /^COM([1-9]\d{0,2})$/i.exec(port);
  if (!match || Number(match[1]) > 256) {
    throw new KodeConsoleError('INVALID_PORT', 'Explicit Windows COM1–COM256 port required. No auto-discovery is performed.');
  }
  return `COM${Number(match[1])}`;
}

export async function validateConsoleConfig(config: ConsoleConfig): Promise<{ script: string; port: string }> {
  if (!config.enabled) {
    throw new KodeConsoleError('NOT_ENABLED', 'Serial console reads are disabled. Set KODE_ENABLE_CONSOLE_READS=1 only when a connected Dot may be reset by opening its port.');
  }
  const port = canonicalPort(config.port);
  if (!isAbsolute(config.toolsDir) || !config.python.trim()) {
    throw new KodeConsoleError('UNCONFIGURED', 'Set absolute KODE_TOOLS_DIR to an official kodeOS tools checkout at an assessed release (v0.1.1 or v0.1.0) and KODE_PYTHON to a trusted Python executable.');
  }
  if (!hexSha.test(config.cliSha256) || !hexSha.test(config.payloadSha256)) {
    throw new KodeConsoleError('NO_INTEGRITY_PIN', 'Set the SHA-256 pins for official tools/kcli.py and tools/kpayload.py before enabling console calls.');
  }
  for (const [file, expected] of [
    ['kcli.py', config.cliSha256], ['kpayload.py', config.payloadSha256],
  ] as const) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(config.toolsDir, file));
    } catch {
      throw new KodeConsoleError('TOOL_MISSING', `The pinned manufacturer's ${file} is missing or unreadable.`);
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash.toLowerCase() !== expected.toLowerCase()) {
      throw new KodeConsoleError('TOOL_HASH_MISMATCH', `Integrity mismatch for manufacturer's ${file}; no process was started.`);
    }
  }
  return { script: join(config.toolsDir, 'kcli.py'), port };
}

export const systemRunner: RunProcess = (program, args, options) => new Promise((resolve, reject) => {
  execFile(program, args, options, (error, stdout, stderr) => {
    if (error) reject(error);
    else resolve({ stdout: String(stdout), stderr: String(stderr) });
  });
});

export type ConsoleTextObservation = {
  status: 'observed';
  operation: 'ping' | 'boot_info' | 'app_list';
  evidenceClass: 'console-observation';
  hardwareIdentityVerified: false;
  output: string;
  warning: string;
};

const resetWarning = 'Opening a USB serial connection can reset the Dot. Console output is observational evidence only; it does not authorise any device-changing operation.';

/** Only four hard-coded read-only verbs are legal, even for internal callers. */
export async function readKodeConsole(
  operation: KodeReadOperation,
  config: ConsoleConfig = consoleConfig(),
  run: RunProcess = systemRunner,
): Promise<ConsoleTextObservation | { status: 'observed'; operation: 'screenshot'; pngBase64: string; warning: string }> {
  if (!allowed.has(operation)) {
    throw new KodeConsoleError('OPERATION_REFUSED', 'Only explicitly allowlisted read-only console operations are supported.');
  }
  const { script, port } = await validateConsoleConfig(config);
  let temporaryDir: string | undefined;
  try {
    const args = ['-B', script, '-p', port];
    if (operation === 'ping') args.push('ping');
    else if (operation === 'boot_info' || operation === 'app_list') args.push('cmd', operation);
    else {
      temporaryDir = await mkdtemp(join(tmpdir(), 'claude-kode-screen-'));
      args.push('screenshot', '-o', join(temporaryDir, 'screen.png'));
    }

    // execFile never invokes a shell; caller text cannot become a command, path or argument.
    const options: ExecFileOptions = {
      cwd: dirname(script), encoding: 'utf8', windowsHide: true,
      timeout: operation === 'screenshot' ? 45_000 : 15_000,
      maxBuffer: 128 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    };
    try {
      const { stdout } = await run(config.python, args, options);
      if (operation !== 'screenshot') {
        return { status: 'observed', operation, evidenceClass: 'console-observation',
          hardwareIdentityVerified: false, output: stdout.trim(), warning: resetWarning };
      }
    } catch {
      throw new KodeConsoleError('CONSOLE_FAILED', 'The read-only console command failed or timed out. Check the explicit COM port, board state and pinned tools; no retry or write was attempted.');
    }
    // Screenshots are returned through MCP and never retained in the project.
    if (!temporaryDir) throw new KodeConsoleError('INTERNAL_ERROR', 'No screenshot directory.');
    let png: Buffer;
    try { png = await readFile(join(temporaryDir, 'screen.png')); }
    catch { throw new KodeConsoleError('SCREENSHOT_MISSING', 'Console returned without a screenshot file.'); }
    if (png.length < pngMagic.length || png.length > maximumScreenshotBytes ||
        !png.subarray(0, pngMagic.length).equals(pngMagic)) {
      throw new KodeConsoleError('SCREENSHOT_INVALID', 'The screenshot was not a bounded PNG image.');
    }
    return { status: 'observed', operation: 'screenshot', pngBase64: png.toString('base64'), warning: resetWarning };
  } finally {
    if (temporaryDir) await rm(temporaryDir, { recursive: true, force: true });
  }
}
