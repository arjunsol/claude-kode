import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectCapability, resultSchema } from '../src/capabilities.js';

test('known build fixture remains simulation, not physical or build evidence', () => {
  const result = resultSchema.parse(inspectCapability({
    profileId: 'simulated-p4-c5', capability: 'local_build',
  }));
  assert.equal(result.status, 'simulated');
  assert.equal(result.hardwareAuthorized, false);
  assert.equal(result.evidenceClass, 'simulation');
});

test('unknown identities never inherit the fixture capabilities', () => {
  for (const profileId of ['production-p4', 'legacy-s3', '__proto__']) {
    const result = inspectCapability({ profileId, capability: 'local_build' });
    assert.equal(result.reason, 'UNKNOWN_PROFILE');
    assert.equal(result.status, 'not_verified');
    assert.equal(result.hardwareAuthorized, false);
  }
});

test('a known fixture cannot authorize hardware operations', () => {
  for (const capability of ['kodeos_install', 'standalone_flash']) {
    const result = inspectCapability({ profileId: 'simulated-p4-c5', capability });
    assert.equal(result.status, 'refused');
    assert.equal(result.reason, 'SIMULATION_CANNOT_AUTHORIZE_HARDWARE');
    assert.equal(result.hardwareAuthorized, false);
  }
});

test('unknown capabilities remain unsupported', () => {
  assert.equal(inspectCapability({ profileId: 'simulated-p4-c5', capability: 'motor' }).status,
    'unsupported');
});

test('caller-supplied evidence or approval cannot promote a simulation', () => {
  for (const extra of [{ hardwareAuthorized: true }, { evidenceClass: 'physical' },
    { approved: true }, { profile: { verified: true } }]) {
    assert.throws(() => inspectCapability({
      profileId: 'simulated-p4-c5', capability: 'kodeos_install', ...extra,
    }));
  }
});
