/**
 * Notion tools — search, read, create, and append to pages.
 * Requires: NOTION_TOKEN (Internal Integration Token)
 * Generate at: notion.so/my-integrations
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN not set in .env");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...notionHeaders(), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json();
}

/** Extract plain text from a Notion rich_text array */
function richText(arr: any[]): string {
  return (arr ?? []).map((r: any) => r.plain_text ?? "").join("");
}

/** Summarize a page object to its key fields */
function summarizePage(page: any): object {
  const props = page.properties ?? {};
  const title =
    richText(props.title?.title ?? props.Name?.title ?? props.name?.title ?? []) ||
    "(untitled)";
  return {
    id: page.id,
    title,
    url: page.url,
    created: page.created_time,
    updated: page.last_edited_time,
    archived: page.archived,
  };
}

/** Convert Notion blocks to readable plain text */
function blocksToText(blocks: any[]): string {
  return blocks
    .map((b: any) => {
      const type = b.type;
      const content = b[type];
      if (!content) return "";
      const text = richText(content.rich_text ?? []);
      switch (type) {
        case "heading_1": return `# ${text}`;
        case "heading_2": return `## ${text}`;
        case "heading_3": return `### ${text}`;
        case "bulleted_list_item": return `• ${text}`;
        case "numbered_list_item": return `1. ${text}`;
        case "to_do": return `[${content.checked ? "x" : " "}] ${text}`;
        case "code": return `\`\`\`\n${text}\n\`\`\``;
        case "quote": return `> ${text}`;
        case "divider": return "---";
        case "paragraph": return text;
        default: return text;
      }
    })
    .filter(Boolean)
    .join("\n");
}

export function registerNotionTools(server: McpServer) {
  server.tool(
    "notion_search",
    "Search Aum's Notion workspace for pages and databases.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().int().min(1).max(20).default(10).describe("Max results"),
    },
    async ({ query, limit }) => {
      try {
        const data = await notionFetch("/search", {
          method: "POST",
          body: JSON.stringify({ query, page_size: limit }),
        });
        const results = (data.results ?? []).map(summarizePage);
        if (!results.length) {
          return { content: [{ type: "text" as const, text: "No results found." }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "notion_get_page",
    "Get the content of a Notion page by ID.",
    {
      page_id: z.string().describe("Notion page ID (with or without dashes)"),
    },
    async ({ page_id }) => {
      try {
        const id = page_id.replace(/-/g, "");
        const [page, blocksData] = await Promise.all([
          notionFetch(`/pages/${id}`),
          notionFetch(`/blocks/${id}/children?page_size=100`),
        ]);
        const summary = summarizePage(page);
        const body = blocksToText(blocksData.results ?? []);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...summary, body }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "notion_create_page",
    "Create a new page in Aum's Notion workspace under a parent page or database.",
    {
      parent_id: z.string().describe("Parent page or database ID"),
      title: z.string().describe("Page title"),
      content: z.string().optional().describe("Page body as plain text (each line becomes a paragraph)"),
      parent_type: z.enum(["page", "database"]).default("page").describe("Whether the parent is a page or database"),
    },
    async ({ parent_id, title, content, parent_type }) => {
      try {
        const id = parent_id.replace(/-/g, "");
        const parent =
          parent_type === "database"
            ? { database_id: id }
            : { page_id: id };

        const properties: Record<string, any> =
          parent_type === "database"
            ? { Name: { title: [{ text: { content: title } }] } }
            : { title: { title: [{ text: { content: title } }] } };

        const children = content
          ? content.split("\n").filter(Boolean).map((line) => ({
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
            }))
          : [];

        const page = await notionFetch("/pages", {
          method: "POST",
          body: JSON.stringify({ parent, properties, children }),
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(summarizePage(page), null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "notion_append_blocks",
    "Append text content to an existing Notion page.",
    {
      page_id: z.string().describe("Notion page ID"),
      content: z.string().describe("Text to append (each line becomes a paragraph)"),
    },
    async ({ page_id, content }) => {
      try {
        const id = page_id.replace(/-/g, "");
        const children = content.split("\n").filter(Boolean).map((line) => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
        }));

        await notionFetch(`/blocks/${id}/children`, {
          method: "PATCH",
          body: JSON.stringify({ children }),
        });

        return { content: [{ type: "text" as const, text: "Content appended successfully." }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "notion_query_database",
    "Query a Notion database and return its entries.",
    {
      database_id: z.string().describe("Notion database ID"),
      limit: z.number().int().min(1).max(50).default(20).describe("Max results"),
    },
    async ({ database_id, limit }) => {
      try {
        const id = database_id.replace(/-/g, "");
        const data = await notionFetch(`/databases/${id}/query`, {
          method: "POST",
          body: JSON.stringify({ page_size: limit }),
        });
        const results = (data.results ?? []).map(summarizePage);
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
