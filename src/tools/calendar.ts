/**
 * Google Calendar tools — upcoming events and today's schedule.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Scopes: https://www.googleapis.com/auth/calendar.readonly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { googleFetch, getGoogleAccessToken } from "./google-oauth.js";

const BASE = "https://www.googleapis.com/calendar/v3/calendars";

function formatEvent(event: any): object {
  const start = event.start?.dateTime ?? event.start?.date ?? "";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  return {
    id: event.id,
    summary: event.summary ?? "(no title)",
    start,
    end,
    location: event.location ?? null,
    description: event.description ? event.description.slice(0, 300) : null,
    hangoutLink: event.hangoutLink ?? null,
    status: event.status,
  };
}

export function registerCalendarTools(server: McpServer) {
  server.tool(
    "calendar_events",
    "Get upcoming events from Aum's Google Calendar.",
    {
      limit: z.number().int().min(1).max(50).default(10).describe("Number of events to return (max 50)"),
      days: z.number().int().min(1).max(90).default(7).describe("Look ahead this many days"),
    },
    async ({ limit, days }) => {
      try {
        const now = new Date();
        const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const data = await googleFetch(
          `${BASE}/primary/events?` +
            new URLSearchParams({
              timeMin: now.toISOString(),
              timeMax: until.toISOString(),
              maxResults: String(limit),
              singleEvents: "true",
              orderBy: "startTime",
            }).toString()
        );

        const events = (data.items ?? []).map(formatEvent);
        if (!events.length) {
          return { content: [{ type: "text" as const, text: `No events in the next ${days} days.` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "calendar_today",
    "Get all of Aum's events for today.",
    {},
    async () => {
      try {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const data = await googleFetch(
          `${BASE}/primary/events?` +
            new URLSearchParams({
              timeMin: startOfDay.toISOString(),
              timeMax: endOfDay.toISOString(),
              maxResults: "50",
              singleEvents: "true",
              orderBy: "startTime",
            }).toString()
        );

        const events = (data.items ?? []).map(formatEvent);
        if (!events.length) {
          return { content: [{ type: "text" as const, text: "No events today." }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(events, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "calendar_list",
    "List all calendars in Aum's Google account.",
    {},
    async () => {
      try {
        const data = await googleFetch(`${BASE.replace("/calendars", "")}/users/me/calendarList`);
        const calendars = (data.items ?? []).map((c: any) => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary ?? false,
          accessRole: c.accessRole,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify(calendars, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "calendar_create_event",
    "Create a new event on Aum's Google Calendar.",
    {
      summary: z.string().describe("Event title"),
      start: z.string().describe("Start time as ISO 8601 (e.g. '2025-03-15T14:00:00') or date only ('2025-03-15' for all-day)"),
      end: z.string().describe("End time as ISO 8601 or date only. For all-day, use the next day's date."),
      description: z.string().optional().describe("Event description/notes"),
      location: z.string().optional().describe("Event location"),
      timezone: z.string().optional().default("America/New_York").describe("IANA timezone (e.g. 'America/Chicago')"),
    },
    async ({ summary, start, end, description, location, timezone }) => {
      try {
        const isAllDay = !start.includes("T");
        const event: Record<string, any> = {
          summary,
          start: isAllDay ? { date: start } : { dateTime: start, timeZone: timezone },
          end: isAllDay ? { date: end } : { dateTime: end, timeZone: timezone },
        };
        if (description) event.description = description;
        if (location) event.location = location;

        const token = await getGoogleAccessToken();
        const res = await fetch(`${BASE}/primary/events`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Calendar API error ${res.status}: ${err.slice(0, 300)}`);
        }

        const created = await res.json() as any;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id: created.id,
              summary: created.summary,
              start: created.start,
              end: created.end,
              htmlLink: created.htmlLink,
            }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
