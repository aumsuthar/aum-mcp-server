/**
 * Canvas LMS tools — courses and grades from OSU.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerCanvasTools(server: McpServer) {
  server.tool(
    "canvas_courses",
    "Get current active courses and grades from Canvas (OSU).",
    {},
    async () => {
      const token = process.env.CANVAS_TOKEN;
      if (!token) {
        return {
          content: [{ type: "text" as const, text: "Error: CANVAS_TOKEN not set." }],
          isError: true,
        };
      }

      try {
        const url = new URL("https://osu.instructure.com/api/v1/courses");
        url.searchParams.set("enrollment_state", "active");
        url.searchParams.append("include[]", "total_scores");
        url.searchParams.set("per_page", "20");

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          return {
            content: [{ type: "text" as const, text: `Canvas API error: ${res.status} ${res.statusText}` }],
            isError: true,
          };
        }

        const data = await res.json() as any[];

        const courses = data.map((c) => ({
          id: c.id,
          name: c.name,
          course_code: c.course_code,
          grade: c.enrollments?.[0]?.computed_current_grade ?? null,
          score: c.enrollments?.[0]?.computed_current_score ?? null,
        }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(courses, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
