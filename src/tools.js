// The 9 MCP tools this server exposes to Claude Code. Each tool is a thin
// wrapper over one hub endpoint; formatting lives here so it can be tested.
import { z } from 'zod';
import { HubError } from './hub-client.js';

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

const when = (ts) => (ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : 'unknown time');

// Wrap a handler so hub failures come back as a readable tool error.
function guarded(handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof HubError) return fail(`Hub error: ${err.message}`);
      throw err;
    }
  };
}

export const TOOL_NAMES = [
  'register_agent', 'list_agents', 'send_message', 'read_messages',
  'create_task', 'check_tasks', 'update_task', 'share_context', 'get_context',
];

export function registerTools(server, { hub, agentId }) {
  server.tool(
    'register_agent',
    'Register this agent with the hub so other agents can see it. Call this first.',
    { name: z.string().optional().describe('Friendly name for this agent') },
    guarded(async ({ name }) => {
      const r = await hub.register(agentId, name || agentId);
      const online = Array.isArray(r.agents) ? r.agents.join(', ') : 'unknown';
      return text(`Registered as "${agentId}". Online agents: ${online}`);
    })
  );

  server.tool(
    'list_agents',
    'List all registered agents across all machines.',
    {},
    guarded(async () => {
      const r = await hub.listAgents();
      if (!r.agents?.length) return text('No agents online');
      return text(r.agents.map((a) => `${a.id} (${a.name}, last seen: ${when(a.lastSeen)})`).join('\n'));
    })
  );

  server.tool(
    'send_message',
    'Send a message to another agent. Use to="all" to broadcast.',
    {
      to: z.string().min(1).describe('Target agent ID or "all" for broadcast'),
      content: z.string().min(1).describe('Message content'),
    },
    guarded(async ({ to, content }) => {
      const r = await hub.sendMessage(agentId, to, content);
      return text(`Message sent to ${to} (id: ${r.message?.id ?? 'unknown'})`);
    })
  );

  server.tool(
    'read_messages',
    'Read messages sent to this agent. Set unreadOnly=false to include messages already read.',
    { unreadOnly: z.boolean().optional().describe('Only show unread messages (default true)') },
    guarded(async ({ unreadOnly }) => {
      const r = await hub.readMessages(agentId, unreadOnly ?? true);
      if (!r.messages?.length) return text('No new messages.');
      return text(r.messages.map((m) => `[${when(m.timestamp)}] ${m.from} -> ${m.to}: ${m.content}`).join('\n'));
    })
  );

  server.tool(
    'create_task',
    'Create a task for another agent to complete. The other agent will see it when they check tasks.',
    {
      assignedTo: z.string().min(1).describe('Agent ID to assign the task to, or "any"'),
      description: z.string().min(1).describe('Detailed description of what needs to be done'),
    },
    guarded(async ({ assignedTo, description }) => {
      const r = await hub.createTask(agentId, assignedTo, description);
      return text(`Task #${r.task?.id ?? '?'} created and assigned to ${assignedTo}`);
    })
  );

  server.tool(
    'check_tasks',
    'Check for tasks assigned to this agent. Optional status filter: pending, in_progress, completed, failed.',
    { status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional().describe('Filter by status') },
    guarded(async ({ status }) => {
      const r = await hub.listTasks(agentId, status);
      if (!r.tasks?.length) return text('No tasks found.');
      return text(
        r.tasks
          .map((t) => `Task #${t.id} [${t.status}] from ${t.from} -> ${t.assignedTo}: ${t.description}` +
            (t.result ? `\n  Result: ${t.result}` : ''))
          .join('\n\n')
      );
    })
  );

  server.tool(
    'update_task',
    'Update a task status and optionally provide a result.',
    {
      taskId: z.number().int().positive().describe('Task ID to update'),
      status: z.enum(['in_progress', 'completed', 'failed']).describe('New status'),
      result: z.string().optional().describe('Result or output of the task'),
    },
    guarded(async ({ taskId, status, result }) => {
      await hub.updateTask(taskId, status, result);
      return text(`Task #${taskId} updated to ${status}`);
    })
  );

  server.tool(
    'share_context',
    'Share data (code, files, notes) with other agents via a named key.',
    {
      key: z.string().min(1).describe('Name/key for this piece of shared context'),
      data: z.string().describe('The data to share'),
    },
    guarded(async ({ key, data }) => {
      await hub.shareContext(agentId, key, data);
      return text(`Context "${key}" shared by ${agentId}`);
    })
  );

  server.tool(
    'get_context',
    'Retrieve shared context by key, or list all available keys.',
    { key: z.string().optional().describe('Key to retrieve. Omit to list all keys.') },
    async ({ key }) => {
      try {
        if (!key) {
          const r = await hub.listContext();
          if (!r.keys?.length) return text('No shared context available.');
          return text(r.keys.map((k) => `${k.key} (from ${k.from}, ${when(k.timestamp)})`).join('\n'));
        }
        const r = await hub.getContext(key);
        return text(`From ${r.from} (${when(r.timestamp)}):\n\n${r.data}`);
      } catch (err) {
        if (err instanceof HubError && err.status === 404) return text(`Key "${key}" not found.`);
        if (err instanceof HubError) return fail(`Hub error: ${err.message}`);
        throw err;
      }
    }
  );
}
