/** Workflow 2, package fix-g2: image inspection also judges the resolved configuration for the partition
 * table (rule B3) and the radio trio (rule B7), so a wrong static reading of sdkconfig.defaults cannot
 * reach kodeos_install_compatible (G2-1, defence in depth). And G2-2: the getEvidence not-applicable message.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createKodeServer } from '../src/app.js';
import { inspectImage } from '../src/build/image.js';
import { CapabilityRegistry } from '../src/registry/registry.js';
import { PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';
import { buildOutputs, fakeImage, hostConfigFor, tempDir, writeFiles } from './helpers.js';

async function inspectWith(options: Parameters<typeof buildOutputs>[2]) {
  const temp = await tempDir('ck-wf2res-');
  try {
    const root = join(temp.dir, 'workspace');
    await mkdir(root);
    await writeFiles(join(root, 'demo_app'), buildOutputs('demo_app', fakeImage({ project: 'demo_app' }), options));
    return await inspectImage(hostConfigFor({ workspaceRoot: root }), 'demo_app');
  } finally { await temp.close(); }
}
const failedIds = (inspection: Awaited<ReturnType<typeof inspectWith>>) => inspection.checks.filter(check => !check.pass).map(check => check.id);
const detailOf = (inspection: Awaited<ReturnType<typeof inspectWith>>, id: string) => inspection.checks.find(check => check.id === id)?.detail ?? '';

test('the stock resolved configuration (board partition table, radio off with esp-hosted and Bluetooth off) is install-compatible with 13 checks passing', async () => {
  const inspection = await inspectWith({});
  assert.equal(inspection.stage, 'kodeos_install_compatible');
  assert.deepEqual(failedIds(inspection), []);
  assert.equal(inspection.checks.length, 13);
});

// ---- B3 in the resolved configuration ----
for (const [label, options] of [
  ['PARTITION_TABLE_CUSTOM_FILENAME is another file', { partitionTable: 'mine.csv' }],
  ['PARTITION_TABLE_CUSTOM_FILENAME is absent', { partitionTable: null }],
  ['PARTITION_TABLE_FILENAME (the table the build uses) is another file', { partitionTableUsed: 'mine.csv' }],
  ['PARTITION_TABLE_FILENAME is absent', { partitionTableUsed: null }],
  ['PARTITION_TABLE_CUSTOM is false', { partitionTableCustom: false }],
  ['PARTITION_TABLE_CUSTOM is the string "true"', { partitionTableCustom: 'true' }],
  ['PARTITION_TABLE_CUSTOM is absent', { partitionTableCustom: null }],
] as const) {
  test(`${label}: compiled_image and app.partition_table fails`, async () => {
    const inspection = await inspectWith(options);
    assert.equal(inspection.stage, 'compiled_image');
    assert.equal(inspection.stages.kodeosInstallCompatible, false);
    assert.deepEqual(failedIds(inspection), ['app.partition_table']);
    assert.match(detailOf(inspection, 'app.partition_table'), /PARTITION_TABLE/);
  });
}

// ---- B7 in the resolved configuration ----
for (const [label, options] of [
  ['KODEOS_RADIO off with ESP_HOSTED_ENABLED on', { hosted: true }],
  ['KODEOS_RADIO off with BT_ENABLED on', { bluetooth: true }],
  ['KODEOS_RADIO off with ESP_HOSTED_ENABLED absent', { hosted: null }],
  ['KODEOS_RADIO off with BT_ENABLED absent', { bluetooth: null }],
  ['KODEOS_RADIO off with ESP_HOSTED_ENABLED the string "false"', { hosted: 'false' }],
  ['KODEOS_RADIO absent', { radio: null }],
  ['KODEOS_RADIO the string "false"', { radio: 'false' }],
] as const) {
  test(`${label}: compiled_image and app.radio fails`, async () => {
    const inspection = await inspectWith(options);
    assert.equal(inspection.stage, 'compiled_image');
    assert.equal(inspection.stages.kodeosInstallCompatible, false);
    assert.deepEqual(failedIds(inspection), ['app.radio']);
    assert.match(detailOf(inspection, 'app.radio'), /KODEOS_RADIO|ESP_HOSTED_ENABLED|BT_ENABLED/);
  });
}

test('a radio turned on deliberately (KODEOS_RADIO true, with its companions on) is not refused by app.radio', async () => {
  const inspection = await inspectWith({ radio: true, hosted: true, bluetooth: true });
  assert.deepEqual(failedIds(inspection), []);
  assert.equal(inspection.stage, 'kodeos_install_compatible');
});

test('a missing sdkconfig.json fails the new checks too, and says so', async () => {
  const temp = await tempDir('ck-wf2res-missing-');
  try {
    const root = join(temp.dir, 'workspace');
    await mkdir(root);
    const outputs = buildOutputs('demo_app', fakeImage({ project: 'demo_app' }));
    delete outputs['build/config/sdkconfig.json'];
    await writeFiles(join(root, 'demo_app'), outputs);
    const inspection = await inspectImage(hostConfigFor({ workspaceRoot: root }), 'demo_app');
    for (const id of ['app.partition_table', 'app.radio']) {
      const check = inspection.checks.find(entry => entry.id === id);
      assert.equal(check?.pass, false, id);
      assert.match(check?.detail ?? '', /missing or unreadable/);
    }
  } finally { await temp.close(); }
});

// ---- G2-2: the getEvidence not-applicable message ----
test('G2-2 kode_get_evidence for a claim outside the stated scope says it was recorded for a different release or board revision, or is dated in the future', async () => {
  const server = createKodeServer({ registry: new CapabilityRegistry(), now: () => new Date('2026-11-13T12:00:00Z'), env: {} });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'wf2-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const result = (await client.callTool({
      name: 'kode_get_evidence', arguments: { profileId: PRODUCTION_PROFILE_ID, claimId: 'sdk.wifi_frames.receive_only', sdkRelease: 'v0.1.0' },
    })).structuredContent as Record<string, any>;
    assert.equal(result.reasonCode, 'EVIDENCE_NOT_APPLICABLE');
    assert.equal(result.status, 'not_verified');
    assert.match(result.message, /different SDK release or board revision/);
    assert.match(result.message, /in the future/);
    assert.ok(result.message.includes('sdk.wifi_frames.receive_only'), result.message);
  } finally { await client.close(); }
});
