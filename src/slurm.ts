#!/usr/bin/env node

/**
 * aum-slurm — generic SLURM HPC cluster tools via SSH
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSlurmTools } from "./tools/slurm.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-slurm", version: "1.0.0" });
patchServer(server);

registerSlurmTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-slurm running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
