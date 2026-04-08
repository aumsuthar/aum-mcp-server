# aum-mcp-server

A personal MCP server split into four focused servers — each loads only the tools it needs, keeping Claude's context lean.

| Server | Tools |
|--------|-------|
| `aum-developer` | Web/HTTP, file system, shell, GitHub, Spotify, Canvas LMS, Ollama |
| `aum-notes` | Persistent notes, Word (.docx), PowerPoint (.pptx) |
| `aum-communication` | Gmail, Google Calendar, Google Contacts, iMessage |
| `aum-slurm` | SLURM job management via SSH (any HPC cluster) |

---

## Setup

### 1. Install dependencies

```sh
npm install
```

### 2. Configure environment

```sh
cp .env.example .env
```

Fill in `.env` with your API keys. Each section in `.env.example` explains where to generate them.

**Google (Gmail + Calendar + Contacts)** requires an OAuth flow — after filling in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, run:

```sh
node --env-file=.env scripts/google-auth.mjs
```

This prints a `GOOGLE_REFRESH_TOKEN` — paste it into `.env`. One token covers all three Google services.

### 3. Build

```sh
npm run build
```

### 4. Register with Claude

Add to `~/.mcp.json` (create it if it doesn't exist). Replace `/path/to/mcp-server` with the absolute path to this repo:

```json
{
  "mcpServers": {
    "aum-developer": {
      "command": "node",
      "args": [
        "--env-file=/path/to/mcp-server/.env",
        "/path/to/mcp-server/dist/developer.js"
      ]
    },
    "aum-notes": {
      "command": "node",
      "args": [
        "--env-file=/path/to/mcp-server/.env",
        "/path/to/mcp-server/dist/notes-server.js"
      ]
    },
    "aum-communication": {
      "command": "node",
      "args": [
        "--env-file=/path/to/mcp-server/.env",
        "/path/to/mcp-server/dist/communication.js"
      ]
    },
    "aum-slurm": {
      "command": "node",
      "args": [
        "--env-file=/path/to/mcp-server/.env",
        "/path/to/mcp-server/dist/slurm.js"
      ]
    }
  }
}
```

You can register only the servers you need — each one is independent.

---

## Tool reference

<details>
<summary>aum-developer</summary>

| Tool | Description |
|------|-------------|
| `fetch_url` | Fetch any URL (GET/POST/PUT/PATCH/DELETE) |
| `http_status` | Check HTTP status without downloading body |
| `call_api` | Call JSON APIs with automatic serialization |
| `read_file` | Read file contents |
| `write_file` | Write content to a file |
| `list_directory` | List files/dirs (optional recursive) |
| `system_info` | Hostname, platform, memory, architecture |
| `current_datetime` | Current date/time in any IANA timezone |
| `run_command` | Execute shell commands |
| `get_env` | Read environment variables |
| `github_contributions` | Contribution calendar and stats for the past N days |
| `github_profile` | Profile info — repos, followers, top starred repos |
| `spotify_now_playing` | Currently playing track |
| `spotify_recent` | 10 most recently played tracks |
| `spotify_top_artists` | Top artists over the past ~6 months |
| `canvas_courses` | Active courses with current grades and scores |
| `ollama_models` | List installed Ollama models ranked by tool-use capability |
| `ollama_chat` | Agentic chat with best local model — routes to relevant tools automatically |

</details>

<details>
<summary>aum-notes</summary>

| Tool | Description |
|------|-------------|
| `note_set` | Save a persistent note by key |
| `note_get` | Retrieve a note by key |
| `note_list` | List all saved note keys |
| `note_delete` | Delete a note by key |
| `word_read` | Extract text from a .docx file |
| `word_create` | Create a .docx file from headings, paragraphs, and bullets |
| `ppt_read` | Extract slide text from a .pptx file |
| `ppt_create` | Create a .pptx file from a list of slides |

</details>

<details>
<summary>aum-communication</summary>

| Tool | Description |
|------|-------------|
| `gmail_inbox` | List recent Gmail inbox messages |
| `gmail_search` | Search Gmail by query |
| `gmail_get_message` | Read a full email message |
| `gmail_send` | Send an email |
| `calendar_list` | List available Google Calendars |
| `calendar_events` | List upcoming calendar events |
| `calendar_today` | Get today's events |
| `calendar_create_event` | Create a new calendar event |
| `contacts_search` | Search Google Contacts by name or email |
| `contacts_get` | Get full details for a specific contact |
| `contacts_list` | List all contacts |
| `imessage_search` | Search messages by contact or content |
| `imessage_recent` | Get most recent messages across all chats |
| `imessage_chat` | Get messages from a specific conversation |
| `imessage_contacts` | List all iMessage contacts with last message |
| `imessage_send` | Send an iMessage via Messages.app |

</details>

<details>
<summary>aum-slurm</summary>

| Tool | Description |
|------|-------------|
| `slurm_run` | Run a shell command on the HPC cluster via SSH |
| `slurm_jobs` | List SLURM jobs in the queue |
| `slurm_files` | List files in a remote directory |
| `slurm_read_file` | Read a file from the HPC cluster |
| `slurm_submit_job` | Submit a SLURM batch job script |
| `slurm_storage` | Check disk quota and storage usage |

</details>

---

## Ollama (local LLM)

`ollama_chat` runs a fully local agentic loop — no cloud required.

**Prerequisites:** [Ollama](https://ollama.com) installed and running, with at least one model pulled.

```sh
ollama pull qwen2.5     # recommended — best tool use, fast
ollama pull llama3.2    # solid alternative
ollama serve            # start if not running as a service
```

`ollama_chat` automatically selects a focused subset of tools based on keywords in your prompt. Destructive tools (`write_file`, `run_command`, `gmail_send`, etc.) are never auto-routed — pass them explicitly via the `tools` parameter.

---

## Dashboard

A local web UI runs at `http://localhost:4242` with server status, registered tools, API integration cards, and a notes viewer/editor.

```sh
npm run web
```

---

## Development

```sh
npm run build                # compile all servers to dist/
npm run dev:developer        # run developer server with tsx
npm run dev:notes            # run notes server with tsx
npm run dev:communication    # run communication server with tsx
npm run dev:slurm            # run slurm server with tsx
npm run web                  # local dashboard
```

Always run `npm run build` after making changes before restarting Claude.

---

## Adding a new tool

1. Create `src/tools/mytool.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMyTools(server: McpServer) {
  server.tool("my_tool", "What it does", {
    param: z.string().describe("A parameter"),
  }, async ({ param }) => {
    return { content: [{ type: "text" as const, text: `result` }] };
  });
}
```

2. Import and call in the relevant entry point (`src/developer.ts`, `src/notes-server.ts`, etc.).

3. Add to the `TOOLS` array in `src/web.ts` for the dashboard.

4. Run `npm run build`.

---

## Notes storage

Notes are persisted at `~/.aum-mcp/notes.json`.
