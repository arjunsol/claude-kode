/** Builds the MCP server. Kept apart from the stdio entry point so tests can
 * run the same server over an in-memory transport with an injected clock.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { inspectCapability, requestSchema, resultSchema } from './capabilities.js';
import { readonlyToolNames, registerReadOnlyKodeTools } from './readonly-tools.js';
import { CapabilityRegistry } from './registry/registry.js';
import { registerBuildTools } from './tools/build-tools.js';
import type { KodeDeps } from './tools/context.js';
import { registerKnowledgeTools } from './tools/knowledge-tools.js';
import { registerResources } from './tools/resources.js';

export const SERVER_INFO = { name: 'claude-kode-feasibility', version: '0.2.0' } as const;

/** Every tool this server registers, in registration order. Documentation and
 * tests compare against this list, so a tool cannot appear unannounced. */
export const TOOL_NAMES = [
  'inspect_capability',
  ...readonlyToolNames,
  'kode_get_capabilities', 'kode_get_pinout', 'kode_list_modules', 'kode_get_module_spec',
  'kode_get_evidence', 'kode_check_compatibility', 'kode_get_sdk_contract', 'kode_get_toolchain_status',
  'kode_new_app', 'kode_validate', 'kode_build', 'kode_inspect_image',
] as const;

export function defaultDeps(): KodeDeps {
  return { registry: new CapabilityRegistry(), now: () => new Date(), env: process.env };
}

export function createKodeServer(deps: KodeDeps = defaultDeps()): McpServer {
  const server = new McpServer(SERVER_INFO);
  server.registerTool('inspect_capability', {
    title: 'Inspect a simulated capability',
    description: 'Read-only test-fixture lookup. Does not detect devices, execute builds, or authorise hardware.',
    inputSchema: requestSchema,
    outputSchema: resultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const result = inspectCapability(input);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  });
  registerReadOnlyKodeTools(server);
  registerKnowledgeTools(server, deps);
  registerBuildTools(server, deps);
  registerResources(server, deps);
  return server;
}
