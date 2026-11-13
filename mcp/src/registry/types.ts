/** Schemas for the provenance-aware capability registry (ADR-0004 accepted,
 * ADR-0005 and ADR-0011 proposed). Data that fails these schemas, or the
 * integrity rules in registry.ts, stops the server instead of being served.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha1 = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,95}$/);

export const sourceSchema = z.object({
  id: identifier,
  kind: z.enum(['git_tag', 'http_probe', 'repository_record']),
  repository: z.string(),
  ref: z.string(),
  commit: sha1.optional(),
  licence: z.string(),
  retrievedAt: isoDate,
  uri: z.string().url(),
}).strict();
export type Source = z.infer<typeof sourceSchema>;

/** ADR-0005's states. `unknown`, `unsupported` and `conflicting` carry no rank. */
export const claimStates = [
  'advertised', 'documented', 'source_verified', 'simulated',
  'device_verified', 'integration_verified',
  'unknown', 'unsupported', 'conflicting',
] as const;
export const claimStateSchema = z.enum(claimStates);
export type ClaimState = z.infer<typeof claimStateSchema>;

export const invalidationTriggers = [
  'sdk_release_change', 'kodeos_release_change', 'template_release_change',
  'board_revision_change', 'module_revision_change', 'upstream_availability_change',
  'idf_release_change', 'catalogue_rules_change',
] as const;

export const claimSchema = z.object({
  id: identifier,
  subject: z.string().regex(/^(board|sdk|console|licence|module:[a-z]+)$/),
  capability: identifier.optional(),
  statement: z.string().min(10),
  value: z.unknown().optional(),
  state: claimStateSchema,
  refs: z.array(z.object({
    sourceId: identifier,
    path: z.string().optional(),
  }).strict()),
  scope: z.object({
    profileId: identifier,
    // Revisions the claim was read for. An empty list means "not revision scoped".
    boardRevisions: z.array(z.string()),
    sdkReleases: z.array(z.string()),
  }).strict(),
  recordedAt: isoDate,
  // After this date the claim is stale and cannot support an operation.
  reviewBy: isoDate,
  invalidatedBy: z.array(z.enum(invalidationTriggers)),
  conflictsWith: z.array(identifier),
  // Required for device_verified and integration_verified claims.
  testRecordIds: z.array(identifier),
}).strict();
export type Claim = z.infer<typeof claimSchema>;

/** ADR-0011 layered evidence. No record is ever inferred from a lower level. */
export const testRecordSchema = z.object({
  id: identifier,
  level: z.enum(['L1', 'L2', 'L3', 'L4']),
  result: z.enum(['passed', 'failed', 'blocked', 'not_tested', 'unsupported']),
  protocol: z.string().min(5),
  artefactSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  board: z.object({ profileId: identifier, revision: z.string(), serial: z.string().optional() }).strict(),
  moduleId: z.string().optional(),
  moduleRevision: z.string().optional(),
  firmware: z.string(),
  toolchain: z.string(),
  observedAt: isoDate,
  // A mock, fixture or emulator run. Can never back L3 or L4.
  simulated: z.boolean(),
}).strict();
export type TestRecord = z.infer<typeof testRecordSchema>;

export const profileSchema = z.object({
  id: identifier,
  status: z.enum(['supported_source_level', 'archived_unreleased_prototype']),
  title: z.string(),
  mainChip: z.string(),
  coprocessor: z.string().optional(),
  // Revisions named by pinned manufacturer source. Not an observation of a device.
  knownBoardRevisions: z.array(z.string()),
  pinnedSdkRelease: z.string().optional(),
  note: z.string(),
}).strict();
export type Profile = z.infer<typeof profileSchema>;

export const moduleIds = ['maker', 'robotics', 'camera', 'mesh', 'fck'] as const;
export const moduleIdSchema = z.enum(moduleIds);
export type ModuleId = z.infer<typeof moduleIdSchema>;

export const moduleSchema = z.object({
  id: moduleIdSchema,
  title: z.string(),
  v1Required: z.literal(true),
  sdkRepository: z.string().nullable(),
  sdkAvailability: z.enum(['uses_base_sdk', 'not_publicly_accessible']),
  // Claims that describe this module. Electrical and API facts stay `unknown`
  // until a pinned manufacturer source or a physical record exists.
  claimIds: z.array(identifier),
  minimumL4Proof: z.string(),
  blockers: z.array(z.string()),
}).strict();
export type ModuleProfile = z.infer<typeof moduleSchema>;

export const registryDataSchema = z.object({
  registryVersion: z.string(),
  sources: z.array(sourceSchema),
  profiles: z.array(profileSchema),
  claims: z.array(claimSchema),
  modules: z.array(moduleSchema),
  testRecords: z.array(testRecordSchema),
}).strict();
export type RegistryData = z.infer<typeof registryDataSchema>;
