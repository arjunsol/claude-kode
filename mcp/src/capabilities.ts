import { z } from 'zod';

export const requestSchema = z.object({
  profileId: z.string().min(1).max(100),
  capability: z.string().min(1).max(100),
}).strict();

export const resultSchema = z.object({
  status: z.enum(['simulated', 'not_verified', 'refused', 'unsupported']),
  reason: z.enum([
    'SIMULATED_BUILD_ONLY', 'UNKNOWN_PROFILE',
    'SIMULATION_CANNOT_AUTHORIZE_HARDWARE', 'UNKNOWN_CAPABILITY',
  ]),
  profileId: z.string(),
  capability: z.string(),
  evidenceClass: z.literal('simulation'),
  hardwareAuthorized: z.literal(false),
  message: z.string(),
}).strict();

// Test fixture only. This is neither a production profile nor device detection.
const profiles = new Map([['simulated-p4-c5', new Set(['local_build'])]]);
const hardwareCapabilities = new Set(['kodeos_install', 'standalone_flash']);

export function inspectCapability(input: unknown): z.infer<typeof resultSchema> {
  const request = requestSchema.parse(input);
  const common = { ...request, evidenceClass: 'simulation' as const,
    hardwareAuthorized: false as const };
  const profile = profiles.get(request.profileId);
  if (!profile) return { ...common, status: 'not_verified', reason: 'UNKNOWN_PROFILE',
    message: 'No verified production profile exists for this identifier.' };
  if (hardwareCapabilities.has(request.capability)) return {
    ...common, status: 'refused', reason: 'SIMULATION_CANNOT_AUTHORIZE_HARDWARE',
    message: 'A simulated profile cannot authorize installation or flashing.',
  };
  if (!profile.has(request.capability)) return { ...common, status: 'unsupported',
    reason: 'UNKNOWN_CAPABILITY', message: 'The fixture does not define this capability.' };
  return { ...common, status: 'simulated', reason: 'SIMULATED_BUILD_ONLY',
    message: 'Fixture lookup only: no build was executed and no hardware was verified.' };
}
