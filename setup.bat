@echo off
echo === Agent Chat MCP Setup ===
echo.

if "%1"=="" (
    set /p AGENT_ID="Enter agent name (e.g. laptop, pc, phone): "
) else (
    set AGENT_ID=%1
)

echo.
echo Installing agent-chat-mcp...
npm install -g "%~dp0"

echo.
echo === Setup Complete ===
echo.
echo Add this to your Claude Code settings (~/.claude.json or .claude/settings.json):
echo.
echo {
echo   "mcpServers": {
echo     "agent-chat": {
echo       "command": "npx",
echo       "args": ["-y", "agent-chat-mcp"],
echo       "env": {
echo         "BROKER_URL": "https://agent-chat.awpdemon.com",
echo         "AGENT_ID": "%AGENT_ID%"
echo       }
echo     }
echo   }
echo }
echo.
pause
