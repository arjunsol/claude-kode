/** Common typed result contract for every F1 tool (CK-R003, proposed in PR #6).
 * A result always states the effect class of the tool, the highest layer that
 * was actually verified, and that it authorises no hardware operation.
 */
import { z } from 'zod';

export const evidenceClasses = [
  'advertised', 'documented', 'source_verified', 'simulated',
  'device_verified', 'integration_verified',
] as const;
export const evidenceClassSchema = z.enum(evidenceClasses);
export type EvidenceClass = z.infer<typeof evidenceClassSchema>;

export const effectClassSchema = z.enum(['S0', 'H0', 'H1', 'D1', 'D2', 'P1', 'RF1', 'MIXED']);
export type EffectClass = z.infer<typeof effectClassSchema>;

export const statusSchema = z.enum(['ok', 'refused', 'not_verified', 'unsupported', 'failed']);
export type KodeStatus = z.infer<typeof statusSchema>;

/** Which layer the answer rests on. Never promoted by inference. */
export const verifiedLayerSchema = z.enum([
  'none', 'documentation', 'source', 'build', 'simulation', 'device', 'integration',
]);
export type VerifiedLayer = z.infer<typeof verifiedLayerSchema>;

/** Closed list: a refusal is a value a caller can branch on, never free text. */
export const reasonCodes = [
  'OK',
  // Identity and scope
  'PROFILE_UNKNOWN', 'PROFILE_ARCHIVED_PROTOTYPE', 'BOARD_REVISION_NOT_IN_PROFILE',
  'DEVICE_IDENTITY_NOT_OBSERVED', 'SDK_RELEASE_NOT_ASSESSED', 'KODEOS_RELEASE_NOT_ASSESSED',
  'IDF_VERSION_UNSUPPORTED', 'IMAGE_CHIP_MISMATCH',
  // Evidence
  'EVIDENCE_MISSING', 'EVIDENCE_EXPIRED', 'EVIDENCE_CONFLICTING', 'EVIDENCE_INSUFFICIENT',
  'EVIDENCE_NOT_APPLICABLE', 'CLAIM_UNKNOWN', 'CAPABILITY_UNKNOWN',
  // Operations
  'RAW_FLASH_NEVER_SUPPORTED', 'OPERATION_EXCLUDED_FROM_TOOLSET', 'OPERATION_NOT_IMPLEMENTED',
  'NO_AUTHORISATION_CHANNEL', 'CONSOLE_READS_NOT_ENABLED', 'RECOVERY_NOT_VALIDATED',
  // Modules and pins
  'MODULE_UNKNOWN', 'MODULE_SDK_UNAVAILABLE', 'MODULE_NOT_QUALIFIED',
  'MODULE_ATTACHMENT_UNVERIFIED', 'MODULE_OPERATION_MISMATCH', 'MODULE_REQUIRED',
  'PIN_NOT_ON_J3',
  // Host, workspace and build
  'WORKSPACE_NOT_CONFIGURED', 'WORKSPACE_ESCAPE', 'PROJECT_NAME_INVALID', 'PROJECT_EXISTS',
  'PROJECT_NOT_FOUND', 'TEMPLATE_NOT_CONFIGURED', 'TEMPLATE_INTEGRITY_MISMATCH',
  'MANIFEST_INPUT_INVALID', 'VALIDATION_FAILED', 'BUILD_NOT_ENABLED',
  'BUILD_LOGIC_NOT_PINNED', 'BUILD_STATE_PRESENT', 'BUILD_NOT_OBSERVED',
  'TOOLCHAIN_NOT_CONFIGURED', 'TOOLCHAIN_VERSION_MISMATCH', 'BUILD_FAILED', 'BUILD_TIMEOUT',
  'BUILD_OUTPUT_MISSING', 'IMAGE_NOT_FOUND', 'IMAGE_TOO_LARGE', 'IMAGE_MALFORMED',
  'IMAGE_NOT_INSTALL_COMPATIBLE', 'INTERNAL_ERROR',
] as const;
export const reasonCodeSchema = z.enum(reasonCodes);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const evidenceRefSchema = z.object({
  claimId: z.string(),
  sourceUri: z.string(),
  revision: z.string(),
  class: evidenceClassSchema,
  verifiedAt: z.string().optional(),
}).strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export function resultSchema<T extends z.ZodType>(payload: T) {
  return z.object({
    schemaVersion: z.literal('1'),
    tool: z.string(),
    status: statusSchema,
    reasonCode: reasonCodeSchema,
    message: z.string(),
    effectClass: effectClassSchema,
    verifiedLayer: verifiedLayerSchema,
    // No tool in this slice can authorise a device, electrical or RF operation.
    hardwareAuthorized: z.literal(false),
    payload: payload.optional(),
    evidence: z.array(evidenceRefSchema),
    artefactSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    requiredNextEvidence: z.array(z.string()),
  }).strict();
}

export type KodeResult<T> = {
  schemaVersion: '1';
  tool: string;
  status: KodeStatus;
  reasonCode: ReasonCode;
  message: string;
  effectClass: EffectClass;
  verifiedLayer: VerifiedLayer;
  hardwareAuthorized: false;
  payload?: T;
  evidence: EvidenceRef[];
  artefactSha256?: string;
  requiredNextEvidence: string[];
};

export type ResultInit<T> = {
  tool: string;
  effectClass: EffectClass;
  status: KodeStatus;
  reasonCode: ReasonCode;
  message: string;
  verifiedLayer?: VerifiedLayer;
  payload?: T;
  evidence?: EvidenceRef[];
  artefactSha256?: string;
  requiredNextEvidence?: string[];
};

export function makeResult<T>(init: ResultInit<T>): KodeResult<T> {
  const result: KodeResult<T> = {
    schemaVersion: '1',
    tool: init.tool,
    status: init.status,
    reasonCode: init.reasonCode,
    message: init.message,
    effectClass: init.effectClass,
    verifiedLayer: init.verifiedLayer ?? 'none',
    hardwareAuthorized: false,
    evidence: init.evidence ?? [],
    requiredNextEvidence: init.requiredNextEvidence ?? [],
  };
  if (init.payload !== undefined) result.payload = init.payload;
  if (init.artefactSha256 !== undefined) result.artefactSha256 = init.artefactSha256;
  return result;
}

/** A refusal or failure is an MCP tool error as well as a structured value, so a
 * client that ignores structured content still cannot read it as success. */
export function toToolResult<T>(result: KodeResult<T>) {
  const base = {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
  return result.status === 'refused' || result.status === 'failed'
    ? { ...base, isError: true as const }
    : base;
}

/** Raised by services; carries a closed reason code instead of free-form detail. */
export class KodeRefusal extends Error {
  constructor(
    readonly reasonCode: ReasonCode,
    message: string,
    readonly status: Extract<KodeStatus, 'refused' | 'failed' | 'not_verified' | 'unsupported'> = 'refused',
    readonly requiredNextEvidence: string[] = [],
  ) {
    super(message);
    this.name = 'KodeRefusal';
  }
}
