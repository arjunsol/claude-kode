import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  canonicalPort, KodeConsoleError, readKodeConsole, validateConsoleConfig,
  type ConsoleConfig, type RunProcess,
} from '../src/kcli-readonly.js';

const sha = (source: string): string => createHash('sha256').update(source).digest('hex');
const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlBS7EAAAAASUVORK5CYII=', 'base64');

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ck-console-test-'));
  await writeFile(join(dir, 'kcli.py'), 'trusted console\n');
  await writeFile(join(dir, 'kpayload.py'), 'trusted payload\n');
  const config: ConsoleConfig = {
    enabled: true, port: 'COM7', toolsDir: dir,
    cliSha256: sha('trusted console\n'), payloadSha256: sha('trusted payload\n'),
    python: 'python',
  };
  return { dir, config, async close() { await rm(dir, { recursive: true, force: true }); } };
}

test('refuses operations unless the operator explicitly enables serial reads', async () => {
  const f = await fixture();
  try {
    await assert.rejects(readKodeConsole('ping', { ...f.config, enabled: false }),
      (e: unknown) => e instanceof KodeConsoleError && e.code === 'NOT_ENABLED');
  } finally { await f.close(); }
});

test('rejects unknown or unsafe ports before executing anything', async () => {
  for (const port of ['COM0', 'COM257', 'COM5 & erase', '/dev/ttyUSB0', 'COM4\\evil', '']) {
    assert.throws(() => canonicalPort(port), (e: unknown) =>
      e instanceof KodeConsoleError && e.code === 'INVALID_PORT');
  }
  assert.equal(canonicalPort('com12'), 'COM12');
});

test('requires explicit SHA-256 pins for both vendor files', async () => {
  const f = await fixture();
  try {
    await assert.rejects(validateConsoleConfig({ ...f.config, payloadSha256: '' }),
      (e: unknown) => e instanceof KodeConsoleError && e.code === 'NO_INTEGRITY_PIN');
    await writeFile(join(f.dir, 'kpayload.py'), 'modified dependency\n');
    await assert.rejects(validateConsoleConfig(f.config),
      (e: unknown) => e instanceof KodeConsoleError && e.code === 'TOOL_HASH_MISMATCH');
  } finally { await f.close(); }
});

test('only fixed ping and read-only console verbs can reach the runner', async () => {
  const f = await fixture();
  const invocations: string[][] = [];
  const runner: RunProcess = async (_command, args) => {
    invocations.push(args);
    return { stdout: '>|boot=ota_0\nok', stderr: '' };
  };
  try {
    for (const op of ['ping', 'boot_info', 'app_list'] as const) {
      const result = await readKodeConsole(op, f.config, runner);
      assert.equal(result.operation, op);
      if ('hardwareIdentityVerified' in result) {
        assert.equal(result.hardwareIdentityVerified, false);
        assert.equal(result.evidenceClass, 'console-observation');
      }
    }
    assert.deepEqual(invocations.map(argv => argv.slice(4)), [
      ['ping'], ['cmd', 'boot_info'], ['cmd', 'app_list'],
    ]);
    for (const argv of invocations) {
      assert.equal(argv[0], '-B');
      assert.equal(argv[2], '-p');
      assert.equal(argv[3], 'COM7');
      assert.ok(argv.every(value => !value.includes('erase-flash')));
    }
  } finally { await f.close(); }
});

test('runtime refuses a fabricated device-changing command', async () => {
  const f = await fixture();
  let called = false;
  try {
    await assert.rejects(
      readKodeConsole('install' as never, f.config, async () => {
        called = true;
        return { stdout: '', stderr: '' };
      }),
      (e: unknown) => e instanceof KodeConsoleError && e.code === 'OPERATION_REFUSED',
    );
    assert.equal(called, false);
  } finally { await f.close(); }
});

test('screenshots use a temporary file and return PNG data with no retained project copy', async () => {
  const f = await fixture();
  let screenshotPath = '';
  const runner: RunProcess = async (_command, argv) => {
    assert.deepEqual(argv.slice(4, 6), ['screenshot', '-o']);
    screenshotPath = argv[6]!;
    await writeFile(screenshotPath, samplePng);
    return { stdout: 'screenshot ready', stderr: '' };
  };
  try {
    const result = await readKodeConsole('screenshot', f.config, runner);
    assert.equal(result.operation, 'screenshot');
    if (result.operation === 'screenshot') {
      assert.deepEqual(Buffer.from(result.pngBase64, 'base64'), samplePng);
    }
    await assert.rejects(readFile(screenshotPath));
  } finally { await f.close(); }
});

test('rejects bogus image output and clears temporary files', async () => {
  const f = await fixture();
  let screenshotPath = '';
  const runner: RunProcess = async (_command, argv) => {
    screenshotPath = argv[6]!;
    await writeFile(screenshotPath, 'not a png');
    return { stdout: 'ok', stderr: '' };
  };
  try {
    await assert.rejects(readKodeConsole('screenshot', f.config, runner),
      (e: unknown) => e instanceof KodeConsoleError && e.code === 'SCREENSHOT_INVALID');
    await assert.rejects(readFile(screenshotPath));
  } finally { await f.close(); }
});

test('failed process never triggers an automatic retry', async () => {
  const f = await fixture();
  let called = 0;
  try {
    await assert.rejects(readKodeConsole('ping', f.config, async () => {
      called++;
      throw new Error('port unavailable');
    }), (e: unknown) => e instanceof KodeConsoleError && e.code === 'CONSOLE_FAILED');
    assert.equal(called, 1);
  } finally { await f.close(); }
});
