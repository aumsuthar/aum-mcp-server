#!/usr/bin/env node

/**
 * aum-canvas — Canvas LMS tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCanvasTools } from "./tools/canvas.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-canvas", version: "1.0.0" });
patchServer(server);

registerCanvasTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-canvas running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
