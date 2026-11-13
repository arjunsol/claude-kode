import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registryData } from '../src/registry/data.js';
import { evaluateCompatibility } from '../src/registry/policy.js';
import { CapabilityRegistry, RegistryIntegrityError } from '../src/registry/registry.js';
import { PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';
import type { Claim, RegistryData, TestRecord } from '../src/registry/types.js';

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
const claimWith = (id: string, recordIds: string[], overrides: Partial<Claim> = {}): Claim => ({
  ...baseClaim(), id, state: 'device_verified', testRecordIds: recordIds, conflictsWith: [],
  recordedAt: '2026-11-13', reviewBy: '2027-05-13', ...overrides,
});
const scopeOf = (boardRevisions: string[]): Claim['scope'] => ({ ...baseClaim().scope, boardRevisions });
const build = (records: TestRecord[], claims: Claim[]): RegistryData => {
  const data = clone();
  data.testRecords.push(...records);
  data.claims.push(...claims);
  return data;
};
const refuses = (data: unknown): void => assert.throws(() => new CapabilityRegistry(data), RegistryIntegrityError);
const accepts = (data: unknown): void => assert.doesNotThrow(() => new CapabilityRegistry(data));

test('a scoped physical claim is refused on a revision the profile does not know', () => {
  const proto = record({ id: 'run.proto', board: { profileId: PRODUCTION_PROFILE_ID, revision: 'proto' } });
  refuses(build([proto], [claimWith('c.proto', ['run.proto'], { scope: scopeOf(['proto']) })]));
});

test('a claim scoped to two revisions needs a record for each of them', () => {
  const dvt = record({ id: 'run.dvt' });
  refuses(build([dvt], [claimWith('c.two', ['run.dvt'], { scope: scopeOf(['DVT', 'proto']) })]));
});

test('a claim scoped to DVT with a DVT record observed on its recorded day is accepted', () => {
  accepts(build([record({ id: 'run.dvt' })], [claimWith('c.dvt', ['run.dvt'], { scope: scopeOf(['DVT']) })]));
});

test('an unscoped claim with a DVT record is accepted', () => {
  accepts(build([record({ id: 'run.dvt' })], [claimWith('c.unscoped', ['run.dvt'], { scope: scopeOf([]) })]));
});

test('a claim cannot be recorded before the observation that proves it', () => {
  const later = record({ id: 'run.later', observedAt: '2026-11-14' });
  assert.throws(() => new CapabilityRegistry(build([later],
    [claimWith('c.early', ['run.later'], { recordedAt: '2026-11-13' })])), /same profile, board revision and module/);
});

test('impossible calendar dates are refused on records and on claims', () => {
  for (const date of ['2026-02-30', '9999-99-99', '2026-13-01']) {
    refuses(build([record({ id: 'run.baddate', observedAt: date })], []));
    refuses(build([record({ id: 'run.ok' })], [claimWith('c.badrecorded', ['run.ok'], { recordedAt: date })]));
    refuses(build([record({ id: 'run.ok' })], [claimWith('c.badreview', ['run.ok'], { reviewBy: date })]));
  }
});

test('a board claim cannot be listed under a module', () => {
  const data = build([record({ id: 'run.dvt' })], [claimWith('board.l3.proof', ['run.dvt'], { subject: 'board' })]);
  const maker = data.modules.find(module => module.id === 'maker');
  assert.ok(maker);
  maker.claimIds.push('board.l3.proof');
  refuses(data);
});

test('another module\'s claim cannot be listed under the maker module', () => {
  const data = build([record({ id: 'run.camera', moduleId: 'camera' })],
    [claimWith('module.camera.l3', ['run.camera'], { subject: 'module:camera' })]);
  const maker = data.modules.find(module => module.id === 'maker');
  assert.ok(maker);
  maker.claimIds.push('module.camera.l3');
  refuses(data);
});

test('a module\'s own claim may be listed under it', () => {
  const data = build([record({ id: 'run.maker', moduleId: 'maker' })],
    [claimWith('module.maker.l3', ['run.maker'], { subject: 'module:maker' })]);
  const maker = data.modules.find(module => module.id === 'maker');
  assert.ok(maker);
  maker.claimIds.push('module.maker.l3');
  accepts(data);
});

test('a claim recorded in the future is not applicable', () => {
  const registry = new CapabilityRegistry(build([record({ id: 'run.future', observedAt: '2027-06-01' })],
    [claimWith('c.future', ['run.future'], { recordedAt: '2027-06-01', reviewBy: '2027-12-01' })]));
  const claim = registry.getClaim('c.future');
  assert.ok(claim);
  const now = registry.evaluate(claim, { now: new Date('2026-11-13T12:00:00Z') });
  assert.equal(now.applicable, false);
  assert.equal(now.effectiveState, 'not_applicable');
  assert.ok(now.issues.includes('EVIDENCE_NOT_APPLICABLE'));
  assert.equal(registry.evaluate(claim, { now: new Date('2027-06-01T00:00:00Z') }).applicable, true);
});

test('a claim recorded one day ahead is still applicable, for time zones', () => {
  const registry = new CapabilityRegistry(build([record({ id: 'run.tomorrow', observedAt: '2026-11-14' })],
    [claimWith('c.tomorrow', ['run.tomorrow'], { recordedAt: '2026-11-14' })]));
  const claim = registry.getClaim('c.tomorrow');
  assert.ok(claim);
  assert.equal(registry.evaluate(claim, { now: new Date('2026-11-13T12:00:00Z') }).applicable, true);
});

test('the shipped registry loads and every shipped claim is applicable at the reference date', () => {
  const registry = new CapabilityRegistry();
  const now = new Date('2026-11-13T12:00:00Z');
  for (const claim of registry.listClaims()) {
    assert.equal(registry.evaluate(claim, { now }).applicable, true, claim.id);
  }
});

test('G1-3 a future-dated claim is refused with a detail that says so, not one naming another release', () => {
  const data = clone();
  const claim = data.claims.find(item => item.id === 'sdk.release.pinned');
  assert.ok(claim);
  claim.recordedAt = '2027-06-01';
  claim.reviewBy = '2028-01-01';
  const now = new Date('2026-11-13T12:00:00Z');
  const request = { profileId: PRODUCTION_PROFILE_ID, operation: 'design_guidance' } as const;
  const decision = evaluateCompatibility(new CapabilityRegistry(data), request, { consoleReadsEnabled: false }, now);
  assert.equal(decision.decision, 'refused');
  assert.deepEqual(decision.reasonCodes, ['EVIDENCE_NOT_APPLICABLE']);
  const detail = decision.reasons[0]?.detail ?? '';
  assert.ok(!/different SDK release|board revision/.test(detail), detail);
  assert.ok(/future/.test(detail) && detail.includes('2027-06-01'), detail);
  assert.ok(!decision.requiredNextEvidence.some(text => /stated target/.test(text)), decision.requiredNextEvidence.join('|'));
});

test('G1-3 a claim scoped to another SDK release still says it was recorded for a different release', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const request = { profileId: PRODUCTION_PROFILE_ID, operation: 'design_guidance', sdkRelease: 'v9.9.9' } as const;
  const decision = evaluateCompatibility(new CapabilityRegistry(), request, { consoleReadsEnabled: false }, now);
  assert.equal(decision.decision, 'refused');
  assert.ok(decision.reasons.some(reason => /different SDK release or board revision/.test(reason.detail)), JSON.stringify(decision.reasons));
});
