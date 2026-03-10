# aum-mcp-server

A personal MCP server — unified tool hub for Claude. Gives Claude access to the file system, web requests, shell commands, persistent notes, and live integrations with GitHub, Spotify, and Canvas LMS. Includes a local web dashboard.

## Integrations

| Tool | Description |
|------|-------------|
| `github_contributions` | Contribution calendar and stats for the past N days |
| `github_profile` | Profile info — repos, followers, top starred repos |
| `spotify_now_playing` | Currently playing track |
| `spotify_recent` | 10 most recently played tracks |
| `spotify_top_artists` | Top artists over the past ~6 months |
| `canvas_courses` | Active OSU courses with current grades and scores |

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
