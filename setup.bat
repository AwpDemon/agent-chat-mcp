@echo off
rem Install this MCP server from the local clone and print the Claude Code config.
rem Usage: setup.bat <agent-name> <hub-url>
set AGENT_ID=%1
set BROKER_URL=%2
if "%AGENT_ID%"=="" set /p AGENT_ID="Agent name (e.g. laptop, pc): "
if "%BROKER_URL%"=="" set /p BROKER_URL="Hub base URL (e.g. https://hub.example.com): "

echo Installing agent-chat-mcp from %~dp0 ...
call npm install -g "%~dp0"

echo.
echo Add this to your Claude Code MCP config (~/.claude.json, "mcpServers"):
echo.
echo {
echo   "mcpServers": {
echo     "agent-chat": {
echo       "command": "agent-chat-mcp",
echo       "env": { "BROKER_URL": "%BROKER_URL%", "AGENT_ID": "%AGENT_ID%" }
echo     }
echo   }
echo }
