/** Build-only firmware pipeline tools: scaffold, validate, build, inspect.
 * No tool here writes to a device, and none takes a path, a command, a flash
 * offset or an approval as an argument.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildApp, OUTPUT_HELD_OPEN_NOTE } from '../build/build.js';
import { inspectImage } from '../build/image.js';
import { BuildReceipts } from '../build/receipts.js';
import { newApp } from '../build/scaffold.js';
import { validateProject } from '../build/validate.js';
import { hostConfig } from '../build/workspace.js';
import { PINNED } from '../registry/sdk-contract.js';
import { makeResult, resultSchema, toToolResult, type KodeResult, type ReasonCode } from '../result.js';
import { refusalResult, releaseSchema, type KodeDeps } from './context.js';

/** Anything that is not a valid name reaches the service, which refuses it with
 * PROJECT_NAME_INVALID. The bound only keeps hostile input small. */
const projectName = z.string().min(1).max(128);
const projectInput = z.object({ projectName }).strict();

const stageNote = 'Stages are separate: a source project, a compiled image, an image compatible with kodeOS installation, and an image verified on a device. This tool never reports the last.';
const BUILD_CLAIMS = ['sdk.release.pinned', 'sdk.idf.version', 'sdk.app.boot_role', 'sdk.app.manifest'];

const newAppInput = z.object({
  projectName,
  displayName: z.string().min(1).max(64),
  categories: z.array(z.string().min(1).max(32)).min(1).max(8),
  version: z.string().max(16).optional(),
  description: z.string().max(128).optional(),
  sdkRelease: releaseSchema.optional(),
}).strict();
const newAppPayload = z.object({
  projectName: z.string(), stage: z.literal('source_project'), licence: z.literal('GPL-3.0-or-later'),
  template: z.object({ repository: z.string(), tag: z.string(), commit: z.string(), lineEndingsNormalised: z.boolean() }).strict(),
  sdk: z.object({ release: z.string(), templatePinned: z.string(), pinChanged: z.boolean(), note: z.string() }).strict(),
  files: z.array(z.object({ path: z.string(), sha256: z.string(), origin: z.enum(['template', 'template_edited', 'generated']) }).strict()),
  notCopied: z.array(z.string()),
  manifest: z.object({ displayName: z.string(), categories: z.array(z.string()), version: z.string() }).strict(),
}).strict();

const findingSchema = z.object({ rule: z.string(), level: z.enum(['reject', 'warn']), status: z.enum(['pass', 'fail']), message: z.string() }).strict();
const validatePayload = z.object({
  projectName: z.string(), stage: z.literal('source_project'), verdict: z.enum(['pass', 'fail']),
  findings: z.array(findingSchema), rejectsFailed: z.number(), warnings: z.number(),
  buildLogic: z.object({ eligible: z.boolean(), findings: z.array(findingSchema) }).strict(),
  manifest: z.object({ displayName: z.string(), categories: z.array(z.string()) }).strict().optional(),
  version: z.string().optional(), sdkRelease: z.string().optional(),
  rulesNotChecked: z.array(z.string()),
}).strict();

const inspectionSchema = z.object({
  projectName: z.string(),
  artefact: z.object({ path: z.string(), sizeBytes: z.number(), sha256: z.string() }).strict(),
  header: z.object({ chipId: z.number(), chip: z.string(), segments: z.number() }).strict(),
  appDescriptor: z.object({
    projectName: z.string(), version: z.string(), idfVersion: z.string(), buildDate: z.string(), buildTime: z.string(),
  }).strict().optional(),
  manifest: z.object({ version: z.number(), displayName: z.string(), categories: z.array(z.string()) }).strict().optional(),
  buildMetadata: z.object({
    bootRoleApp: z.boolean().nullable(), configuredTarget: z.string().nullable(),
    flashPlan: z.enum(['mailbox_only', 'not_mailbox_only', 'unreadable']),
    flashEntries: z.array(z.object({ offset: z.string(), file: z.string() }).strict()),
  }).strict(),
  size: z.object({
    mailboxMax: z.number(), fitsMailbox: z.boolean(), catalogueMax: z.number(), fitsCatalogue: z.boolean(), appsRegion: z.number(),
  }).strict(),
  checks: z.array(z.object({ id: z.string(), pass: z.boolean(), detail: z.string() }).strict()),
  stages: z.object({
    sourceProject: z.literal(true), compiledImage: z.boolean(), kodeosInstallCompatible: z.boolean(), deviceVerified: z.literal(false),
  }).strict(),
  stage: z.enum(['source_project', 'compiled_image', 'kodeos_install_compatible']),
  deviceVerification: z.literal('NOT TESTED'),
  buildObserved: z.boolean(),
}).strict();

const buildPayload = z.object({
  projectName: z.string(),
  stage: z.enum(['source_project', 'compiled_image', 'kodeos_install_compatible']),
  command: z.object({ program: z.literal('KODE_IDF_PYTHON'), arguments: z.array(z.string()) }).strict(),
  toolchain: z.object({
    idfVersion: z.string(), idfCommit: z.string().nullable(), idfCommitMatchesPin: z.boolean().nullable(), sdkRelease: z.string().nullable(),
  }).strict(),
  reproduciblyPinned: z.boolean(),
  validation: z.object({ verdict: z.enum(['pass', 'fail']), warnings: z.number() }).strict(),
  buildLogicWarnings: z.array(z.string()),
  inspection: inspectionSchema,
  logTail: z.string(),
  outputHeldOpen: z.boolean(),
  evidence: z.object({ level: z.literal('L1'), result: z.literal('passed'), note: z.string() }).strict(),
}).strict();

const DEVICE_GATES = [
  'An observed identity of the target Dot, including its installed kodeOS release.',
  'A verified install route and a validated recovery procedure.',
  'An independent authorisation bound to this exact image digest.',
];

function inspectionResult(tool: string, inspection: z.infer<typeof inspectionSchema>): {
  status: KodeResult<unknown>['status']; reasonCode: ReasonCode; message: string;
} {
  if (inspection.header.chip !== 'esp32p4') {
    return { status: 'refused', reasonCode: 'IMAGE_CHIP_MISMATCH',
      message: `The image is built for ${inspection.header.chip}, not the ESP32-P4. It must never be installed on a production Dot.` };
  }
  // Files under build/ can be written by anything. Without a receipt from a build
  // this server ran, what was read is a description of files, not build evidence.
  if (!inspection.buildObserved) {
    return { status: 'not_verified', reasonCode: 'BUILD_NOT_OBSERVED',
      message: 'These files were not produced by a build this server ran, so they are reported as found and nothing here is build evidence. Run kode_build to produce an image this server has observed.' };
  }
  if (inspection.stages.kodeosInstallCompatible) {
    return { status: 'ok', reasonCode: 'OK',
      message: 'The image matches the kodeOS app contract as read from source. It has not been installed or run on any device.' };
  }
  const failed = inspection.checks.filter(check => !check.pass).map(check => check.id).join(', ');
  return { status: 'not_verified', reasonCode: 'IMAGE_NOT_INSTALL_COMPATIBLE',
    message: `${tool === 'kode_build' ? 'The build produced an image, but it' : 'The image'} does not meet the kodeOS app contract (failed: ${failed}).` };
}

/** The kode_build message: the verdict, the build-logic warnings, and, when it is known, that a
 * process the build started held the output open. */
export function buildMessage(
  message: string, outcome: { buildLogicWarnings: readonly string[]; outputHeldOpen: boolean },
): string {
  const withWarnings = withBuildLogicWarnings(message, outcome.buildLogicWarnings);
  return outcome.outputHeldOpen ? `${withWarnings} ${OUTPUT_HELD_OPEN_NOTE}` : withWarnings;
}

/** Append the build-logic warnings to a build message, so a build that trusted
 * something it could not verify says so in the message and not only in the payload. */
export function withBuildLogicWarnings(message: string, warnings: readonly string[]): string {
  return warnings.length === 0 ? message
    : `${message} Not verified, and used by this build: ${warnings.join(' ')}`;
}

export function registerBuildTools(server: McpServer, deps: KodeDeps): void {
  // One store per server: it is how kode_inspect_image tells an image this
  // process built from files that merely sit in the build directory.
  const receipts = deps.receipts ?? new BuildReceipts();
  const evidence = () => deps.registry.evidenceRefs(
    BUILD_CLAIMS.map(id => deps.registry.getClaim(id)).filter(claim => claim !== undefined));

  server.registerTool('kode_new_app', {
    title: 'Scaffold a kodeOS app',
    description: `Create a new app project in the operator's configured workspace from the operator's checkout of the official template, verified against ${PINNED.template.repository} ${PINNED.template.tag}. Pins kode-sdk ${PINNED.sdk.tag} unless another assessed release is named. Never overwrites, never builds, never touches a device. The project is GPL-3.0-or-later.`,
    inputSchema: newAppInput, outputSchema: resultSchema(newAppPayload),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async input => {
    const tool = 'kode_new_app';
    try {
      const request: Parameters<typeof newApp>[1] = {
        projectName: input.projectName, displayName: input.displayName, categories: input.categories,
      };
      if (input.version !== undefined) request.version = input.version;
      if (input.description !== undefined) request.description = input.description;
      if (input.sdkRelease !== undefined) request.sdkRelease = input.sdkRelease;
      const outcome = await newApp(hostConfig(deps.env), request);
      return toToolResult(makeResult({
        tool, effectClass: 'H1', status: 'ok', reasonCode: 'OK',
        message: `Created source project ${outcome.projectName}. It is a source project only: nothing was built or installed.`,
        verifiedLayer: 'source', payload: outcome, evidence: evidence(),
        requiredNextEvidence: ['kode_validate, then an observed ESP-IDF v6.1 build (L1).'],
      }));
    } catch (error) { return toToolResult(refusalResult(tool, 'H1', error)); }
  });

  server.registerTool('kode_validate', {
    title: 'Validate a kodeOS app project',
    description: "Statically check a workspace project against the pinned SDK contract and the catalogue rules that source alone can decide: identity, ESP32-P4 target, app role, SDK pin, manifest, forbidden flash calls. Lists the rules it cannot check. Also reports separately whether the project's build logic is the pinned template's, which kode_build requires and the verdict does not cover. Reads files only.",
    inputSchema: projectInput, outputSchema: resultSchema(validatePayload),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    const tool = 'kode_validate';
    try {
      const outcome = await validateProject(hostConfig(deps.env), input.projectName);
      const passed = outcome.verdict === 'pass';
      const eligibility = outcome.buildLogic.eligible
        ? 'Its build logic matches the pinned template, so kode_build may build it.'
        : `Its build logic is not the pinned template's, so kode_build will refuse it (${outcome.buildLogic.findings.filter(finding => finding.status === 'fail').map(finding => finding.rule).join(', ')}).`;
      return toToolResult(makeResult({
        tool, effectClass: 'H0', status: passed ? 'ok' : 'not_verified', reasonCode: passed ? 'OK' : 'VALIDATION_FAILED',
        message: passed
          ? `${outcome.projectName} passes the static checks (${outcome.warnings} warning(s)). This is not the catalogue's own checker and proves nothing about a build or a device. ${eligibility}`
          : `${outcome.projectName} fails ${outcome.rejectsFailed} static check(s) and must not be built for a production Dot as it stands. ${eligibility}`,
        verifiedLayer: 'source', payload: outcome, evidence: evidence(),
        requiredNextEvidence: passed ? ['An observed ESP-IDF v6.1 build (L1).'] : ['Fix the failed checks and validate again.'],
      }));
    } catch (error) { return toToolResult(refusalResult(tool, 'H0', error)); }
  });

  server.registerTool('kode_build', {
    title: 'Build a kodeOS app (build only)',
    description: `Run the fixed command "idf.py build" for a workspace project with the configured ESP-IDF v6.1, after validation. The server passes that one verb and never another, and builds only a project whose build logic matches the pinned template. It cannot constrain what the SDK's own build scripts, or a tampered managed_components directory, do on the host: a build executes CMake and Python and fetches the pinned SDK, so the operator must enable it, and should build with no Dot attached. ${stageNote}`,
    inputSchema: projectInput, outputSchema: resultSchema(buildPayload),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async input => {
    const tool = 'kode_build';
    try {
      const outcome = await buildApp(hostConfig(deps.env), input.projectName, {
        ...(deps.runBuild !== undefined ? { run: deps.runBuild } : {}), receipts,
      });
      const base = inspectionResult(tool, outcome.inspection);
      const summary = { ...base, message: buildMessage(base.message, outcome) };
      return toToolResult(makeResult({
        tool, effectClass: 'H1', ...summary, verifiedLayer: 'build', payload: outcome, evidence: evidence(),
        artefactSha256: outcome.inspection.artefact.sha256, requiredNextEvidence: DEVICE_GATES,
      }));
    } catch (error) { return toToolResult(refusalResult(tool, 'H1', error)); }
  });

  server.registerTool('kode_inspect_image', {
    title: 'Inspect a built app image',
    description: `Parse a workspace project's built image and build metadata: target chip, ESP-IDF app descriptor, KODE_APP_MANIFEST, boot role, generated flash plan, size and SHA-256. ${stageNote} Reads files only.`,
    inputSchema: projectInput, outputSchema: resultSchema(inspectionSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    const tool = 'kode_inspect_image';
    try {
      const inspection = await inspectImage(hostConfig(deps.env), input.projectName, receipts);
      const summary = inspectionResult(tool, inspection);
      return toToolResult(makeResult({
        tool, effectClass: 'H0', ...summary,
        // Whatever the verdict, files this server did not build are not build evidence.
        verifiedLayer: inspection.buildObserved ? 'build' : 'none', payload: inspection, evidence: evidence(),
        artefactSha256: inspection.artefact.sha256, requiredNextEvidence: DEVICE_GATES,
      }));
    } catch (error) { return toToolResult(refusalResult(tool, 'H0', error)); }
  });
}
