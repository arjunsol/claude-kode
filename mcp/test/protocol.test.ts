import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resultSchema } from '../src/capabilities.js';

test('independent client negotiates stdio, discovers tools, validates calls and closes the process',
  { timeout: 15_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    const client = new Client({ name: 'independent-test-client', version: '0.0.0' });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.name, 'claude-kode-feasibility');
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map(t => t.name), ['inspect_capability']);
      assert.equal(tools[0]?.annotations?.readOnlyHint, true);
      for (const [capability, expected] of [['local_build', 'simulated'],
        ['kodeos_install', 'refused'], ['standalone_flash', 'refused']]) {
        const response = await client.callTool({ name: 'inspect_capability',
          arguments: { profileId: 'simulated-p4-c5', capability } });
        assert.equal(response.isError, undefined);
        const result = resultSchema.parse(response.structuredContent);
        assert.equal(result.status, expected);
        assert.equal(result.hardwareAuthorized, false);
      }
      for (const args of [{ profileId: 5, capability: 'local_build' },
        { profileId: 'simulated-p4-c5' },
        { profileId: 'simulated-p4-c5', capability: 'kodeos_install', approved: true }]) {
        const result = await client.callTool({ name: 'inspect_capability', arguments: args });
        assert.equal(result.isError, true);
      }
      const absent = await client.callTool({ name: 'flash_device', arguments: {} });
      assert.equal(absent.isError, true);
    } catch (error) {
      throw new Error(`MCP child stderr: ${stderr}`, { cause: error });
    } finally {
      await client.close();
      assert.equal(transport.pid, null);
    }
  });
