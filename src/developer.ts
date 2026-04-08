#!/usr/bin/env node

/**
 * aum-developer — web, files, utility, GitHub, Ollama
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerWebTools } from "./tools/web.js";
import { registerFileTools } from "./tools/files.js";
import { registerUtilityTools } from "./tools/utility.js";
import { registerGithubTools } from "./tools/github.js";
import { registerOllamaTools } from "./tools/ollama.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-developer", version: "1.0.0" });
patchServer(server);

registerWebTools(server);
registerFileTools(server);
registerUtilityTools(server);
registerGithubTools(server);
registerOllamaTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-developer running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
