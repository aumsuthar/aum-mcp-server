#!/usr/bin/env node

/**
 * aum-notes — notes, Office docs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerNotesTools } from "./tools/notes.js";
import { registerOfficeTools } from "./tools/office.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-notes", version: "1.0.0" });
patchServer(server);

registerNotesTools(server);
registerOfficeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-notes running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
