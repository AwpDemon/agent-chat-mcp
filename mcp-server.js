#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BROKER_URL = process.env.BROKER_URL || 'http://localhost:8200';
const AGENT_ID = process.env.AGENT_ID || 'unknown';

async function api(path, options = {}) {
  const res = await fetch(`${BROKER_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

const server = new McpServer({
  name: 'agent-chat',
  version: '1.0.0',
});

// --- Register ---
server.tool(
  'register_agent',
  'Register this agent with the broker so other agents can see it. Call this first.',
  { name: z.string().optional().describe('Friendly name for this agent') },
  async ({ name }) => {
    const result = await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({ agentId: AGENT_ID, name: name || AGENT_ID }),
    });
    return { content: [{ type: 'text', text: `Registered as "${AGENT_ID}". Online agents: ${result.agents?.join(', ')}` }] };
  }
);

// --- List Agents ---
server.tool(
  'list_agents',
  'List all registered agents across all machines.',
  {},
  async () => {
    const result = await api('/agents');
    const list = result.agents?.map(a => `${a.id} (${a.name}, last seen: ${new Date(a.lastSeen).toLocaleString()})`).join('\n') || 'No agents online';
    return { content: [{ type: 'text', text: list }] };
  }
);

// --- Send Message ---
server.tool(
  'send_message',
  'Send a message to another agent. Use to="all" to broadcast.',
  {
    to: z.string().describe('Target agent ID or "all" for broadcast'),
    content: z.string().describe('Message content'),
  },
  async ({ to, content }) => {
    const result = await api('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_ID, to, content }),
    });
    return { content: [{ type: 'text', text: `Message sent to ${to} (id: ${result.message?.id})` }] };
  }
);

// --- Read Messages ---
server.tool(
  'read_messages',
  'Read messages sent to this agent. Set unreadOnly=true to only see new messages.',
  { unreadOnly: z.boolean().optional().describe('Only show unread messages') },
  async ({ unreadOnly }) => {
    const result = await api(`/messages?agentId=${AGENT_ID}&unreadOnly=${unreadOnly ?? true}`);
    if (!result.messages?.length) {
      return { content: [{ type: 'text', text: 'No new messages.' }] };
    }
    const formatted = result.messages.map(m =>
      `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.from} → ${m.to}: ${m.content}`
    ).join('\n');
    return { content: [{ type: 'text', text: formatted }] };
  }
);

// --- Create Task ---
server.tool(
  'create_task',
  'Create a task for another agent to complete. The other agent will see it when they check tasks.',
  {
    assignedTo: z.string().describe('Agent ID to assign the task to, or "any"'),
    description: z.string().describe('Detailed description of what needs to be done'),
  },
  async ({ assignedTo, description }) => {
    const result = await api('/tasks/create', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_ID, assignedTo, description }),
    });
    return { content: [{ type: 'text', text: `Task #${result.task?.id} created and assigned to ${assignedTo}` }] };
  }
);

// --- Check Tasks ---
server.tool(
  'check_tasks',
  'Check for tasks assigned to this agent. Use status filter: pending, in_progress, completed.',
  { status: z.string().optional().describe('Filter by status: pending, in_progress, completed') },
  async ({ status }) => {
    const result = await api(`/tasks?agentId=${AGENT_ID}${status ? `&status=${status}` : ''}`);
    if (!result.tasks?.length) {
      return { content: [{ type: 'text', text: 'No tasks found.' }] };
    }
    const formatted = result.tasks.map(t =>
      `Task #${t.id} [${t.status}] from ${t.from} → ${t.assignedTo}: ${t.description}${t.result ? `\n  Result: ${t.result}` : ''}`
    ).join('\n\n');
    return { content: [{ type: 'text', text: formatted }] };
  }
);

// --- Update Task ---
server.tool(
  'update_task',
  'Update a task status and optionally provide a result.',
  {
    taskId: z.number().describe('Task ID to update'),
    status: z.enum(['in_progress', 'completed', 'failed']).describe('New status'),
    result: z.string().optional().describe('Result or output of the task'),
  },
  async ({ taskId, status, result }) => {
    const res = await api(`/tasks/${taskId}/update`, {
      method: 'POST',
      body: JSON.stringify({ status, result }),
    });
    return { content: [{ type: 'text', text: `Task #${taskId} updated to ${status}` }] };
  }
);

// --- Share Context ---
server.tool(
  'share_context',
  'Share data (code, files, notes) with other agents via a named key.',
  {
    key: z.string().describe('Name/key for this piece of shared context'),
    data: z.string().describe('The data to share'),
  },
  async ({ key, data }) => {
    await api('/context/share', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_ID, key, data }),
    });
    return { content: [{ type: 'text', text: `Context "${key}" shared by ${AGENT_ID}` }] };
  }
);

// --- Get Shared Context ---
server.tool(
  'get_context',
  'Retrieve shared context by key, or list all available keys.',
  { key: z.string().optional().describe('Key to retrieve. Omit to list all keys.') },
  async ({ key }) => {
    if (!key) {
      const result = await api('/context');
      if (!result.keys?.length) return { content: [{ type: 'text', text: 'No shared context available.' }] };
      const list = result.keys.map(k => `${k.key} (from ${k.from}, ${new Date(k.timestamp).toLocaleString()})`).join('\n');
      return { content: [{ type: 'text', text: list }] };
    }
    const result = await api(`/context/${key}`);
    if (result.error) return { content: [{ type: 'text', text: `Key "${key}" not found.` }] };
    return { content: [{ type: 'text', text: `From ${result.from} (${new Date(result.timestamp).toLocaleString()}):\n\n${result.data}` }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
