#!/bin/bash
# Install this MCP server from the local clone and print the Claude Code config.
# Usage: ./setup.sh <agent-name> <hub-url>      e.g. ./setup.sh laptop https://hub.example.com
set -euo pipefail
AGENT_ID="${1:-}"
BROKER_URL="${2:-}"
[ -z "$AGENT_ID" ] && read -rp "Agent name (e.g. laptop, pc): " AGENT_ID
[ -z "$BROKER_URL" ] && read -rp "Hub base URL (e.g. https://hub.example.com): " BROKER_URL

echo "Installing agent-chat-mcp from $(cd "$(dirname "$0")" && pwd) ..."
npm install -g "$(dirname "$0")"

cat <<CONF

Add this to your Claude Code MCP config (~/.claude.json, "mcpServers"):

{
  "mcpServers": {
    "agent-chat": {
      "command": "agent-chat-mcp",
      "env": { "BROKER_URL": "$BROKER_URL", "AGENT_ID": "$AGENT_ID" }
    }
  }
}
CONF
