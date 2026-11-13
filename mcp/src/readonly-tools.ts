import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KodeConsoleError, readKodeConsole, type KodeReadOperation } from './kcli-readonly.js';

const noArguments = z.object({}).strict();
const caution = 'A USB serial connection may reset the Dot. Requires explicit KODE_ENABLE_CONSOLE_READS=1 and a pinned manufacturer console. Never installs, flashes or controls radios/motors.';

export function registerReadOnlyKodeTools(server: McpServer): void {
  for (const [name, op, description] of [
    ['kode_ping', 'ping', 'Check liveness with the official console.'],
    ['kode_boot_info', 'boot_info', 'Read kodeOS boot and firmware state.'],
    ['kode_list_apps', 'app_list', 'Read the installed application list.'],
  ] as const) {
    server.registerTool(name, {
      title: name, description: `${description} ${caution}`,
      inputSchema: noArguments,
      // Serial attachment can reset hardware; do not claim this is perfectly side-effect-free.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async () => {
      try {
        const observation = await readKodeConsole(op as KodeReadOperation);
        return { content: [{ type: 'text' as const, text: JSON.stringify(observation) }],
          structuredContent: observation };
      } catch (error) {
        return blocked(error);
      }
    });
  }
  server.registerTool('kode_capture_screen', {
    title: 'Capture Kode Dot screen',
    description: `Read the device screen as a PNG returned only in this MCP result; temporary host files are removed. ${caution}`,
    inputSchema: noArguments,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async () => {
    try {
      const result = await readKodeConsole('screenshot');
      if (result.operation !== 'screenshot') throw new Error('Unexpected result');
      return { content: [
        { type: 'text' as const, text: result.warning },
        { type: 'image' as const, mimeType: 'image/png', data: result.pngBase64 },
      ] };
    } catch (error) {
      return blocked(error);
    }
  });
}

function blocked(error: unknown) {
  const reason = error instanceof KodeConsoleError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof KodeConsoleError ? error.message : 'Console integration failed; details were not returned to the model.';
  return { isError: true as const, content: [{ type: 'text' as const,
    text: JSON.stringify({ status: 'blocked', reason, message, hardwareAuthorized: false }) }] };
}
