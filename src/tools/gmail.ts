/**
 * Gmail tools — inbox and search.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Scopes: https://www.googleapis.com/auth/gmail.readonly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { googleFetch, getGoogleAccessToken } from "./google-oauth.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface MessageHeader {
  name: string;
  value: string;
}

function header(headers: MessageHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function fetchMessageSummaries(messageIds: { id: string }[]): Promise<object[]> {
  return Promise.all(
    messageIds.map(async ({ id }) => {
      const msg = await googleFetch(
        `${BASE}/messages/${id}?format=metadata&metadataHeaders=Subject,From,Date`
      );
      const headers: MessageHeader[] = msg.payload?.headers ?? [];
      return {
        id,
        subject: header(headers, "Subject") || "(no subject)",
        from: header(headers, "From"),
        date: header(headers, "Date"),
        snippet: msg.snippet ?? "",
      };
    })
  );
}

export function registerGmailTools(server: McpServer) {
  server.tool(
    "gmail_inbox",
    "Get recent emails from Aum's Gmail inbox.",
    {
      limit: z.number().int().min(1).max(25).default(10).describe("Number of emails to return (max 25)"),
    },
    async ({ limit }) => {
      try {
        const list = await googleFetch(`${BASE}/messages?labelIds=INBOX&maxResults=${limit}`);
        if (!list.messages?.length) {
          return { content: [{ type: "text" as const, text: "Inbox is empty." }] };
        }
        const messages = await fetchMessageSummaries(list.messages);
        return { content: [{ type: "text" as const, text: JSON.stringify(messages, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "gmail_search",
    "Search Aum's Gmail using Gmail query syntax (e.g. 'from:alice subject:invoice is:unread').",
    {
      query: z.string().describe("Gmail search query"),
      limit: z.number().int().min(1).max(25).default(10).describe("Number of results (max 25)"),
    },
    async ({ query, limit }) => {
      try {
        const list = await googleFetch(
          `${BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`
        );
        if (!list.messages?.length) {
          return { content: [{ type: "text" as const, text: "No messages found." }] };
        }
        const messages = await fetchMessageSummaries(list.messages);
        return { content: [{ type: "text" as const, text: JSON.stringify(messages, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "gmail_get_message",
    "Get the full body of a Gmail message by ID.",
    {
      id: z.string().describe("Gmail message ID"),
    },
    async ({ id }) => {
      try {
        const msg = await googleFetch(`${BASE}/messages/${id}?format=full`);
        const headers: MessageHeader[] = msg.payload?.headers ?? [];

        // Extract plain text body
        function extractBody(payload: any): string {
          if (!payload) return "";
          if (payload.mimeType === "text/plain" && payload.body?.data) {
            return Buffer.from(payload.body.data, "base64url").toString("utf-8");
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              const text = extractBody(part);
              if (text) return text;
            }
          }
          return "";
        }

        const result = {
          id,
          subject: header(headers, "Subject"),
          from: header(headers, "From"),
          to: header(headers, "To"),
          date: header(headers, "Date"),
          snippet: msg.snippet ?? "",
          body: extractBody(msg.payload) || "(no plain-text body)",
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "gmail_send",
    "Send an email from Aum's Gmail account.",
    {
      to: z.string().describe("Recipient email address(es), comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      cc: z.string().optional().describe("CC email address(es), comma-separated"),
      reply_to_id: z.string().optional().describe("Message ID to reply to (sets In-Reply-To and References headers)"),
    },
    async ({ to, subject, body, cc, reply_to_id }) => {
      try {
        const lines = [
          `To: ${to}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          `Subject: ${subject}`,
          "Content-Type: text/plain; charset=utf-8",
          "MIME-Version: 1.0",
          ...(reply_to_id ? [`In-Reply-To: ${reply_to_id}`, `References: ${reply_to_id}`] : []),
          "",
          body,
        ];
        const raw = Buffer.from(lines.join("\r\n"))
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const token = await getGoogleAccessToken();
        const res = await fetch(`${BASE}/messages/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gmail API error ${res.status}: ${err.slice(0, 300)}`);
        }

        const sent = await res.json() as any;
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ id: sent.id, threadId: sent.threadId, status: "sent" }, null, 2),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
