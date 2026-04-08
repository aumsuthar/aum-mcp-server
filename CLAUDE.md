# aum-mcp-server — Claude Code Guide

## Project overview

Personal MCP server that gives Claude a unified set of tools: file system access, web/HTTP requests, shell commands, persistent notes, live integrations with GitHub, Spotify, Canvas LMS, Gmail, Google Calendar, Contacts, Notion, iMessage, Office, OSC — and a local Ollama agentic loop for fully offline generation with tool use.

## Commands

```sh
npm run build       # compile TypeScript → dist/
npm run dev         # run MCP server with tsx (no build needed, loads .env)
npm run web         # run local dashboard at http://localhost:4242 (loads .env)
npm start           # run compiled dist/index.js (no .env auto-load)
```

## Project structure

```
src/
  index.ts          # MCP server entry point — registers all tool groups
  web.ts            # Local dashboard server (port 4242)
  tools/
    web.ts          # fetch_url, http_status, call_api
    files.ts        # read_file, write_file, list_directory
    utility.ts      # system_info, current_datetime, run_command, get_env
    notes.ts        # note_set, note_get, note_list, note_delete
    github.ts       # github_contributions, github_profile
    spotify.ts      # spotify_now_playing, spotify_recent, spotify_top_artists
    canvas.ts       # canvas_courses
    ollama.ts       # ollama_models, ollama_chat (local agentic loop)
```

## Environment variables

Copy `.env.example` → `.env` and fill in keys. The `.env` file is gitignored and must never be committed.

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | GitHub GraphQL API |
| `CANVAS_TOKEN` | Canvas LMS REST API (OSU) |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_REFRESH_TOKEN` | Spotify OAuth refresh token |
| `SUPABASE_URL` | Supabase project URL (Spotify token cache) |
| `SUPABASE_KEY` | Supabase anon key |
| `OLLAMA_HOST` | Ollama base URL (optional, default: `http://localhost:11434`) |

## MCP configuration

The server is registered in `~/.mcp.json`. It uses Node's `--env-file` flag to load `.env`:

```json
{
  "mcpServers": {
    "aum-mcp": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-server/.env",
        "/absolute/path/to/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Always run `npm run build` after making changes before Claude will pick them up.

## Adding a new tool

1. Create `src/tools/mytool.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMyTools(server: McpServer) {
  server.tool("my_tool", "Description of what it does", {
    param: z.string().describe("A parameter"),
  }, async ({ param }) => {
    return { content: [{ type: "text" as const, text: `result` }] };
  });
}
```

2. Import and register in `src/index.ts`:

```ts
import { registerMyTools } from "./tools/mytool.js";
registerMyTools(server);
```

3. Add to the `TOOLS` array in `src/web.ts` so it appears on the dashboard.

4. Run `npm run build`.

## Notes storage

Notes are stored at `~/.aum-mcp/notes.json` as a flat key-value JSON object.

## Dashboard

The web dashboard (`npm run web`) provides a live view of:
- Server status and system info
- All registered tools grouped by category
- API integrations with masked keys and connection status
- Notes viewer and editor
