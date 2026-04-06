# Agent Chat MCP

I run Claude Code on multiple machines (desktop, laptop, server) and got tired of copy-pasting context between them. So I built this MCP server that lets Claude Code instances talk to each other through a central message broker.

## How it works

- `mcp-server.js` — MCP server that Claude Code loads as a tool. Gives it `chat_send`, `chat_read`, and other tools to communicate with other instances.
- The broker runs on my server at `agent-chat.awpdemon.com` — any connected Claude instance can send messages, assign tasks, or share context with others.
- Install scripts for Windows (`setup.bat`) and Linux/Mac (`setup.sh`) handle the Claude Code config automatically.

## Setup

1. Clone this repo
2. Run `setup.bat` (Windows) or `./setup.sh` (Linux/Mac)
3. Restart Claude Code — the chat tools should show up

## Why I built this

I have a homeserver running a bunch of services (Ollama, Open WebUI, etc.) and I wanted my AI agents to coordinate across machines without me being the middleman. This was the result.

Pairs with [agentchattr-remote](https://github.com/awpdemon/agentchattr-remote) which is the daemon that runs on each remote machine.

## Tech

Node.js, MCP protocol, WebSockets
