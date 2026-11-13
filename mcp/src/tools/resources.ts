/** MCP resources: the larger reference bodies, so they need not crowd the tool
 * list. Each is the same data the knowledge tools serve, as one JSON document.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PINNED, PRODUCTION_PROFILE_ID } from '../registry/sdk-contract.js';
import type { KodeDeps } from './context.js';
import { getCapabilities, getEvidence, getModuleSpec, getSdkContract } from './knowledge-tools.js';

export function registerResources(server: McpServer, deps: KodeDeps): void {
  const json = (uri: string, value: unknown) => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  });
  const profile = { profileId: PRODUCTION_PROFILE_ID };

  const profileUri = `kode://profiles/${PRODUCTION_PROFILE_ID}`;
  server.registerResource('kode-profile', profileUri, {
    title: 'Production Kode Dot profile',
    description: 'Board identity and capabilities with their evidence. Source-level; not device verified.',
    mimeType: 'application/json',
  }, async () => json(profileUri, getCapabilities(deps, profile)));

  const contractUri = `kode://sdk/${PINNED.sdk.tag}/app-contract`;
  server.registerResource('kode-sdk-contract', contractUri, {
    title: `kode-sdk ${PINNED.sdk.tag} application contract`,
    description: 'ESP-IDF v6.1, KODE_APP_MANIFEST, app-role boot and partition model, console verbs, licences and hazards.',
    mimeType: 'application/json',
  }, async () => json(contractUri, getSdkContract(deps, profile)));

  const ledgerUri = 'kode://evidence/ledger';
  server.registerResource('kode-evidence-ledger', ledgerUri, {
    title: 'Evidence ledger',
    description: 'Every evidence record with source, revision, state, review date, conflicts and invalidation triggers.',
    mimeType: 'application/json',
  }, async () => json(ledgerUri, getEvidence(deps, profile)));

  for (const module of deps.registry.listModules()) {
    const uri = `kode://modules/${module.id}`;
    server.registerResource(`kode-module-${module.id}`, uri, {
      title: module.title,
      description: `What is recorded and what is unknown about the ${module.title}. Not qualified.`,
      mimeType: 'application/json',
    }, async () => json(uri, getModuleSpec(deps, { ...profile, moduleId: module.id })));
  }
}
