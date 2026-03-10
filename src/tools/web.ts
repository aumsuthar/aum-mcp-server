/**
 * Web tools — fetch URLs, check HTTP status, call APIs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerWebTools(server: McpServer) {
  server.tool(
    "fetch_url",
    "Fetch content from a URL and return the response body. Supports JSON and text.",
    {
      url: z.string().url().describe("The URL to fetch"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .default("GET")
        .describe("HTTP method"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional headers as key-value pairs"),
      body: z.string().optional().describe("Optional request body"),
    },
    async ({ url, method, headers, body }) => {
      try {
        const response = await fetch(url, {
          method,
          headers: headers
            ? { ...headers }
            : undefined,
          body: body ?? undefined,
        });

        const contentType = response.headers.get("content-type") ?? "";
        const responseBody = contentType.includes("application/json")
          ? JSON.stringify(await response.json(), null, 2)
          : await response.text();

        // Truncate very large responses
        const maxLen = 50_000;
        const truncated =
          responseBody.length > maxLen
            ? responseBody.slice(0, maxLen) + "\n\n... (truncated)"
            : responseBody;

        return {
          content: [
            {
              type: "text" as const,
              text: `HTTP ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${truncated}`,
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
    "http_status",
    "Check the HTTP status of a URL without downloading the full body.",
    {
      url: z.string().url().describe("The URL to check"),
    },
    async ({ url }) => {
      try {
        const response = await fetch(url, { method: "HEAD" });
        const headers = Object.fromEntries(response.headers.entries());
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: response.status,
                  statusText: response.statusText,
                  headers,
                },
                null,
                2
              ),
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
    "call_api",
    "Call a JSON API endpoint. Sends and expects JSON.",
    {
      url: z.string().url().describe("API endpoint URL"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .default("GET"),
      headers: z.record(z.string(), z.string()).optional(),
      json_body: z
        .record(z.string(), z.any())
        .optional()
        .describe("JSON body to send (automatically serialized)"),
    },
    async ({ url, method, headers, json_body }) => {
      try {
        const reqHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        };

        const response = await fetch(url, {
          method,
          headers: reqHeaders,
          body: json_body ? JSON.stringify(json_body) : undefined,
        });

        const data = await response.json();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
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
}
