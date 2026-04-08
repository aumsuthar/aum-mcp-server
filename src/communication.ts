#!/usr/bin/env node

/**
 * aum-communication — Gmail, Google Calendar, Contacts, iMessage
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerContactsTools } from "./tools/contacts.js";
import { registerIMessageTools } from "./tools/imessage.js";
import { patchServer } from "./registry.js";

const server = new McpServer({ name: "aum-communication", version: "1.0.0" });
patchServer(server);

registerGmailTools(server);
registerCalendarTools(server);
registerContactsTools(server);
registerIMessageTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aum-communication running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
