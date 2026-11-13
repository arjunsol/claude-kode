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
import { withBuildLogicWarnings } from '../src/tools/build-tools.js';
import { CapabilityRegistry } from '../src/registry/registry.js';
import { MAILBOX } from '../src/registry/sdk-contract.js';
import { KodeRefusal, type ReasonCode } from '../src/result.js';
import {
  buildDigests, buildOutputs, fakeIdf, fakeImage, hostConfigFor, sha256, standInTemplate, tempDir, writeFiles,
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

test('a build, sdkconfig or sdkconfig.old that exists before the build refuses with BUILD_STATE_PRESENT and starts nothing', async () => {
  const hostile: Record<string, Record<string, string>> = {
    // A planted cache whose include pulls project CMake into the build (confirmation case V16).
    build: { 'build/CMakeCache.txt': 'CMAKE_PROJECT_INCLUDE:FILEPATH=notes.txt\n' },
    // A junction inside a real build/ that would send output outside the workspace (case 2b) is also a build/.
    'build-with-junction': { 'build/keep.txt': 'x' },
    // A root sdkconfig overrides sdkconfig.defaults, which the static rules read (case S2).
    sdkconfig: { sdkconfig: 'CONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_PARTITION_TABLE_CUSTOM_FILENAME="../../evil.csv"\n' },
    'sdkconfig.old': { 'sdkconfig.old': 'CONFIG_X=y\n' },
  };
  for (const [label, files] of Object.entries(hostile)) {
    const f = await buildFixture();
    try {
      const outside = join(f.dir, 'OUTSIDE');
      await mkdir(outside);
      await writeFiles(f.project, files);
      if (label === 'build-with-junction') await symlink(outside, join(f.project, 'build', 'esp-idf'), 'junction');
      let calls = 0;
      await assert.rejects(buildApp(f.config, 'demo_app', {
        pinnedFiles: f.pinnedFiles, run: async () => { calls++; return okRun(f.project)(); },
      }), (error: unknown) => {
        refuses('BUILD_STATE_PRESENT')(error);
        assert.equal((error as KodeRefusal).status, 'refused', label);
        assert.ok((error as KodeRefusal).message.includes(label.split('-')[0] as string), label);
        return true;
      }, label);
      assert.equal(calls, 0, label);
      assert.deepEqual(await readdir(outside), [], `${label}: nothing may be written outside`);
      // The server removes nothing it did not create.
      for (const path of Object.keys(files)) assert.equal(existsSync(join(f.project, path)), true, `${label}: ${path} must be left in place`);
    } finally { await f.close(); }
  }
});

test('the refusal names every one of build, sdkconfig and sdkconfig.old that is present', async () => {
  const f = await buildFixture();
  try {
    await writeFiles(f.project, { 'build/x.txt': 'x', sdkconfig: 'x', 'sdkconfig.old': 'x' });
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project) }), (error: unknown) => {
      refuses('BUILD_STATE_PRESENT')(error);
      assert.match((error as KodeRefusal).message, /build, sdkconfig, sdkconfig\.old already exist/);
      return true;
    });
  } finally { await f.close(); }
});

test('a build runs, a second build is refused, and it builds again once the state is removed', async () => {
  const f = await buildFixture();
  try {
    let calls = 0;
    const run = async () => { calls++; return okRun(f.project)(); };
    // The runner is what creates build/: it does not exist beforehand.
    assert.equal(existsSync(join(f.project, 'build')), false);
    const first = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run });
    assert.equal(first.stage, 'kodeos_install_compatible');
    assert.equal(calls, 1);
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run }), refuses('BUILD_STATE_PRESENT'));
    assert.equal(calls, 1);
    await rm(join(f.project, 'build'), { recursive: true, force: true });
    const again = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run });
    assert.equal(again.stage, 'kodeos_install_compatible');
    assert.equal(calls, 2);
  } finally { await f.close(); }
});

test('a build that trusts a pre-existing managed_components or dependencies.lock carries the warning in its outcome and message', async () => {
  const f = await buildFixture();
  try {
    const clean = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project) });
    assert.deepEqual(clean.buildLogicWarnings, []);
    assert.equal(withBuildLogicWarnings('Done.', clean.buildLogicWarnings), 'Done.');
    await rm(join(f.project, 'build'), { recursive: true, force: true });
    await writeFiles(f.project, { 'managed_components/kodediy__kode/CMakeLists.txt': '# fetched\n', 'dependencies.lock': 'x\n' });
    const outcome = await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project) });
    assert.equal(outcome.buildLogicWarnings.length, 2);
    assert.ok(outcome.buildLogicWarnings.every(warning => warning.startsWith('BL-UNVERIFIABLE: ')));
    assert.ok(outcome.buildLogicWarnings.some(warning => warning.includes('managed_components')));
    assert.ok(outcome.buildLogicWarnings.some(warning => warning.includes('dependencies.lock')));
    const message = withBuildLogicWarnings('Done.', outcome.buildLogicWarnings);
    assert.match(message, /^Done\. Not verified, and used by this build: BL-UNVERIFIABLE: /);
    assert.ok(message.includes('managed_components') && message.includes('dependencies.lock'));
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
    assert.equal(result.attachedTreeEnded, true);
    assert.ok(performance.now() - started < 2500, 'the runner must not wait for the descendant');
    await new Promise(resolve => setTimeout(resolve, 4000));
    assert.equal(existsSync(marker), false, 'a process the build started survived the deadline');
  } finally { await ws.close(); }
});

test('a timeout message claims only what is known, in both branches', async () => {
  const f = await buildFixture();
  try {
    const run = (attachedTreeEnded: boolean) => async () => ({ exitCode: null, timedOut: true, output: '', attachedTreeEnded });
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: run(true) }), (error: unknown) => {
      refuses('BUILD_TIMEOUT')(error);
      const message = (error as KodeRefusal).message;
      assert.match(message, /build process and the processes still attached to it were ended/);
      assert.match(message, /process that detached itself cannot be tracked and may still be running/);
      assert.doesNotMatch(message, /process tree|all processes|everything/);
      return true;
    });
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: run(false) }), (error: unknown) => {
      refuses('BUILD_TIMEOUT')(error);
      const message = (error as KodeRefusal).message;
      assert.match(message, /not confirmed/);
      assert.match(message, /may still be running/);
      assert.doesNotMatch(message, /were ended|was ended|was stopped/);
      return true;
    });
    // A runner that does not report the kill is not claimed to have ended anything.
    await assert.rejects(buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles, run: async () => ({ exitCode: null, timedOut: true, output: '' }),
    }), (error: unknown) => /not confirmed/.test((error as KodeRefusal).message) && !/were ended/.test((error as KodeRefusal).message));
  } finally { await f.close(); }
});

test('a process that detached itself (double fork) survives the deadline, and the message does not say it was ended', async () => {
  const f = await buildFixture();
  const marker = join(f.dir, 'detached-ran.txt');
  try {
    const writer = `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 2500)`;
    const middle = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(writer)}], { stdio: 'ignore', detached: true }).unref();`;
    const top = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(middle)}], { stdio: 'ignore' }); setTimeout(() => {}, 60000);`;
    let outcome: Awaited<ReturnType<typeof systemBuildRunner>> | undefined;
    await assert.rejects(buildApp({ ...f.config, buildTimeoutMs: 700 }, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async () => { outcome = await systemBuildRunner(process.execPath, ['-e', top], { cwd: f.dir, env: process.env, timeoutMs: 700 }); return outcome; },
    }), (error: unknown) => {
      refuses('BUILD_TIMEOUT')(error);
      const message = (error as KodeRefusal).message;
      assert.match(message, /may still be running/);
      assert.match(message, /detached itself cannot be tracked/);
      assert.doesNotMatch(message, /detached[^.]*(was|were) ended/);
      return true;
    });
    assert.equal(outcome?.timedOut, true);
    // The fact the message must not contradict: the detached process was not reached.
    await new Promise(resolve => setTimeout(resolve, 3500));
    assert.equal(existsSync(marker), true, 'the detached process was expected to survive the deadline');
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

// ---- Residuals of finding 13 and of finding 8 ----

test('only 0x followed by hex digits names the mailbox offset, in either letter case of the digits', async () => {
  for (const offset of ['0x1a00000', '0x1A00000', '0x01a00000']) {
    const inspection = await inspected(fakeImage({ project: 'demo_app' }), { flashFiles: { [offset]: 'demo_app.bin' } });
    assert.equal(inspection.buildMetadata.flashPlan, 'mailbox_only', offset);
    assert.equal(inspection.stages.kodeosInstallCompatible, true, offset);
  }
  // Number() accepted each of these: decimal, exponent, padded, hex with a space, binary, octal, and a sign.
  for (const offset of [String(MAILBOX.offset), '2.7262976e7', ` 0x${MAILBOX.offset.toString(16)}`, `0x${MAILBOX.offset.toString(16)} `,
    `0X${MAILBOX.offset.toString(16)}`, '0b1101000000000000000000000', '0o150000000', `+0x${MAILBOX.offset.toString(16)}`, '0x', '']) {
    const inspection = await inspected(fakeImage({ project: 'demo_app' }), { flashFiles: { [offset]: 'demo_app.bin' } });
    assert.equal(inspection.buildMetadata.flashPlan, 'not_mailbox_only', JSON.stringify(offset));
    assert.equal(inspection.stages.kodeosInstallCompatible, false, JSON.stringify(offset));
  }
});

test('strings taken from build metadata are echoed at most 64 characters, and at most 16 flash entries are reported', async () => {
  const huge = 'B'.repeat(200000);
  const longName = await inspected(fakeImage({ project: 'demo_app' }), { flashFiles: { '0x0': huge, ['C'.repeat(30000)]: 'x' } });
  const entries = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`0x${(index * 4096).toString(16)}`, `part${index}.bin`]));
  const many = await inspected(fakeImage({ project: 'demo_app' }), { flashFiles: entries });
  for (const inspection of [longName, many]) {
    assert.equal(inspection.buildMetadata.flashPlan, 'not_mailbox_only');
    assert.ok(inspection.buildMetadata.flashEntries.length <= 16);
    for (const entry of inspection.buildMetadata.flashEntries) {
      assert.ok(entry.offset.length <= 64 && entry.file.length <= 64, 'an echoed entry is capped');
    }
  }
  const flashCheck = (inspection: typeof many) => inspection.checks.find(check => check.id === 'app.flash_plan')!;
  assert.ok(flashCheck(longName).detail.length < 1000, `detail is ${flashCheck(longName).detail.length} characters`);
  assert.equal(many.buildMetadata.flashEntries.length, 16);
  assert.match(flashCheck(many).detail, /20 entries were present; only the first 16 are listed/);
  // A configured target taken from sdkconfig.json is capped too.
  const ws = await workspace();
  try {
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', fakeImage({ project: 'demo_app' })));
    await writeFile(join(ws.root, 'demo_app', 'build', 'config', 'sdkconfig.json'), JSON.stringify({ IDF_TARGET: huge, KODEOS_BOOT_ROLE_APP: true }));
    const target = await inspectImage(hostConfigFor({ workspaceRoot: ws.root }), 'demo_app');
    assert.ok((target.buildMetadata.configuredTarget ?? '').length <= 64);
    assert.ok(target.checks.every(check => check.detail.length < 1000));
  } finally { await ws.close(); }
});

test('a manifest whose name is only spaces, or that repeats a category, is not install-compatible', async () => {
  for (const [label, manifest] of [
    ['spaces only', { name: '   ', category: 'tools' }],
    ['duplicate category', { name: 'X', category: 'tools,tools' }],
    ['duplicate in another letter case', { name: 'X', category: 'tools,TOOLS' }],
  ] as const) {
    const inspection = await inspected(fakeImage({ project: 'demo_app', manifest }));
    assert.equal(inspection.stages.kodeosInstallCompatible, false, label);
    assert.ok(inspection.checks.some(check => check.id === 'app.manifest' && !check.pass), label);
  }
  assert.equal((await inspected(fakeImage({ project: 'demo_app', manifest: { name: 'A b', category: 'tools,media' } }))).stages.kodeosInstallCompatible, true);
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
    assert.equal(receipts.observed('demo_app', buildDigests('demo_app', image)), true);
    assert.equal((await inspectImage(f.config, 'demo_app', receipts)).buildObserved, true);
    // Hand-written replacement bytes have no receipt.
    await writeFiles(f.project, { 'build/demo_app.bin': fakeImage({ project: 'demo_app', version: '9.9.9' }) });
    assert.equal((await inspectImage(f.config, 'demo_app', receipts)).buildObserved, false);
    assert.equal((await inspectImage(f.config, 'demo_app')).buildObserved, false);
  } finally { await f.close(); }
});

test('a receipt covers the image and both build metadata files: changing, removing or adding any one of them is not observed', async () => {
  const f = await buildFixture();
  try {
    const receipts = new BuildReceipts();
    const image = fakeImage({ project: 'demo_app' });
    await buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project, image), receipts });
    const observed = async () => (await inspectImage(f.config, 'demo_app', receipts)).buildObserved;
    assert.equal(await observed(), true);
    const original = buildOutputs('demo_app', image);
    // Confirmation cases 9f and 9g: hand-edit the metadata after a real build; the .bin is unchanged.
    for (const file of ['build/config/sdkconfig.json', 'build/flasher_args.json'] as const) {
      await writeFile(join(f.project, file), `${original[file] as string} `);
      assert.equal(await observed(), false, `${file} edited`);
      await writeFile(join(f.project, file), original[file] as string);
      assert.equal(await observed(), true, `${file} restored`);
      await rm(join(f.project, file));
      assert.equal(await observed(), false, `${file} removed`);
      await writeFile(join(f.project, file), original[file] as string);
    }
    await writeFiles(f.project, { 'build/demo_app.bin': fakeImage({ project: 'demo_app', version: '9.9.9' }) });
    assert.equal(await observed(), false, 'image replaced');
  } finally { await f.close(); }
});

test('a metadata file that was absent at the build is recorded as absent and does not match a present file', () => {
  const receipts = new BuildReceipts();
  const present = 'a'.repeat(64);
  receipts.record('demo_app', { image: 'b'.repeat(64), sdkconfigJson: null, flasherArgs: present });
  assert.equal(receipts.observed('demo_app', { image: 'B'.repeat(64), sdkconfigJson: null, flasherArgs: present.toUpperCase() }), true);
  assert.equal(receipts.observed('demo_app', { image: 'b'.repeat(64), sdkconfigJson: present, flasherArgs: present }), false);
  assert.equal(receipts.observed('demo_app', { image: 'b'.repeat(64), sdkconfigJson: null, flasherArgs: null }), false);
  assert.equal(receipts.observed('other_app', { image: 'b'.repeat(64), sdkconfigJson: null, flasherArgs: present }), false);
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
    receipts.record('demo_app', buildDigests('demo_app', image));
    const observed = await toolSession(env, receipts);
    const ok = await observed.call('kode_inspect_image', { projectName: 'demo_app' });
    assert.equal(ok.status, 'ok');
    assert.equal(ok.verifiedLayer, 'build');
    assert.equal(ok.payload.buildObserved, true);

    // The chip-mismatch refusal wins over everything, receipt or not.
    const s3 = fakeImage({ project: 'demo_app', chipId: 0x0009 });
    await writeFiles(join(ws.root, 'demo_app'), buildOutputs('demo_app', s3));
    receipts.record('demo_app', buildDigests('demo_app', s3));
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

test('a build-gate refusal names the rules that caused it, not the warnings beside them', async () => {
  const f = await buildFixture();
  try {
    // A fetched SDK directory is only a warning; the idf_ext.py is the reason.
    await mkdir(join(f.project, 'managed_components'));
    await writeFile(join(f.project, 'idf_ext.py'), 'print("loaded by idf.py")\n');
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: okRun(f.project) }), (error: unknown) => {
      refuses('BUILD_LOGIC_NOT_PINNED')(error);
      assert.match((error as KodeRefusal).message, /BL-EXTRA-BUILD-FILE/);
      assert.doesNotMatch((error as KodeRefusal).message, /BL-UNVERIFIABLE/);
      return true;
    });
  } finally { await f.close(); }
});
