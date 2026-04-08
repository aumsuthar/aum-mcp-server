/**
 * Shared tool registry.
 *
 * Wraps McpServer.tool() so every registration is also captured here.
 * ollama_chat (and any future local-agent tool) can then enumerate and
 * call any registered MCP tool without needing a hard-coded list.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type MpcHandler = (
  args: Record<string, unknown>
) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

interface Entry {
  name: string;
  description: string;
  zodShape: Record<string, z.ZodTypeAny>;
  handler: MpcHandler;
}

export const registry = new Map<string, Entry>();

/**
 * Call this once on the McpServer instance *before* any registerXTools() calls.
 * It monkey-patches server.tool() to also store entries in the shared registry.
 */
export function patchServer(server: McpServer): void {
  const orig: (...args: unknown[]) => unknown = (server.tool as any).bind(server);

  (server as any).tool = (
    name: string,
    descOrShape: string | Record<string, z.ZodTypeAny>,
    shapeOrCb: Record<string, z.ZodTypeAny> | MpcHandler,
    cb?: MpcHandler
  ) => {
    // Only intercept the 4-arg form used throughout this codebase:
    // server.tool(name, description, zodShape, handler)
    if (
      typeof descOrShape === "string" &&
      cb !== undefined &&
      typeof shapeOrCb === "object" &&
      typeof cb === "function"
    ) {
      registry.set(name, {
        name,
        description: descOrShape,
        zodShape: shapeOrCb as Record<string, z.ZodTypeAny>,
        handler: cb,
      });
    }
    return orig(name, descOrShape, shapeOrCb, cb);
  };
}

/** Convert a registry entry to an Ollama-compatible tool definition. */
export function toOllamaToolDef(entry: Entry) {
  const schema = z.object(entry.zodShape);
  // Zod v4 built-in JSON Schema conversion
  const jsonSchema = z.toJSONSchema(schema);
  return {
    type: "function" as const,
    function: {
      name: entry.name,
      description: entry.description,
      parameters: jsonSchema,
    },
  };
}

/**
 * Execute any registered MCP tool by name.
 * Args are parsed through the tool's Zod schema before the handler is called,
 * matching what the MCP SDK would do at the protocol layer.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const entry = registry.get(name);
  if (!entry) return `Unknown tool: ${name}`;
  try {
    const parsed = z.object(entry.zodShape).parse(args);
    const result = await entry.handler(parsed as Record<string, unknown>);
    return result.content.map((c) => c.text).join("\n");
  } catch (err: any) {
    return `Tool error (${name}): ${err.message}`;
  }
}
