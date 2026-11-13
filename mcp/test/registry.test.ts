import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registryData } from '../src/registry/data.js';
import { CapabilityRegistry, RegistryIntegrityError, meetsState } from '../src/registry/registry.js';
import { ASSESSED_SDK_RELEASES, PINNED, PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';
import type { Claim, RegistryData, TestRecord } from '../src/registry/types.js';

const today = new Date('2026-11-13T12:00:00Z');
const clone = (): RegistryData => structuredClone(registryData);
const baseClaim = (): Claim => {
  const claim = registryData.claims.find(item => item.id === 'board.chip.main');
  assert.ok(claim);
  return structuredClone(claim);
};
const record = (overrides: Partial<TestRecord>): TestRecord => ({
  id: 'run.example', level: 'L3', result: 'passed', protocol: 'example protocol',
  board: { profileId: PRODUCTION_PROFILE_ID, revision: 'DVT' }, firmware: 'kodeOS v0.1.1',
  toolchain: 'ESP-IDF v6.1', observedAt: '2026-11-13', simulated: false, ...overrides,
});

test('the shipped registry loads and is pinned to the newest assessed releases', () => {
  const registry = new CapabilityRegistry();
  assert.equal(PINNED.sdk.tag, 'v0.1.1');
  assert.equal(PINNED.kodeos.tag, 'v0.1.1');
  assert.equal(PINNED.c5.tag, 'v0.1.1');
  assert.equal(PINNED.template.tag, 'v0.1.0');
  assert.deepEqual([...ASSESSED_SDK_RELEASES], ['v0.1.0', 'v0.1.1']);
  assert.equal(registry.getProfile(PRODUCTION_PROFILE_ID)?.pinnedSdkRelease, 'v0.1.1');
  assert.equal(registry.listModules().length, 5);
});

test('no shipped claim asserts device or integration verification, and no test record exists', () => {
  const registry = new CapabilityRegistry();
  assert.equal(registry.listTestRecords().length, 0);
  for (const claim of registry.listClaims()) {
    assert.notEqual(claim.state, 'device_verified', claim.id);
    assert.notEqual(claim.state, 'integration_verified', claim.id);
  }
});

test('every sourced claim cites a pinned commit or a dated probe, and unknowns invent no value', () => {
  const registry = new CapabilityRegistry();
  for (const claim of registry.listClaims()) {
    if (claim.state === 'unknown') {
      assert.equal(claim.value, undefined, `${claim.id} is unknown but carries a value`);
      continue;
    }
    assert.ok(claim.refs.length > 0, claim.id);
    for (const ref of claim.refs) {
      const source = registry.getSource(ref.sourceId);
      assert.ok(source, `${claim.id} -> ${ref.sourceId}`);
      if (source.kind === 'git_tag') assert.match(source.commit ?? '', /^[a-f0-9]{40}$/);
    }
  }
});

test('module electrical data, detection and qualification are unknown for all five modules', () => {
  const registry = new CapabilityRegistry();
  for (const module of registry.listModules()) {
    for (const suffix of ['electrical', 'detection', 'l4_qualification']) {
      assert.equal(registry.getClaim(`module.${module.id}.${suffix}`)?.state, 'unknown', `${module.id}.${suffix}`);
    }
    assert.ok(module.blockers.length > 0);
  }
  for (const id of ['robotics', 'camera', 'mesh', 'fck']) {
    assert.equal(registry.getModule(id)?.sdkAvailability, 'not_publicly_accessible');
  }
});

test('a device-verified claim cannot be typed in without a real test record', () => {
  const data = clone();
  data.claims.push({ ...baseClaim(), id: 'fake.device.claim', state: 'device_verified', conflictsWith: [] });
  assert.throws(() => new CapabilityRegistry(data), RegistryIntegrityError);
});

test('a mock or simulated run can never back L3 or L4 evidence', () => {
  for (const level of ['L3', 'L4'] as const) {
    const data = clone();
    data.testRecords.push(record({ level, simulated: true, moduleId: 'maker', moduleRevision: 'r1' }));
    assert.throws(() => new CapabilityRegistry(data), /simulated run cannot be/);
  }
  const promoted = clone();
  promoted.testRecords.push(record({ id: 'run.l2', level: 'L2', simulated: true }));
  promoted.claims.push({ ...baseClaim(), id: 'fake.promoted', state: 'device_verified', testRecordIds: ['run.l2'] });
  assert.throws(() => new CapabilityRegistry(promoted), /needs a passed, non-simulated L3 or L4/);
});

test('integration evidence needs an L4 record that names the module and its revision', () => {
  const noModule = clone();
  noModule.testRecords.push(record({ level: 'L4' }));
  assert.throws(() => new CapabilityRegistry(noModule), /must name the module/);

  const fromL3 = clone();
  fromL3.testRecords.push(record({ id: 'run.l3', level: 'L3' }));
  fromL3.claims.push({ ...baseClaim(), id: 'fake.integration', state: 'integration_verified', testRecordIds: ['run.l3'] });
  assert.throws(() => new CapabilityRegistry(fromL3), /needs a passed, non-simulated L4/);

  const failed = clone();
  failed.testRecords.push(record({ id: 'run.failed', level: 'L4', result: 'failed', moduleId: 'maker', moduleRevision: 'r1' }));
  failed.claims.push({ ...baseClaim(), id: 'fake.failed', state: 'integration_verified', testRecordIds: ['run.failed'] });
  assert.throws(() => new CapabilityRegistry(failed), RegistryIntegrityError);

  const genuine = clone();
  genuine.testRecords.push(record({ id: 'run.real', level: 'L4', moduleId: 'maker', moduleRevision: 'r1' }));
  genuine.claims.push({ ...baseClaim(), id: 'real.integration', state: 'integration_verified', testRecordIds: ['run.real'] });
  assert.doesNotThrow(() => new CapabilityRegistry(genuine));
});

test('malformed registry data stops the registry instead of being served', () => {
  const unknownSource = clone();
  unknownSource.claims.push({ ...baseClaim(), id: 'bad.source', refs: [{ sourceId: 'no-such-source' }] });
  assert.throws(() => new CapabilityRegistry(unknownSource), /unknown source/);

  const unsourced = clone();
  unsourced.claims.push({ ...baseClaim(), id: 'bad.unsourced', refs: [] });
  assert.throws(() => new CapabilityRegistry(unsourced), /needs a source reference/);

  const oneSided = clone();
  oneSided.claims.push({ ...baseClaim(), id: 'bad.conflict', conflictsWith: ['board.chip.main'] });
  assert.throws(() => new CapabilityRegistry(oneSided), /not recorded on both sides/);

  const duplicate = clone();
  duplicate.claims.push(baseClaim());
  assert.throws(() => new CapabilityRegistry(duplicate), /Duplicate claim/);

  assert.throws(() => new CapabilityRegistry({ ...clone(), extra: true }), RegistryIntegrityError);
  assert.throws(() => new CapabilityRegistry({ claims: 'none' }), RegistryIntegrityError);
});

test('evidence expires on its review date and availability facts expire sooner', () => {
  const registry = new CapabilityRegistry();
  const pinned = registry.getClaim('board.partition_table');
  const availability = registry.getClaim('module.robotics.sdk_access');
  assert.ok(pinned && availability);
  assert.equal(registry.evaluate(pinned, { now: today }).effectiveState, 'source_verified');
  assert.equal(registry.evaluate(availability, { now: today }).fresh, true);

  const threeWeeks = new Date('2026-12-04T00:00:00Z');
  assert.equal(registry.evaluate(pinned, { now: threeWeeks }).fresh, true);
  const stale = registry.evaluate(availability, { now: threeWeeks });
  assert.equal(stale.effectiveState, 'stale');
  assert.deepEqual(stale.issues, ['EVIDENCE_EXPIRED']);

  const nextSummer = new Date('2027-06-01T00:00:00Z');
  assert.equal(registry.evaluate(pinned, { now: nextSummer }).effectiveState, 'stale');
  // The last valid day is the review date itself.
  assert.equal(registry.evaluate(pinned, { now: new Date(`${pinned.reviewBy}T23:59:59Z`) }).fresh, true);
});

test('a claim is not applied to an SDK release or board revision it was not recorded for', () => {
  const registry = new CapabilityRegistry();
  const frames = registry.getClaim('sdk.wifi_frames.receive_only');
  const pinout = registry.getClaim('board.expansion.j3.positions');
  assert.ok(frames && pinout);
  assert.equal(registry.evaluate(frames, { now: today, sdkRelease: 'v0.1.1' }).applicable, true);
  const older = registry.evaluate(frames, { now: today, sdkRelease: 'v0.1.0' });
  assert.equal(older.effectiveState, 'not_applicable');
  assert.deepEqual(older.issues, ['EVIDENCE_NOT_APPLICABLE']);
  assert.equal(registry.evaluate(pinout, { now: today, boardRevision: 'DVT' }).applicable, true);
  assert.equal(registry.evaluate(pinout, { now: today, boardRevision: 'PVT' }).applicable, false);
  assert.equal(registry.evaluate(pinout, { now: today, sdkRelease: 'v0.1.2' }).applicable, false);
});

test('the raw-offset contradiction is recorded on both sides and marks both claims conflicting', () => {
  const registry = new CapabilityRegistry();
  const partition = registry.getClaim('sdk.app.mailbox.partition_offset');
  const readme = registry.getClaim('sdk.template.readme_raw_offset');
  assert.ok(partition && readme);
  assert.deepEqual(partition.value, { offset: 0x1a00000, imageMax: 0x5ff000 });
  assert.deepEqual(readme.value, { offset: 0x1c00000 });
  for (const claim of [partition, readme]) {
    const evaluation = registry.evaluate(claim, { now: today });
    assert.equal(evaluation.effectiveState, 'conflicting');
    assert.ok(evaluation.issues.includes('EVIDENCE_CONFLICTING'));
  }
});

test('evidence strength is ordered and the unranked states support nothing', () => {
  assert.equal(meetsState('source_verified', 'documented'), true);
  assert.equal(meetsState('documented', 'source_verified'), false);
  assert.equal(meetsState('simulated', 'source_verified'), false);
  assert.equal(meetsState('simulated', 'device_verified'), false);
  assert.equal(meetsState('source_verified', 'device_verified'), false);
  for (const weak of ['unknown', 'unsupported', 'conflicting'] as const) {
    assert.equal(meetsState(weak, 'advertised'), false);
  }
});

test('a test record backs only the claim it was taken for: profile, board revision, module and date', () => {
  const claimWith = (id: string, state: 'device_verified' | 'integration_verified', recordId: string,
    overrides: Partial<Claim> = {}): Claim =>
    ({ ...baseClaim(), id, state, testRecordIds: [recordId], conflictsWith: [], ...overrides });
  const withRecords = (records: TestRecord[], claims: Claim[]): RegistryData => {
    const data = clone();
    data.testRecords.push(...records);
    data.claims.push(...claims);
    return data;
  };

  // The archived S3 prototype's L3 run is not proof for the production profile.
  const prototype = record({ id: 'run.s3', board: { profileId: 'kode-dot-s3-prototype', revision: 'DVT' } });
  assert.throws(() => new CapabilityRegistry(withRecords([prototype], [claimWith('c.s3', 'device_verified', 'run.s3')])),
    /same profile, board revision and module/);

  // A record for another board revision is not proof for a claim scoped to DVT.
  assert.deepEqual(baseClaim().scope.boardRevisions, ['DVT']);
  const otherRevision = record({ id: 'run.pvt', board: { profileId: PRODUCTION_PROFILE_ID, revision: 'PVT' } });
  assert.throws(() => new CapabilityRegistry(withRecords([otherRevision], [claimWith('c.pvt', 'device_verified', 'run.pvt')])),
    /same profile, board revision and module/);
  // A claim that is not revision scoped (every shipped claim) accepts a record for a
  // revision the profile knows, and rejects one for a revision it does not know.
  const unscopedScope = { ...baseClaim().scope, boardRevisions: [] };
  const unscoped = claimWith('c.unscoped', 'device_verified', 'run.pvt', { scope: unscopedScope });
  assert.throws(() => new CapabilityRegistry(withRecords([otherRevision], [unscoped])),
    /same profile, board revision and module/);
  const evt = record({ id: 'run.evt', board: { profileId: PRODUCTION_PROFILE_ID, revision: 'EVT' } });
  assert.throws(() => new CapabilityRegistry(withRecords([evt],
    [claimWith('c.evt', 'device_verified', 'run.evt', { scope: unscopedScope })])), /same profile, board revision and module/);
  const known = record({ id: 'run.dvt' });
  assert.doesNotThrow(() => new CapabilityRegistry(withRecords([known],
    [claimWith('c.known', 'device_verified', 'run.dvt', { scope: unscopedScope })])));

  // A module claim needs a record that names its module, at either level: a
  // board-level L3 record does not back it, and a maker record does not back a camera claim.
  const l3Board = record({ id: 'run.l3board' });
  assert.throws(() => new CapabilityRegistry(withRecords([l3Board],
    [claimWith('module.camera.l3', 'device_verified', 'run.l3board', { subject: 'module:camera' })])),
  /same profile, board revision and module/);
  const l3Camera = record({ id: 'run.l3camera', moduleId: 'camera' });
  assert.doesNotThrow(() => new CapabilityRegistry(withRecords([l3Camera],
    [claimWith('module.camera.l3', 'device_verified', 'run.l3camera', { subject: 'module:camera' })])));
  const l3Maker = record({ id: 'run.l3maker', moduleId: 'maker' });
  assert.throws(() => new CapabilityRegistry(withRecords([l3Maker],
    [claimWith('module.camera.l3', 'device_verified', 'run.l3maker', { subject: 'module:camera' })])),
  /same profile, board revision and module/);

  // A maker L4 record is not proof of a camera claim; a camera one is.
  const maker = record({ id: 'run.maker', level: 'L4', moduleId: 'maker', moduleRevision: 'r1' });
  const camera = record({ id: 'run.camera', level: 'L4', moduleId: 'camera', moduleRevision: 'r1' });
  assert.throws(() => new CapabilityRegistry(withRecords([maker],
    [claimWith('module.camera.proof', 'integration_verified', 'run.maker', { subject: 'module:camera' })])),
  /same profile, board revision and module/);
  assert.doesNotThrow(() => new CapabilityRegistry(withRecords([camera],
    [claimWith('module.camera.proof', 'integration_verified', 'run.camera', { subject: 'module:camera' })])));

  // A record observed after the claim's review date cannot back it.
  const late = record({ id: 'run.late', observedAt: '2099-01-01' });
  assert.throws(() => new CapabilityRegistry(withRecords([late], [claimWith('c.late', 'device_verified', 'run.late')])),
    /observed by its review date/);
});
