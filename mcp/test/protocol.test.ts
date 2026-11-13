import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resultSchema } from '../src/capabilities.js';

test('independent MCP client sees simulation and disabled read-only console tools',
  { timeout: 15_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
      stderr: 'pipe',
      // No test may discover or touch attached hardware through inherited configuration.
      env: {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        KODE_ENABLE_CONSOLE_READS: '0',
      },
    });
    let stderr = '';
    transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    const client = new Client({ name: 'independent-test-client', version: '0.0.0' });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion()?.name, 'claude-kode-feasibility');
      const { tools } = await client.listTools();
      // The original five keep their position; the F1 tools follow them.
      assert.deepEqual(tools.map(t => t.name).slice(0, 5), [
        'inspect_capability', 'kode_ping', 'kode_boot_info',
        'kode_list_apps', 'kode_capture_screen',
      ]);
      assert.equal(tools[0]?.annotations?.readOnlyHint, true);
      for (const tool of tools.slice(1, 5)) {
        // Serial attachment can reset the board, so host tool hints must not over-promise.
        assert.equal(tool.annotations?.readOnlyHint, false);
        const result = await client.callTool({ name: tool.name, arguments: {} });
        assert.equal(result.isError, true);
        assert.match(String(result.content?.[0]?.type === 'text' ? result.content[0].text : ''), /NOT_ENABLED/);
      }
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
      for (const name of ['flash_device', 'kode_run_command', 'kode_install_app', 'kode_transmit']) {
        const absent = await client.callTool({ name, arguments: {} });
        assert.equal(absent.isError, true);
      }
    } catch (error) {
      throw new Error(`MCP child stderr: ${stderr}`, { cause: error });
    } finally {
      await client.close();
      assert.equal(transport.pid, null);
    }
  });
