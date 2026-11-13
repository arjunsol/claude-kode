/** Drives the built server as a separate process through an independent MCP
 * client. These tests exercise host control flow only: no device is attached,
 * no ESP-IDF build runs, and none of this is evidence about real hardware.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { TOOL_NAMES } from '../src/app.js';
import { PINNED, PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';
import { resultSchema } from '../src/result.js';
import { buildOutputs, fakeImage, projectFiles, sha256, tempDir, writeFiles } from './helpers.js';

const envelope = resultSchema(z.unknown());
const profileId = PRODUCTION_PROFILE_ID;
/** Optional: a real checkout of the official template, to exercise kode_new_app end to end. */
const realTemplate = process.env.KODE_TEST_TEMPLATE_DIR ?? '';

let client: Client;
let transport: StdioClientTransport;
let stderr = '';
let temp: Awaited<ReturnType<typeof tempDir>>;
let workspaceRoot: string;

before(async () => {
  temp = await tempDir('ck-proto-');
  workspaceRoot = join(temp.dir, 'workspace');
  await mkdir(workspaceRoot);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    // No test may reach attached hardware or a real toolchain through inherited configuration.
    KODE_ENABLE_CONSOLE_READS: '0',
    KODE_ENABLE_BUILD: '0',
    KODE_WORKSPACE_ROOT: workspaceRoot,
  };
  if (realTemplate) env.KODE_TEMPLATE_DIR = realTemplate;
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
    stderr: 'pipe', env,
  });
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  client = new Client({ name: 'independent-f1-test-client', version: '0.0.0' });
  await client.connect(transport);
});

after(async () => {
  await client.close();
  await temp.close();
  assert.equal(stderr, '', 'the server wrote to stderr');
});

type Envelope = z.infer<typeof envelope> & { payload?: any };
async function call(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; result: Envelope }> {
  const response = await client.callTool({ name, arguments: args });
  assert.ok(response.structuredContent, `${name} returned no structured content: ${JSON.stringify(response.content)}`);
  const result = envelope.parse(response.structuredContent) as Envelope;
  // The text channel carries the same value, so a client that ignores structure sees it too.
  const first = (response.content as Array<{ type: string; text?: string }>)[0];
  assert.deepEqual(JSON.parse(first?.text ?? '{}'), response.structuredContent);
  assert.equal(result.tool, name);
  assert.equal(result.hardwareAuthorized, false);
  return { isError: response.isError === true, result };
}
/** A call the server must reject at its schema boundary, before any handler runs. */
async function rejected(name: string, args: Record<string, unknown>): Promise<void> {
  const response = await client.callTool({ name, arguments: args });
  assert.equal(response.isError, true, `${name} accepted ${JSON.stringify(args)}`);
  assert.equal(response.structuredContent, undefined);
}

test('the server advertises exactly the documented tools and nothing that writes to a device', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), [...TOOL_NAMES]);
  assert.equal(client.getServerVersion()?.version, '0.2.0');
  for (const tool of tools) {
    assert.doesNotMatch(tool.name, /flash|erase|install|remove|run_command|serial|transmit|send|move|gpio|ota|exec|shell/i);
    const properties = Object.keys((tool.inputSchema as { properties?: object }).properties ?? {});
    for (const property of properties) {
      assert.doesNotMatch(property, /path|dir|command|cmd|args|offset|address|port|approv|force|confirm|token/i, `${tool.name}.${property}`);
    }
    assert.equal((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties, false, tool.name);
  }
  for (const name of ['kode_new_app', 'kode_build']) {
    assert.equal(tools.find(tool => tool.name === name)?.annotations?.readOnlyHint, false);
  }
});

test('tools that do not exist cannot be invoked, including every raw-flash spelling', async () => {
  for (const name of ['kode_flash', 'kode_raw_flash', 'kode_write_flash', 'kode_erase_flash', 'kode_esptool',
    'kode_install_app', 'kode_app_remove', 'kode_serial_monitor', 'kode_run_command', 'kode_kcli', 'kode_shell',
    'kode_robotics_move', 'kode_mesh_send', 'kode_rf_lab_transmit', 'kode_maker_gpio_control', 'kode_camera_capture']) {
    const response = await client.callTool({ name, arguments: { offset: '0x1C00000', file: 'app.bin', approved: true } });
    assert.equal(response.isError, true, name);
  }
});

test('falsified approvals and unknown arguments are rejected by every F1 tool', async () => {
  const valid: Record<string, Record<string, unknown>> = {
    kode_get_capabilities: { profileId }, kode_get_pinout: { profileId }, kode_list_modules: { profileId },
    kode_get_module_spec: { profileId, moduleId: 'maker' }, kode_get_evidence: { profileId },
    kode_check_compatibility: { profileId, operation: 'install_app' }, kode_get_sdk_contract: { profileId },
    kode_get_toolchain_status: {}, kode_new_app: { projectName: 'x1', displayName: 'X', categories: ['tools'] },
    kode_validate: { projectName: 'x1' }, kode_build: { projectName: 'x1' }, kode_inspect_image: { projectName: 'x1' },
  };
  const forged = [{ approved: true }, { approvalHandle: 'owner-ok' }, { hardwareAuthorized: true }, { force: true },
    { confirm: 'yes' }, { evidenceClass: 'device_verified' }, { deviceVerified: true }, { identityObserved: true },
    { consoleReadsEnabled: true }, { now: '2020-01-01' }, { workspaceRoot: 'C:\\' }, { extraArgs: ['flash'] }];
  for (const [name, args] of Object.entries(valid)) {
    for (const extra of forged) await rejected(name, { ...args, ...extra });
  }
  // The forged calls created nothing.
  assert.equal(existsSync(join(workspaceRoot, 'x1')), false);
});

test('malformed tool arguments are rejected at the schema boundary', async () => {
  await rejected('kode_get_capabilities', {});
  await rejected('kode_get_capabilities', { profileId: 5 });
  await rejected('kode_get_capabilities', { profileId: '../../etc/passwd' });
  await rejected('kode_get_capabilities', { profileId, sdkRelease: 'latest' });
  await rejected('kode_get_capabilities', { profileId, sdkRelease: 'v0.1.1; rm -rf /' });
  await rejected('kode_get_capabilities', { profileId, boardRevision: 'DVT\n--flash' });
  await rejected('kode_get_pinout', { profileId, position: 'eight' });
  await rejected('kode_get_pinout', { profileId, position: 1.5 });
  await rejected('kode_get_pinout', { profileId, gpio: 1e9 });
  await rejected('kode_get_module_spec', { profileId });
  await rejected('kode_get_module_spec', { profileId, moduleId: 'maker; drop' });
  await rejected('kode_check_compatibility', { profileId, operation: 'flash_everything' });
  await rejected('kode_check_compatibility', { profileId, operation: 'build_app', imageChip: 'stm32' });
  await rejected('kode_check_compatibility', { profileId });
  await rejected('kode_get_evidence', { profileId, subject: 'everything' });
  await rejected('kode_new_app', { projectName: 'ok_app', displayName: 'Ok', categories: 'tools' });
  await rejected('kode_new_app', { projectName: 'ok_app', displayName: 'Ok' });
  await rejected('kode_validate', { projectName: ['demo'] });
  await rejected('kode_validate', { projectName: 'x'.repeat(4000) });
  await rejected('kode_build', {});
});

test('capabilities are served with provenance for assessed releases only', async () => {
  // The full list includes the two contradicting flash-offset claims, so the
  // answer as a whole is served but flagged; a single clean capability is ok.
  const { isError, result } = await call('kode_get_capabilities', { profileId });
  assert.equal(isError, false);
  assert.equal(result.status, 'not_verified');
  assert.equal(result.reasonCode, 'EVIDENCE_CONFLICTING');
  assert.equal((await call('kode_get_capabilities', { profileId, capability: 'main_chip' })).result.status, 'ok');
  assert.equal(result.effectClass, 'S0');
  assert.equal(result.verifiedLayer, 'documentation');
  assert.equal(result.payload.deviceVerified, false);
  assert.equal(result.payload.profile.pinnedSdkRelease, 'v0.1.1');
  assert.ok(result.payload.availableCapabilities.includes('expansion_j3'));
  assert.ok(result.payload.unknowns.length > 0);
  assert.ok(result.evidence.length > 20);
  for (const ref of result.evidence) {
    assert.match(ref.sourceUri, /^https:\/\/github\.com\//);
    assert.notEqual(ref.class, 'device_verified');
    assert.notEqual(ref.class, 'integration_verified');
  }
  assert.ok(result.evidence.some(ref => ref.revision === PINNED.sdk.commit));

  const flash = await call('kode_get_capabilities', { profileId, capability: 'flash', boardRevision: 'DVT', sdkRelease: 'v0.1.1' });
  assert.equal(flash.result.status, 'ok');
  assert.equal(flash.result.verifiedLayer, 'source');
  assert.equal(flash.result.payload.capabilities[0].claims[0].value.sizeMb, 32);

  // v0.1.0 stays assessed, but a fact introduced by v0.1.1 is not served for it.
  const newer = await call('kode_get_capabilities', { profileId, capability: 'wifi_frames', sdkRelease: 'v0.1.1' });
  assert.equal(newer.result.payload.capabilities.length, 1);
  const older = await call('kode_get_capabilities', { profileId, capability: 'wifi_frames', sdkRelease: 'v0.1.0' });
  assert.equal(older.result.payload.capabilities.length, 0);

  const unknown = await call('kode_get_capabilities', { profileId, capability: 'lidar' });
  assert.equal(unknown.result.status, 'unsupported');
  assert.equal(unknown.result.reasonCode, 'CAPABILITY_UNKNOWN');
});

test('unknown boards, wrong revisions, unassessed SDK releases and the S3 prototype get no facts', async () => {
  const cases: Array<[Record<string, unknown>, string, string, boolean]> = [
    // Every one is a refusal and an MCP tool error: a client that reads only the
    // error flag or the text must not take any of these for an answer.
    [{ profileId: 'kode-dot-pro' }, 'refused', 'PROFILE_UNKNOWN', true],
    [{ profileId: 'simulated-p4-c5' }, 'refused', 'PROFILE_UNKNOWN', true],
    [{ profileId: 'kode-dot-s3-prototype' }, 'refused', 'PROFILE_ARCHIVED_PROTOTYPE', true],
    [{ profileId, boardRevision: 'EVT' }, 'refused', 'BOARD_REVISION_NOT_IN_PROFILE', true],
    [{ profileId, boardRevision: 'PVT-2' }, 'refused', 'BOARD_REVISION_NOT_IN_PROFILE', true],
    [{ profileId, sdkRelease: 'v0.1.2' }, 'refused', 'SDK_RELEASE_NOT_ASSESSED', true],
    [{ profileId, sdkRelease: 'v1.0.0' }, 'refused', 'SDK_RELEASE_NOT_ASSESSED', true],
  ];
  for (const tool of ['kode_get_capabilities', 'kode_get_pinout', 'kode_get_evidence']) {
    for (const [args, status, reasonCode, isError] of cases) {
      const response = await call(tool, args);
      assert.equal(response.result.status, status, `${tool} ${JSON.stringify(args)}`);
      assert.equal(response.result.reasonCode, reasonCode);
      assert.equal(response.isError, isError);
      assert.equal(response.result.payload, undefined, 'facts leaked for an unsupported target');
      assert.deepEqual(response.result.evidence, []);
    }
  }
});

test('the pinout answers for J3 only and refuses pins it cannot speak for', async () => {
  const all = await call('kode_get_pinout', { profileId });
  assert.equal(all.result.status, 'ok');
  assert.equal(all.result.payload.positions.length, 14);
  assert.equal(all.result.payload.seriesResistanceOhms, 68);
  assert.equal(all.result.payload.controllers.length, 7);
  assert.equal(all.result.payload.unknowns.length, 2);
  assert.deepEqual((await call('kode_get_pinout', { profileId, position: 8 })).result.payload.positions,
    [{ position: 8, gpio: 21, adc1Channel: 5, lowPower: false }]);
  assert.deepEqual((await call('kode_get_pinout', { profileId, gpio: 16 })).result.payload.positions,
    [{ position: 14, gpio: 16, adc1Channel: 0, lowPower: false }]);
  for (const args of [{ position: 0 }, { position: 15 }, { position: -1 }, { gpio: 22 }, { gpio: 48 }, { gpio: 99 },
    { position: 1, gpio: 21 }]) {
    const bad = await call('kode_get_pinout', { profileId, ...args });
    assert.equal(bad.result.status, 'unsupported', JSON.stringify(args));
    assert.equal(bad.result.reasonCode, 'PIN_NOT_ON_J3');
    assert.equal(bad.result.payload, undefined);
  }
  // An S3-era pin number that the production board uses for its own bus is named as such.
  assert.match((await call('kode_get_pinout', { profileId, gpio: 4 })).result.message, /system I2C/);
});

test('modules are catalogued, never detected, and unknown modules get no invented specification', async () => {
  const list = await call('kode_list_modules', { profileId });
  assert.deepEqual(list.result.payload.modules.map((module: { id: string }) => module.id), ['maker', 'robotics', 'camera', 'mesh', 'fck']);
  for (const module of list.result.payload.modules) {
    assert.equal(module.attachment, 'not_detectable');
    assert.deepEqual(module.qualification, { L1: 'NOT TESTED', L2: 'NOT TESTED', L3: 'NOT TESTED', L4: 'NOT TESTED' });
    assert.equal(module.v1Required, true);
  }
  assert.equal(list.result.requiredNextEvidence.length, 5);

  for (const moduleId of ['maker', 'robotics', 'camera', 'mesh', 'fck']) {
    const spec = await call('kode_get_module_spec', { profileId, moduleId });
    assert.equal(spec.result.status, 'not_verified', moduleId);
    assert.equal(spec.result.reasonCode, 'MODULE_NOT_QUALIFIED');
    assert.deepEqual(spec.result.payload.supportedOperations, []);
    assert.ok(spec.result.payload.unknowns.length >= 3);
    const text = JSON.stringify(spec.result.payload);
    assert.doesNotMatch(text, /"(voltage|currentMa|pins|chipset|frequencyMhz|i2cAddress)"\s*:/, 'a module specification was invented');
  }
  for (const moduleId of ['lidar', 'gps', 'unknown', 'maker2']) {
    const spec = await call('kode_get_module_spec', { profileId, moduleId });
    assert.equal(spec.result.status, 'unsupported', moduleId);
    assert.equal(spec.result.reasonCode, 'MODULE_UNKNOWN');
    assert.equal(spec.result.payload, undefined);
  }
});

test('the evidence ledger reports conflicts, unknowns and the absence of test records', async () => {
  const ledger = await call('kode_get_evidence', { profileId });
  assert.equal(ledger.result.payload.summary.conflicting, 4);
  assert.ok(ledger.result.payload.summary.unknown >= 15);
  assert.equal(ledger.result.payload.summary.stale, 0);
  assert.deepEqual(ledger.result.payload.testRecords, []);
  assert.deepEqual(ledger.result.payload.qualification, { L1: 'NOT TESTED', L2: 'NOT TESTED', L3: 'NOT TESTED', L4: 'NOT TESTED' });

  const conflict = await call('kode_get_evidence', { profileId, claimId: 'sdk.app.mailbox.partition_offset' });
  assert.equal(conflict.result.status, 'not_verified');
  assert.equal(conflict.result.reasonCode, 'EVIDENCE_CONFLICTING');
  assert.deepEqual(conflict.result.payload.claims[0].conflictsWith, ['sdk.template.readme_raw_offset']);

  const missing = await call('kode_get_evidence', { profileId, claimId: 'board.identity.revision_observed' });
  assert.equal(missing.result.reasonCode, 'EVIDENCE_MISSING');
  assert.deepEqual(missing.result.evidence, []);

  const absent = await call('kode_get_evidence', { profileId, claimId: 'board.does.not.exist' });
  assert.equal(absent.result.reasonCode, 'CLAIM_UNKNOWN');

  const delta = await call('kode_get_evidence', { profileId, claimId: 'sdk.release.delta_v0_1_1' });
  assert.equal(delta.result.status, 'ok');
  assert.ok(delta.result.payload.claims[0].value.identicalFiles.includes('components/kbsp/partitions.csv'));
});

test('compatibility checks refuse device operations for stated reasons and never authorise', async () => {
  const build = await call('kode_check_compatibility', { profileId, operation: 'build_app', sdkRelease: 'v0.1.1', idfVersion: 'v6.1' });
  assert.equal(build.result.payload.decision, 'allowed');
  assert.equal(build.result.payload.grantsAuthorisation, false);
  assert.equal(build.result.payload.advisoryOnly, true);

  const expectations: Array<[Record<string, unknown>, string[]]> = [
    [{ operation: 'raw_flash' }, ['RAW_FLASH_NEVER_SUPPORTED']],
    [{ operation: 'erase_flash' }, ['OPERATION_EXCLUDED_FROM_TOOLSET']],
    [{ operation: 'c5_firmware_update' }, ['OPERATION_EXCLUDED_FROM_TOOLSET']],
    [{ operation: 'install_app' }, ['EVIDENCE_CONFLICTING', 'DEVICE_IDENTITY_NOT_OBSERVED', 'NO_AUTHORISATION_CHANNEL']],
    [{ operation: 'install_app', imageChip: 'esp32s3' }, ['IMAGE_CHIP_MISMATCH']],
    [{ operation: 'build_app', sdkRelease: 'v0.1.2' }, ['SDK_RELEASE_NOT_ASSESSED']],
    [{ operation: 'build_app', boardRevision: 'EVT' }, ['BOARD_REVISION_NOT_IN_PROFILE']],
    [{ operation: 'build_app', idfVersion: '6.0.1' }, ['IDF_VERSION_UNSUPPORTED']],
    [{ operation: 'console_read' }, ['CONSOLE_READS_NOT_ENABLED']],
    [{ operation: 'console_read', kodeosRelease: 'v0.1.2' }, ['KODEOS_RELEASE_NOT_ASSESSED']],
    [{ operation: 'robotics_move', moduleId: 'robotics' }, ['MODULE_SDK_UNAVAILABLE', 'MODULE_NOT_QUALIFIED']],
    [{ operation: 'rf_lab_transmit', moduleId: 'fck' }, ['MODULE_SDK_UNAVAILABLE', 'NO_AUTHORISATION_CHANNEL']],
    [{ operation: 'camera_capture', moduleId: 'lidar' }, ['MODULE_UNKNOWN']],
    [{ operation: 'maker_gpio_control' }, ['MODULE_REQUIRED']],
  ];
  assert.equal(build.result.status, 'ok');
  assert.equal(build.isError, false);
  assert.deepEqual(build.result.payload.cautions, []);
  for (const [args, codes] of expectations) {
    const { isError, result } = await call('kode_check_compatibility', { profileId, ...args });
    assert.equal(result.payload.decision, 'refused', JSON.stringify(args));
    for (const code of codes) assert.ok(result.payload.reasonCodes.includes(code), `${JSON.stringify(args)} lacks ${code}`);
    assert.equal(result.payload.grantsAuthorisation, false);
    assert.match(result.message, /^Decision: REFUSED/);
    // A refused decision is a refusal at every level, not an "ok" with a payload to read.
    assert.equal(result.status, 'refused', JSON.stringify(args));
    assert.equal(result.reasonCode, result.payload.reasonCodes[0]);
    assert.equal(isError, true);
  }
  const s3 = await call('kode_check_compatibility', { profileId: 'kode-dot-s3-prototype', operation: 'build_app' });
  assert.ok(s3.result.payload.reasonCodes.includes('PROFILE_ARCHIVED_PROTOTYPE'));
  // A console read carries its cautions even when it is refused for lack of opt-in.
  const serial = await call('kode_check_compatibility', { profileId, operation: 'console_read' });
  assert.equal(serial.result.payload.cautions.length, 2);
  assert.match(serial.result.payload.cautions[0], /resets the Dot/);
});

test('the SDK contract reports v0.1.1, the unchanged partition table and the standing offset conflict', async () => {
  const { result } = await call('kode_get_sdk_contract', { profileId });
  assert.equal(result.status, 'ok');
  assert.equal(result.payload.release, 'v0.1.1');
  assert.deepEqual(result.payload.assessedSdkReleases, ['v0.1.0', 'v0.1.1']);
  assert.equal(result.payload.toolchain.idfCommit, PINNED.idf.commit);
  assert.equal(result.payload.installation.mailbox.offset, '0x1A00000');
  assert.equal(result.payload.installation.conflict.templateReadmeOffset, '0x1C00000');
  assert.match(result.payload.installation.status, /NOT IMPLEMENTED/);
  assert.ok(result.payload.changesInV011.length >= 5);
  // Console tool digests are keyed by kodeOS release: what runs on a Dot is
  // independent of the SDK release an app pins.
  const digests = { 'v0.1.1': 'a8c65236b51a904ee879c4ee1776612065417fae45eb4d15dc367c0cb737bcca', 'v0.1.0': '8df04628aa2b2acf09bc60d42814a573e7545cdf99f07ad0318ca723d39ca750' };
  for (const [release, digest] of Object.entries(digests)) {
    assert.equal(result.payload.console.integrityByKodeosRelease[release].kcli.sha256, digest);
  }
  assert.equal(result.payload.examples.length, 17);
  assert.ok(result.payload.hazards.some((hazard: string) => /installs it there/.test(hazard)));
  const previous = await call('kode_get_sdk_contract', { profileId, sdkRelease: 'v0.1.0' });
  assert.equal(previous.result.payload.release, 'v0.1.0');
  assert.deepEqual(previous.result.payload.changesInV011, []);
  for (const [release, digest] of Object.entries(digests)) {
    assert.equal(previous.result.payload.console.integrityByKodeosRelease[release].kcli.sha256, digest);
  }
  // A fact recorded only for v0.1.1 is not served as a v0.1.0 hazard.
  assert.equal(previous.result.payload.hazards.some((hazard: string) => /installs it there/.test(hazard)), false);
  const unassessed = await call('kode_get_sdk_contract', { profileId, sdkRelease: 'v0.1.2' });
  assert.equal(unassessed.result.reasonCode, 'SDK_RELEASE_NOT_ASSESSED');
  assert.equal(unassessed.result.status, 'refused');
});

test('toolchain status reports the host as not ready without starting anything', async () => {
  const { result } = await call('kode_get_toolchain_status', {});
  assert.equal(result.effectClass, 'H0');
  assert.equal(result.payload.build.enabled, false);
  assert.equal(result.payload.build.ready, false);
  assert.equal(result.payload.workspace.exists, true);
  assert.equal(result.payload.idf.configured, false);
  assert.equal(result.payload.console.readsEnabled, false);
  assert.match(result.payload.node.version, /^24\./);
});

test('workspace escapes and unsafe project names are refused over the protocol', async () => {
  for (const projectName of ['../outside', '..\\outside', 'C:\\Windows\\System32', '/etc/passwd', 'app;whoami', 'App', 'kodeos', 'a b']) {
    for (const tool of ['kode_validate', 'kode_inspect_image']) {
      const { isError, result } = await call(tool, { projectName });
      assert.equal(result.reasonCode, 'PROJECT_NAME_INVALID', `${tool} ${projectName}`);
      assert.equal(result.status, 'refused');
      assert.equal(isError, true);
    }
    const created = await call('kode_new_app', { projectName, displayName: 'X', categories: ['tools'] });
    assert.equal(created.result.reasonCode, 'PROJECT_NAME_INVALID');
  }
  const outside = join(temp.dir, 'outside-project');
  await writeFiles(outside, { ...projectFiles('linked'), 'build/linked.bin': fakeImage({ project: 'linked' }) });
  await symlink(outside, join(workspaceRoot, 'linked'), 'junction');
  for (const tool of ['kode_validate', 'kode_inspect_image']) {
    assert.equal((await call(tool, { projectName: 'linked' })).result.reasonCode, 'WORKSPACE_ESCAPE', tool);
  }
  assert.equal((await call('kode_new_app', { projectName: 'linked', displayName: 'X', categories: ['tools'] })).result.reasonCode, 'WORKSPACE_ESCAPE');
});

test('builds are refused while the operator has not enabled them, and no build output appears', async () => {
  await writeFiles(join(workspaceRoot, 'build_me'), projectFiles('build_me'));
  const { isError, result } = await call('kode_build', { projectName: 'build_me' });
  assert.equal(isError, true);
  assert.equal(result.status, 'refused');
  assert.equal(result.reasonCode, 'BUILD_NOT_ENABLED');
  assert.equal(result.effectClass, 'H1');
  assert.equal(result.artefactSha256, undefined);
  assert.equal(existsSync(join(workspaceRoot, 'build_me', 'build')), false);
});

test('validation and image inspection keep source, compiled, install-compatible and device stages apart', async () => {
  const project = join(workspaceRoot, 'stage_app');
  await writeFiles(project, projectFiles('stage_app'));
  const validated = await call('kode_validate', { projectName: 'stage_app' });
  assert.equal(validated.result.status, 'ok');
  assert.equal(validated.result.payload.stage, 'source_project');
  assert.equal(validated.result.verifiedLayer, 'source');
  // Passing the static checks is not permission to execute the project's build
  // scripts: this hand-made project's build logic is not the pinned template's.
  assert.equal(validated.result.payload.buildLogic.eligible, false);
  assert.match(validated.result.message, /kode_build will refuse it/);

  // A source project is not an image.
  const unbuilt = await call('kode_inspect_image', { projectName: 'stage_app' });
  assert.equal(unbuilt.result.status, 'not_verified');
  assert.equal(unbuilt.result.reasonCode, 'IMAGE_NOT_FOUND');
  assert.equal(unbuilt.result.artefactSha256, undefined);

  // A compiled image without the app contract is not install-compatible.
  const bare = fakeImage({ project: 'stage_app', manifest: null });
  await writeFiles(project, { 'build/stage_app.bin': bare });
  // These files were written by the test, not by a build this server ran, so
  // every answer about them is a description of files and never build evidence.
  const compiled = await call('kode_inspect_image', { projectName: 'stage_app' });
  assert.equal(compiled.result.status, 'not_verified');
  assert.equal(compiled.result.reasonCode, 'BUILD_NOT_OBSERVED');
  assert.equal(compiled.result.verifiedLayer, 'none');
  assert.equal(compiled.result.payload.buildObserved, false);
  assert.equal(compiled.result.payload.stage, 'compiled_image');
  assert.equal(compiled.result.artefactSha256, sha256(bare));

  // Files shaped like an install-compatible build are described as such, but
  // are not accepted as a build, and are never device verified.
  const image = fakeImage({ project: 'stage_app' });
  await writeFiles(project, buildOutputs('stage_app', image));
  const compatible = await call('kode_inspect_image', { projectName: 'stage_app' });
  assert.equal(compatible.result.status, 'not_verified');
  assert.equal(compatible.result.reasonCode, 'BUILD_NOT_OBSERVED');
  assert.equal(compatible.result.verifiedLayer, 'none');
  assert.equal(compatible.result.payload.buildObserved, false);
  assert.equal(compatible.result.payload.stage, 'kodeos_install_compatible');
  assert.deepEqual(compatible.result.payload.stages, { sourceProject: true, compiledImage: true, kodeosInstallCompatible: true, deviceVerified: false });
  assert.equal(compatible.result.payload.deviceVerification, 'NOT TESTED');
  assert.equal(compatible.result.artefactSha256, sha256(image));
  assert.equal(compatible.result.requiredNextEvidence.length, 3);
  assert.match(compatible.result.message, /not produced by a build this server ran/);
});

test('an S3 binary supplied for the P4 target is refused over the protocol', async () => {
  const project = join(workspaceRoot, 's3_binary');
  await writeFiles(project, { ...projectFiles('s3_binary'), ...buildOutputs('s3_binary', fakeImage({ project: 's3_binary', chipId: 0x0009 })) });
  const { isError, result } = await call('kode_inspect_image', { projectName: 's3_binary' });
  assert.equal(isError, true);
  assert.equal(result.status, 'refused');
  assert.equal(result.reasonCode, 'IMAGE_CHIP_MISMATCH');
  assert.equal(result.verifiedLayer, 'none');
  assert.equal(result.payload.header.chip, 'esp32s3');
  assert.equal(result.payload.stages.kodeosInstallCompatible, false);

  await writeFiles(join(workspaceRoot, 's3_source'), projectFiles('s3_source', { target: 'esp32s3' }));
  const source = await call('kode_validate', { projectName: 's3_source' });
  assert.equal(source.result.status, 'not_verified');
  assert.equal(source.result.reasonCode, 'VALIDATION_FAILED');
});

test('scaffolding is refused without a verified template and leaves the workspace untouched', async (t) => {
  if (realTemplate) { t.skip('a real template checkout is configured for this run'); return; }
  const { isError, result } = await call('kode_new_app', { projectName: 'fresh_app', displayName: 'Fresh', categories: ['tools'] });
  assert.equal(isError, true);
  assert.equal(result.reasonCode, 'TEMPLATE_NOT_CONFIGURED');
  assert.equal(existsSync(join(workspaceRoot, 'fresh_app')), false);
});

test('with a real official template checkout, a scaffolded app pins SDK v0.1.1 and passes validation', async (t) => {
  if (!realTemplate) { t.skip('set KODE_TEST_TEMPLATE_DIR to a kode-app-template v0.1.0 checkout to run this'); return; }
  const status = await call('kode_get_toolchain_status', {});
  assert.equal(status.result.payload.template.matchesPinnedTag, true, status.result.payload.template.detail);
  const created = await call('kode_new_app', {
    projectName: 'sensor_reader', displayName: 'Sensor reader', categories: ['tools'], version: '0.1.0',
    description: 'Reads a sensor through J3.',
  });
  assert.equal(created.result.status, 'ok', created.result.message);
  assert.equal(created.result.payload.template.commit, PINNED.template.commit);
  assert.equal(created.result.payload.sdk.release, 'v0.1.1');
  assert.equal(created.result.payload.licence, 'GPL-3.0-or-later');
  const project = join(workspaceRoot, 'sensor_reader');
  assert.match(await readFile(join(project, 'main', 'idf_component.yml'), 'utf8'), /version: v0\.1\.1/);
  assert.match(await readFile(join(project, 'CMakeLists.txt'), 'utf8'), /project\(sensor_reader\)/);
  assert.doesNotMatch(await readFile(join(project, 'README.md'), 'utf8'), /write-flash|0x1C00000/);
  const validated = await call('kode_validate', { projectName: 'sensor_reader' });
  assert.equal(validated.result.status, 'ok', JSON.stringify(validated.result.payload.findings.filter((f: { status: string }) => f.status === 'fail')));
  assert.equal(validated.result.payload.sdkRelease, 'v0.1.1');
  // The build gate, against the real pinned template: an untouched scaffold is
  // eligible to build, and stops being eligible the moment something that would
  // run at build time is added.
  assert.deepEqual(validated.result.payload.buildLogic.findings.filter((f: { status: string; level: string }) => f.status === 'fail' && f.level === 'reject'), []);
  assert.equal(validated.result.payload.buildLogic.eligible, true);
  await writeFiles(project, { 'idf_ext.py': 'def action_extensions(base_actions, project_path):\n    return {}\n' });
  const tampered = await call('kode_validate', { projectName: 'sensor_reader' });
  assert.equal(tampered.result.payload.buildLogic.eligible, false);
  await rm(join(project, 'idf_ext.py'));
  const cmake = await readFile(join(project, 'CMakeLists.txt'), 'utf8');
  await writeFile(join(project, 'CMakeLists.txt'), `${cmake}\nexecute_process(COMMAND python -c "print(1)")\n`);
  assert.equal((await call('kode_validate', { projectName: 'sensor_reader' })).result.payload.buildLogic.eligible, false);
  await writeFile(join(project, 'CMakeLists.txt'), cmake);
  assert.equal((await call('kode_validate', { projectName: 'sensor_reader' })).result.payload.buildLogic.eligible, true);
  const again = await call('kode_new_app', { projectName: 'sensor_reader', displayName: 'Other', categories: ['tools'] });
  assert.equal(again.result.reasonCode, 'PROJECT_EXISTS');
});

test('reference bodies are available as resources and carry the same guarded answers', async () => {
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map(resource => resource.uri).sort(), [
    'kode://evidence/ledger', 'kode://modules/camera', 'kode://modules/fck', 'kode://modules/maker',
    'kode://modules/mesh', 'kode://modules/robotics', `kode://profiles/${profileId}`, 'kode://sdk/v0.1.1/app-contract',
  ]);
  for (const resource of resources) {
    const read = await client.readResource({ uri: resource.uri });
    const body = envelope.parse(JSON.parse(String((read.contents[0] as { text?: string }).text)));
    assert.equal(body.hardwareAuthorized, false, resource.uri);
    assert.notEqual(body.verifiedLayer, 'device');
    assert.notEqual(body.verifiedLayer, 'integration');
  }
});
