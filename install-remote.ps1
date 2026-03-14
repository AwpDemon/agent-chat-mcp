# Agent Chat MCP - Remote Install Script
# Run this on any Windows device:
#   powershell -ExecutionPolicy Bypass -File install-remote.ps1 -AgentId "laptop"

param(
    [string]$AgentId = "",
    [string]$BrokerUrl = "https://agent-chat.awpdemon.com"
)

if (-not $AgentId) {
    $AgentId = Read-Host "Enter agent name (e.g. laptop, phone, tablet)"
}

Write-Host "`n=== Agent Chat MCP Installer ===" -ForegroundColor Cyan
Write-Host "Agent ID: $AgentId"
Write-Host "Broker: $BrokerUrl`n"

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing..." -ForegroundColor Yellow
    $installer = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.22.1/node-v22.22.1-x64.msi" -OutFile $installer -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i", $installer, "/quiet", "/norestart" -Wait
    $env:PATH = "C:\Program Files\nodejs;$env:PATH"
    Write-Host "Node.js installed." -ForegroundColor Green
}

# Create install directory
$installDir = "$env:USERPROFILE\.agent-chat-mcp"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# Write package.json
@'
{
  "name": "agent-chat-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  }
}
'@ | Set-Content "$installDir\package.json"

# Write MCP server
$serverUrl = "https://raw.githubusercontent.com/placeholder/agent-chat-mcp/main/mcp-server.js"
# Inline the server instead of downloading
@'
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

const server = new McpServer({ name: 'agent-chat', version: '1.0.0' });

server.tool('register_agent', 'Register this agent with the broker so other agents can see it. Call this first.', { name: z.string().optional().describe('Friendly name for this agent') }, async ({ name }) => {
  const result = await api('/agents/register', { method: 'POST', body: JSON.stringify({ agentId: AGENT_ID, name: name || AGENT_ID }) });
  return { content: [{ type: 'text', text: `Registered as "${AGENT_ID}". Online agents: ${result.agents?.join(', ')}` }] };
});

server.tool('list_agents', 'List all registered agents across all machines.', {}, async () => {
  const result = await api('/agents');
  const list = result.agents?.map(a => `${a.id} (${a.name}, last seen: ${new Date(a.lastSeen).toLocaleString()})`).join('\n') || 'No agents online';
  return { content: [{ type: 'text', text: list }] };
});

server.tool('send_message', 'Send a message to another agent. Use to="all" to broadcast.', { to: z.string().describe('Target agent ID or "all"'), content: z.string().describe('Message content') }, async ({ to, content }) => {
  const result = await api('/messages/send', { method: 'POST', body: JSON.stringify({ from: AGENT_ID, to, content }) });
  return { content: [{ type: 'text', text: `Message sent to ${to} (id: ${result.message?.id})` }] };
});

server.tool('read_messages', 'Read messages sent to this agent.', { unreadOnly: z.boolean().optional().describe('Only show unread messages') }, async ({ unreadOnly }) => {
  const result = await api(`/messages?agentId=${AGENT_ID}&unreadOnly=${unreadOnly ?? true}`);
  if (!result.messages?.length) return { content: [{ type: 'text', text: 'No new messages.' }] };
  const formatted = result.messages.map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.from} -> ${m.to}: ${m.content}`).join('\n');
  return { content: [{ type: 'text', text: formatted }] };
});

server.tool('create_task', 'Create a task for another agent to complete.', { assignedTo: z.string().describe('Agent ID to assign to, or "any"'), description: z.string().describe('Task description') }, async ({ assignedTo, description }) => {
  const result = await api('/tasks/create', { method: 'POST', body: JSON.stringify({ from: AGENT_ID, assignedTo, description }) });
  return { content: [{ type: 'text', text: `Task #${result.task?.id} created for ${assignedTo}` }] };
});

server.tool('check_tasks', 'Check for tasks assigned to this agent.', { status: z.string().optional().describe('Filter: pending, in_progress, completed') }, async ({ status }) => {
  const result = await api(`/tasks?agentId=${AGENT_ID}${status ? `&status=${status}` : ''}`);
  if (!result.tasks?.length) return { content: [{ type: 'text', text: 'No tasks found.' }] };
  const formatted = result.tasks.map(t => `Task #${t.id} [${t.status}] from ${t.from} -> ${t.assignedTo}: ${t.description}${t.result ? `\n  Result: ${t.result}` : ''}`).join('\n\n');
  return { content: [{ type: 'text', text: formatted }] };
});

server.tool('update_task', 'Update a task status and optionally provide a result.', { taskId: z.number().describe('Task ID'), status: z.enum(['in_progress', 'completed', 'failed']).describe('New status'), result: z.string().optional().describe('Result') }, async ({ taskId, status, result }) => {
  await api(`/tasks/${taskId}/update`, { method: 'POST', body: JSON.stringify({ status, result }) });
  return { content: [{ type: 'text', text: `Task #${taskId} updated to ${status}` }] };
});

server.tool('share_context', 'Share data with other agents via a named key.', { key: z.string().describe('Name for this context'), data: z.string().describe('Data to share') }, async ({ key, data }) => {
  await api('/context/share', { method: 'POST', body: JSON.stringify({ from: AGENT_ID, key, data }) });
  return { content: [{ type: 'text', text: `Context "${key}" shared` }] };
});

server.tool('get_context', 'Retrieve shared context by key, or list all keys.', { key: z.string().optional().describe('Key to retrieve, omit to list all') }, async ({ key }) => {
  if (!key) {
    const result = await api('/context');
    if (!result.keys?.length) return { content: [{ type: 'text', text: 'No shared context.' }] };
    return { content: [{ type: 'text', text: result.keys.map(k => `${k.key} (from ${k.from})`).join('\n') }] };
  }
  const result = await api(`/context/${key}`);
  if (result.error) return { content: [{ type: 'text', text: `"${key}" not found.` }] };
  return { content: [{ type: 'text', text: `From ${result.from}:\n\n${result.data}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
'@ | Set-Content "$installDir\mcp-server.js"

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Push-Location $installDir
& npm install 2>&1 | Out-Null
Pop-Location
Write-Host "Dependencies installed." -ForegroundColor Green

# Configure Claude Code
$claudeSettings = "$env:USERPROFILE\.claude\settings.json"
if (Test-Path $claudeSettings) {
    $settings = Get-Content $claudeSettings | ConvertFrom-Json
} else {
    New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude" | Out-Null
    $settings = [PSCustomObject]@{}
}

if (-not $settings.mcpServers) {
    $settings | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{}) -Force
}

$mcpPath = "$installDir\mcp-server.js" -replace '\\', '\\'

$agentChat = [PSCustomObject]@{
    command = "node"
    args = @($mcpPath)
    env = [PSCustomObject]@{
        BROKER_URL = $BrokerUrl
        AGENT_ID = $AgentId
    }
}

$settings.mcpServers | Add-Member -NotePropertyName "agent-chat" -NotePropertyValue $agentChat -Force

$settings | ConvertTo-Json -Depth 10 | Set-Content $claudeSettings

Write-Host "`n=== Installation Complete ===" -ForegroundColor Green
Write-Host "`nAgent Chat MCP installed for agent '$AgentId'"
Write-Host "Claude Code settings updated at: $claudeSettings"
Write-Host "`nRestart Claude Code to activate."
Write-Host "The agent-chat tools will be available: register_agent, send_message, read_messages, create_task, etc.`n"
