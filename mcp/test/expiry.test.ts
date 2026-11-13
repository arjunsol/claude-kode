/** The same server, over an in-memory transport, with the clock moved. The
 * clock is a server dependency: no tool argument or environment variable can
 * move it, which is why this cannot be done against the spawned process.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createKodeServer } from '../src/app.js';
import { CapabilityRegistry } from '../src/registry/registry.js';
import { PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';

const profileId = PRODUCTION_PROFILE_ID;

async function connect(now: string, env: NodeJS.ProcessEnv = {}) {
  const server = createKodeServer({ registry: new CapabilityRegistry(), now: () => new Date(now), env });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'clock-test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })).structuredContent as Record<string, any>;
  return { call, close: () => client.close() };
}

test('on the day of the audit every knowledge answer is current', async () => {
  const session = await connect('2026-11-13T12:00:00Z');
  try {
    for (const tool of ['kode_get_capabilities', 'kode_get_pinout', 'kode_get_sdk_contract', 'kode_get_evidence']) {
      const result = await session.call(tool, { profileId });
      assert.equal(result.status, 'ok', tool);
    }
  } finally { await session.close(); }
});

test('after the availability review date, facts about what upstream publishes are stale', async () => {
  const session = await connect('2026-12-04T00:00:00Z');
  try {
    const evidence = await session.call('kode_get_evidence', { profileId, claimId: 'module.mesh.sdk_access' });
    assert.equal(evidence.status, 'not_verified');
    assert.equal(evidence.reasonCode, 'EVIDENCE_EXPIRED');
    assert.equal(evidence.payload.claims[0].effectiveState, 'stale');
    const head = await session.call('kode_get_evidence', { profileId, claimId: 'sdk.release.upstream_head' });
    assert.equal(head.reasonCode, 'EVIDENCE_EXPIRED');
    // Tag-pinned facts are still current at that date.
    assert.equal((await session.call('kode_get_pinout', { profileId })).status, 'ok');
    assert.equal((await session.call('kode_check_compatibility', { profileId, operation: 'build_app' })).payload.decision, 'allowed');
  } finally { await session.close(); }
});

test('after the pinned review date, capability assertions expire and stop supporting builds', async () => {
  const session = await connect('2027-06-01T00:00:00Z');
  try {
    for (const tool of ['kode_get_capabilities', 'kode_get_pinout', 'kode_get_sdk_contract', 'kode_get_evidence']) {
      const result = await session.call(tool, { profileId });
      assert.equal(result.status, 'not_verified', tool);
      assert.equal(result.reasonCode, 'EVIDENCE_EXPIRED', tool);
      assert.equal(result.hardwareAuthorized, false);
    }
    for (const operation of ['design_guidance', 'scaffold_app', 'build_app', 'inspect_image']) {
      const decision = (await session.call('kode_check_compatibility', { profileId, operation })).payload;
      assert.equal(decision.decision, 'refused', operation);
      assert.ok(decision.reasonCodes.includes('EVIDENCE_EXPIRED'));
    }
  } finally { await session.close(); }
});

test('the operator opt-in for console reads is read from the host, and is still only advice', async () => {
  const off = await connect('2026-11-13T12:00:00Z', {});
  const on = await connect('2026-11-13T12:00:00Z', { KODE_ENABLE_CONSOLE_READS: '1' });
  try {
    assert.deepEqual((await off.call('kode_check_compatibility', { profileId, operation: 'console_read' })).payload.reasonCodes,
      ['CONSOLE_READS_NOT_ENABLED']);
    const allowed = (await on.call('kode_check_compatibility', { profileId, operation: 'console_read' })).payload;
    assert.equal(allowed.decision, 'allowed');
    assert.equal(allowed.grantsAuthorisation, false);
    // Even with the opt-in, nothing that changes a device becomes allowed.
    assert.equal((await on.call('kode_check_compatibility', { profileId, operation: 'install_app' })).payload.decision, 'refused');
  } finally { await off.close(); await on.close(); }
});
