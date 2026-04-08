# aum-mcp-server

A personal MCP server — unified tool hub for Claude. Gives Claude access to the file system, web requests, shell commands, persistent notes, live integrations with GitHub, Spotify, Canvas LMS, Gmail, Google Calendar, Google Contacts, and Notion — and a local Ollama agent loop for fully offline generation with tool use. Includes a local web dashboard.

## Integrations

| Tool | Description |
|------|-------------|
| `github_contributions` | Contribution calendar and stats for the past N days |
| `github_profile` | Profile info — repos, followers, top starred repos |
| `spotify_now_playing` | Currently playing track |
| `spotify_recent` | 10 most recently played tracks |
| `spotify_top_artists` | Top artists over the past ~6 months |
| `canvas_courses` | Active OSU courses with current grades and scores |
| `gmail_inbox` | List recent Gmail inbox messages |
| `gmail_search` | Search Gmail by query |
| `gmail_get_message` | Read a full email message |
| `gmail_send` | Send an email (auto-looks up contacts by name) |
| `calendar_list` | List available Google Calendars |
| `calendar_events` | List upcoming calendar events |
| `calendar_today` | Get today's events |
| `calendar_create_event` | Create a new calendar event (auto-looks up attendees by name) |
| `contacts_search` | Search Google Contacts by name or email — auto-called when a name is mentioned |
| `contacts_get` | Get full details for a specific contact |
| `contacts_list` | List all contacts |
| `notion_search` | Search across all Notion pages and databases |
| `notion_get_page` | Get a Notion page's content |
| `notion_create_page` | Create a new Notion page |
| `notion_append_blocks` | Append blocks to an existing Notion page |
| `notion_query_database` | Query a Notion database with filters |
| `ollama_models` | List installed Ollama models ranked by tool-use capability |
| `ollama_chat` | Agentic chat with best local model — keyword-routes to relevant MCP tools, validates calls, safe by default |

## Tools

<details>
<summary>View all tools</summary>

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
| `note_set` | Save a persistent note by key |
| `note_get` | Retrieve a note by key |
| `note_list` | List all saved note keys |
| `note_delete` | Delete a note by key |

</details>

## Setup

**1. Install dependencies**

```sh
npm install
```

**2. Configure environment**

```sh
cp .env.example .env
```

Fill in `.env` with your API keys (see `.env.example` for details on where to generate each one).

For Gmail and Google Calendar, run the OAuth flow after filling in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`:

```sh
node --env-file=.env scripts/google-auth.mjs
```

This will print a `GOOGLE_REFRESH_TOKEN` to add to `.env`. Covers both Gmail and Calendar in one flow.

**3. Build**

```sh
npm run build
```

**4. Register with Claude**

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "aum-mcp": {
      "command": "node",
      "args": [
        "--env-file=/path/to/mcp-server/.env",
        "/path/to/mcp-server/dist/index.js"
      ]
    }
  }
}
```

## Ollama (local LLM)

`ollama_chat` runs a fully local agentic loop — no cloud required.

**Prerequisites:** [Ollama](https://ollama.com) installed and running, with at least one model pulled.

```sh
ollama pull qwen2.5     # recommended — best tool use, fast
ollama pull llama3.2    # solid alternative
ollama serve            # start if not running as a service
```

### How tool routing works

Rather than dumping all 50+ MCP tools into every request, `ollama_chat` automatically selects a focused subset (up to 10) based on keywords in your prompt:

| Prompt contains | Tools exposed |
|-----------------|---------------|
| "osc", "hpc", "cluster", "slurm" | `osc_files`, `osc_jobs`, `osc_read_file`, `osc_storage` |
| "email", "gmail", "inbox" | `gmail_inbox`, `gmail_search`, `gmail_get_message` |
| "calendar", "schedule", "meeting" | `calendar_today`, `calendar_events`, `calendar_list` |
| "notion" | `notion_search`, `notion_get_page`, `notion_query_database` |
| "spotify", "music" | `spotify_now_playing`, `spotify_recent` |
| "github", "git" | `github_profile`, `github_contributions` |
| "file", "directory", "folder" | `read_file`, `list_directory` |
| no keyword match | `read_file`, `list_directory`, `fetch_url`, `system_info`, `current_datetime`, `note_get`, `note_list` |

### Dangerous tools require explicit opt-in

The following tools are **never** included in auto-routed sets. Pass them explicitly via the `tools` param:

`write_file` · `run_command` · `gmail_send` · `imessage_send` · `calendar_create_event` · `note_set` · `note_delete` · `word_create` · `ppt_create` · `osc_run` · `osc_submit_job`

### Parameters

| Param | Default | Description |
|-------|---------|-------------|
| `prompt` | — | Task or question |
| `model` | auto | Override model name (e.g. `llama3.3`) |
| `system` | built-in | Override system prompt |
| `tools` | auto-routed | Explicit tool whitelist, e.g. `["osc_run","osc_jobs"]` |
| `use_tools` | `true` | Set `false` for plain generation |
| `max_iterations` | `3` | Max tool-call rounds |

### Examples

```
# Auto-routes to osc_* tools
ollama_chat(prompt="List my files in /fs/ess/PAS2136")

# Explicit whitelist — enables dangerous tools
ollama_chat(prompt="Submit this SLURM script", tools=["osc_submit_job","osc_run"])

# Plain generation, no tools
ollama_chat(prompt="Explain SLURM job arrays", use_tools=false)

# Force a specific model for a complex multi-step task
ollama_chat(prompt="...", model="llama3.3", max_iterations=5)
```

### Remote Ollama

```sh
# .env
OLLAMA_HOST=http://my-server:11434
```

Model auto-selection ranking: qwen3 > qwen2.5 > llama3.3 > llama3.2 > llama3.1 > mistral-nemo > …

## Dashboard

A local web UI runs at `http://localhost:4242` with server status, all registered tools, API integration cards, and a notes viewer/editor.

```sh
npm run web
```

## Development

```sh
npm run dev    # run with tsx (no build needed, .env auto-loaded)
npm run build  # compile to dist/
npm run web    # local dashboard
```

## Adding your own tools

Create a file in `src/tools/`, export a `registerXTools(server)` function, import it in `src/index.ts`, and add it to the `TOOLS` array in `src/web.ts`. See `CLAUDE.md` for a full example.

## Notes storage

Notes are persisted at `~/.aum-mcp/notes.json`.
