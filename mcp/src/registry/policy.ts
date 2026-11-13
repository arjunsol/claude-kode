/** Deterministic compatibility evaluator (proposed ADR-0005 and ADR-0006).
 *
 * The same inputs always give the same decision and the same ordered reason
 * codes. A decision of `allowed` is advice that the evidence threshold is met;
 * it is never an authorisation and no caller argument can turn it into one.
 */
import type { EffectClass, ReasonCode } from '../result.js';
import { meetsState, type CapabilityRegistry, type EvaluationContext } from './registry.js';
import {
  ASSESSED_KODEOS_RELEASES, ASSESSED_SDK_RELEASES, IDF_SERIES, REQUIRED_CHIP,
  isAssessedKodeosRelease, isAssessedSdkRelease,
} from './sdk-contract.js';
import type { ClaimState, ModuleId } from './types.js';

export const operations = [
  'design_guidance', 'scaffold_app', 'validate_project', 'build_app', 'inspect_image',
  'console_read', 'install_app', 'remove_app',
  'raw_flash', 'erase_flash', 'os_update', 'c5_firmware_update', 'standalone_firmware_flash',
  'maker_bus_probe', 'maker_sensor_read', 'maker_gpio_control',
  'robotics_move', 'robotics_stop',
  'camera_capture',
  'mesh_receive', 'mesh_send',
  'rf_passive_capture', 'rf_lab_transmit',
] as const;
export type Operation = typeof operations[number];

type Rule = {
  effect: EffectClass;
  /** Claims that must be applicable, fresh, unconflicted and at least `minimum`. */
  requires: ReadonlyArray<{ claimId: string; minimum: ClaimState }>;
  /** Refused whatever the evidence says. */
  excluded?: { code: ReasonCode; why: string };
  module?: ModuleId;
  implemented: boolean;
};

const source = (claimId: string) => ({ claimId, minimum: 'source_verified' as const });
const device = (claimId: string) => ({ claimId, minimum: 'device_verified' as const });
const integration = (claimId: string) => ({ claimId, minimum: 'integration_verified' as const });

const buildClaims = [source('sdk.release.pinned'), source('sdk.idf.version'), source('sdk.app.boot_role'), source('sdk.app.manifest')];
const moduleRule = (module: ModuleId, effect: EffectClass): Rule => ({
  effect, module, implemented: false,
  requires: [device('board.identity.revision_observed'), integration(`module.${module}.l4_qualification`)],
});

const rules: Record<Operation, Rule> = {
  design_guidance: { effect: 'S0', implemented: true, requires: [{ claimId: 'sdk.release.pinned', minimum: 'documented' }] },
  scaffold_app: { effect: 'H1', implemented: true, requires: buildClaims },
  validate_project: { effect: 'H0', implemented: true, requires: buildClaims },
  build_app: { effect: 'H1', implemented: true, requires: buildClaims },
  inspect_image: { effect: 'H0', implemented: true, requires: [source('sdk.app.manifest'), source('board.chip.main')] },
  console_read: { effect: 'D1', implemented: true, requires: [source('console.kcli.surface'), source('console.serial_open_resets')] },
  install_app: {
    effect: 'D2', implemented: false,
    requires: [
      device('board.identity.revision_observed'), source('sdk.app.mailbox.partition_offset'),
      device('sdk.app.install_on_device'), device('sdk.recovery.procedure'),
    ],
  },
  remove_app: { effect: 'D2', implemented: false, requires: [device('board.identity.revision_observed'), device('sdk.app.install_on_device')] },
  raw_flash: {
    effect: 'D2', implemented: false, requires: [],
    excluded: { code: 'RAW_FLASH_NEVER_SUPPORTED', why: 'Writing an image at a caller-chosen flash offset is not offered by any Claude Kode tool.' },
  },
  erase_flash: {
    effect: 'D2', implemented: false, requires: [],
    excluded: { code: 'OPERATION_EXCLUDED_FROM_TOOLSET', why: 'Erasing flash removes kodeOS and is outside the application toolset.' },
  },
  os_update: {
    effect: 'D2', implemented: false, requires: [],
    excluded: { code: 'OPERATION_EXCLUDED_FROM_TOOLSET', why: 'kodeOS updates are a separate privileged operation, outside the application toolset.' },
  },
  c5_firmware_update: {
    effect: 'D2', implemented: false, requires: [],
    excluded: { code: 'OPERATION_EXCLUDED_FROM_TOOLSET', why: 'The production ESP32-C5 boots only Kode-signed images; custom C5 firmware is not installable.' },
  },
  standalone_firmware_flash: {
    effect: 'D2', implemented: false, requires: [device('sdk.recovery.procedure')],
    excluded: { code: 'RECOVERY_NOT_VALIDATED', why: 'Standalone firmware stays disabled until recovery is validated on a production Dot (Q07).' },
  },
  maker_bus_probe: moduleRule('maker', 'P1'),
  maker_sensor_read: moduleRule('maker', 'P1'),
  maker_gpio_control: moduleRule('maker', 'P1'),
  robotics_move: moduleRule('robotics', 'P1'),
  robotics_stop: moduleRule('robotics', 'P1'),
  camera_capture: moduleRule('camera', 'P1'),
  mesh_receive: moduleRule('mesh', 'P1'),
  mesh_send: moduleRule('mesh', 'RF1'),
  rf_passive_capture: moduleRule('fck', 'P1'),
  rf_lab_transmit: moduleRule('fck', 'RF1'),
};

/** Effects that touch a device, a circuit or the air. */
const physicalEffects: ReadonlySet<EffectClass> = new Set(['D2', 'P1', 'RF1', 'MIXED']);

export type CompatibilityRequest = {
  profileId: string;
  operation: Operation;
  boardRevision?: string;
  sdkRelease?: string;
  /** The kodeOS release the caller believes the Dot runs. A Dot can update
   * itself, so this is a declaration to check, not an observation. */
  kodeosRelease?: string;
  idfVersion?: string;
  imageChip?: string;
  moduleId?: string;
};

/** Host facts the server observes for itself. Never taken from tool arguments. */
export type HostState = { consoleReadsEnabled: boolean };

export type CompatibilityDecision = {
  operation: Operation;
  effectClass: EffectClass;
  decision: 'allowed' | 'refused';
  reasonCodes: ReasonCode[];
  reasons: Array<{ code: ReasonCode; detail: string }>;
  evaluatedClaims: Array<{ claimId: string; required: ClaimState; found: string }>;
  requiredNextEvidence: string[];
  implemented: boolean;
  advisoryOnly: true;
  grantsAuthorisation: false;
};

export function evaluateCompatibility(
  registry: CapabilityRegistry, request: CompatibilityRequest, host: HostState, now: Date,
): CompatibilityDecision {
  const rule = rules[request.operation];
  const reasons: Array<{ code: ReasonCode; detail: string }> = [];
  const next: string[] = [];
  const evaluated: CompatibilityDecision['evaluatedClaims'] = [];
  const add = (code: ReasonCode, detail: string, nextEvidence?: string) => {
    reasons.push({ code, detail });
    if (nextEvidence) next.push(nextEvidence);
  };

  // 1. Target profile.
  const profile = registry.getProfile(request.profileId);
  if (!profile) {
    add('PROFILE_UNKNOWN', `No hardware profile named ${request.profileId} exists.`, 'Use a profile listed by kode_get_capabilities.');
  } else if (profile.status === 'archived_unreleased_prototype') {
    add('PROFILE_ARCHIVED_PROTOTYPE', 'The ESP32-S3 prototype was never released; nothing derived from it may target a production Dot.');
  }

  // 2. Operations refused whatever the evidence says.
  if (rule.excluded) add(rule.excluded.code, rule.excluded.why);

  // 3. Declared target facts. A caller's word is checked, never trusted.
  if (profile && request.boardRevision !== undefined && !profile.knownBoardRevisions.includes(request.boardRevision)) {
    add('BOARD_REVISION_NOT_IN_PROFILE',
      `Board revision "${request.boardRevision}" is not one the pinned SDK names (${profile.knownBoardRevisions.join(', ') || 'none'}).`,
      'Read the revision from a physical Dot and audit that revision against manufacturer source.');
  }
  if (request.sdkRelease !== undefined && !isAssessedSdkRelease(request.sdkRelease)) {
    add('SDK_RELEASE_NOT_ASSESSED',
      `kode-sdk ${request.sdkRelease} has not been audited; this registry covers ${ASSESSED_SDK_RELEASES.join(' and ')} only.`,
      `Audit kode-sdk ${request.sdkRelease} against the registry before using it.`);
  }
  if (request.kodeosRelease !== undefined && !isAssessedKodeosRelease(request.kodeosRelease)) {
    add('KODEOS_RELEASE_NOT_ASSESSED',
      `kodeOS ${request.kodeosRelease} has not been audited; this registry covers ${ASSESSED_KODEOS_RELEASES.join(' and ')} only. A Dot can update its own kodeOS.`,
      `Audit kodeOS ${request.kodeosRelease} against the registry before relying on any recorded fact for that device.`);
  }
  if (request.idfVersion !== undefined && !isSupportedIdf(request.idfVersion)) {
    add('IDF_VERSION_UNSUPPORTED', `ESP-IDF ${request.idfVersion} is not the v${IDF_SERIES.major}.${IDF_SERIES.minor} series the pinned SDK builds with.`);
  }
  if (request.imageChip !== undefined && request.imageChip !== REQUIRED_CHIP) {
    add('IMAGE_CHIP_MISMATCH', `An image built for ${request.imageChip} cannot target the ${REQUIRED_CHIP} main chip.`);
  }

  // 4. Module scope.
  if (rule.module) {
    if (request.moduleId === undefined) {
      add('MODULE_REQUIRED', `Operation ${request.operation} acts through the ${rule.module} module; name it explicitly.`);
    } else if (!registry.getModule(request.moduleId)) {
      add('MODULE_UNKNOWN', `No module named ${request.moduleId} is catalogued.`);
    } else if (request.moduleId !== rule.module) {
      add('MODULE_OPERATION_MISMATCH', `Operation ${request.operation} belongs to the ${rule.module} module, not ${request.moduleId}.`);
    }
    const module = registry.getModule(rule.module);
    if (module?.sdkAvailability === 'not_publicly_accessible') {
      add('MODULE_SDK_UNAVAILABLE', `${module.sdkRepository} is not publicly accessible, so the module API and limits are unread.`,
        `Obtain ${module.sdkRepository} at a published release.`);
    }
    add('MODULE_ATTACHMENT_UNVERIFIED', 'No mechanism identifies an attached module; attachment cannot be established by this server.',
      'Define and verify a module identification or operator-confirmation procedure.');
    add('MODULE_NOT_QUALIFIED', `No L4 physical integration record exists for the ${rule.module} module.`,
      module ? `L4 record: ${module.minimumL4Proof}` : undefined);
  } else if (request.moduleId !== undefined && !registry.getModule(request.moduleId)) {
    add('MODULE_UNKNOWN', `No module named ${request.moduleId} is catalogued.`);
  }

  // 5. Evidence thresholds, in the order the rule lists them.
  if (profile && profile.status === 'supported_source_level') {
    const context: EvaluationContext = { now };
    if (request.boardRevision !== undefined) context.boardRevision = request.boardRevision;
    if (request.sdkRelease !== undefined) context.sdkRelease = request.sdkRelease;
    for (const requirement of rule.requires) {
      const claim = registry.getClaim(requirement.claimId);
      if (!claim || claim.scope.profileId !== profile.id) {
        evaluated.push({ claimId: requirement.claimId, required: requirement.minimum, found: 'missing' });
        add('EVIDENCE_MISSING', `No evidence record ${requirement.claimId} exists for this profile.`, `Record evidence for ${requirement.claimId}.`);
        continue;
      }
      const result = registry.evaluate(claim, context);
      evaluated.push({ claimId: claim.id, required: requirement.minimum, found: result.effectiveState });
      if (!result.applicable) {
        add('EVIDENCE_NOT_APPLICABLE', `${claim.id} was recorded for a different SDK release or board revision.`, `Re-verify ${claim.id} for the stated target.`);
      } else if (!result.fresh) {
        add('EVIDENCE_EXPIRED', `${claim.id} passed its review date ${claim.reviewBy}.`, `Re-verify ${claim.id} against current manufacturer sources.`);
      } else if (result.conflicting) {
        add('EVIDENCE_CONFLICTING', `${claim.id} is contradicted by ${claim.conflictsWith.join(', ')}.`, `Resolve the conflict between ${claim.id} and ${claim.conflictsWith.join(', ')} with the manufacturer.`);
      } else if (!meetsState(claim.state, requirement.minimum)) {
        add(claim.state === 'unknown' ? 'EVIDENCE_MISSING' : 'EVIDENCE_INSUFFICIENT',
          `${claim.id} is ${claim.state}; ${request.operation} needs ${requirement.minimum}.`,
          `${requirement.minimum} evidence for ${claim.id}.`);
      }
    }
  }

  // 6. Effects on a device, a circuit or the air.
  if (rule.effect === 'D1' && !host.consoleReadsEnabled) {
    add('CONSOLE_READS_NOT_ENABLED', 'Serial console reads are off. Opening the port can reset the Dot, so the operator must opt in on the host.');
  }
  if (physicalEffects.has(rule.effect)) {
    add('DEVICE_IDENTITY_NOT_OBSERVED', 'No device identity has been read from a physical Dot; identity and installed kodeOS release are never accepted from tool arguments.',
      'An observed identity session (serial, revision, installed kodeOS release) for the target Dot, with that release among the assessed ones.');
    add('NO_AUTHORISATION_CHANNEL', 'This build has no independent approval interface, so no device-changing operation can be authorised.',
      'An approval channel the model cannot write to, bound to device, action, artefact digest and expiry.');
  }
  if (!rule.implemented) add('OPERATION_NOT_IMPLEMENTED', `No Claude Kode tool performs ${request.operation}.`);

  const reasonCodes = [...new Set(reasons.map(reason => reason.code))];
  return {
    operation: request.operation,
    effectClass: rule.effect,
    decision: reasons.length === 0 ? 'allowed' : 'refused',
    reasonCodes,
    reasons,
    evaluatedClaims: evaluated,
    requiredNextEvidence: [...new Set(next)],
    implemented: rule.implemented,
    advisoryOnly: true,
    grantsAuthorisation: false,
  };
}

export function isSupportedIdf(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)(?:\.\d+)?$/.exec(version.trim());
  return match !== null && Number(match[1]) === IDF_SERIES.major && Number(match[2]) === IDF_SERIES.minor;
}

export function effectOf(operation: Operation): EffectClass { return rules[operation].effect; }
