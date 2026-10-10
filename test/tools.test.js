// End-to-end tests: a real MCP client talks to this MCP server over an
// in-memory transport, and the server talks over real HTTP to a mock hub.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHubClient } from '../src/hub-client.js';
import { registerTools, TOOL_NAMES } from '../src/tools.js';

// ---- mock hub -----------------------------------------------------------
let hub, hubUrl, requests, routes;

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

before(async () => {
  hub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : undefined };
      requests.push(entry);
      const handler = routes[`${req.method} ${url.pathname}`];
      if (!handler) return respond(res, 404, { error: 'not found' });
      const [status, body] = handler(entry);
      respond(res, status, body);
    });
  });
  await new Promise((r) => hub.listen(0, '127.0.0.1', r));
  hubUrl = `http://127.0.0.1:${hub.address().port}`;
});

after(() => hub.close());

beforeEach(() => {
  requests = [];
  routes = {};
});

async function connect(baseUrl = hubUrl, agentId = 'laptop') {
  const server = new McpServer({ name: 'agent-chat', version: 'test' });
  registerTools(server, { hub: createHubClient({ baseUrl, timeoutMs: 2000 }), agentId });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.map((c) => c.text).join(''), isError: Boolean(r.isError) };
};

// ---- tests ---------------------------------------------------------------
test('exposes exactly the 9 documented tools', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
});

test('register_agent posts agentId and name, lists online agents', async () => {
  routes['POST /agents/register'] = () => [200, { agents: ['laptop', 'desktop'] }];
  const r = await call(await connect(), 'register_agent', { name: 'My Laptop' });
  assert.deepEqual(requests[0].body, { agentId: 'laptop', name: 'My Laptop' });
  assert.equal(r.text, 'Registered as "laptop". Online agents: laptop, desktop');
});

test('list_agents formats each agent and handles an empty hub', async () => {
  routes['GET /agents'] = () => [200, { agents: [{ id: 'desktop', name: 'Desktop', lastSeen: '2026-10-10T12:00:00Z' }] }];
  const r = await call(await connect(), 'list_agents');
  assert.equal(r.text, 'desktop (Desktop, last seen: 2026-10-10 12:00:00Z)');
  routes['GET /agents'] = () => [200, { agents: [] }];
  assert.equal((await call(await connect(), 'list_agents')).text, 'No agents online');
});

test('send_message broadcasts with from = this agent', async () => {
  routes['POST /messages/send'] = () => [200, { message: { id: 42 } }];
  const r = await call(await connect(), 'send_message', { to: 'all', content: 'build is green' });
  assert.deepEqual(requests[0].body, { from: 'laptop', to: 'all', content: 'build is green' });
  assert.equal(r.text, 'Message sent to all (id: 42)');
});

test('read_messages defaults to unreadOnly=true and URL-encodes the agent id', async () => {
  routes['GET /messages'] = () => [200, { messages: [{ timestamp: '2026-10-10T09:30:00Z', from: 'desktop', to: 'my pc', content: 'hi' }] }];
  const r = await call(await connect(hubUrl, 'my pc&x=1'), 'read_messages');
  assert.deepEqual(requests[0].query, { agentId: 'my pc&x=1', unreadOnly: 'true' });
  assert.equal(r.text, '[2026-10-10 09:30:00Z] desktop -> my pc: hi');
});

test('task lifecycle: create, check with status filter, update', async () => {
  routes['POST /tasks/create'] = () => [200, { task: { id: 7 } }];
  routes['GET /tasks'] = () => [200, { tasks: [{ id: 7, status: 'completed', from: 'desktop', assignedTo: 'laptop', description: 'run tests', result: '41 passed' }] }];
  routes['POST /tasks/7/update'] = () => [200, { ok: true }];
  const client = await connect();
  assert.equal((await call(client, 'create_task', { assignedTo: 'any', description: 'run tests' })).text,
    'Task #7 created and assigned to any');
  const checked = await call(client, 'check_tasks', { status: 'completed' });
  assert.equal(requests[1].query.status, 'completed');
  assert.match(checked.text, /Task #7 \[completed\].*\n  Result: 41 passed/);
  await call(client, 'update_task', { taskId: 7, status: 'completed', result: 'done' });
  assert.deepEqual(requests[2], { method: 'POST', path: '/tasks/7/update', query: {}, body: { status: 'completed', result: 'done' } });
});

test('invalid arguments are rejected before reaching the hub', async () => {
  const client = await connect();
  const r = await client.callTool({ name: 'update_task', arguments: { taskId: 'seven', status: 'done' } });
  assert.equal(r.isError, true);
  assert.equal(requests.length, 0);
});

test('share_context and get_context round-trip; keys with slashes are encoded', async () => {
  routes['POST /context/share'] = () => [200, { ok: true }];
  routes['GET /context/notes%2Ftoday'] = () => [200, { from: 'laptop', timestamp: '2026-10-10T00:00:00Z', data: 'plan' }];
  const client = await connect();
  await call(client, 'share_context', { key: 'notes/today', data: 'plan' });
  assert.deepEqual(requests[0].body, { from: 'laptop', key: 'notes/today', data: 'plan' });
  const r = await call(client, 'get_context', { key: 'notes/today' });
  assert.equal(requests[1].path, '/context/notes%2Ftoday');
  assert.equal(r.text, 'From laptop (2026-10-10 00:00:00Z):\n\nplan');
});

test('get_context: 404 means "not found", no key lists keys', async () => {
  const client = await connect();
  assert.equal((await call(client, 'get_context', { key: 'missing' })).text, 'Key "missing" not found.');
  routes['GET /context'] = () => [200, { keys: [{ key: 'plan', from: 'desktop', timestamp: '2026-10-10T00:00:00Z' }] }];
  assert.equal((await call(client, 'get_context')).text, 'plan (from desktop, 2026-10-10 00:00:00Z)');
});

test('hub HTTP errors become tool errors with the hub message', async () => {
  routes['POST /messages/send'] = () => [500, { error: 'database locked' }];
  const r = await call(await connect(), 'send_message', { to: 'all', content: 'x' });
  assert.equal(r.isError, true);
  assert.equal(r.text, 'Hub error: database locked');
});

test('non-JSON hub responses are reported, not thrown', async () => {
  routes['GET /agents'] = () => [502, '<html>Bad Gateway</html>'];
  const r = await call(await connect(), 'list_agents');
  assert.equal(r.isError, true);
  assert.match(r.text, /non-JSON \(HTTP 502\)/);
});

test('an unreachable hub is reported as a tool error', async () => {
  const r = await call(await connect('http://127.0.0.1:9'), 'list_agents');
  assert.equal(r.isError, true);
  assert.match(r.text, /hub unreachable/);
});
