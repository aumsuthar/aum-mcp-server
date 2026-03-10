/**
 * Utility tools — system info, date/time, environment, and shell commands.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { hostname, platform, arch, cpus, totalmem, freemem } from "os";

export function registerUtilityTools(server: McpServer) {
  server.tool(
    "system_info",
    "Get current system information — hostname, platform, architecture, memory, etc.",
    {},
    async () => {
      const info = {
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        cpus: cpus().length,
        totalMemoryGB: (totalmem() / 1e9).toFixed(1),
        freeMemoryGB: (freemem() / 1e9).toFixed(1),
        nodeVersion: process.version,
        uptime: `${(process.uptime() / 60).toFixed(0)} min`,
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(info, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "current_datetime",
    "Get the current date and time in various formats.",
    {
      timezone: z
        .string()
        .default("America/Los_Angeles")
        .describe("IANA timezone name"),
    },
    async ({ timezone }) => {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", { timeZone: timezone });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                iso: now.toISOString(),
                unix: Math.floor(now.getTime() / 1000),
                local: formatted,
                timezone,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "run_command",
    "Run a shell command and return its output. Use with caution.",
    {
      command: z.string().describe("Shell command to execute"),
      timeout: z
        .number()
        .default(30000)
        .describe("Timeout in milliseconds (default 30s)"),
    },
    async ({ command, timeout }) => {
      try {
        const output = execSync(command, {
          timeout,
          encoding: "utf-8",
          maxBuffer: 1024 * 1024 * 5,
        });
        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Exit code: ${error.status ?? "unknown"}\n${error.stderr ?? error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_env",
    "Get the value of an environment variable.",
    {
      name: z.string().describe("Environment variable name"),
    },
    async ({ name }) => {
      const value = process.env[name];
      return {
        content: [
          {
            type: "text" as const,
            text: value !== undefined ? value : `(not set)`,
          },
        ],
      };
    }
  );
}
