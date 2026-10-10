// Launch the real entry point over stdio, exactly as Claude Code does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_NAMES } from '../src/tools.js';

test('mcp-server.js starts over stdio and lists its tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../mcp-server.js', import.meta.url))],
    env: { ...process.env, BROKER_URL: 'http://127.0.0.1:9', AGENT_ID: 'ci' },
  });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
    const r = await client.callTool({ name: 'list_agents', arguments: {} });
    assert.equal(r.isError, true); // hub at port 9 is unreachable; server must not crash
  } finally {
    await client.close();
  }
});
