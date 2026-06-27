# Mem0 MCP Setup Guide

This guide describes how to configure and verify the **Mem0 Model Context Protocol (MCP)** server integration for this project. Mem0 acts as a persistent memory layer for AI agents (such as Claude Desktop, Claude Code, Cursor, and Windsurf), enabling them to retain preferences, project context, and past instructions across sessions.

---

## Prerequisites

1. **Mem0 Account & API Key:**
   - Sign up or log in at [app.mem0.ai](https://app.mem0.ai).
   - Go to your dashboard and generate a new API key.
   - Copy the API key (which typically starts with `m0-`).

---

## Configuration

We have pre-configured the Mem0 MCP server in this workspace's [.mcp.json](file:///C:/mahesh-client-project/.mcp.json):

```json
"mem0": {
  "type": "http",
  "url": "https://mcp.mem0.ai/mcp/",
  "headers": {
    "Authorization": "Token ${MEM0_API_KEY}"
  }
}
```

To enable this configuration, you must expose your API key as the environment variable `MEM0_API_KEY`.

### 1. Setting the Environment Variable

Add the variable to your shell environment so that MCP clients can resolve it.

#### Windows (PowerShell)
To set it for the current session:
```powershell
$env:MEM0_API_KEY="m0-your-api-key-here"
```
To set it permanently (requires restarting your terminal/editor):
```powershell
[System.Environment]::SetEnvironmentVariable('MEM0_API_KEY', 'm0-your-api-key-here', 'User')
```

#### macOS / Linux
Add this to your profile file (e.g., `~/.zshrc` or `~/.bashrc`):
```bash
export MEM0_API_KEY="m0-your-api-key-here"
```
Then load the changes:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

---

## Client Integration

### 1. Claude Desktop
Claude Desktop reads configuration from `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

To add Mem0, append it to your `mcpServers` object:
```json
{
  "mcpServers": {
    "mem0-mcp": {
      "type": "http",
      "url": "https://mcp.mem0.ai/mcp/",
      "headers": {
        "Authorization": "Token m0-your-api-key-here"
      }
    }
  }
}
```
*(Note: Replace `m0-your-api-key-here` with your actual key directly if your client does not support env expansion).*

### 2. Cursor
In Cursor, you can add HTTP-based MCP servers directly through the GUI:
1. Open Cursor **Settings** (`Ctrl+,` or `Cmd+,`).
2. Navigate to **Features** -> **MCP**.
3. Click **+ Add New MCP Server**.
4. Enter the details:
   - **Name:** `mem0`
   - **Type:** `SSE` (or HTTP)
   - **URL:** `https://mcp.mem0.ai/mcp/`
5. Since Cursor GUI MCP doesn't support custom headers easily for HTTP servers out of the box, we recommend using the `npx mcp-add` command or ensuring the environment variable `MEM0_API_KEY` is loaded:
   ```bash
   npx mcp-add --name mem0-mcp --type http --url "https://mcp.mem0.ai/mcp/" --clients "cursor"
   ```

### 3. Claude Code / Antigravity CLI
If you run agents within the project folder using Claude Code or Antigravity, the tool will automatically detect `.mcp.json` at the root of the project and prompt for permissions. Ensure your `MEM0_API_KEY` is set in the environment from which you launch the CLI tool.

---

## Verifying Setup

Once configured, the following tools will be exposed to your AI assistant:
*   `add_memory`: Adds a memory or fact about the user, project, or context.
*   `search_memories`: Searches through stored memories.
*   `get_memories`: Lists all stored memories.
*   `delete_memory`: Deletes a specific memory.

To verify, you can ask your AI assistant:
> "What memories do you have stored for me?"

Or tell it a fact to remember:
> "Remember that this project uses Next.js and FastAPI."
