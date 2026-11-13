import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { inspectCapability, requestSchema, resultSchema } from './capabilities.js';
import { registerReadOnlyKodeTools } from './readonly-tools.js';

const server = new McpServer({ name: 'claude-kode-feasibility', version: '0.1.0' });
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

// stdout belongs exclusively to MCP JSON-RPC. Never print logs here.
await server.connect(new StdioServerTransport());
