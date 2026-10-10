// HTTP client for the agent-chat hub's REST API.
//
// The hub itself is a separate service (not in this repo). This module only
// knows its endpoints: /agents, /messages, /tasks, /context. Every failure
// (network error, non-2xx status, non-JSON body) becomes a HubError so the MCP
// tools can report it to the model instead of crashing or printing "undefined".

export class HubError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = 'HubError';
    this.status = status;
    this.path = path;
  }
}

export function createHubClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  if (!baseUrl) throw new Error('BROKER_URL (hub base URL) is required');
  const root = baseUrl.replace(/\/+$/, '');

  async function request(path, { method = 'GET', body, query } = {}) {
    let url = `${root}${path}`;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
      ).toString();
      if (qs) url += `?${qs}`;
    }
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new HubError(`hub unreachable at ${root}: ${err.message}`, { path });
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new HubError(`hub returned non-JSON (HTTP ${res.status}) for ${path}`, { status: res.status, path });
    }
    if (!res.ok) {
      throw new HubError(data.error || `hub returned HTTP ${res.status} for ${path}`, { status: res.status, path });
    }
    return data;
  }

  // Path segments are encoded so keys like "notes/today" or ids with spaces work.
  const seg = (v) => encodeURIComponent(String(v));

  return {
    register: (agentId, name) => request('/agents/register', { method: 'POST', body: { agentId, name } }),
    listAgents: () => request('/agents'),
    sendMessage: (from, to, content) => request('/messages/send', { method: 'POST', body: { from, to, content } }),
    readMessages: (agentId, unreadOnly) => request('/messages', { query: { agentId, unreadOnly } }),
    createTask: (from, assignedTo, description) =>
      request('/tasks/create', { method: 'POST', body: { from, assignedTo, description } }),
    listTasks: (agentId, status) => request('/tasks', { query: { agentId, status } }),
    updateTask: (taskId, status, result) =>
      request(`/tasks/${seg(taskId)}/update`, { method: 'POST', body: { status, result } }),
    shareContext: (from, key, data) => request('/context/share', { method: 'POST', body: { from, key, data } }),
    listContext: () => request('/context'),
    getContext: (key) => request(`/context/${seg(key)}`),
  };
}
