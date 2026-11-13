import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registryData } from '../src/registry/data.js';
import {
  evaluateCompatibility, isSupportedIdf, operations, type CompatibilityRequest, type Operation,
} from '../src/registry/policy.js';
import { CapabilityRegistry } from '../src/registry/registry.js';
import { ARCHIVED_S3_PROFILE_ID, PRODUCTION_PROFILE_ID } from '../src/registry/sdk-contract.js';

const registry = new CapabilityRegistry();
const today = new Date('2026-11-13T12:00:00Z');
const off = { consoleReadsEnabled: false };
const on = { consoleReadsEnabled: true };
const decide = (request: Partial<CompatibilityRequest> & { operation: Operation }, host = off, now = today) =>
  evaluateCompatibility(registry, { profileId: PRODUCTION_PROFILE_ID, ...request }, host, now);

const hostOperations: Operation[] = ['design_guidance', 'scaffold_app', 'validate_project', 'build_app', 'inspect_image'];

test('source-level host operations are allowed on current evidence, as advice only', () => {
  for (const operation of hostOperations) {
    const decision = decide({ operation });
    assert.equal(decision.decision, 'allowed', operation);
    assert.deepEqual(decision.reasonCodes, []);
    assert.equal(decision.advisoryOnly, true);
    assert.equal(decision.grantsAuthorisation, false);
  }
  assert.equal(decide({ operation: 'build_app', boardRevision: 'DVT', sdkRelease: 'v0.1.1', idfVersion: 'v6.1' }).decision, 'allowed');
  assert.equal(decide({ operation: 'build_app', sdkRelease: 'v0.1.0', idfVersion: '6.1.0' }).decision, 'allowed');
});

test('an unknown or incorrect board revision is refused', () => {
  for (const boardRevision of ['EVT', 'PVT', 'rev-b', 'S3']) {
    const decision = decide({ operation: 'build_app', boardRevision });
    assert.equal(decision.decision, 'refused');
    assert.ok(decision.reasonCodes.includes('BOARD_REVISION_NOT_IN_PROFILE'), boardRevision);
  }
});

test('the archived S3 prototype and unknown profiles can support nothing', () => {
  for (const operation of operations) {
    assert.ok(decide({ operation, profileId: ARCHIVED_S3_PROFILE_ID }).reasonCodes.includes('PROFILE_ARCHIVED_PROTOTYPE'), operation);
    assert.ok(decide({ operation, profileId: 'made-up-board' }).reasonCodes.includes('PROFILE_UNKNOWN'), operation);
  }
});

test('an S3 image is refused for the P4 target', () => {
  for (const imageChip of ['esp32s3', 'esp32', 'esp32c5']) {
    for (const operation of ['inspect_image', 'install_app'] as const) {
      const decision = decide({ operation, imageChip });
      assert.equal(decision.decision, 'refused');
      assert.ok(decision.reasonCodes.includes('IMAGE_CHIP_MISMATCH'), `${operation} ${imageChip}`);
    }
  }
  assert.equal(decide({ operation: 'inspect_image', imageChip: 'esp32p4' }).decision, 'allowed');
});

test('SDK, kodeOS and ESP-IDF versions outside the assessed set are refused', () => {
  for (const sdkRelease of ['v0.1.2', 'v0.2.0', 'v9.9.9', 'v0.0.27']) {
    assert.ok(decide({ operation: 'build_app', sdkRelease }).reasonCodes.includes('SDK_RELEASE_NOT_ASSESSED'), sdkRelease);
  }
  // A Dot can update its own kodeOS, so a declared release is checked too.
  assert.ok(decide({ operation: 'console_read', kodeosRelease: 'v0.1.2' }, on).reasonCodes.includes('KODEOS_RELEASE_NOT_ASSESSED'));
  assert.equal(decide({ operation: 'console_read', kodeosRelease: 'v0.1.1' }, on).decision, 'allowed');
  for (const idfVersion of ['6.0.1', 'v5.4', 'v6.2', '7.0.0']) {
    assert.ok(decide({ operation: 'build_app', idfVersion }).reasonCodes.includes('IDF_VERSION_UNSUPPORTED'), idfVersion);
  }
  assert.equal(isSupportedIdf('v6.1'), true);
  assert.equal(isSupportedIdf('6.1.2'), true);
  assert.equal(isSupportedIdf('6.10'), false);
  assert.equal(isSupportedIdf('six'), false);
});

test('expired capability assertions stop supporting operations', () => {
  const later = new Date('2027-06-01T00:00:00Z');
  for (const operation of hostOperations) {
    const decision = decide({ operation }, off, later);
    assert.equal(decision.decision, 'refused', operation);
    assert.ok(decision.reasonCodes.includes('EVIDENCE_EXPIRED'));
    assert.ok(decision.evaluatedClaims.some(claim => claim.found === 'stale'));
  }
});

test('missing evidence is refused, not assumed', () => {
  const data = structuredClone(registryData);
  data.claims = data.claims.filter(claim => claim.id !== 'sdk.app.boot_role');
  const decision = evaluateCompatibility(new CapabilityRegistry(data),
    { profileId: PRODUCTION_PROFILE_ID, operation: 'build_app' }, off, today);
  assert.equal(decision.decision, 'refused');
  assert.deepEqual(decision.reasonCodes, ['EVIDENCE_MISSING']);
  assert.deepEqual(decision.evaluatedClaims.find(claim => claim.claimId === 'sdk.app.boot_role'),
    { claimId: 'sdk.app.boot_role', required: 'source_verified', found: 'missing' });
});

test('installation is refused for conflicting evidence, missing device evidence and no approval channel', () => {
  const decision = decide({ operation: 'install_app', boardRevision: 'DVT', sdkRelease: 'v0.1.1', imageChip: 'esp32p4' }, on);
  assert.equal(decision.decision, 'refused');
  for (const code of ['EVIDENCE_CONFLICTING', 'EVIDENCE_MISSING', 'DEVICE_IDENTITY_NOT_OBSERVED',
    'NO_AUTHORISATION_CHANNEL', 'OPERATION_NOT_IMPLEMENTED'] as const) {
    assert.ok(decision.reasonCodes.includes(code), code);
  }
  assert.ok(decision.reasons.some(reason => reason.code === 'EVIDENCE_CONFLICTING' && /readme_raw_offset/.test(reason.detail)));
  assert.ok(decision.requiredNextEvidence.length >= 3);
});

test('raw flashing, erase, OS and C5 updates and standalone firmware are refused whatever is supplied', () => {
  const expected: Array<[Operation, string]> = [
    ['raw_flash', 'RAW_FLASH_NEVER_SUPPORTED'], ['erase_flash', 'OPERATION_EXCLUDED_FROM_TOOLSET'],
    ['os_update', 'OPERATION_EXCLUDED_FROM_TOOLSET'], ['c5_firmware_update', 'OPERATION_EXCLUDED_FROM_TOOLSET'],
    ['standalone_firmware_flash', 'RECOVERY_NOT_VALIDATED'],
  ];
  for (const [operation, code] of expected) {
    const decision = decide({ operation, boardRevision: 'DVT', sdkRelease: 'v0.1.1', idfVersion: 'v6.1', imageChip: 'esp32p4' }, on);
    assert.equal(decision.decision, 'refused');
    assert.ok(decision.reasonCodes.includes(code as never), operation);
  }
});

test('module operations are refused: no SDK, no attachment proof, no L4 record', () => {
  const cases: Array<[Operation, string]> = [
    ['maker_gpio_control', 'maker'], ['maker_bus_probe', 'maker'], ['maker_sensor_read', 'maker'],
    ['robotics_move', 'robotics'], ['robotics_stop', 'robotics'], ['camera_capture', 'camera'],
    ['mesh_send', 'mesh'], ['mesh_receive', 'mesh'], ['rf_passive_capture', 'fck'], ['rf_lab_transmit', 'fck'],
  ];
  for (const [operation, moduleId] of cases) {
    const decision = decide({ operation, moduleId }, on);
    assert.equal(decision.decision, 'refused', operation);
    for (const code of ['MODULE_NOT_QUALIFIED', 'MODULE_ATTACHMENT_UNVERIFIED', 'DEVICE_IDENTITY_NOT_OBSERVED',
      'NO_AUTHORISATION_CHANNEL', 'OPERATION_NOT_IMPLEMENTED'] as const) {
      assert.ok(decision.reasonCodes.includes(code), `${operation} ${code}`);
    }
    assert.equal(decision.reasonCodes.includes('MODULE_SDK_UNAVAILABLE'), moduleId !== 'maker', operation);
  }
  assert.ok(decide({ operation: 'robotics_move' }).reasonCodes.includes('MODULE_REQUIRED'));
  assert.ok(decide({ operation: 'robotics_move', moduleId: 'camera' }).reasonCodes.includes('MODULE_OPERATION_MISMATCH'));
  assert.ok(decide({ operation: 'robotics_move', moduleId: 'lidar' }).reasonCodes.includes('MODULE_UNKNOWN'));
  assert.ok(decide({ operation: 'build_app', moduleId: 'lidar' }).reasonCodes.includes('MODULE_UNKNOWN'));
});

test('console reads depend on the operator opt-in the server observes, not on arguments', () => {
  const refused = decide({ operation: 'console_read' }, off);
  assert.deepEqual(refused.reasonCodes, ['CONSOLE_READS_NOT_ENABLED']);
  assert.equal(decide({ operation: 'console_read' }, on).decision, 'allowed');
});

test('an allowed console read carries the cautions: the port resets the Dot and the device is unidentified', () => {
  const allowed = decide({ operation: 'console_read' }, on);
  assert.equal(allowed.decision, 'allowed');
  assert.equal(allowed.cautions.length, 2);
  assert.match(allowed.cautions[0] ?? '', /resets the Dot/);
  assert.match(allowed.cautions[1] ?? '', /identity and installed kodeOS release .* unverified/);
  // Cautions are specific to device reads; host-only operations carry none.
  for (const operation of hostOperations) assert.deepEqual(decide({ operation }).cautions, [], operation);
});

test('no input combination ever allows an operation that changes a device, a circuit or the air', () => {
  const physical = operations.filter(operation => !hostOperations.includes(operation) && operation !== 'console_read');
  const modules = [undefined, 'maker', 'robotics', 'camera', 'mesh', 'fck'];
  // Declaring a fact is never required for a refusal: with every declared
  // fact omitted the same operations are still refused.
  const declarations: Array<Partial<CompatibilityRequest>> = [
    { sdkRelease: 'v0.1.1', kodeosRelease: 'v0.1.1', idfVersion: 'v6.1', imageChip: 'esp32p4' },
    {},
  ];
  let evaluated = 0;
  for (const operation of physical) {
    for (const host of [off, on]) {
      for (const moduleId of modules) {
        for (const boardRevision of [undefined, 'DVT']) {
          for (const declared of declarations) {
          const request: Partial<CompatibilityRequest> & { operation: Operation } = { operation, ...declared };
          if (moduleId !== undefined) request.moduleId = moduleId;
          if (boardRevision !== undefined) request.boardRevision = boardRevision;
          const decision = decide(request, host);
          assert.equal(decision.decision, 'refused', `${operation} ${moduleId} ${boardRevision}`);
          assert.equal(decision.grantsAuthorisation, false);
          evaluated++;
          }
        }
      }
    }
  }
  assert.equal(evaluated, physical.length * 2 * modules.length * 2 * declarations.length);
});

test('console_read is never allowed without the host opt-in, whatever is declared', () => {
  const declarations: Array<Partial<CompatibilityRequest>> = [
    {}, { sdkRelease: 'v0.1.1' }, { kodeosRelease: 'v0.1.1' }, { boardRevision: 'DVT' },
    { sdkRelease: 'v0.1.1', kodeosRelease: 'v0.1.1', idfVersion: 'v6.1', imageChip: 'esp32p4', boardRevision: 'DVT' },
    { sdkRelease: 'v0.1.0', kodeosRelease: 'v0.1.0' },
  ];
  for (const declared of declarations) {
    const decision = decide({ operation: 'console_read', ...declared }, off);
    assert.equal(decision.decision, 'refused', JSON.stringify(declared));
    assert.ok(decision.reasonCodes.includes('CONSOLE_READS_NOT_ENABLED'), JSON.stringify(declared));
  }
});

test('the evaluator is deterministic: same input, same decision and reason order', () => {
  for (const operation of operations) {
    const request = { operation, boardRevision: 'EVT', sdkRelease: 'v0.3.0', imageChip: 'esp32s3', moduleId: 'mesh' };
    assert.deepEqual(decide(request, on), decide(request, on));
  }
  const decision = decide({ operation: 'install_app', boardRevision: 'EVT', sdkRelease: 'v0.3.0', imageChip: 'esp32s3' });
  assert.deepEqual(decision.reasonCodes.slice(0, 3), ['BOARD_REVISION_NOT_IN_PROFILE', 'SDK_RELEASE_NOT_ASSESSED', 'IMAGE_CHIP_MISMATCH']);
});
