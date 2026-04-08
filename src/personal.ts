#!/usr/bin/env node

/**
 * aum-personal — Spotify and other personal/lifestyle tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSpotifyTools } from "./tools/spotify.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-personal", version: "1.0.0" });
patchServer(server);

registerSpotifyTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-personal running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
