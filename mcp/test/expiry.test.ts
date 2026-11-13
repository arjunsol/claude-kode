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
  const raw = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
  return { call, raw, close: () => client.close() };
}

test('on the day of the audit every knowledge answer is current, except the list that serves conflicting claims', async () => {
  const session = await connect('2026-11-13T12:00:00Z');
  try {
    for (const tool of ['kode_get_pinout', 'kode_get_sdk_contract', 'kode_get_evidence']) {
      const result = await session.call(tool, { profileId });
      assert.equal(result.status, 'ok', tool);
    }
    // The whole capability list serves the two contradicting raw-offset claims,
    // so it cannot be reported as plainly ok; a list without them can.
    const all = await session.call('kode_get_capabilities', { profileId });
    assert.equal(all.status, 'not_verified');
    assert.equal(all.reasonCode, 'EVIDENCE_CONFLICTING');
    assert.equal((await session.call('kode_get_capabilities', { profileId, capability: 'main_chip' })).status, 'ok');
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
      // Nothing served is current, so nothing is verified at any layer.
      assert.equal(result.verifiedLayer, 'none', tool);
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

test('a refused compatibility decision is a tool error with the first reason code and the full payload', async () => {
  const session = await connect('2026-11-13T12:00:00Z');
  try {
    const raw = await session.raw('kode_check_compatibility', { profileId, operation: 'raw_flash' });
    const result = raw.structuredContent as Record<string, any>;
    assert.equal(raw.isError, true);
    assert.equal(result.status, 'refused');
    assert.equal(result.reasonCode, 'RAW_FLASH_NEVER_SUPPORTED');
    assert.equal(result.reasonCode, result.payload.reasonCodes[0]);
    assert.equal(result.payload.decision, 'refused');
    assert.ok(result.payload.reasons.length > 0);
    const allowed = await session.raw('kode_check_compatibility', { profileId, operation: 'build_app' });
    assert.equal(allowed.isError, undefined);
    assert.equal((allowed.structuredContent as Record<string, any>).status, 'ok');
  } finally { await session.close(); }
});

test('an allowed console read says in its message that opening the port resets the Dot', async () => {
  const session = await connect('2026-11-13T12:00:00Z', { KODE_ENABLE_CONSOLE_READS: '1' });
  try {
    const result = await session.call('kode_check_compatibility', { profileId, operation: 'console_read' });
    assert.equal(result.payload.decision, 'allowed');
    assert.equal(result.payload.cautions.length, 2);
    assert.match(result.message, /resets the Dot/);
    assert.match(result.message, /unverified/);
  } finally { await session.close(); }
});

test('every scope gate refuses as a tool error, for every knowledge tool', async () => {
  const session = await connect('2026-11-13T12:00:00Z');
  try {
    const gates: Array<[Record<string, unknown>, string]> = [
      [{ profileId: 'made-up-board' }, 'PROFILE_UNKNOWN'],
      [{ profileId, sdkRelease: 'v9.9.9' }, 'SDK_RELEASE_NOT_ASSESSED'],
      [{ profileId, boardRevision: 'EVT' }, 'BOARD_REVISION_NOT_IN_PROFILE'],
    ];
    for (const tool of ['kode_get_capabilities', 'kode_get_pinout', 'kode_get_evidence', 'kode_get_sdk_contract']) {
      for (const [args, code] of gates) {
        // The SDK contract takes no board revision; its schema rejects it first.
        if (tool === 'kode_get_sdk_contract' && 'boardRevision' in args) continue;
        const raw = await session.raw(tool, args);
        const result = raw.structuredContent as Record<string, any>;
        assert.equal(raw.isError, true, `${tool} ${code}`);
        assert.equal(result.status, 'refused', `${tool} ${code}`);
        assert.equal(result.reasonCode, code, tool);
      }
    }
  } finally { await session.close(); }
});

test('the SDK contract serves release-scoped facts only for their release, and console digests for every kodeOS release', async () => {
  const session = await connect('2026-11-13T12:00:00Z');
  try {
    const registry = new CapabilityRegistry();
    const selfUpdate = registry.getClaim('board.identity.kodeos_self_update');
    assert.ok(selfUpdate);
    assert.deepEqual(selfUpdate.scope.sdkReleases, ['v0.1.1']);
    const older = await session.call('kode_get_sdk_contract', { profileId, sdkRelease: 'v0.1.0' });
    assert.ok(!older.payload.hazards.includes(selfUpdate.statement));
    assert.ok(!older.payload.hazards.includes(''));
    const newer = await session.call('kode_get_sdk_contract', { profileId, sdkRelease: 'v0.1.1' });
    assert.ok(newer.payload.hazards.includes(selfUpdate.statement));
    // Independent of the SDK release asked about.
    assert.deepEqual(older.payload.console.integrityByKodeosRelease, newer.payload.console.integrityByKodeosRelease);
    assert.deepEqual(Object.keys(newer.payload.console.integrityByKodeosRelease).sort(), ['v0.1.0', 'v0.1.1']);
    assert.notEqual(newer.payload.console.integrityByKodeosRelease['v0.1.0'].kcli.sha256,
      newer.payload.console.integrityByKodeosRelease['v0.1.1'].kcli.sha256);
  } finally { await session.close(); }
});
