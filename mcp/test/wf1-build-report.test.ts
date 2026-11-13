/** What a build reports is what is known: the resolved configuration (F2) and a finished build that is not a timeout (F4). */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp, systemBuildRunner, type BuildProcessResult } from '../src/build/build.js';
import { inspectImage } from '../src/build/image.js';
import { newApp } from '../src/build/scaffold.js';
import { KodeRefusal } from '../src/result.js';
import { buildOutputs, fakeIdf, fakeImage, hostConfigFor, standInTemplate, tempDir, writeFiles } from './helpers.js';

async function workspace() {
  const temp = await tempDir('ck-wf1br-');
  const root = join(temp.dir, 'workspace');
  await mkdir(root);
  return { ...temp, root };
}

async function inspectWith(options: Parameters<typeof buildOutputs>[2]) {
  const ws = await workspace();
  try {
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', fakeImage({ project: 'demo_app' }), options));
    return await inspectImage(hostConfigFor({ workspaceRoot: ws.root }), 'demo_app');
  } finally { await ws.close(); }
}

const failedIds = (inspection: Awaited<ReturnType<typeof inspectWith>>) => inspection.checks.filter(check => !check.pass).map(check => check.id);

// ---- A. the resolved configuration ----

test('both settings true in the resolved configuration: install-compatible, 13 checks, none fail', async () => {
  const inspection = await inspectWith({});
  assert.equal(inspection.stage, 'kodeos_install_compatible');
  assert.deepEqual(failedIds(inspection), []);
  assert.equal(inspection.checks.length, 13);
});

for (const [key, option, id] of [['KODEOS_HOME_HOLD', 'homeHold', 'app.home_hold'], ['KQP_AO_WATCH', 'aoWatch', 'app.ao_watchdog']] as const) {
  for (const [label, value] of [['absent', null], ['false', false], ['the string "true"', 'true']] as const) {
    test(`${key} ${label} in sdkconfig.json: compiled_image and ${id} fails`, async () => {
      const inspection = await inspectWith({ [option]: value });
      assert.equal(inspection.stage, 'compiled_image');
      assert.equal(inspection.stages.kodeosInstallCompatible, false);
      assert.deepEqual(failedIds(inspection), [id]);
      assert.match(inspection.checks.find(check => check.id === id)!.detail, new RegExp(key));
    });
  }
}

test('an unreadable or missing sdkconfig.json fails both new checks and says so', async () => {
  const ws = await workspace();
  try {
    const outputs = buildOutputs('demo_app', fakeImage({ project: 'demo_app' }));
    delete outputs['build/config/sdkconfig.json'];
    await writeFiles(join(ws.root, 'demo_app'), outputs);
    const inspection = await inspectImage(hostConfigFor({ workspaceRoot: ws.root }), 'demo_app');
    assert.equal(inspection.stage, 'compiled_image');
    for (const id of ['app.home_hold', 'app.ao_watchdog']) {
      const check = inspection.checks.find(entry => entry.id === id)!;
      assert.equal(check.pass, false);
      assert.match(check.detail, /missing or unreadable/);
    }
  } finally { await ws.close(); }
});

const realBuildDir = process.env.KODE_TEST_REAL_BUILD_DIR;
test('a real build directory (KODE_TEST_REAL_BUILD_DIR) inspects as install-compatible with every check passing', async (t) => {
  if (!realBuildDir) { t.skip('set KODE_TEST_REAL_BUILD_DIR to the build directory of a real build of the unmodified template to run this'); return; }
  const project = realBuildDir.replace(/\\/g, '/').split('/').slice(-2)[0]!;
  const ws = await workspace();
  try {
    const target = join(ws.root, project, 'build');
    mkdirSync(join(target, 'config'), { recursive: true });
    copyFileSync(join(realBuildDir, `${project}.bin`), join(target, `${project}.bin`));
    copyFileSync(join(realBuildDir, 'config', 'sdkconfig.json'), join(target, 'config', 'sdkconfig.json'));
    copyFileSync(join(realBuildDir, 'flasher_args.json'), join(target, 'flasher_args.json'));
    const inspection = await inspectImage(hostConfigFor({ workspaceRoot: ws.root }), project);
    assert.deepEqual(failedIds(inspection), []);
    assert.equal(inspection.stage, 'kodeos_install_compatible');
  } finally { await ws.close(); }
});

// ---- B. a finished build is not a timeout ----

const holder = (sleepMs: number, pidFile: string, exitCode: number) =>
  `const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${sleepMs})'], { stdio: 'inherit', detached: true, windowsHide: true });`
  + ` require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); c.unref(); console.log('compiled line'); process.exit(${exitCode});`;

function endByPid(pidFile: string) {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch { /* already gone, or never written */ }
}

for (const exitCode of [0, 3]) {
  test(`a build that exits ${exitCode} while something it started holds the output open is reported by its exit code`, async () => {
    const ws = await workspace();
    const pidFile = join(ws.dir, 'holder.pid');
    try {
      const started = performance.now();
      const result = await systemBuildRunner(process.execPath, ['-e', holder(8000, pidFile, exitCode)], { cwd: process.cwd(), env: process.env, timeoutMs: 15_000 });
      assert.ok(performance.now() - started < 5000, 'the runner waited for the holder instead of the drain');
      assert.equal(result.timedOut, false);
      assert.equal(result.exitCode, exitCode);
      assert.match(result.output, /compiled line/);
      assert.equal(result.outputHeldOpen, true);
    } finally { endByPid(pidFile); await ws.close(); }
  });
}

test('a normal exit has its full output and no outputHeldOpen', async () => {
  const ws = await workspace();
  try {
    const result = await systemBuildRunner(process.execPath, ['-e', "console.log('one'); console.error('two')"], { cwd: ws.dir, env: process.env, timeoutMs: 15_000 });
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.ok(!result.outputHeldOpen);
    assert.match(result.output, /one/);
    assert.match(result.output, /two/);
  } finally { await ws.close(); }
});

test('a process that never exits is still a timeout with no exit code', async () => {
  const ws = await workspace();
  try {
    const result = await systemBuildRunner(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: ws.dir, env: process.env, timeoutMs: 500 });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, null);
    assert.ok(!result.outputHeldOpen);
  } finally { await ws.close(); }
});

async function buildFixture() {
  const ws = await workspace();
  const idf = await fakeIdf(ws.dir, [6, 1, 0]);
  const templateDir = join(ws.dir, 'template');
  const standIn = standInTemplate();
  await writeFiles(templateDir, standIn.files);
  const config = hostConfigFor({ workspaceRoot: ws.root, templateDir, buildEnabled: true, ...idf });
  await newApp(config, { projectName: 'demo_app', displayName: 'Demo app', categories: ['tools'] }, standIn.manifest);
  return { ...ws, config, pinnedFiles: standIn.manifest, project: join(ws.root, 'demo_app') };
}

const SENTENCE = /Something the build started still held the build's output open after the build process exited; it was not ended and may still be running on this host/;

test('buildApp: exit 0 with the output held open goes on to inspection and carries the fact and the sentence', async () => {
  const f = await buildFixture();
  try {
    const outcome = await buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async (): Promise<BuildProcessResult> => {
        await writeFiles(f.project, buildOutputs('demo_app', fakeImage({ project: 'demo_app' })));
        return { exitCode: 0, timedOut: false, output: 'ok', outputHeldOpen: true };
      },
    });
    assert.equal(outcome.outputHeldOpen, true);
    assert.equal(outcome.stage, 'kodeos_install_compatible');
    const { buildMessage } = await import('../src/tools/build-tools.js');
    assert.match(buildMessage('The image matches.', outcome), SENTENCE);
  } finally { await f.close(); }
});

test('buildApp: a normal exit has outputHeldOpen false and no sentence', async () => {
  const f = await buildFixture();
  try {
    const outcome = await buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async (): Promise<BuildProcessResult> => {
        await writeFiles(f.project, buildOutputs('demo_app', fakeImage({ project: 'demo_app' })));
        return { exitCode: 0, timedOut: false, output: '' };
      },
    });
    assert.equal(outcome.outputHeldOpen, false);
    const { buildMessage } = await import('../src/tools/build-tools.js');
    assert.doesNotMatch(buildMessage('The image matches.', outcome), /held the build's output open/);
  } finally { await f.close(); }
});

test('buildApp: exit 2 with the output held open is BUILD_FAILED with the log tail and the sentence', async () => {
  const f = await buildFixture();
  try {
    await assert.rejects(buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async (): Promise<BuildProcessResult> => ({ exitCode: 2, timedOut: false, output: 'LINK ERROR here', outputHeldOpen: true }),
    }), (error: unknown) => {
      assert.ok(error instanceof KodeRefusal);
      assert.equal(error.reasonCode, 'BUILD_FAILED');
      assert.match(error.message, /exited with 2/);
      assert.match(error.message, /LINK ERROR here/);
      assert.match(error.message, SENTENCE);
      return true;
    });
    assert.equal(existsSync(join(f.project, 'build')), false);
  } finally { await f.close(); }
});
