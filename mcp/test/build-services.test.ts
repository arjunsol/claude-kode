import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp, buildArguments, systemBuildRunner, type BuildRunner } from '../src/build/build.js';
import { inspectImage, parseImage } from '../src/build/image.js';
import { loadPinnedTemplate, newApp } from '../src/build/scaffold.js';
import { toolchainStatus } from '../src/build/toolchain.js';
import { validateProject } from '../src/build/validate.js';
import { assertProjectName, hostConfig, isInside, locateProject } from '../src/build/workspace.js';
import { MAILBOX, PINNED } from '../src/registry/sdk-contract.js';
import { KodeRefusal, type ReasonCode } from '../src/result.js';
import {
  buildOutputs, fakeIdf, fakeImage, hostConfigFor, projectFiles, sha256, standInTemplate, tempDir, writeFiles,
} from './helpers.js';

const refuses = (code: ReasonCode) => (error: unknown): boolean => {
  assert.ok(error instanceof KodeRefusal, `expected a KodeRefusal, got ${String(error)}`);
  assert.equal(error.reasonCode, code);
  return true;
};
const failedRules = (outcome: Awaited<ReturnType<typeof validateProject>>) =>
  outcome.findings.filter(finding => finding.level === 'reject' && finding.status === 'fail').map(finding => finding.rule);

async function workspace() {
  const temp = await tempDir('ck-ws-');
  const root = join(temp.dir, 'workspace');
  await mkdir(root);
  return { ...temp, root, config: hostConfigFor({ workspaceRoot: root }) };
}

// ---- Workspace boundary ----

test('project names that could leave the workspace or run a command are refused', () => {
  for (const name of ['../escape', '..', 'a/b', 'a\\b', 'C:\\Windows', '/etc', 'app;rm -rf', 'app & del', 'app$(id)',
    'App', 'my-app', 'a b', '', 'x'.repeat(32), 'kodeos', 'c5_slave',
    'con', 'prn', 'aux', 'nul', 'com1', 'com5', 'com9', 'lpt1', 'lpt5', 'lpt9', 'app\0', 5, null, undefined, ['app']]) {
    assert.throws(() => assertProjectName(name), refuses('PROJECT_NAME_INVALID'), String(name));
  }
  assert.equal(assertProjectName('sensor_reader_2'), 'sensor_reader_2');
  // Only the exact device names are reserved: neighbours are ordinary names.
  for (const ok of ['com0', 'com10', 'lpt0', 'console', 'auxiliary', 'nulls', 'com', 'lpt']) assert.equal(assertProjectName(ok), ok);
  assert.equal(assertProjectName('x'.repeat(31)).length, 31);
});

test('an unconfigured, relative or missing workspace root is refused', async () => {
  for (const workspaceRoot of ['', 'relative/dir', join(process.cwd(), 'no-such-directory-ck')]) {
    await assert.rejects(locateProject(hostConfigFor({ workspaceRoot }), 'demo_app'), refuses('WORKSPACE_NOT_CONFIGURED'));
  }
});

test('path containment treats only real descendants as inside', () => {
  const base = join(process.cwd(), 'ws');
  assert.equal(isInside(base, join(base, 'a', 'b')), true);
  assert.equal(isInside(base, base), true);
  assert.equal(isInside(base, join(base, '..', 'ws-other')), false);
  assert.equal(isInside(base, join(base, '..')), false);
  assert.equal(isInside(base, `${base}-suffix`), false);
});

test('a project directory that is a junction to outside the workspace is refused', async () => {
  const ws = await workspace();
  try {
    const outside = join(ws.dir, 'outside');
    await writeFiles(outside, projectFiles('linked_app'));
    await symlink(outside, join(ws.root, 'linked_app'), 'junction');
    await assert.rejects(locateProject(ws.config, 'linked_app'), refuses('WORKSPACE_ESCAPE'));
    await assert.rejects(validateProject(ws.config, 'linked_app'), refuses('WORKSPACE_ESCAPE'));
    await assert.rejects(inspectImage(ws.config, 'linked_app'), refuses('WORKSPACE_ESCAPE'));
  } finally { await ws.close(); }
});

test('files reached through a link that leaves the project are refused', async () => {
  const ws = await workspace();
  try {
    const outside = join(ws.dir, 'outside-build');
    await writeFiles(outside, { 'demo_app.bin': fakeImage(), 'app_main.c': 'secret' });
    await writeFiles(join(ws.root, 'demo_app'), projectFiles('demo_app'));
    await symlink(outside, join(ws.root, 'demo_app', 'build'), 'junction');
    await assert.rejects(inspectImage(ws.config, 'demo_app'), refuses('WORKSPACE_ESCAPE'));
  } finally { await ws.close(); }
});

// ---- kode_new_app ----

async function templateFixture() {
  const ws = await workspace();
  const templateDir = join(ws.dir, 'template');
  const standIn = standInTemplate();
  await writeFiles(templateDir, standIn.files);
  return { ...ws, templateDir, manifest: standIn.manifest, config: hostConfigFor({ workspaceRoot: ws.root, templateDir }) };
}
const appInput = { projectName: 'demo_app', displayName: 'Demo app', categories: ['tools', 'media'] };

test('scaffolding writes a verified, edited copy and never the upstream README', async () => {
  const f = await templateFixture();
  try {
    const outcome = await newApp(f.config, { ...appInput, version: '1.2.3', description: 'Reads a sensor.' }, f.manifest);
    assert.equal(outcome.stage, 'source_project');
    assert.equal(outcome.licence, 'GPL-3.0-or-later');
    assert.deepEqual(outcome.sdk, { ...outcome.sdk, release: PINNED.sdk.tag, templatePinned: 'v0.1.0', pinChanged: true });
    assert.deepEqual(outcome.notCopied, ['README.md']);
    const project = join(f.root, 'demo_app');
    const cmake = await readFile(join(project, 'CMakeLists.txt'), 'utf8');
    assert.match(cmake, /project\(demo_app\)/);
    assert.match(cmake, /set\(PROJECT_VER "1\.2\.3"\)/);
    assert.match(await readFile(join(project, 'main', 'app_main.c'), 'utf8'), /KODE_APP_MANIFEST\("Demo app", "tools,media"\);/);
    assert.match(await readFile(join(project, 'main', 'idf_component.yml'), 'utf8'), /version: v0\.1\.1\n/);
    assert.match(await readFile(join(project, 'appdata', 'app.json'), 'utf8'), /"description": "Reads a sensor\."/);
    assert.match(await readFile(join(project, 'ram_budget.txt'), 'utf8'), /build\/demo_app\.elf/);
    const readme = await readFile(join(project, 'README.md'), 'utf8');
    assert.doesNotMatch(readme, /write[-_]flash|0x1C00000/i);
    assert.match(readme, /GPL-3\.0-or-later/);
    assert.equal(outcome.files.find(file => file.path === 'README.md')?.origin, 'generated');
    assert.equal(outcome.files.find(file => file.path === 'LICENSE')?.origin, 'template');
    for (const file of outcome.files) {
      assert.equal(sha256(await readFile(join(project, file.path))), file.sha256, file.path);
    }
    // The scaffold satisfies the static checks, and a second call never overwrites it.
    assert.equal((await validateProject(f.config, 'demo_app')).verdict, 'pass');
    await writeFile(join(project, 'main', 'app_main.c'), 'user edit');
    await assert.rejects(newApp(f.config, appInput, f.manifest), refuses('PROJECT_EXISTS'));
    assert.equal(await readFile(join(project, 'main', 'app_main.c'), 'utf8'), 'user edit');
  } finally { await f.close(); }
});

test('the template pin can stay on the previous assessed SDK release but not on an unassessed one', async () => {
  const f = await templateFixture();
  try {
    const kept = await newApp(f.config, { ...appInput, sdkRelease: 'v0.1.0' }, f.manifest);
    assert.equal(kept.sdk.pinChanged, false);
    assert.equal(kept.files.find(file => file.path === 'main/idf_component.yml')?.origin, 'template');
    const validation = await validateProject(f.config, 'demo_app');
    assert.equal(validation.verdict, 'pass');
    assert.ok(validation.findings.some(finding => finding.rule === 'B1-RELEASE' && finding.level === 'warn'));
    for (const sdkRelease of ['v0.1.2', 'v1.0.0']) {
      await assert.rejects(newApp(f.config, { ...appInput, projectName: 'other_app', sdkRelease }, f.manifest), refuses('SDK_RELEASE_NOT_ASSESSED'));
    }
    assert.deepEqual(await readdir(f.root), ['demo_app']);
  } finally { await f.close(); }
});

test('a template checkout that differs from the pinned tag is refused and nothing is written', async () => {
  const f = await templateFixture();
  try {
    await writeFile(join(f.templateDir, 'main', 'app_main.c'), '#include "kode.h"\nKODE_APP_MANIFEST("My app", "tools");\nvoid app_main(void) { system("format"); }\n');
    await assert.rejects(newApp(f.config, appInput, f.manifest), refuses('TEMPLATE_INTEGRITY_MISMATCH'));
    assert.deepEqual(await readdir(f.root), []);
    // The real pinned manifest rejects the stand-in outright.
    await assert.rejects(newApp(f.config, appInput), refuses('TEMPLATE_INTEGRITY_MISMATCH'));
    await assert.rejects(newApp(hostConfigFor({ workspaceRoot: f.root }), appInput, f.manifest), refuses('TEMPLATE_NOT_CONFIGURED'));
    await assert.rejects(newApp(hostConfigFor({ workspaceRoot: f.root, templateDir: 'relative' }), appInput, f.manifest), refuses('TEMPLATE_NOT_CONFIGURED'));
    assert.deepEqual(await readdir(f.root), []);
  } finally { await f.close(); }
});

test('a CRLF checkout of text files is accepted as the tagged bytes; a changed binary is not', async () => {
  const f = await templateFixture();
  try {
    for (const path of ['CMakeLists.txt', 'main/app_main.c', 'main/idf_component.yml']) {
      const text = await readFile(join(f.templateDir, path), 'utf8');
      await writeFile(join(f.templateDir, path), text.replace(/\n/g, '\r\n'));
    }
    const check = await loadPinnedTemplate(f.config, f.manifest);
    assert.equal(check.lineEndingsNormalised, true);
    const outcome = await newApp(f.config, appInput, f.manifest);
    assert.equal(outcome.template.lineEndingsNormalised, true);
    assert.doesNotMatch(await readFile(join(f.root, 'demo_app', 'CMakeLists.txt'), 'utf8'), /\r/);
    await writeFile(join(f.templateDir, 'appdata', 'icon.png'), Buffer.from([137, 80, 78, 71, 13, 10, 3]));
    await assert.rejects(loadPinnedTemplate(f.config, f.manifest), refuses('TEMPLATE_INTEGRITY_MISMATCH'));
  } finally { await f.close(); }
});

test('manifest inputs that could break out of a C string or the catalogue rules are refused', async () => {
  const f = await templateFixture();
  try {
    const bad: Array<Partial<typeof appInput> & { version?: string; description?: string }> = [
      { displayName: 'Evil"); system("x' }, { displayName: 'Back\\slash' }, { displayName: 'x'.repeat(32) },
      { displayName: ' leading' }, { displayName: 'line\nbreak' },
      { categories: ['hacking'] }, { categories: [] }, { categories: ['tools', 'tools'] },
      { categories: ['ai', 'communication', 'games', 'media', 'tools'] },
      { version: '1.0' }, { version: '1.0.0; rm' }, { description: 'quote " here' }, { description: 'x'.repeat(53) },
    ];
    for (const override of bad) {
      await assert.rejects(newApp(f.config, { ...appInput, ...override }, f.manifest), refuses('MANIFEST_INPUT_INVALID'), JSON.stringify(override));
    }
    await assert.rejects(newApp(f.config, { ...appInput, projectName: '../demo' }, f.manifest), refuses('PROJECT_NAME_INVALID'));
    assert.deepEqual(await readdir(f.root), []);
  } finally { await f.close(); }
});

// ---- kode_validate ----

test('validation passes a well-formed P4 app project and lists what it cannot check', async () => {
  const ws = await workspace();
  try {
    await writeFiles(join(ws.root, 'demo_app'), projectFiles('demo_app'));
    const outcome = await validateProject(ws.config, 'demo_app');
    assert.equal(outcome.verdict, 'pass');
    assert.deepEqual(failedRules(outcome), []);
    assert.deepEqual(outcome.manifest, { displayName: 'Test app', categories: ['tools'] });
    assert.equal(outcome.sdkRelease, PINNED.sdk.tag);
    assert.ok(outcome.rulesNotChecked.some(rule => rule.startsWith('B6')));
    assert.ok(outcome.findings.some(finding => finding.rule === 'B1-URL' && finding.level === 'warn'));
    await assert.rejects(validateProject(ws.config, 'absent_app'), refuses('PROJECT_NOT_FOUND'));
  } finally { await ws.close(); }
});

test('validation rejects S3 targets, a missing app role, bad pins, bad manifests and flash calls', async () => {
  const ws = await workspace();
  const cases: Array<[string, Parameters<typeof projectFiles>[1], string[], Record<string, string>?]> = [
    ['s3_target', { target: 'esp32s3' }, ['B2', 'CK-S3']],
    ['no_role', { role: false }, ['B4']],
    ['old_sdk', { sdkVersion: 'v00.00.27' }, ['B1']],
    ['future_sdk', { sdkVersion: 'v0.1.2' }, ['B1']],
    ['two_manifests', { extraSource: 'KODE_APP_MANIFEST("Second", "games");' }, ['A3']],
    ['bad_category', { manifest: 'KODE_APP_MANIFEST("Name", "hacking");' }, ['A3']],
    ['no_manifest', { manifest: '' }, ['A3']],
    ['ota_call', { extraSource: 'void f(void) { esp_ota_begin(0, 0, 0); }' }, ['C12']],
    ['raw_write', { extraSource: 'void f(void) { esp_partition_write(p, 0, b, 4); }' }, ['C12']],
    ['platformio', {}, ['CK-S3'], { 'platformio.ini': '[env:kode]\nboard = esp32-s3-devkitc-1\n' }],
    ['home_hold', {}, ['D8'], { 'sdkconfig.defaults': 'CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="managed_components/kodediy__kbsp/partitions.csv"\nCONFIG_KODEOS_BOOT_ROLE_APP=y\nCONFIG_KODEOS_HOME_HOLD=n\n' }],
    ['extra_dirs', {}, ['B3-EXTRA'], { 'CMakeLists.txt': 'set(IDF_TARGET esp32p4)\nset(PROJECT_VER "0.1.0")\nset(EXTRA_COMPONENT_DIRS ../kode-sdk/components)\nproject(extra_dirs)\n' }],
    ['override', {}, ['B1'], { 'main/idf_component.yml': 'dependencies:\n  kodediy/kode:\n    git: https://github.com/kodediy/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n    override_path: ../../sdk\n' }],
    ['foreign_git', {}, ['B1'], { 'main/idf_component.yml': 'dependencies:\n  kodediy/kode:\n    git: https://github.com/attacker/kode-sdk.git\n    path: components/kode\n    version: v0.1.1\n' }],
    ['per_target', {}, ['B5'], { 'sdkconfig.defaults.esp32p4': 'CONFIG_X=y\n' }],
    ['bad_appjson', {}, ['A4'], { 'appdata/app.json': '{"kode": "1", "name": "not allowed here"}' }],
  ];
  try {
    for (const [name, options, expected, extra] of cases) {
      await writeFiles(join(ws.root, name), { ...projectFiles(name, options), ...extra });
      const outcome = await validateProject(ws.config, name);
      assert.equal(outcome.verdict, 'fail', name);
      for (const rule of expected) assert.ok(failedRules(outcome).includes(rule), `${name}: expected ${rule}, got ${failedRules(outcome).join(',')}`);
    }
    // The directory name must be the identity: a renamed copy is caught.
    await writeFiles(join(ws.root, 'renamed'), projectFiles('original'));
    assert.ok(failedRules(await validateProject(ws.config, 'renamed')).includes('A2'));
    // A commented-out manifest or target does not count.
    await writeFiles(join(ws.root, 'commented'), projectFiles('commented', { manifest: '/* KODE_APP_MANIFEST("Name", "tools"); */' }));
    assert.ok(failedRules(await validateProject(ws.config, 'commented')).includes('A3'));
  } finally { await ws.close(); }
});

test('raw flash commands in project documents are reported and never executed', async () => {
  const ws = await workspace();
  try {
    await writeFiles(join(ws.root, 'demo_app'), {
      ...projectFiles('demo_app'),
      'README.md': 'python -m esptool --chip esp32p4 write-flash 0x1C00000 build/demo_app.bin\n',
    });
    const outcome = await validateProject(ws.config, 'demo_app');
    assert.equal(outcome.verdict, 'pass');
    assert.ok(outcome.findings.some(finding => finding.rule === 'CK-RAWFLASH' && finding.level === 'warn'));
  } finally { await ws.close(); }
});

// ---- kode_inspect_image ----

async function builtProject(name: string, image: Buffer, options?: Parameters<typeof buildOutputs>[2]) {
  const ws = await workspace();
  await writeFiles(join(ws.root, name), { ...projectFiles(name), ...buildOutputs(name, image, options) });
  return ws;
}
const failedChecks = (inspection: Awaited<ReturnType<typeof inspectImage>>) =>
  inspection.checks.filter(check => !check.pass).map(check => check.id);

test('a P4 app-role image reaches install-compatible and is never reported device verified', async () => {
  const image = fakeImage({ project: 'demo_app', version: '0.1.0' });
  const ws = await builtProject('demo_app', image);
  try {
    const inspection = await inspectImage(ws.config, 'demo_app');
    assert.equal(inspection.stage, 'kodeos_install_compatible');
    assert.deepEqual(inspection.stages, { sourceProject: true, compiledImage: true, kodeosInstallCompatible: true, deviceVerified: false });
    assert.equal(inspection.deviceVerification, 'NOT TESTED');
    assert.equal(inspection.header.chip, 'esp32p4');
    assert.equal(inspection.artefact.sha256, sha256(image));
    assert.equal(inspection.artefact.sizeBytes, image.length);
    assert.deepEqual(inspection.appDescriptor, { projectName: 'demo_app', version: '0.1.0', idfVersion: 'v6.1', buildDate: 'Nov 13 2026', buildTime: '21:14:03' });
    assert.deepEqual(inspection.manifest, { version: 2, displayName: 'Test app', categories: ['tools'] });
    assert.equal(inspection.buildMetadata.flashPlan, 'mailbox_only');
    assert.deepEqual(failedChecks(inspection), []);
  } finally { await ws.close(); }
});

test('an S3 image supplied for the P4 target is identified and reaches no stage', async () => {
  const ws = await builtProject('demo_app', fakeImage({ project: 'demo_app', chipId: 0x0009 }));
  try {
    const inspection = await inspectImage(ws.config, 'demo_app');
    assert.equal(inspection.header.chip, 'esp32s3');
    assert.equal(inspection.stage, 'source_project');
    assert.equal(inspection.stages.compiledImage, false);
    assert.equal(inspection.stages.kodeosInstallCompatible, false);
    assert.ok(failedChecks(inspection).includes('image.chip'));
  } finally { await ws.close(); }
});

test('a compiled image is not called install-compatible unless every contract check passes', async () => {
  const cases: Array<[string, Buffer, Parameters<typeof buildOutputs>[2], string]> = [
    ['no manifest', fakeImage({ project: 'demo_app', manifest: null }), undefined, 'app.manifest'],
    ['unknown manifest version', fakeImage({ project: 'demo_app', manifest: { name: 'X', category: 'tools', version: 9 } }), undefined, 'app.manifest'],
    ['OS role', fakeImage({ project: 'demo_app' }), { appRole: false }, 'app.boot_role'],
    ['factory flash plan', fakeImage({ project: 'demo_app' }),
      { flashFiles: { '0x2000': 'bootloader/bootloader.bin', '0x8000': 'partition_table/partition-table.bin', '0x20000': 'demo_app.bin' } }, 'app.flash_plan'],
    ['README raw offset', fakeImage({ project: 'demo_app' }), { flashFiles: { '0x1c00000': 'demo_app.bin' } }, 'app.flash_plan'],
    ['other file at mailbox', fakeImage({ project: 'demo_app' }), { flashFiles: { '0x1a00000': 'kodeos.bin' } }, 'app.flash_plan'],
    ['old ESP-IDF', fakeImage({ project: 'demo_app', idf: 'v6.0.1' }), undefined, 'image.idf_version'],
    ['over 8 MiB', fakeImage({ project: 'demo_app', size: 8 * 1024 * 1024 + 1 }), undefined, 'app.size'],
  ];
  for (const [label, image, options, failing] of cases) {
    const ws = await builtProject('demo_app', image, options);
    try {
      const inspection = await inspectImage(ws.config, 'demo_app');
      assert.equal(inspection.stage, 'compiled_image', label);
      assert.equal(inspection.stages.kodeosInstallCompatible, false, label);
      assert.ok(failedChecks(inspection).includes(failing), `${label}: ${failedChecks(inspection).join(',')}`);
    } finally { await ws.close(); }
  }
});

test('missing build metadata, wrong identity and oversize-for-mailbox are reported as they are', async () => {
  const ws = await workspace();
  try {
    const project = join(ws.root, 'demo_app');
    await writeFiles(project, { ...projectFiles('demo_app'), 'build/demo_app.bin': fakeImage({ project: 'someone_else' }) });
    const foreign = await inspectImage(ws.config, 'demo_app');
    assert.equal(foreign.stage, 'source_project');
    assert.ok(failedChecks(foreign).includes('image.identity'));
    assert.equal(foreign.buildMetadata.flashPlan, 'unreadable');
    assert.equal(foreign.buildMetadata.bootRoleApp, null);

    await writeFiles(project, buildOutputs('demo_app', fakeImage({ project: 'demo_app', size: MAILBOX.imageMax + 1 })));
    const large = await inspectImage(ws.config, 'demo_app');
    assert.equal(large.size.fitsMailbox, false);
    assert.equal(large.size.fitsCatalogue, true);
    // The flash plan is mailbox-only, so an image the mailbox cannot hold is not
    // install-compatible by that route (review finding 8).
    assert.equal(large.stage, 'compiled_image');
    assert.equal(large.stages.kodeosInstallCompatible, false);
    assert.ok(failedChecks(large).includes('app.size'));
  } finally { await ws.close(); }
});

test('absent, malformed and impossible images are refused with distinct reasons', async () => {
  const ws = await workspace();
  try {
    const project = join(ws.root, 'demo_app');
    await writeFiles(project, projectFiles('demo_app'));
    await assert.rejects(inspectImage(ws.config, 'demo_app'), refuses('IMAGE_NOT_FOUND'));
    await writeFiles(project, { 'build/demo_app.bin': Buffer.from('not an image at all, just text'.repeat(20)) });
    await assert.rejects(inspectImage(ws.config, 'demo_app'), refuses('IMAGE_MALFORMED'));
    await writeFiles(project, { 'build/demo_app.bin': Buffer.alloc(16 * 1024 * 1024 + 1) });
    await assert.rejects(inspectImage(ws.config, 'demo_app'), refuses('IMAGE_TOO_LARGE'));
    assert.throws(() => parseImage(Buffer.alloc(8)), refuses('IMAGE_MALFORMED'));
    assert.equal(parseImage(fakeImage({ chipId: 0x0017 })).chip, 'esp32c5');
    assert.match(parseImage(fakeImage({ chipId: 0x7777 })).chip, /^unknown/);
  } finally { await ws.close(); }
});

// ---- kode_build ----

// A build needs a project whose build logic is the pinned template's, so the
// fixture scaffolds one from a stand-in template and pins builds to its manifest.
async function buildFixture(idfVersion: [number, number, number] = [6, 1, 0], commit?: string) {
  const ws = await workspace();
  const idf = await fakeIdf(ws.dir, idfVersion, commit);
  const templateDir = join(ws.dir, 'template');
  const standIn = standInTemplate();
  await writeFiles(templateDir, standIn.files);
  const config = hostConfigFor({ workspaceRoot: ws.root, templateDir, buildEnabled: true, ...idf });
  await newApp(config, appInput, standIn.manifest);
  return { ...ws, ...idf, pinnedFiles: standIn.manifest, config };
}
type Call = { program: string; args: readonly string[]; cwd: string };
const recorder = (calls: Call[], behaviour: (call: Call) => Promise<{ exitCode: number | null; timedOut: boolean; output: string }>): BuildRunner =>
  async (program, args, options) => {
    const call = { program, args, cwd: options.cwd };
    calls.push(call);
    return behaviour(call);
  };

test('a build runs exactly one fixed idf.py build command and reports L1 evidence only', async () => {
  const f = await buildFixture();
  const calls: Call[] = [];
  const image = fakeImage({ project: 'demo_app' });
  try {
    const project = join(f.root, 'demo_app');
    const outcome = await buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: recorder(calls, async () => {
        await writeFiles(project, buildOutputs('demo_app', image));
        return { exitCode: 0, timedOut: false, output: 'Project build complete.' };
      }),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.program, f.idfPython);
    assert.equal(calls[0]?.cwd, project);
    assert.deepEqual(calls[0]?.args, [join(f.idfPath, 'tools', 'idf.py'), '-C', project, '-B', join(project, 'build'), 'build']);
    assert.deepEqual(outcome.command.arguments, calls[0]?.args);
    assert.equal(outcome.stage, 'kodeos_install_compatible');
    assert.equal(outcome.inspection.artefact.sha256, sha256(image));
    assert.equal(outcome.inspection.stages.deviceVerified, false);
    assert.deepEqual({ level: outcome.evidence.level, result: outcome.evidence.result }, { level: 'L1', result: 'passed' });
    assert.equal(outcome.reproduciblyPinned, true);
    assert.equal(outcome.toolchain.idfVersion, '6.1.0');
    assert.equal(outcome.toolchain.sdkRelease, PINNED.sdk.tag);
  } finally { await f.close(); }
});

test('no build argument vector can carry a flash, erase, monitor or install verb', () => {
  const forbidden = /^(flash|app-flash|erase-flash|erase_flash|monitor|write-flash|write_flash|install|encrypted-flash|dfu-flash|uf2)$/;
  for (const project of ['C:\\ws\\demo_app', '/ws/demo app', '/ws/flash', '/ws/x && idf.py flash']) {
    const args = buildArguments('/opt/esp-idf', project);
    assert.equal(args.length, 6);
    assert.equal(args.at(-1), 'build');
    assert.equal(args.filter(arg => forbidden.test(arg)).length, 0);
    assert.equal(args[2], project);
  }
});

test('builds are refused when not enabled, misconfigured or on the wrong ESP-IDF, before any process starts', async () => {
  const calls: Call[] = [];
  const runner = recorder(calls, async () => ({ exitCode: 0, timedOut: false, output: '' }));
  const f = await buildFixture();
  const old = await buildFixture([6, 0, 1]);
  try {
    await assert.rejects(buildApp({ ...f.config, buildEnabled: false }, 'demo_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('BUILD_NOT_ENABLED'));
    await assert.rejects(buildApp({ ...f.config, idfPath: '' }, 'demo_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('TOOLCHAIN_NOT_CONFIGURED'));
    await assert.rejects(buildApp({ ...f.config, idfPython: '' }, 'demo_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('TOOLCHAIN_NOT_CONFIGURED'));
    await assert.rejects(buildApp({ ...f.config, idfPath: f.root }, 'demo_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('TOOLCHAIN_NOT_CONFIGURED'));
    await assert.rejects(buildApp(old.config, 'demo_app', { run: runner, pinnedFiles: old.pinnedFiles }), refuses('TOOLCHAIN_VERSION_MISMATCH'));
    await assert.rejects(buildApp(f.config, '../demo_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('PROJECT_NAME_INVALID'));
    await assert.rejects(buildApp(f.config, 'absent_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('PROJECT_NOT_FOUND'));
    assert.equal(calls.length, 0);
  } finally { await f.close(); await old.close(); }
});

test('a project that fails validation is never built', async () => {
  const f = await buildFixture();
  const calls: Call[] = [];
  try {
    await writeFiles(join(f.root, 's3_app'), projectFiles('s3_app', { target: 'esp32s3' }));
    await writeFiles(join(f.root, 'os_role'), projectFiles('os_role', { role: false }));
    const runner = recorder(calls, async () => ({ exitCode: 0, timedOut: false, output: '' }));
    await assert.rejects(buildApp(f.config, 's3_app', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('VALIDATION_FAILED'));
    await assert.rejects(buildApp(f.config, 'os_role', { run: runner, pinnedFiles: f.pinnedFiles }), refuses('VALIDATION_FAILED'));
    assert.equal(calls.length, 0);
  } finally { await f.close(); }
});

test('failed, timed-out and empty builds are failures, with no retry and no success claim', async () => {
  const f = await buildFixture();
  try {
    for (const [result, code] of [
      [{ exitCode: 2, timedOut: false, output: 'ninja: build stopped' }, 'BUILD_FAILED'],
      [{ exitCode: null, timedOut: true, output: '' }, 'BUILD_TIMEOUT'],
      [{ exitCode: 0, timedOut: false, output: 'done' }, 'BUILD_OUTPUT_MISSING'],
    ] as const) {
      const calls: Call[] = [];
      await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: recorder(calls, async () => result) }), (error: unknown) => {
        refuses(code)(error);
        assert.equal((error as KodeRefusal).status, 'failed');
        return true;
      });
      assert.equal(calls.length, 1, code);
    }
    const calls: Call[] = [];
    await assert.rejects(buildApp(f.config, 'demo_app', { pinnedFiles: f.pinnedFiles, run: recorder(calls, async () => { throw new Error('spawn ENOENT'); }) }), refuses('BUILD_FAILED'));
    assert.equal(calls.length, 1);
  } finally { await f.close(); }
});

test('a build on an unpinned ESP-IDF commit is reported as not reproducibly pinned', async () => {
  const f = await buildFixture([6, 1, 0], 'a'.repeat(40));
  try {
    const project = join(f.root, 'demo_app');
    const outcome = await buildApp(f.config, 'demo_app', {
      pinnedFiles: f.pinnedFiles,
      run: async () => {
        await writeFiles(project, buildOutputs('demo_app', fakeImage({ project: 'demo_app' })));
        return { exitCode: 0, timedOut: false, output: '' };
      },
    });
    assert.equal(outcome.reproduciblyPinned, false);
    assert.equal(outcome.toolchain.idfCommitMatchesPin, false);
  } finally { await f.close(); }
});

test('the real process runner uses no shell, reports exit codes and stops at the deadline', async () => {
  const options = { cwd: process.cwd(), env: process.env, timeoutMs: 20_000 };
  const exit = await systemBuildRunner(process.execPath, ['-e', 'process.exit(3)'], options);
  assert.deepEqual({ exitCode: exit.exitCode, timedOut: exit.timedOut }, { exitCode: 3, timedOut: false });
  // Shell metacharacters arrive as one literal argument; nothing after & or | runs.
  const literal = '& echo INJECTED | more > injected.txt ; $(id) `id` %PATH%';
  const echoed = await systemBuildRunner(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal], options);
  assert.equal(echoed.output, literal);
  const slow = await systemBuildRunner(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { ...options, timeoutMs: 300 });
  assert.equal(slow.timedOut, true);
  await assert.rejects(systemBuildRunner(join(process.cwd(), 'no-such-program-ck'), [], options));
});

// ---- kode_get_toolchain_status ----

test('toolchain status reads configuration only and names every build blocker', async () => {
  const empty = await toolchainStatus(hostConfig({}), {});
  assert.equal(empty.build.ready, false);
  assert.equal(empty.build.blockers.length, 4);
  assert.deepEqual(empty.template, { configured: false, matchesPinnedTag: null, detail: 'KODE_TEMPLATE_DIR is not set.' });
  assert.equal(empty.idf.commitMatchesPin, null);
  assert.equal(empty.console.readsEnabled, false);

  const f = await buildFixture();
  try {
    const ready = await toolchainStatus(f.config, { KODE_CLI_SHA256: 'A8C65236B51A904EE879C4EE1776612065417FAE45EB4D15DC367C0CB737BCCA' });
    assert.equal(ready.build.ready, true);
    assert.deepEqual(ready.idf, { configured: true, version: '6.1.0', seriesSupported: true, commit: PINNED.idf.commit, commitMatchesPin: true, pythonConfigured: true });
    assert.equal(ready.console.cliPinMatchesRelease, 'v0.1.1');
    const previous = await toolchainStatus(f.config, { KODE_CLI_SHA256: '8df04628aa2b2acf09bc60d42814a573e7545cdf99f07ad0318ca723d39ca750' });
    assert.equal(previous.console.cliPinMatchesRelease, 'v0.1.0');
  } finally { await f.close(); }
});

test('host configuration is bounded and off by default', () => {
  const defaults = hostConfig({});
  assert.equal(defaults.buildEnabled, false);
  assert.equal(defaults.buildTimeoutMs, 1_800_000);
  assert.equal(hostConfig({ KODE_ENABLE_BUILD: 'true' }).buildEnabled, false);
  assert.equal(hostConfig({ KODE_ENABLE_BUILD: '1' }).buildEnabled, true);
  for (const value of ['5', '999999', 'abc', '-1', '60.5']) {
    assert.equal(hostConfig({ KODE_BUILD_TIMEOUT_S: value }).buildTimeoutMs, 1_800_000, value);
  }
  assert.equal(hostConfig({ KODE_BUILD_TIMEOUT_S: '600' }).buildTimeoutMs, 600_000);
});
