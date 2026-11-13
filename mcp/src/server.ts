import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKodeServer } from './app.js';

// stdout belongs exclusively to MCP JSON-RPC. Never print logs here.
await createKodeServer().connect(new StdioServerTransport());
