#!/usr/bin/env node

/**
 * aum-mcp-server
 * A personal MCP server — unified API hub for Claude.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerWebTools } from "./tools/web.js";
import { registerFileTools } from "./tools/files.js";
import { registerUtilityTools } from "./tools/utility.js";
import { registerNotesTools } from "./tools/notes.js";
import { registerGithubTools } from "./tools/github.js";
import { registerSpotifyTools } from "./tools/spotify.js";
import { registerCanvasTools } from "./tools/canvas.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerNotionTools } from "./tools/notion.js";
import { registerContactsTools } from "./tools/contacts.js";
import { registerIMessageTools } from "./tools/imessage.js";

const server = new McpServer({
  name: "aum-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerWebTools(server);
registerFileTools(server);
registerUtilityTools(server);
registerNotesTools(server);
registerGithubTools(server);
registerSpotifyTools(server);
registerCanvasTools(server);
registerGmailTools(server);
registerCalendarTools(server);
registerNotionTools(server);
registerContactsTools(server);
registerIMessageTools(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-mcp-server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
