/** What the tool layer is given. Tests inject a clock, an environment and a
 * build runner; the real server uses the system ones. */
import { z } from 'zod';
import type { BuildRunner } from '../build/build.js';
import type { BuildReceipts } from '../build/receipts.js';
import type { CapabilityRegistry, ClaimEvaluation, EvaluationContext } from '../registry/registry.js';
import { sourceUri } from '../registry/registry.js';
import { ASSESSED_SDK_RELEASES, isAssessedSdkRelease } from '../registry/sdk-contract.js';
import type { Claim, Profile } from '../registry/types.js';
import {
  KodeRefusal, makeResult, type EffectClass, type KodeResult, type VerifiedLayer,
} from '../result.js';

export type KodeDeps = {
  registry: CapabilityRegistry;
  now: () => Date;
  env: NodeJS.ProcessEnv;
  runBuild?: BuildRunner;
  /** Images this server process built. Created per server when not supplied. */
  receipts?: BuildReceipts;
};

export const profileIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{1,63}$/);
export const releaseSchema = z.string().regex(/^v\d{1,3}\.\d{1,3}\.\d{1,3}$/);
export const boardRevisionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}$/);

export const claimViewSchema = z.object({
  id: z.string(),
  subject: z.string(),
  capability: z.string().optional(),
  statement: z.string(),
  value: z.unknown().optional(),
  state: z.string(),
  effectiveState: z.string(),
  fresh: z.boolean(),
  recordedAt: z.string(),
  reviewBy: z.string(),
  appliesToSdkReleases: z.array(z.string()),
  appliesToBoardRevisions: z.array(z.string()),
  invalidatedBy: z.array(z.string()),
  conflictsWith: z.array(z.string()),
  sources: z.array(z.object({ uri: z.string(), revision: z.string() }).strict()),
}).strict();
export type ClaimView = z.infer<typeof claimViewSchema>;

export function claimView(registry: CapabilityRegistry, evaluation: ClaimEvaluation): ClaimView {
  const { claim } = evaluation;
  const view: ClaimView = {
    id: claim.id, subject: claim.subject, statement: claim.statement, state: claim.state,
    effectiveState: evaluation.effectiveState, fresh: evaluation.fresh,
    recordedAt: claim.recordedAt, reviewBy: claim.reviewBy,
    appliesToSdkReleases: claim.scope.sdkReleases, appliesToBoardRevisions: claim.scope.boardRevisions,
    invalidatedBy: claim.invalidatedBy, conflictsWith: claim.conflictsWith,
    sources: claim.refs.flatMap(ref => {
      const source = registry.getSource(ref.sourceId);
      return source ? [{ uri: sourceUri(source, ref.path), revision: source.commit ?? source.ref }] : [];
    }),
  };
  if (claim.capability !== undefined) view.capability = claim.capability;
  if (claim.value !== undefined) view.value = claim.value;
  return view;
}

export type ScopeInput = { profileId: string; boardRevision?: string | undefined; sdkRelease?: string | undefined };

/** Resolve the target a knowledge query names, or return the refusal to send.
 * Facts recorded for one release or revision are never served for another. */
export function resolveScope(
  deps: KodeDeps, tool: string, effect: EffectClass, input: ScopeInput,
): { profile: Profile; context: EvaluationContext } | KodeResult<never> {
  // Every scope gate refuses: the tool then returns an MCP tool error, so a
  // client that reads only the text cannot take a refusal for an answer.
  // not_verified is kept for answers that are served but cannot be relied on.
  const fail = (status: 'refused', reasonCode: Parameters<typeof makeResult>[0]['reasonCode'], message: string, next: string[] = []) =>
    makeResult<never>({ tool, effectClass: effect, status, reasonCode, message, requiredNextEvidence: next });
  const profile = deps.registry.getProfile(input.profileId);
  if (!profile) {
    return fail('refused', 'PROFILE_UNKNOWN',
      `No hardware profile named ${input.profileId} exists. Known profiles: ${deps.registry.listProfiles().map(item => item.id).join(', ')}.`);
  }
  if (profile.status === 'archived_unreleased_prototype') {
    return fail('refused', 'PROFILE_ARCHIVED_PROTOTYPE',
      'The ESP32-S3 prototype was never released. Its pins, partitions and flash layout are not served, so they cannot be mistaken for production facts.');
  }
  if (input.sdkRelease !== undefined && !isAssessedSdkRelease(input.sdkRelease)) {
    return fail('refused', 'SDK_RELEASE_NOT_ASSESSED',
      `kode-sdk ${input.sdkRelease} has not been audited. Facts recorded for ${ASSESSED_SDK_RELEASES.join(' and ')} are not served for it.`,
      [`Audit kode-sdk ${input.sdkRelease} against the registry.`]);
  }
  if (input.boardRevision !== undefined && !profile.knownBoardRevisions.includes(input.boardRevision)) {
    return fail('refused', 'BOARD_REVISION_NOT_IN_PROFILE',
      `Board revision "${input.boardRevision}" is not one the pinned SDK names (${profile.knownBoardRevisions.join(', ')}). Facts recorded for another revision are not served for it.`,
      ['Read the revision from a physical Dot and audit it against manufacturer source.']);
  }
  const context: EvaluationContext = { now: deps.now() };
  if (input.boardRevision !== undefined) context.boardRevision = input.boardRevision;
  if (input.sdkRelease !== undefined) context.sdkRelease = input.sdkRelease;
  return { profile, context };
}

export const isRefusal = (value: unknown): value is KodeResult<never> =>
  typeof value === 'object' && value !== null && 'schemaVersion' in value;

/** Evaluate claims for a scope, dropping those recorded for another release. */
export function evaluateClaims(deps: KodeDeps, claims: Claim[], context: EvaluationContext): ClaimEvaluation[] {
  return claims.map(claim => deps.registry.evaluate(claim, context)).filter(evaluation => evaluation.applicable);
}

/** The weakest layer among the sourced claims an answer rests on. Computed
 * from the effective state: a stale, conflicting or out-of-scope claim
 * contributes nothing, so an answer with no usable claim left is `none`. */
export function layerOf(evaluations: ClaimEvaluation[]): VerifiedLayer {
  const rank: Record<string, number> = { advertised: 1, documented: 1, simulated: 2, source_verified: 3, device_verified: 4, integration_verified: 5 };
  const layers: VerifiedLayer[] = ['none', 'documentation', 'simulation', 'source', 'device', 'integration'];
  const sourced = evaluations.filter(evaluation => rank[evaluation.effectiveState] !== undefined);
  if (sourced.length === 0) return 'none';
  return layers[Math.min(...sourced.map(evaluation => rank[evaluation.effectiveState] ?? 0))] ?? 'none';
}

/** Turn a service refusal into a result; anything else is an internal failure
 * whose detail is not passed to the model. */
export function refusalResult(tool: string, effect: EffectClass, error: unknown): KodeResult<never> {
  if (error instanceof KodeRefusal) {
    return makeResult<never>({
      tool, effectClass: effect, status: error.status, reasonCode: error.reasonCode,
      message: error.message, requiredNextEvidence: error.requiredNextEvidence,
    });
  }
  return makeResult<never>({
    tool, effectClass: effect, status: 'failed', reasonCode: 'INTERNAL_ERROR',
    message: 'The operation failed inside the server; details were not returned.',
  });
}
