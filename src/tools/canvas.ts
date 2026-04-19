/**
 * Canvas LMS tools — courses, modules, pages, files, assignments from OSU.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const CANVAS_BASE = "https://osu.instructure.com/api/v1";

function requireToken(): string | { error: string } {
  const token = process.env.CANVAS_TOKEN;
  if (!token) return { error: "CANVAS_TOKEN not set." };
  return token;
}

async function canvasFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${CANVAS_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
}

async function canvasGetAll<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = path.startsWith("http") ? path : `${CANVAS_BASE}${path}`;
  while (url) {
    const res: Response = await canvasFetch(url, token);
    if (!res.ok) throw new Error(`Canvas API ${res.status} ${res.statusText}: ${await res.text()}`);
    const data = (await res.json()) as T[];
    out.push(...data);
    const link = res.headers.get("link") || "";
    const next = link.split(",").find((p) => p.includes('rel="next"'));
    url = next ? (next.match(/<([^>]+)>/)?.[1] ?? null) : null;
  }
  return out;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function errResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
function okResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function registerCanvasTools(server: McpServer) {
  server.tool(
    "canvas_courses",
    "Get current active courses and grades from Canvas (OSU).",
    {},
    async () => {
      const token = requireToken();
      if (typeof token !== "string") return errResult(`Error: ${token.error}`);
      try {
        const url = new URL(`${CANVAS_BASE}/courses`);
        url.searchParams.set("enrollment_state", "active");
        url.searchParams.append("include[]", "total_scores");
        url.searchParams.set("per_page", "50");
        const res = await canvasFetch(url.toString(), token);
        if (!res.ok) return errResult(`Canvas API error: ${res.status} ${res.statusText}`);
        const data = (await res.json()) as any[];
        const courses = data.map((c) => ({
          id: c.id,
          name: c.name,
          course_code: c.course_code,
          grade: c.enrollments?.[0]?.computed_current_grade ?? null,
          score: c.enrollments?.[0]?.computed_current_score ?? null,
        }));
        return okResult(JSON.stringify(courses, null, 2));
      } catch (err: any) {
        return errResult(`Error: ${err.message}`);
      }
    }
  );

  server.tool(
    "canvas_modules",
    "List modules for a Canvas course, including items (pages, files, assignments, etc.).",
    {
      course_id: z.number().describe("Canvas course ID (from canvas_courses)"),
      include_items: z.boolean().optional().describe("Include module items inline (default true)"),
    },
    async ({ course_id, include_items }) => {
      const token = requireToken();
      if (typeof token !== "string") return errResult(`Error: ${token.error}`);
      try {
        const params = new URLSearchParams();
        params.set("per_page", "100");
        if (include_items !== false) params.append("include[]", "items");
        const modules = await canvasGetAll<any>(
          `/courses/${course_id}/modules?${params.toString()}`,
          token
        );
        const simplified = modules.map((m) => ({
          id: m.id,
          name: m.name,
          position: m.position,
          state: m.state,
          items: (m.items ?? []).map((it: any) => ({
            id: it.id,
            title: it.title,
            type: it.type,
            content_id: it.content_id,
            page_url: it.page_url,
            url: it.url,
            html_url: it.html_url,
            external_url: it.external_url,
          })),
        }));
        return okResult(JSON.stringify(simplified, null, 2));
      } catch (err: any) {
        return errResult(`Error: ${err.message}`);
      }
    }
  );

  server.tool(
    "canvas_page",
    "Get the body (as plain text) of a Canvas wiki page.",
    {
      course_id: z.number().describe("Canvas course ID"),
      page_url: z.string().describe("The page_url slug from a module item (e.g., 'module-6-overview')"),
    },
    async ({ course_id, page_url }) => {
      const token = requireToken();
      if (typeof token !== "string") return errResult(`Error: ${token.error}`);
      try {
        const res = await canvasFetch(`/courses/${course_id}/pages/${encodeURIComponent(page_url)}`, token);
        if (!res.ok) return errResult(`Canvas API error: ${res.status} ${res.statusText}`);
        const page = (await res.json()) as any;
        const text = `# ${page.title}\n\n${stripHtml(page.body || "")}`;
        return okResult(text);
      } catch (err: any) {
        return errResult(`Error: ${err.message}`);
      }
    }
  );

  server.tool(
    "canvas_assignment",
    "Get a Canvas assignment's description (as plain text) and metadata.",
    {
      course_id: z.number().describe("Canvas course ID"),
      assignment_id: z.number().describe("Assignment ID (the content_id from a module item of type 'Assignment')"),
    },
    async ({ course_id, assignment_id }) => {
      const token = requireToken();
      if (typeof token !== "string") return errResult(`Error: ${token.error}`);
      try {
        const res = await canvasFetch(`/courses/${course_id}/assignments/${assignment_id}`, token);
        if (!res.ok) return errResult(`Canvas API error: ${res.status} ${res.statusText}`);
        const a = (await res.json()) as any;
        const text = [
          `# ${a.name}`,
          `Due: ${a.due_at ?? "n/a"} | Points: ${a.points_possible ?? "n/a"}`,
          "",
          stripHtml(a.description || ""),
        ].join("\n");
        return okResult(text);
      } catch (err: any) {
        return errResult(`Error: ${err.message}`);
      }
    }
  );

  server.tool(
    "canvas_file",
    "Get Canvas file metadata and download URL. For text/html/json files, returns the contents inline.",
    {
      file_id: z.number().describe("Canvas file ID (the content_id from a module item of type 'File')"),
      course_id: z.number().optional().describe("Optional course ID (not required but can help with scoping)"),
    },
    async ({ file_id, course_id }) => {
      const token = requireToken();
      if (typeof token !== "string") return errResult(`Error: ${token.error}`);
      try {
        const path = course_id
          ? `/courses/${course_id}/files/${file_id}`
          : `/files/${file_id}`;
        const res = await canvasFetch(path, token);
        if (!res.ok) return errResult(`Canvas API error: ${res.status} ${res.statusText}`);
        const f = (await res.json()) as any;
        const meta = {
          id: f.id,
          display_name: f.display_name,
          filename: f.filename,
          content_type: f["content-type"] ?? f.content_type,
          size: f.size,
          url: f.url,
        };
        const ct = (meta.content_type || "").toLowerCase();
        let body = "";
        if (meta.url && (ct.includes("text") || ct.includes("json") || ct.includes("html"))) {
          const dl = await fetch(meta.url);
          if (dl.ok) {
            const raw = await dl.text();
            body = ct.includes("html") ? stripHtml(raw) : raw;
          }
        }
        const out = body
          ? `${JSON.stringify(meta, null, 2)}\n\n--- CONTENT ---\n${body}`
          : `${JSON.stringify(meta, null, 2)}\n\nNote: binary file (e.g., PDF/docx). Use the 'url' above to download, or ask to add a PDF parser.`;
        return okResult(out);
      } catch (err: any) {
        return errResult(`Error: ${err.message}`);
      }
    }
  );
}
