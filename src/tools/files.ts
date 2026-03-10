/**
 * File tools — read, write, list, and search files on the local system.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import { join, resolve, extname } from "path";

export function registerFileTools(server: McpServer) {
  server.tool(
    "read_file",
    "Read the contents of a file at the given path.",
    {
      path: z.string().describe("Absolute or relative file path"),
    },
    async ({ path }) => {
      try {
        const content = await readFile(resolve(path), "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (error: any) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "write_file",
    "Write content to a file. Creates parent directories if needed.",
    {
      path: z.string().describe("Absolute or relative file path"),
      content: z.string().describe("Content to write"),
    },
    async ({ path, content }) => {
      try {
        const resolved = resolve(path);
        const dir = resolved.substring(0, resolved.lastIndexOf("/"));
        await mkdir(dir, { recursive: true });
        await writeFile(resolved, content, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: `Written ${content.length} bytes to ${resolved}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_directory",
    "List files and directories at the given path.",
    {
      path: z.string().default(".").describe("Directory path"),
      recursive: z
        .boolean()
        .default(false)
        .describe("List recursively (max 2 levels deep)"),
    },
    async ({ path, recursive }) => {
      try {
        const entries = await listDir(resolve(path), recursive ? 2 : 0, 0);
        return {
          content: [{ type: "text" as const, text: entries.join("\n") }],
        };
      } catch (error: any) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}

async function listDir(
  dir: string,
  maxDepth: number,
  depth: number
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  const indent = "  ".repeat(depth);

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const prefix = entry.isDirectory() ? "📁 " : "  ";
    results.push(`${indent}${prefix}${entry.name}`);
    if (entry.isDirectory() && depth < maxDepth) {
      results.push(
        ...(await listDir(join(dir, entry.name), maxDepth, depth + 1))
      );
    }
  }
  return results;
}
