/** Capability and evidence registry: validates its data, then answers what is
 * known, how it is known, and whether that knowledge still applies.
 */
import type { EvidenceClass, EvidenceRef, ReasonCode } from '../result.js';
import { evidenceClasses } from '../result.js';
import { registryData } from './data.js';
import {
  registryDataSchema,
  type Claim, type ClaimState, type ModuleProfile, type Profile, type RegistryData,
  type Source, type TestRecord,
} from './types.js';

export class RegistryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryIntegrityError';
  }
}

/** What a caller says about the target. None of it is an observation. */
export type EvaluationContext = {
  now: Date;
  boardRevision?: string;
  sdkRelease?: string;
};

export type ClaimEvaluation = {
  claim: Claim;
  /** The state after freshness, scope and conflicts are applied. */
  effectiveState: ClaimState | 'stale' | 'not_applicable';
  fresh: boolean;
  applicable: boolean;
  conflicting: boolean;
  issues: ReasonCode[];
};

/** Rank for "is this at least as strong as required". Simulation never
 * outranks reading the source, and the unranked states support nothing. */
const stateRank: Record<ClaimState, number> = {
  unknown: 0, unsupported: 0, conflicting: 0,
  advertised: 1, documented: 2, simulated: 2, source_verified: 3,
  device_verified: 5, integration_verified: 6,
};

const sourceBackedStates: ReadonlySet<ClaimState> = new Set([
  'advertised', 'documented', 'source_verified', 'simulated', 'device_verified', 'integration_verified',
]);

export function meetsState(actual: ClaimState, required: ClaimState): boolean {
  return stateRank[actual] > 0 && stateRank[actual] >= stateRank[required];
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

export class CapabilityRegistry {
  readonly version: string;
  private readonly sources: Map<string, Source>;
  private readonly profiles: Map<string, Profile>;
  private readonly claims: Map<string, Claim>;
  private readonly modules: Map<string, ModuleProfile>;
  private readonly testRecords: Map<string, TestRecord>;

  constructor(data: unknown = registryData) {
    const parsed = registryDataSchema.safeParse(data);
    if (!parsed.success) {
      throw new RegistryIntegrityError(`Registry data does not match its schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    }
    const value: RegistryData = parsed.data;
    this.version = value.registryVersion;
    this.sources = unique('source', value.sources);
    this.profiles = unique('profile', value.profiles);
    this.claims = unique('claim', value.claims);
    this.modules = unique('module', value.modules);
    this.testRecords = unique('test record', value.testRecords);
    this.checkIntegrity();
  }

  /** Rules the schema cannot express. A registry that breaks one is not served. */
  private checkIntegrity(): void {
    for (const record of this.testRecords.values()) {
      if (record.simulated && (record.level === 'L3' || record.level === 'L4')) {
        throw new RegistryIntegrityError(`Test record ${record.id}: a simulated run cannot be ${record.level} evidence.`);
      }
      if (!this.profiles.has(record.board.profileId)) {
        throw new RegistryIntegrityError(`Test record ${record.id}: unknown profile ${record.board.profileId}.`);
      }
      if (record.level === 'L4' && (!record.moduleId || !record.moduleRevision)) {
        throw new RegistryIntegrityError(`Test record ${record.id}: L4 evidence must name the module and its revision.`);
      }
    }
    for (const claim of this.claims.values()) {
      if (!this.profiles.has(claim.scope.profileId)) {
        throw new RegistryIntegrityError(`Claim ${claim.id}: unknown profile ${claim.scope.profileId}.`);
      }
      for (const ref of claim.refs) {
        if (!this.sources.has(ref.sourceId)) {
          throw new RegistryIntegrityError(`Claim ${claim.id}: unknown source ${ref.sourceId}.`);
        }
      }
      if (sourceBackedStates.has(claim.state) && claim.refs.length === 0) {
        throw new RegistryIntegrityError(`Claim ${claim.id}: state ${claim.state} needs a source reference.`);
      }
      if (claim.reviewBy < claim.recordedAt) {
        throw new RegistryIntegrityError(`Claim ${claim.id}: reviewBy precedes recordedAt.`);
      }
      for (const other of claim.conflictsWith) {
        const counterpart = this.claims.get(other);
        if (!counterpart) throw new RegistryIntegrityError(`Claim ${claim.id}: conflicts with unknown claim ${other}.`);
        if (!counterpart.conflictsWith.includes(claim.id)) {
          throw new RegistryIntegrityError(`Claim ${claim.id}: conflict with ${other} is not recorded on both sides.`);
        }
      }
      this.checkPhysicalClaim(claim);
    }
    for (const module of this.modules.values()) {
      for (const id of module.claimIds) {
        if (!this.claims.has(id)) throw new RegistryIntegrityError(`Module ${module.id}: unknown claim ${id}.`);
      }
    }
  }

  /** Physical states are earned by records of the matching level, never typed in. */
  private checkPhysicalClaim(claim: Claim): void {
    const needed = claim.state === 'device_verified' ? ['L3', 'L4']
      : claim.state === 'integration_verified' ? ['L4'] : undefined;
    if (!needed) {
      if (claim.testRecordIds.some(id => !this.testRecords.has(id))) {
        throw new RegistryIntegrityError(`Claim ${claim.id}: references a test record that does not exist.`);
      }
      return;
    }
    const records = claim.testRecordIds.map(id => this.testRecords.get(id));
    // A record only proves the claim it was taken for: same hardware profile, a
    // board revision the claim is scoped to (an empty list is "not revision
    // scoped"), the same module for a module claim, and observed no later than
    // the claim's review date. Otherwise a prototype or another module's run
    // would read as proof of a production claim.
    const moduleSubject = /^module:([a-z]+)$/.exec(claim.subject)?.[1];
    const backed = records.some(record => record !== undefined && !record.simulated &&
      record.result === 'passed' && needed.includes(record.level) &&
      record.board.profileId === claim.scope.profileId &&
      (claim.scope.boardRevisions.length === 0 || claim.scope.boardRevisions.includes(record.board.revision)) &&
      (moduleSubject === undefined || record.level !== 'L4' || record.moduleId === moduleSubject) &&
      record.observedAt <= claim.reviewBy);
    if (!backed) {
      throw new RegistryIntegrityError(
        `Claim ${claim.id}: state ${claim.state} needs a passed, non-simulated ${needed.join(' or ')} test record for the same profile, board revision and module, observed by its review date.`);
    }
  }

  getProfile(id: string): Profile | undefined { return this.profiles.get(id); }
  listProfiles(): Profile[] { return [...this.profiles.values()]; }
  getClaim(id: string): Claim | undefined { return this.claims.get(id); }
  listClaims(): Claim[] { return [...this.claims.values()]; }
  getModule(id: string): ModuleProfile | undefined { return this.modules.get(id); }
  listModules(): ModuleProfile[] { return [...this.modules.values()]; }
  listTestRecords(): TestRecord[] { return [...this.testRecords.values()]; }
  getSource(id: string): Source | undefined { return this.sources.get(id); }
  listSources(): Source[] { return [...this.sources.values()]; }

  claimsFor(profileId: string, filter: { subject?: string; capability?: string } = {}): Claim[] {
    return this.listClaims().filter(claim => claim.scope.profileId === profileId &&
      (filter.subject === undefined || claim.subject === filter.subject) &&
      (filter.capability === undefined || claim.capability === filter.capability));
  }

  capabilityNames(profileId: string, subject: string): string[] {
    return [...new Set(this.claimsFor(profileId, { subject })
      .map(claim => claim.capability).filter((name): name is string => name !== undefined))].sort();
  }

  /** Apply freshness, scope and recorded conflicts to one claim. */
  evaluate(claim: Claim, context: EvaluationContext): ClaimEvaluation {
    const issues: ReasonCode[] = [];
    const fresh = day(context.now) <= claim.reviewBy;
    let applicable = true;
    if (context.sdkRelease !== undefined && claim.scope.sdkReleases.length > 0 &&
        !claim.scope.sdkReleases.includes(context.sdkRelease)) applicable = false;
    if (context.boardRevision !== undefined && claim.scope.boardRevisions.length > 0 &&
        !claim.scope.boardRevisions.includes(context.boardRevision)) applicable = false;
    const conflicting = claim.state === 'conflicting' || claim.conflictsWith.length > 0;
    if (!applicable) issues.push('EVIDENCE_NOT_APPLICABLE');
    if (!fresh) issues.push('EVIDENCE_EXPIRED');
    if (conflicting) issues.push('EVIDENCE_CONFLICTING');
    const effectiveState = !applicable ? 'not_applicable' : !fresh ? 'stale'
      : conflicting ? 'conflicting' : claim.state;
    return { claim, effectiveState, fresh, applicable, conflicting, issues };
  }

  /** Evidence references for a result. Unsourced (`unknown`) claims have none. */
  evidenceRefs(claims: Claim[]): EvidenceRef[] {
    const refs: EvidenceRef[] = [];
    for (const claim of claims) {
      if (!isEvidenceClass(claim.state)) continue;
      for (const ref of claim.refs) {
        const source = this.sources.get(ref.sourceId);
        if (!source) continue;
        refs.push({
          claimId: claim.id,
          sourceUri: sourceUri(source, ref.path),
          revision: source.commit ?? source.ref,
          class: claim.state,
          verifiedAt: claim.recordedAt,
        });
      }
    }
    return refs;
  }
}

function isEvidenceClass(state: ClaimState): state is EvidenceClass {
  return (evidenceClasses as readonly string[]).includes(state);
}

export function sourceUri(source: Source, path?: string): string {
  if (source.kind !== 'git_tag' || !path) return source.uri;
  return `https://github.com/${source.repository}/blob/${source.ref}/${path}`;
}

function unique<T extends { id: string }>(kind: string, items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new RegistryIntegrityError(`Duplicate ${kind} id ${item.id}.`);
    map.set(item.id, item);
  }
  return map;
}
