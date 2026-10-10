#!/usr/bin/env node
// Entry point: an MCP server (stdio) that Claude Code launches as a tool
// provider. It is a client of a separate agent-chat hub; set BROKER_URL to the
// hub's base URL and AGENT_ID to this machine's name.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHubClient } from './src/hub-client.js';
import { registerTools } from './src/tools.js';

const BROKER_URL = process.env.BROKER_URL || 'http://localhost:8200';
const AGENT_ID = process.env.AGENT_ID || 'unknown';

const server = new McpServer({ name: 'agent-chat', version: '1.1.0' });
registerTools(server, { hub: createHubClient({ baseUrl: BROKER_URL }), agentId: AGENT_ID });

await server.connect(new StdioServerTransport());
