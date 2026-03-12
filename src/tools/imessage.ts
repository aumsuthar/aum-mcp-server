/**
 * iMessage tools — read and send iMessages via macOS.
 * Reads from ~/Library/Messages/chat.db (requires Full Disk Access).
 * Sends via AppleScript automating Messages.app (requires Automation permission).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { homedir } from "os";
import { join } from "path";
import Database from "better-sqlite3";
import { execFile } from "child_process";

const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

function openDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true });
}

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

export function registerIMessageTools(server: McpServer) {
  server.tool(
    "imessage_search",
    "Search iMessage conversations by contact name, phone number, or message content.",
    {
      query: z.string().describe("Search term — matches against contact name, phone number, email, or message text"),
      limit: z.number().int().min(1).max(50).default(20).describe("Max results to return"),
    },
    async ({ query, limit }) => {
      try {
        const db = openDb();
        const rows = db.prepare(`
          SELECT
            m.rowid,
            m.guid,
            m.text,
            m.is_from_me,
            datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS date,
            h.id AS handle_id,
            h.uncanonicalized_id,
            COALESCE(h.uncanonicalized_id, h.id) AS contact
          FROM message m
          LEFT JOIN handle h ON m.handle_id = h.rowid
          WHERE m.text LIKE ?
             OR h.id LIKE ?
             OR h.uncanonicalized_id LIKE ?
          ORDER BY m.date DESC
          LIMIT ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
        db.close();

        if (!rows.length) {
          return { content: [{ type: "text" as const, text: "No messages found." }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "imessage_recent",
    "Get the most recent iMessages across all conversations.",
    {
      limit: z.number().int().min(1).max(50).default(20).describe("Number of recent messages"),
    },
    async ({ limit }) => {
      try {
        const db = openDb();
        const rows = db.prepare(`
          SELECT
            m.rowid,
            m.text,
            m.is_from_me,
            datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS date,
            COALESCE(h.uncanonicalized_id, h.id) AS contact
          FROM message m
          LEFT JOIN handle h ON m.handle_id = h.rowid
          WHERE m.text IS NOT NULL AND m.text != ''
          ORDER BY m.date DESC
          LIMIT ?
        `).all(limit);
        db.close();

        return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "imessage_chat",
    "Get messages from a specific conversation by phone number or email.",
    {
      handle: z.string().describe("Phone number (e.g. +11234567890) or email of the contact"),
      limit: z.number().int().min(1).max(100).default(30).describe("Number of messages to return"),
    },
    async ({ handle, limit }) => {
      try {
        const db = openDb();
        const rows = db.prepare(`
          SELECT
            m.rowid,
            m.text,
            m.is_from_me,
            datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS date,
            COALESCE(h.uncanonicalized_id, h.id) AS contact
          FROM message m
          LEFT JOIN handle h ON m.handle_id = h.rowid
          WHERE (h.id = ? OR h.uncanonicalized_id = ?)
            AND m.text IS NOT NULL AND m.text != ''
          ORDER BY m.date DESC
          LIMIT ?
        `).all(handle, handle, limit);
        db.close();

        if (!rows.length) {
          return { content: [{ type: "text" as const, text: `No messages found for ${handle}.` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "imessage_contacts",
    "List all iMessage contacts (handles) with their most recent message date.",
    {
      limit: z.number().int().min(1).max(100).default(30).describe("Max contacts to return"),
    },
    async ({ limit }) => {
      try {
        const db = openDb();
        const rows = db.prepare(`
          SELECT
            COALESCE(h.uncanonicalized_id, h.id) AS contact,
            h.id AS handle,
            h.service,
            COUNT(m.rowid) AS message_count,
            datetime(MAX(m.date) / 1000000000 + 978307200, 'unixepoch', 'localtime') AS last_message
          FROM handle h
          LEFT JOIN message m ON m.handle_id = h.rowid
          GROUP BY h.rowid
          ORDER BY MAX(m.date) DESC
          LIMIT ?
        `).all(limit);
        db.close();

        return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "imessage_send",
    "Send an iMessage to a phone number or email. Uses AppleScript to automate Messages.app. If the recipient is specified by name, use contacts_search first to find their phone number.",
    {
      to: z.string().describe("Recipient phone number (e.g. +11234567890) or email address"),
      message: z.string().describe("Message text to send"),
    },
    async ({ to, message }) => {
      try {
        // Escape for AppleScript string literal
        const escapedTo = to.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const escapedMsg = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

        const script = `
          tell application "Messages"
            set targetService to 1st account whose service type = iMessage
            set targetBuddy to participant "${escapedTo}" of targetService
            send "${escapedMsg}" to targetBuddy
          end tell
        `;

        await runAppleScript(script);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ to, status: "sent" }, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
