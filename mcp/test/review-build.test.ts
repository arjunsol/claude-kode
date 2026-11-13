/** Regression tests for the independent review's build-side findings (1, 2, 3, 8, 9, 13). */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { link, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createKodeServer } from '../src/app.js';
import { buildApp, systemBuildRunner } from '../src/build/build.js';
import { inspectImage } from '../src/build/image.js';
import { BuildReceipts } from '../src/build/receipts.js';
import { newApp } from '../src/build/scaffold.js';
import { readTextInside } from '../src/build/workspace.js';
import { CapabilityRegistry } from '../src/registry/registry.js';
import { MAILBOX } from '../src/registry/sdk-contract.js';
import { KodeRefusal, type ReasonCode } from '../src/result.js';
import {
  buildOutputs, fakeIdf, fakeImage, hostConfigFor, sha256, standInTemplate, tempDir, writeFiles,
} from './helpers.js';

const refuses = (code: ReasonCode) => (error: unknown): boolean => {
  assert.ok(error instanceof KodeRefusal, `expected a KodeRefusal, got ${String(error)}`);
  assert.equal(error.reasonCode, code);
  return true;
};

async function workspace() {
  const temp = await tempDir('ck-rv-');
  const root = join(temp.dir, 'workspace');
  await mkdir(root);
  return { ...temp, root };
}

// ---- Finding 13: hard links ----

test('a file that is a hard link to content outside the project is refused', async () => {
  const ws = await workspace();
  try {
    const secret = join(ws.dir, 'outside-secret.txt');
    await writeFile(secret, 'project(TOKEN_outside)\n');
    const project = join(ws.root, 'hl_app');
    await mkdir(project);
    await link(secret, join(project, 'CMakeLists.txt'));
    await assert.rejects(readTextInside(project, 'CMakeLists.txt'), refuses('WORKSPACE_ESCAPE'));
    // An ordinary single-link file is still read.
    await writeFile(join(project, 'plain.txt'), 'hello');
    assert.equal(await readTextInside(project, 'plain.txt'), 'hello');
    assert.equal(await readTextInside(project, 'absent.txt'), undefined);
  } finally { await ws.close(); }
});

// ---- Shared fixture: an eligible project, built through a stub runner ----

const appInput = { projectName: 'demo_app', displayName: 'Demo app', categories: ['tools'] };

async function buildFixture() {
  const ws = await workspace();
  const idf = await fakeIdf(ws.dir, [6, 1, 0]);
  const templateDir = join(ws.dir, 'template');
  const standIn = standInTemplate();
  await writeFiles(templateDir, standIn.files);
  const config = hostConfigFor({ workspaceRoot: ws.root, templateDir, buildEnabled: true, ...idf });
  await newApp(config, appInput, standIn.manifest);
  return { ...ws, ...idf, config, pinnedFiles: standIn.manifest, project: join(ws.root, 'demo_app') };
}

const okRun = (project: string, image = fakeImage({ project: 'demo_app' })) => async () => {
  await writeFiles(project, buildOutputs('demo_app', image));
  return { exitCode: 0, timedOut: false, output: '' };
};

// ---- Finding 2: links in build, managed_components and sdkconfig ----

test('a build, managed_components or sdkconfig that is a link is refused before any process starts', async () => {
  for (const [entry, kind] of [['build', 'directory'], ['managed_components', 'directory'], ['sdkconfig', 'file']] as const) {
    const f = await buildFixture();
    try {
      const outside = join(f.dir, 'OUTSIDE');
      if (kind === 'directory') {
        await mkdir(outside);
        await symlink(outside, join(f.project, entry), 'junction');
      } else {
        await writeFile(outside, 'CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_IDF_TARGET="esp32p4"\n');
        try {
          await symlink(outside, join(f.project, entry), 'file');
        } catch { continue; } // creating a file symlink needs a privilege on some Windows hosts
      }
      let calls = 0;
      await assert.rejects(buildApp(f.config, 'demo_app', {
        pinnedFiles: f.pinnedFiles, run: async () => { calls++; return okRun(f.project)(); },
      }), refuses('WORKSPACE_ESCAPE'), entry);
      assert.equal(calls, 0, entry);
      if (kind === 'directory') assert.deepEqual(await readdir(outside), [], `${entry}: nothing may be written outside`);
    } finally { await f.close(); }
  }
});

test('a real build directory inside the project is still built', async () => {
  const f = await buildFixture();
  try {
    await mkdir(join(f.project, 'build'));
    const outcome = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project) });
    assert.equal(outcome.stage, 'kodeos_install_compatible');
  } finally { await f.close(); }
});

// ---- Finding 3: the deadline ends the process tree ----

test('the deadline ends the whole process tree, not only the top process', async () => {
  const ws = await workspace();
  const marker = join(ws.dir, 'grandchild-ran.txt');
  try {
    // The parent starts a child that would write a marker after the deadline,
    // detached so that only a tree kill (not the parent's own death) can reach it.
    const grand = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 3000)`;
    const parent = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grand)}], { stdio: 'ignore', detached: true }); setTimeout(() => {}, 60000);`;
    const started = performance.now();
    const result = await systemBuildRunner(process.execPath, ['-e', parent], { cwd: ws.dir, env: process.env, timeoutMs: 500 });
    assert.equal(result.timedOut, true);
    assert.equal(result.treeKilled, true);
    assert.ok(performance.now() - started < 2500, 'the runner must not wait for the descendant');
    await new Promise(resolve => setTimeout(resolve, 4000));
    assert.equal(existsSync(marker), false, 'a process the build started survived the deadline');
  } finally { await ws.close(); }
});

test('a timeout message says the tree was stopped only when that was confirmed', async () => {
  const f = await buildFixture();
  try {
    const run = (treeKilled: boolean) => async () => ({ exitCode: null, timedOut: true, output: '', treeKilled });
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: run(true) }), (error: unknown) => {
      refuses('BUILD_TIMEOUT')(error);
      assert.match((error as KodeRefusal).message, /process tree was ended/);
      return true;
    });
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: run(false) }), (error: unknown) => {
      refuses('BUILD_TIMEOUT')(error);
      assert.match((error as KodeRefusal).message, /may still be running/);
      assert.doesNotMatch((error as KodeRefusal).message, /was ended|was stopped/);
      return true;
    });
    // A runner that does not report the kill is not claimed to have stopped anything.
    await assert.rejects(buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles, run: async () => ({ exitCode: null, timedOut: true, output: '' }),
    }), (error: unknown) => /may still be running/.test((error as KodeRefusal).message));
  } finally { await f.close(); }
});

// ---- Finding 8: install compatibility needs a real manifest and a plan that fits ----

async function inspected(image: Buffer, options?: Parameters<typeof buildOutputs>[2]) {
  const ws = await workspace();
  try {
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', image, options));
    return await inspectImage(hostConfigFor({ workspaceRoot: ws.root }), 'demo_app');
  } finally { await ws.close(); }
}

test('an empty or out-of-catalogue manifest, or an image the mailbox cannot hold, is not install-compatible', async () => {
  const good = await inspected(fakeImage({ project: 'demo_app' }));
  assert.equal(good.stages.kodeosInstallCompatible, true);
  const cases: Array<[string, Buffer, string]> = [
    ['empty name and categories', fakeImage({ project: 'demo_app', manifest: { name: '', category: '' } }), 'app.manifest'],
    ['empty name', fakeImage({ project: 'demo_app', manifest: { name: '', category: 'tools' } }), 'app.manifest'],
    ['categories outside the catalogue', fakeImage({ project: 'demo_app', manifest: { name: 'X', category: 'HACKING,rf_jam' } }), 'app.manifest'],
    ['one good and one bad category', fakeImage({ project: 'demo_app', manifest: { name: 'X', category: 'tools,rf_jam' } }), 'app.manifest'],
    ['five categories', fakeImage({ project: 'demo_app', manifest: { name: 'X', category: 'ai,communication,games,media,tools' } }), 'app.manifest'],
    ['too big for the mailbox', fakeImage({ project: 'demo_app', size: MAILBOX.imageMax + 4096 }), 'app.size'],
  ];
  for (const [label, image, failing] of cases) {
    const inspection = await inspected(image);
    assert.equal(inspection.stages.kodeosInstallCompatible, false, label);
    assert.ok(inspection.checks.some(check => check.id === failing && !check.pass), label);
  }
});

// ---- Finding 9: flash plan file, and build receipts ----

test('a flash plan whose file is a path other than <name>.bin is not the mailbox plan', async () => {
  for (const file of ['C:/elsewhere/demo_app.bin', 'sub/demo_app.bin', '../demo_app.bin', './demo_app.bin']) {
    const inspection = await inspected(fakeImage({ project: 'demo_app' }), { flashFiles: { '0x1a00000': file } });
    assert.equal(inspection.buildMetadata.flashPlan, 'not_mailbox_only', file);
    assert.equal(inspection.stages.kodeosInstallCompatible, false, file);
  }
});

test('a build records a receipt for its image, and only that exact image is observed', async () => {
  const f = await buildFixture();
  try {
    const receipts = new BuildReceipts();
    const image = fakeImage({ project: 'demo_app' });
    const outcome = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project, image), receipts });
    assert.equal(outcome.inspection.buildObserved, true);
    assert.equal(receipts.observed('demo_app', sha256(image)), true);
    assert.equal((await inspectImage(f.config, 'demo_app', receipts)).buildObserved, true);
    // Hand-written replacement bytes have no receipt.
    await writeFiles(f.project, { 'build/demo_app.bin': fakeImage({ project: 'demo_app', version: '9.9.9' }) });
    assert.equal((await inspectImage(f.config, 'demo_app', receipts)).buildObserved, false);
    assert.equal((await inspectImage(f.config, 'demo_app')).buildObserved, false);
  } finally { await f.close(); }
});

async function toolSession(env: NodeJS.ProcessEnv, receipts?: BuildReceipts) {
  const server = createKodeServer({
    registry: new CapabilityRegistry(), now: () => new Date('2026-11-13T12:00:00Z'), env,
    ...(receipts ? { receipts } : {}),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'review-build-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })).structuredContent as Record<string, any>;
  return { call, close: () => client.close() };
}

test('kode_inspect_image reports build evidence only for an image this server built', async () => {
  const ws = await workspace();
  try {
    const image = fakeImage({ project: 'demo_app' });
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', image));
    const env = { KODE_WORKSPACE_ROOT: ws.root };

    const bare = await toolSession(env);
    const unobserved = await bare.call('kode_inspect_image', { projectName: 'demo_app' });
    await bare.close();
    assert.equal(unobserved.status, 'not_verified');
    assert.equal(unobserved.reasonCode, 'BUILD_NOT_OBSERVED');
    assert.equal(unobserved.verifiedLayer, 'none');
    assert.equal(unobserved.payload.buildObserved, false);
    assert.equal(unobserved.payload.header.chip, 'esp32p4');
    assert.match(unobserved.message, /not produced by a build this server ran/);

    const receipts = new BuildReceipts();
    receipts.record('demo_app', sha256(image));
    const observed = await toolSession(env, receipts);
    const ok = await observed.call('kode_inspect_image', { projectName: 'demo_app' });
    assert.equal(ok.status, 'ok');
    assert.equal(ok.verifiedLayer, 'build');
    assert.equal(ok.payload.buildObserved, true);

    // The chip-mismatch refusal wins over everything, receipt or not.
    const s3 = fakeImage({ project: 'demo_app', chipId: 0x0009 });
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', s3));
    receipts.record('demo_app', sha256(s3));
    const refused = await observed.call('kode_inspect_image', { projectName: 'demo_app' });
    await observed.close();
    assert.equal(refused.status, 'refused');
    assert.equal(refused.reasonCode, 'IMAGE_CHIP_MISMATCH');
    const refusedBare = await toolSession(env);
    assert.equal((await refusedBare.call('kode_inspect_image', { projectName: 'demo_app' })).reasonCode, 'IMAGE_CHIP_MISMATCH');
    await refusedBare.close();
  } finally { await ws.close(); }
});

// ---- Finding 1, build side ----

test('a real buildApp run passes exactly the six expected arguments', async () => {
  const f = await buildFixture();
  try {
    const seen: Array<readonly string[]> = [];
    await buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async (_program, args) => { seen.push(args); return okRun(f.project)(); },
    });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], [join(f.idfPath, 'tools', 'idf.py'), '-C', f.project, '-B', join(f.project, 'build'), 'build']);
  } finally { await f.close(); }
});

test('a project with build logic that is not the pinned template is refused before any process starts', async () => {
  const f = await buildFixture();
  try {
    let calls = 0;
    const run = async () => { calls++; return okRun(f.project)(); };
    // A project-supplied idf_ext.py is code idf.py loads and runs.
    await writeFile(join(f.project, 'idf_ext.py'), 'print("loaded by idf.py")\n');
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run }), refuses('BUILD_LOGIC_NOT_PINNED'));
    await rm(join(f.project, 'idf_ext.py'));
    // Extra commands added to the root CMakeLists.txt.
    const cmake = join(f.project, 'CMakeLists.txt');
    const original = await readFile(cmake, 'utf8');
    await writeFile(cmake, `${original}execute_process(COMMAND cmd /c echo hostile)\n`);
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run }), refuses('BUILD_LOGIC_NOT_PINNED'));
    assert.equal(calls, 0);
    // Restored, the same project builds.
    await writeFile(cmake, original);
    await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run });
    assert.equal(calls, 1);
  } finally { await f.close(); }
});
