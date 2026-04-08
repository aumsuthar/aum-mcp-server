# aum-mcp-server — Claude Code Guide

## Overview

Personal MCP server split into four focused entry points. Each compiles to its own dist file and registers only the tools it needs.

## Commands

```sh
npm run build                # compile TypeScript → dist/
npm run dev:developer        # run developer server with tsx (no build, loads .env)
npm run dev:notes            # run notes server with tsx
npm run dev:communication    # run communication server with tsx
npm run dev:slurm            # run slurm server with tsx
npm run web                  # local dashboard at http://localhost:4242
```

## Project structure

```
src/
  developer.ts      # web, files, utility, github, spotify, canvas, ollama
  notes-server.ts   # notes, office
  communication.ts  # gmail, calendar, contacts, imessage
  slurm.ts          # slurm HPC tools
  web.ts            # local dashboard server (port 4242)
  registry.ts       # shared tool registry (used by ollama_chat for tool routing)
  tools/
    web.ts          # fetch_url, http_status, call_api
    files.ts        # read_file, write_file, list_directory
    utility.ts      # system_info, current_datetime, run_command, get_env
    notes.ts        # note_set, note_get, note_list, note_delete
    github.ts       # github_contributions, github_profile
    spotify.ts      # spotify_now_playing, spotify_recent, spotify_top_artists
    canvas.ts       # canvas_courses
    ollama.ts       # ollama_models, ollama_chat (local agentic loop)
    gmail.ts        # gmail_inbox, gmail_search, gmail_get_message, gmail_send
    calendar.ts     # calendar_events, calendar_today, calendar_list, calendar_create_event
    contacts.ts     # contacts_search, contacts_list, contacts_get
    imessage.ts     # imessage_search, imessage_recent, imessage_chat, imessage_contacts, imessage_send
    office.ts       # word_read, word_create, ppt_read, ppt_create
    slurm.ts        # slurm_run, slurm_jobs, slurm_files, slurm_read_file, slurm_submit_job, slurm_storage
    google-oauth.ts # shared Google OAuth helper (used by gmail, calendar, contacts)
```

## Environment variables

Copy `.env.example` → `.env`. The `.env` file is gitignored and must never be committed.

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | GitHub GraphQL API |
| `CANVAS_TOKEN` | Canvas LMS REST API |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `SPOTIFY_REFRESH_TOKEN` | Spotify OAuth refresh token |
| `SUPABASE_URL` | Supabase project URL (Spotify token cache) |
| `SUPABASE_KEY` | Supabase anon key |
| `OLLAMA_HOST` | Ollama base URL (optional, default: `http://localhost:11434`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth refresh token (run `scripts/google-auth.mjs`) |
| `SLURM_HOST` | HPC cluster SSH host |
| `SLURM_USERNAME` | HPC cluster SSH username |
| `SLURM_PASSWORD` | HPC cluster SSH password |

## MCP configuration (~/.mcp.json)

```json
{
  "mcpServers": {
    "aum-developer": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-server/.env",
        "/absolute/path/to/mcp-server/dist/developer.js"
      ]
    },
    "aum-notes": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-server/.env",
        "/absolute/path/to/mcp-server/dist/notes-server.js"
      ]
    },
    "aum-communication": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-server/.env",
        "/absolute/path/to/mcp-server/dist/communication.js"
      ]
    },
    "aum-slurm": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mcp-server/.env",
        "/absolute/path/to/mcp-server/dist/slurm.js"
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
  server.tool("my_tool", "Description", {
    param: z.string().describe("A parameter"),
  }, async ({ param }) => {
    return { content: [{ type: "text" as const, text: `result` }] };
  });
}
```

2. Import and call in the relevant entry point (`src/developer.ts`, etc.).

3. Add to the `TOOLS` array in `src/web.ts` for the dashboard.

4. Run `npm run build`.

## Notes storage

Notes are stored at `~/.aum-mcp/notes.json` as a flat key-value JSON object.
