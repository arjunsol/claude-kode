/** S0 and H0 knowledge tools: capabilities, pinout, modules, evidence,
 * compatibility, the SDK contract and toolchain status. None opens a device,
 * starts a process or writes a file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolchainStatus } from '../build/toolchain.js';
import { hostConfig } from '../build/workspace.js';
import { consoleConfig } from '../kcli-readonly.js';
import { evaluateCompatibility, operations } from '../registry/policy.js';
import {
  ASSESSED_KODEOS_RELEASES, ASSESSED_SDK_RELEASES, BOARD_OWNED_PINS, CATALOGUE_IMAGE_MAX, CATEGORIES,
  CONSOLE_TOOLS, IDF_SERIES, IMAGE, J3_CONTROLLERS, J3_POSITIONS, KCLI_SURFACE, MAILBOX,
  MANIFEST_LIMITS, PARTITIONS, PINNED, PREVIOUS, PRODUCTION_PROFILE_ID, RELEASE_DELTA_V0_1_1,
  SDK_DEPENDENCY, SDK_EXAMPLES, TEMPLATE_README_RAW_OFFSET,
} from '../registry/sdk-contract.js';
import { makeResult, resultSchema, toToolResult, type KodeResult, type ReasonCode } from '../result.js';
import {
  boardRevisionSchema, claimView, claimViewSchema, evaluateClaims, isRefusal, layerOf,
  profileIdSchema, refusalResult, releaseSchema, resolveScope, type KodeDeps,
} from './context.js';

const scopeShape = {
  profileId: profileIdSchema,
  boardRevision: boardRevisionSchema.optional(),
  sdkRelease: releaseSchema.optional(),
};
const knowledge = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const NOT_TESTED = { L1: 'NOT TESTED', L2: 'NOT TESTED', L3: 'NOT TESTED', L4: 'NOT TESTED' } as const;
const levelsSchema = z.object({ L1: z.string(), L2: z.string(), L3: z.string(), L4: z.string() }).strict();

// ---- kode_get_capabilities ----
const capabilitiesInput = z.object({ ...scopeShape, capability: z.string().regex(/^[a-z0-9_]{1,64}$/).optional() }).strict();
const capabilitiesPayload = z.object({
  profile: z.object({
    id: z.string(), title: z.string(), status: z.string(), mainChip: z.string(),
    coprocessor: z.string().optional(), knownBoardRevisions: z.array(z.string()),
    pinnedSdkRelease: z.string().optional(), note: z.string(),
  }).strict(),
  registryVersion: z.string(),
  capabilities: z.array(z.object({ name: z.string(), subject: z.string(), claims: z.array(claimViewSchema) }).strict()),
  availableCapabilities: z.array(z.string()),
  unknowns: z.array(z.string()),
  deviceVerified: z.literal(false),
}).strict();

export function getCapabilities(deps: KodeDeps, input: z.infer<typeof capabilitiesInput>): KodeResult<z.infer<typeof capabilitiesPayload>> {
  const tool = 'kode_get_capabilities';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  const subjects = ['board', 'sdk', 'console', 'licence'];
  const all = deps.registry.claimsFor(scope.profile.id).filter(claim => subjects.includes(claim.subject));
  const available = [...new Set(all.map(claim => claim.capability).filter((name): name is string => name !== undefined))].sort();
  if (input.capability !== undefined && !available.includes(input.capability)) {
    return makeResult({
      tool, effectClass: 'S0', status: 'unsupported', reasonCode: 'CAPABILITY_UNKNOWN',
      message: `No capability named ${input.capability} is recorded for ${scope.profile.id}. Unrecorded does not mean absent from the hardware; it means this registry cannot speak for it.`,
      payload: emptyCapabilities(deps, scope.profile, available),
    });
  }
  const selected = evaluateClaims(deps, all.filter(claim => input.capability === undefined || claim.capability === input.capability), scope.context);
  const names = [...new Set(selected.map(evaluation => evaluation.claim.capability ?? 'general'))].sort();
  const payload = {
    ...emptyCapabilities(deps, scope.profile, available),
    capabilities: names.map(name => {
      const members = selected.filter(evaluation => (evaluation.claim.capability ?? 'general') === name);
      return { name, subject: members[0]?.claim.subject ?? 'board', claims: members.map(member => claimView(deps.registry, member)) };
    }),
    unknowns: selected.filter(evaluation => evaluation.claim.state === 'unknown').map(evaluation => evaluation.claim.statement),
  };
  // Expiry takes precedence over a conflict: stale evidence says nothing yet.
  const stale = selected.some(evaluation => !evaluation.fresh);
  const conflicting = selected.filter(evaluation => evaluation.fresh && evaluation.conflicting);
  const status = stale || conflicting.length > 0 ? 'not_verified' : 'ok';
  const reasonCode: ReasonCode = stale ? 'EVIDENCE_EXPIRED' : conflicting.length > 0 ? 'EVIDENCE_CONFLICTING' : 'OK';
  return makeResult({
    tool, effectClass: 'S0', status, reasonCode,
    message: stale
      ? 'Some recorded evidence has passed its review date and must be re-verified before it is relied on.'
      : conflicting.length > 0
        ? `Some recorded claims contradict each other (${conflicting.map(evaluation => evaluation.claim.id).join(', ')}); neither side may be acted on until the conflict is resolved.`
        : `Capabilities of ${scope.profile.title} as read from manufacturer source. None has been verified on a physical device.`,
    verifiedLayer: layerOf(selected), payload,
    evidence: deps.registry.evidenceRefs(selected.map(evaluation => evaluation.claim)),
    requiredNextEvidence: stale ? ['Re-audit the stale claims against current manufacturer releases.']
      : conflicting.length > 0 ? ['Resolve each conflicting claim with the manufacturer.']
      : ['A physical identity observation of a production Dot (revision, serial, installed kodeOS release).'],
  });
}

function emptyCapabilities(deps: KodeDeps, profile: ReturnType<KodeDeps['registry']['listProfiles']>[number], available: string[]) {
  return {
    profile, registryVersion: deps.registry.version, capabilities: [],
    availableCapabilities: available, unknowns: [] as string[], deviceVerified: false as const,
  };
}

// ---- kode_get_pinout ----
const pinoutInput = z.object({
  ...scopeShape,
  position: z.number().int().min(-1000).max(1000).optional(),
  gpio: z.number().int().min(-1000).max(1000).optional(),
}).strict();
const pinoutPayload = z.object({
  header: z.literal('J3'),
  positions: z.array(z.object({
    position: z.number(), gpio: z.number(), adc1Channel: z.number().nullable(), lowPower: z.boolean(),
  }).strict()),
  seriesResistanceOhms: z.number(),
  controllers: z.array(z.object({ kind: z.string(), idfId: z.number(), note: z.string() }).strict()),
  power: z.array(claimViewSchema),
  boardOwnedPins: z.array(z.object({ function: z.string(), gpios: z.array(z.number()) }).strict()),
  unknowns: z.array(z.string()),
  notes: z.array(z.string()),
}).strict();

export function getPinout(deps: KodeDeps, input: z.infer<typeof pinoutInput>): KodeResult<z.infer<typeof pinoutPayload>> {
  const tool = 'kode_get_pinout';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  let positions = [...J3_POSITIONS];
  const refuse = (message: string) => makeResult<z.infer<typeof pinoutPayload>>({
    tool, effectClass: 'S0', status: 'unsupported', reasonCode: 'PIN_NOT_ON_J3', message,
  });
  if (input.position !== undefined) {
    positions = positions.filter(item => item.position === input.position);
    if (positions.length === 0) return refuse(`J3 has positions 1 to 14; there is no position ${input.position}.`);
  }
  if (input.gpio !== undefined) {
    positions = positions.filter(item => item.gpio === input.gpio);
    if (positions.length === 0) {
      const owner = BOARD_OWNED_PINS.find(item => (item.gpios as readonly number[]).includes(input.gpio as number));
      return refuse(owner
        ? `GPIO${input.gpio} is not on J3: the board uses it for ${owner.function}. An app must not drive it.`
        : `GPIO${input.gpio} is not one of the fourteen J3 positions (GPIO8 to GPIO21)${input.position !== undefined ? ' at that position' : ''}.`);
    }
  }
  const ids = ['board.expansion.j3.positions', 'board.expansion.j3.controllers', 'board.expansion.j3.series_resistance',
    'board.expansion.j3.analog', 'board.expansion.j3.power_3v3', 'board.expansion.j3.power_5v',
    'board.expansion.j3.electrical_limits', 'board.expansion.j3.physical_pinout', 'board.pins.board_owned'];
  const claims = ids.map(id => deps.registry.getClaim(id)).filter(claim => claim !== undefined);
  const evaluated = evaluateClaims(deps, claims, scope.context);
  const byId = (id: string) => evaluated.find(evaluation => evaluation.claim.id === id);
  const stale = evaluated.some(evaluation => !evaluation.fresh);
  return makeResult({
    tool, effectClass: 'S0', status: stale ? 'not_verified' : 'ok', reasonCode: stale ? 'EVIDENCE_EXPIRED' : 'OK',
    message: stale ? 'The pin map evidence has passed its review date and must be re-verified.'
      : 'J3 logical positions from the pinned board support package. Electrical limits and the physical header pin order are not known.',
    verifiedLayer: layerOf(evaluated.filter(evaluation => evaluation.claim.state !== 'unknown')),
    payload: {
      header: 'J3' as const, positions, seriesResistanceOhms: 68,
      controllers: J3_CONTROLLERS.map(item => ({ ...item })),
      power: ['board.expansion.j3.power_3v3', 'board.expansion.j3.power_5v'].flatMap(id => {
        const evaluation = byId(id);
        return evaluation ? [claimView(deps.registry, evaluation)] : [];
      }),
      boardOwnedPins: BOARD_OWNED_PINS.map(item => ({ function: item.function, gpios: [...item.gpios] })),
      unknowns: evaluated.filter(evaluation => evaluation.claim.state === 'unknown').map(evaluation => evaluation.claim.statement),
      notes: [
        'Positions are the SDK\'s logical numbering (kode_pin_* uses them). They are not physical header pin numbers.',
        'Analog positions are read one sample at a time; the continuous ADC engine belongs to the RFID driver.',
        'This describes the Dot\'s header only. It says nothing about any expansion module plugged into it.',
      ],
    },
    evidence: deps.registry.evidenceRefs(evaluated.map(evaluation => evaluation.claim)),
    requiredNextEvidence: ['Manufacturer electrical limits for J3.', 'A measured or documented physical pin order for the 2x10 header.'],
  });
}

// ---- kode_list_modules and kode_get_module_spec ----
const listModulesInput = z.object({ profileId: profileIdSchema }).strict();
const moduleSummary = z.object({
  id: z.string(), title: z.string(), v1Required: z.literal(true),
  sdkRepository: z.string().nullable(), sdkAvailability: z.string(),
  attachment: z.literal('not_detectable'), qualification: levelsSchema, blockers: z.array(z.string()),
}).strict();
const listModulesPayload = z.object({
  modules: z.array(moduleSummary), autoDetection: z.string(), v1Rule: z.string(),
}).strict();

function summarise(module: ReturnType<KodeDeps['registry']['listModules']>[number]): z.infer<typeof moduleSummary> {
  return {
    id: module.id, title: module.title, v1Required: true, sdkRepository: module.sdkRepository,
    sdkAvailability: module.sdkAvailability, attachment: 'not_detectable', qualification: { ...NOT_TESTED },
    blockers: module.blockers,
  };
}

export function listModules(deps: KodeDeps, input: z.infer<typeof listModulesInput>): KodeResult<z.infer<typeof listModulesPayload>> {
  const tool = 'kode_list_modules';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  const claim = deps.registry.getClaim('module.all.required_for_v1');
  return makeResult({
    tool, effectClass: 'S0', status: 'ok', reasonCode: 'OK',
    message: 'The five modules required for v1. This is a catalogue: no module is detected, attached or qualified.',
    verifiedLayer: 'documentation',
    payload: {
      modules: deps.registry.listModules().map(summarise),
      autoDetection: 'Not available. No module identification mechanism was found in the pinned sources; this server never reports a module as attached.',
      v1Rule: 'Q09 and Q12: all five need an L4 physical integration record on production hardware before v1.',
    },
    evidence: claim ? deps.registry.evidenceRefs([claim]) : [],
    requiredNextEvidence: deps.registry.listModules().map(module => `${module.title}: ${module.minimumL4Proof}`),
  });
}

const moduleSpecInput = z.object({ profileId: profileIdSchema, moduleId: z.string().regex(/^[a-z0-9_-]{1,32}$/) }).strict();
const moduleSpecPayload = z.object({
  module: moduleSummary, minimumL4Proof: z.string(), claims: z.array(claimViewSchema),
  supportedOperations: z.array(z.string()), unknowns: z.array(z.string()),
}).strict();

export function getModuleSpec(deps: KodeDeps, input: z.infer<typeof moduleSpecInput>): KodeResult<z.infer<typeof moduleSpecPayload>> {
  const tool = 'kode_get_module_spec';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  const module = deps.registry.getModule(input.moduleId);
  if (!module) {
    return makeResult({
      tool, effectClass: 'S0', status: 'unsupported', reasonCode: 'MODULE_UNKNOWN',
      message: `No module named ${input.moduleId} is catalogued. Known modules: ${deps.registry.listModules().map(item => item.id).join(', ')}. No specification is invented for an unknown module.`,
    });
  }
  const claims = module.claimIds.map(id => deps.registry.getClaim(id)).filter(claim => claim !== undefined);
  const evaluated = evaluateClaims(deps, claims, scope.context);
  return makeResult({
    tool, effectClass: 'S0', status: 'not_verified', reasonCode: 'MODULE_NOT_QUALIFIED',
    message: `${module.title}: what is recorded is listed below. Its electrical and software contract is not verified, and no MCP operation acts through it.`,
    verifiedLayer: layerOf(evaluated),
    payload: {
      module: summarise(module), minimumL4Proof: module.minimumL4Proof,
      claims: evaluated.map(evaluation => claimView(deps.registry, evaluation)),
      supportedOperations: [],
      unknowns: evaluated.filter(evaluation => evaluation.claim.state === 'unknown').map(evaluation => evaluation.claim.statement),
    },
    evidence: deps.registry.evidenceRefs(evaluated.map(evaluation => evaluation.claim)),
    requiredNextEvidence: [...module.blockers, `L4 record: ${module.minimumL4Proof}`],
  });
}

// ---- kode_get_evidence ----
const evidenceInput = z.object({
  ...scopeShape,
  claimId: z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,95}$/).optional(),
  subject: z.string().regex(/^(board|sdk|console|licence|module:[a-z]+)$/).optional(),
}).strict();
const evidencePayload = z.object({
  registryVersion: z.string(),
  claims: z.array(claimViewSchema),
  summary: z.object({ total: z.number(), stale: z.number(), conflicting: z.number(), unknown: z.number() }).strict(),
  testRecords: z.array(z.unknown()),
  qualification: levelsSchema,
  note: z.string(),
}).strict();

export function getEvidence(deps: KodeDeps, input: z.infer<typeof evidenceInput>): KodeResult<z.infer<typeof evidencePayload>> {
  const tool = 'kode_get_evidence';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  let claims = deps.registry.claimsFor(scope.profile.id);
  if (input.subject !== undefined) claims = claims.filter(claim => claim.subject === input.subject);
  if (input.claimId !== undefined) {
    claims = claims.filter(claim => claim.id === input.claimId);
    if (claims.length === 0) {
      return makeResult({
        tool, effectClass: 'S0', status: 'unsupported', reasonCode: 'CLAIM_UNKNOWN',
        message: `No evidence record named ${input.claimId} exists for ${scope.profile.id}.`,
      });
    }
  }
  const evaluated = evaluateClaims(deps, claims, scope.context);
  const summary = {
    total: evaluated.length,
    stale: evaluated.filter(evaluation => !evaluation.fresh).length,
    conflicting: evaluated.filter(evaluation => evaluation.conflicting).length,
    unknown: evaluated.filter(evaluation => evaluation.claim.state === 'unknown').length,
  };
  const records = deps.registry.listTestRecords();
  const payload = {
    registryVersion: deps.registry.version,
    claims: evaluated.map(evaluation => claimView(deps.registry, evaluation)),
    summary, testRecords: records, qualification: { ...NOT_TESTED },
    note: 'No L1 to L4 test record has been recorded. Source evidence is never promoted to build, device or integration evidence.',
  };
  // For one named claim the status says whether that claim can be relied on.
  let status: KodeResult<unknown>['status'] = 'ok';
  let reasonCode: ReasonCode = 'OK';
  let message = `${summary.total} evidence record(s): ${summary.conflicting} conflicting, ${summary.stale} stale, ${summary.unknown} unknown.`;
  const single = input.claimId !== undefined ? evaluated[0] : undefined;
  if (input.claimId !== undefined && !single) {
    status = 'not_verified'; reasonCode = 'EVIDENCE_NOT_APPLICABLE';
    message = `${input.claimId} is not applicable: it was recorded for a different SDK release or board revision than the one stated, or its recorded date is in the future.`;
  } else if (single && !single.fresh) {
    status = 'not_verified'; reasonCode = 'EVIDENCE_EXPIRED';
    message = `${single.claim.id} passed its review date ${single.claim.reviewBy} and must be re-verified.`;
  } else if (single?.conflicting) {
    status = 'not_verified'; reasonCode = 'EVIDENCE_CONFLICTING';
    message = `${single.claim.id} is contradicted by ${single.claim.conflictsWith.join(', ')}. Neither side may be acted on until the conflict is resolved.`;
  } else if (single?.claim.state === 'unknown') {
    status = 'not_verified'; reasonCode = 'EVIDENCE_MISSING';
    message = `${single.claim.id}: nothing is known. ${single.claim.statement}`;
  } else if (summary.stale > 0) {
    status = 'not_verified'; reasonCode = 'EVIDENCE_EXPIRED';
    message = `${summary.stale} of ${summary.total} evidence record(s) passed their review date.`;
  }
  return makeResult({
    tool, effectClass: 'S0', status, reasonCode, message, verifiedLayer: layerOf(evaluated), payload,
    evidence: deps.registry.evidenceRefs(evaluated.map(evaluation => evaluation.claim)),
  });
}

// ---- kode_check_compatibility ----
const compatibilityInput = z.object({
  ...scopeShape,
  operation: z.enum(operations),
  kodeosRelease: releaseSchema.optional(),
  idfVersion: z.string().regex(/^v?\d{1,2}\.\d{1,2}(\.\d{1,2})?$/).optional(),
  imageChip: z.string().regex(/^esp32[a-z0-9]{0,4}$/).optional(),
  moduleId: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(),
}).strict();
const compatibilityPayload = z.object({
  operation: z.string(), effectClass: z.string(), decision: z.enum(['allowed', 'refused']),
  reasonCodes: z.array(z.string()),
  reasons: z.array(z.object({ code: z.string(), detail: z.string() }).strict()),
  evaluatedClaims: z.array(z.object({ claimId: z.string(), required: z.string(), found: z.string() }).strict()),
  requiredNextEvidence: z.array(z.string()), implemented: z.boolean(),
  cautions: z.array(z.string()),
  advisoryOnly: z.literal(true), grantsAuthorisation: z.literal(false),
}).strict();

export function checkCompatibility(deps: KodeDeps, input: z.infer<typeof compatibilityInput>): KodeResult<z.infer<typeof compatibilityPayload>> {
  const request: Parameters<typeof evaluateCompatibility>[1] = { profileId: input.profileId, operation: input.operation };
  if (input.boardRevision !== undefined) request.boardRevision = input.boardRevision;
  if (input.sdkRelease !== undefined) request.sdkRelease = input.sdkRelease;
  if (input.kodeosRelease !== undefined) request.kodeosRelease = input.kodeosRelease;
  if (input.idfVersion !== undefined) request.idfVersion = input.idfVersion;
  if (input.imageChip !== undefined) request.imageChip = input.imageChip;
  if (input.moduleId !== undefined) request.moduleId = input.moduleId;
  // Host state is read by the server. It is never taken from tool arguments.
  const decision = evaluateCompatibility(deps.registry, request, { consoleReadsEnabled: consoleConfig(deps.env).enabled }, deps.now());
  const claims = decision.evaluatedClaims.map(item => deps.registry.getClaim(item.claimId)).filter(claim => claim !== undefined);
  const refused = decision.decision === 'refused';
  return makeResult({
    // A refused decision is a refusal: the tool returns an error with the first
    // reason (reasons are produced in a fixed rule order), and the whole
    // decision stays in the payload.
    tool: 'kode_check_compatibility', effectClass: 'S0',
    status: refused ? 'refused' : 'ok', reasonCode: decision.reasonCodes[0] ?? 'OK',
    message: !refused
      ? `Decision: ALLOWED (advisory). The evidence threshold for ${decision.operation} is met. This is not an authorisation.${
        decision.cautions.length > 0 ? ` Cautions: ${decision.cautions.join(' ')}` : ''}`
      : `Decision: REFUSED. ${decision.operation} is refused for: ${decision.reasonCodes.join(', ')}.`,
    verifiedLayer: 'source', payload: decision,
    evidence: deps.registry.evidenceRefs(claims),
    requiredNextEvidence: decision.requiredNextEvidence,
  });
}

// ---- kode_get_sdk_contract ----
const sdkContractInput = z.object({ profileId: profileIdSchema, sdkRelease: releaseSchema.optional() }).strict();
const sdkContractPayload = z.object({
  release: z.string(),
  pinned: z.record(z.string(), z.unknown()),
  previous: z.record(z.string(), z.unknown()),
  assessedSdkReleases: z.array(z.string()), assessedKodeosReleases: z.array(z.string()),
  changesInV011: z.array(z.string()),
  toolchain: z.object({ idfSeries: z.string(), idfTag: z.string(), idfCommit: z.string(), target: z.string() }).strict(),
  appModel: z.array(z.string()),
  manifest: z.record(z.string(), z.unknown()),
  image: z.record(z.string(), z.unknown()),
  partitions: z.array(z.unknown()),
  installation: z.record(z.string(), z.unknown()),
  console: z.record(z.string(), z.unknown()),
  examples: z.array(z.string()),
  licences: z.array(z.string()),
  hazards: z.array(z.string()),
  claims: z.array(claimViewSchema),
}).strict();

export function getSdkContract(deps: KodeDeps, input: z.infer<typeof sdkContractInput>): KodeResult<z.infer<typeof sdkContractPayload>> {
  const tool = 'kode_get_sdk_contract';
  const scope = resolveScope(deps, tool, 'S0', input);
  if (isRefusal(scope)) return scope;
  const release = input.sdkRelease ?? PINNED.sdk.tag;
  const context = { ...scope.context, sdkRelease: release };
  const claims = deps.registry.claimsFor(scope.profile.id).filter(claim => ['sdk', 'console', 'licence'].includes(claim.subject));
  const evaluated = evaluateClaims(deps, claims, context);
  // Free text is taken only from a claim that applies to the requested release,
  // so a fact recorded for v0.1.1 is never printed as a hazard of v0.1.0. A
  // claim may belong to another subject than those listed in claims[].
  const text = (id: string) => {
    const claim = deps.registry.getClaim(id);
    return claim !== undefined && deps.registry.evaluate(claim, context).applicable ? claim.statement : '';
  };
  const stale = evaluated.some(evaluation => !evaluation.fresh);
  const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`;
  return makeResult({
    tool, effectClass: 'S0', status: stale ? 'not_verified' : 'ok', reasonCode: stale ? 'EVIDENCE_EXPIRED' : 'OK',
    message: stale ? 'The SDK contract evidence has passed its review date and must be re-verified.'
      : `The kodeOS application contract for kode-sdk ${release}, read from source. Not verified on a device.`,
    verifiedLayer: layerOf(evaluated) === 'none' ? 'none' : 'source',
    payload: {
      release, pinned: PINNED, previous: PREVIOUS,
      assessedSdkReleases: [...ASSESSED_SDK_RELEASES], assessedKodeosReleases: [...ASSESSED_KODEOS_RELEASES],
      changesInV011: release === 'v0.1.1' ? [...RELEASE_DELTA_V0_1_1] : [],
      toolchain: { idfSeries: `${IDF_SERIES.major}.${IDF_SERIES.minor}`, idfTag: PINNED.idf.tag, idfCommit: PINNED.idf.commit, target: 'esp32p4' },
      appModel: [text('sdk.app.model'), text('sdk.app.boot_role'), text('sdk.app.active_objects')].filter(isPresent),
      manifest: {
        macro: 'KODE_APP_MANIFEST("Display name", "cat1,cat2")', limits: MANIFEST_LIMITS, categories: CATEGORIES,
        identity: text('sdk.app.identity_rules'), dependency: SDK_DEPENDENCY, templatePin: text('sdk.template.pins_previous_sdk'),
      },
      image: {
        headerMagic: hex(IMAGE.magic), chipIdOffset: IMAGE.chipIdOffset, requiredChip: 'esp32p4',
        idfDescriptorOffset: hex(IMAGE.idfDescOffset), manifestOffset: hex(IMAGE.manifestOffset),
        manifestMagic: 'KAPD', manifestKnownVersions: IMAGE.manifestKnownVersions,
      },
      partitions: PARTITIONS.map(partition => ({ ...partition, offset: hex(partition.offset), size: hex(partition.size) })),
      installation: {
        status: 'NOT IMPLEMENTED in Claude Kode and NOT TESTED on a device',
        flashRedirect: text('sdk.app.flash_redirect'),
        mailbox: { partition: MAILBOX.partition, offset: hex(MAILBOX.offset), imageMax: hex(MAILBOX.imageMax) },
        catalogueImageMax: CATALOGUE_IMAGE_MAX,
        conflict: {
          partitionTableOffset: hex(MAILBOX.offset), templateReadmeOffset: hex(TEMPLATE_README_RAW_OFFSET),
          standing: 'Unresolved. The template is still v0.1.0 and the partition table is unchanged in v0.1.1. No raw offset is ever used.',
        },
      },
      // The kodeOS on a Dot is independent of an app's SDK pin (a Dot can update
      // itself), so the digests are given for every assessed kodeOS release.
      console: {
        verbs: KCLI_SURFACE,
        integrityByKodeosRelease: Object.fromEntries(ASSESSED_KODEOS_RELEASES.map(kodeos => [kodeos, CONSOLE_TOOLS[kodeos]])),
        serialOpenResets: text('console.serial_open_resets'),
      },
      examples: [...SDK_EXAMPLES],
      licences: [text('licence.sdk'), text('licence.c5'), text('licence.claude_kode')].filter(isPresent),
      hazards: [
        text('sdk.template.readme_raw_offset'),
        'idf.py erase-flash is not redirected by the SDK and erases the whole chip, kodeOS included.',
        'Without CONFIG_KODEOS_BOOT_ROLE_APP=y, idf.py flash writes to kodeOS\'s own factory slot.',
        text('board.identity.kodeos_self_update'),
        text('board.c5.secure_boot'),
      ].filter(isPresent),
      claims: evaluated.map(evaluation => claimView(deps.registry, evaluation)),
    },
    evidence: deps.registry.evidenceRefs(evaluated.map(evaluation => evaluation.claim)),
    requiredNextEvidence: ['An observed ESP-IDF v6.1 build of an app (L1).', 'An observed install, run and return to kodeOS on a production Dot (L3).'],
  });
}

const isPresent = (value: string): boolean => value !== '';

// ---- kode_get_toolchain_status ----
const toolchainInput = z.object({}).strict();
const toolchainPayload = z.object({
  node: z.object({ version: z.string(), supported: z.boolean() }).strict(),
  workspace: z.object({ configured: z.boolean(), exists: z.boolean() }).strict(),
  template: z.object({ configured: z.boolean(), matchesPinnedTag: z.boolean().nullable(), detail: z.string() }).strict(),
  idf: z.object({
    configured: z.boolean(), version: z.string().nullable(), seriesSupported: z.boolean(),
    commit: z.string().nullable(), commitMatchesPin: z.boolean().nullable(), pythonConfigured: z.boolean(),
  }).strict(),
  build: z.object({ enabled: z.boolean(), ready: z.boolean(), blockers: z.array(z.string()) }).strict(),
  console: z.object({ readsEnabled: z.boolean(), toolsConfigured: z.boolean(), cliPinMatchesRelease: z.string().nullable() }).strict(),
  pinned: z.record(z.string(), z.unknown()),
}).strict();

export async function getToolchainStatus(deps: KodeDeps): Promise<KodeResult<z.infer<typeof toolchainPayload>>> {
  const status = await toolchainStatus(hostConfig(deps.env), deps.env);
  return makeResult({
    tool: 'kode_get_toolchain_status', effectClass: 'H0', status: 'ok', reasonCode: 'OK',
    message: status.build.ready ? 'The host is configured for build-only work. No tool was executed to check it.'
      : `The host is not ready to build: ${status.build.blockers.join(' ')}`,
    verifiedLayer: 'none', payload: status,
    requiredNextEvidence: status.build.ready ? [] : status.build.blockers,
  });
}

export function registerKnowledgeTools(server: McpServer, deps: KodeDeps): void {
  const scopeNote = 'Answers come from manufacturer source at an assessed release, with their evidence. Nothing is detected, and nothing here is verified on a device or authorises an operation.';
  server.registerTool('kode_get_capabilities', {
    title: 'Kode Dot capabilities',
    description: `Board, SDK and console capabilities for a hardware profile (use "${PRODUCTION_PROFILE_ID}"), each with its evidence state. ${scopeNote}`,
    inputSchema: capabilitiesInput, outputSchema: resultSchema(capabilitiesPayload), annotations: knowledge,
  }, async input => toToolResult(getCapabilities(deps, input)));
  server.registerTool('kode_get_pinout', {
    title: 'Kode Dot expansion header pinout',
    description: `The J3 expansion header: logical positions, GPIOs, ADC channels, bus controllers and power, plus the pins the board owns. Electrical limits are reported as unknown where the source is silent. ${scopeNote}`,
    inputSchema: pinoutInput, outputSchema: resultSchema(pinoutPayload), annotations: knowledge,
  }, async input => toToolResult(getPinout(deps, input)));
  server.registerTool('kode_list_modules', {
    title: 'List expansion modules',
    description: 'The five expansion modules required for v1, with SDK availability and qualification status. A catalogue only: no module is ever reported as attached.',
    inputSchema: listModulesInput, outputSchema: resultSchema(listModulesPayload), annotations: knowledge,
  }, async input => toToolResult(listModules(deps, input)));
  server.registerTool('kode_get_module_spec', {
    title: 'Expansion module specification',
    description: 'What is recorded about one module (maker, robotics, camera, mesh, fck) and what is still unknown. Returns not_verified until the module has manufacturer data and a physical test record.',
    inputSchema: moduleSpecInput, outputSchema: resultSchema(moduleSpecPayload), annotations: knowledge,
  }, async input => toToolResult(getModuleSpec(deps, input)));
  server.registerTool('kode_get_evidence', {
    title: 'Evidence ledger',
    description: 'Evidence records behind the registry: source, revision, state, review date, conflicts and what invalidates each. Also reports L1 to L4 test records (none exist yet).',
    inputSchema: evidenceInput, outputSchema: resultSchema(evidencePayload), annotations: knowledge,
  }, async input => toToolResult(getEvidence(deps, input)));
  server.registerTool('kode_check_compatibility', {
    title: 'Check operation compatibility',
    description: 'Deterministically evaluate whether the recorded evidence supports an operation for a target. Returns allowed or refused with machine-readable reasons. Advisory only: it never authorises anything, and no argument can supply an approval.',
    inputSchema: compatibilityInput, outputSchema: resultSchema(compatibilityPayload), annotations: knowledge,
  }, async input => toToolResult(checkCompatibility(deps, input)));
  server.registerTool('kode_get_sdk_contract', {
    title: 'Kode SDK application contract',
    description: 'The kodeOS application contract for an assessed kode-sdk release: toolchain, app model, manifest, image layout, partitions, console verbs, licences and known hazards.',
    inputSchema: sdkContractInput, outputSchema: resultSchema(sdkContractPayload), annotations: knowledge,
  }, async input => toToolResult(getSdkContract(deps, input)));
  server.registerTool('kode_get_toolchain_status', {
    title: 'Host toolchain status',
    description: 'What the host is configured with for build-only work: Node, workspace, template checkout, ESP-IDF version and pin. Reads configuration and files only; starts no process and opens no port.',
    inputSchema: toolchainInput, outputSchema: resultSchema(toolchainPayload), annotations: knowledge,
  }, async () => {
    try { return toToolResult(await getToolchainStatus(deps)); }
    catch (error) { return toToolResult(refusalResult('kode_get_toolchain_status', 'H0', error)); }
  });
}
