/**
 * Notes tools — a simple persistent key-value note store.
 * Notes are stored as JSON in ~/.aum-mcp/notes.json.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const NOTES_DIR = join(homedir(), ".aum-mcp");
const NOTES_FILE = join(NOTES_DIR, "notes.json");

type Notes = Record<string, { content: string; updated: string }>;

async function loadNotes(): Promise<Notes> {
  try {
    const raw = await readFile(NOTES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveNotes(notes: Notes): Promise<void> {
  await mkdir(NOTES_DIR, { recursive: true });
  await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf-8");
}

export function registerNotesTools(server: McpServer) {
  server.tool(
    "note_set",
    "Save a note with a key. Overwrites existing notes with the same key.",
    {
      key: z.string().describe("Note key / identifier"),
      content: z.string().describe("Note content"),
    },
    async ({ key, content }) => {
      const notes = await loadNotes();
      notes[key] = { content, updated: new Date().toISOString() };
      await saveNotes(notes);
      return {
        content: [
          { type: "text" as const, text: `Saved note: "${key}"` },
        ],
      };
    }
  );

  server.tool(
    "note_get",
    "Retrieve a note by key.",
    {
      key: z.string().describe("Note key to retrieve"),
    },
    async ({ key }) => {
      const notes = await loadNotes();
      const note = notes[key];
      if (!note) {
        return {
          content: [
            { type: "text" as const, text: `Note "${key}" not found.` },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `[${note.updated}]\n\n${note.content}`,
          },
        ],
      };
    }
  );

  server.tool(
    "note_list",
    "List all saved note keys.",
    {},
    async () => {
      const notes = await loadNotes();
      const keys = Object.keys(notes);
      if (keys.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No notes saved." }],
        };
      }
      const list = keys
        .map((k) => `• ${k}  (${notes[k].updated})`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text: list }],
      };
    }
  );

  server.tool(
    "note_delete",
    "Delete a note by key.",
    {
      key: z.string().describe("Note key to delete"),
    },
    async ({ key }) => {
      const notes = await loadNotes();
      if (!(key in notes)) {
        return {
          content: [
            { type: "text" as const, text: `Note "${key}" not found.` },
          ],
        };
      }
      delete notes[key];
      await saveNotes(notes);
      return {
        content: [
          { type: "text" as const, text: `Deleted note: "${key}"` },
        ],
      };
    }
  );
}
