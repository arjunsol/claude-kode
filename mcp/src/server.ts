import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { inspectCapability, requestSchema, resultSchema } from './capabilities.js';

const server = new McpServer({ name: 'claude-kode-feasibility', version: '0.0.0' });
server.registerTool('inspect_capability', {
  title: 'Inspect a simulated capability',
  description: 'Read-only test-fixture lookup. Does not detect devices, execute builds, or authorize hardware.',
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

// stdout belongs exclusively to the MCP protocol. No network listener or device API.
await server.connect(new StdioServerTransport());
