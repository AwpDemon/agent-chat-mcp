#!/bin/bash
echo "=== Agent Chat MCP Setup ==="

if [ -z "$1" ]; then
    read -p "Enter agent name (e.g. laptop, pc, phone): " AGENT_ID
else
    AGENT_ID=$1
fi

echo "Installing agent-chat-mcp..."
npm install -g "$(dirname "$0")"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add this to your Claude Code settings:"
echo ""
cat <<CONF
{
  "mcpServers": {
    "agent-chat": {
      "command": "npx",
      "args": ["-y", "agent-chat-mcp"],
      "env": {
        "BROKER_URL": "https://agent-chat.awpdemon.com",
        "AGENT_ID": "$AGENT_ID"
      }
    }
  }
}
CONF
