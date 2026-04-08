/**
 * Obsidian vault tools — read, write, search, and list notes.
 * Env var: OBSIDIAN_VAULT_PATH (absolute path to the vault directory)
 * Writes auto-commit and push to git so the vault stays synced across devices.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { join, dirname, relative, extname } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function vaultPath(): string {
  const p = process.env.OBSIDIAN_VAULT_PATH;
  if (!p) throw new Error("OBSIDIAN_VAULT_PATH is not set in .env");
  return p;
}

function notePath(vault: string, name: string): string {
  const p = name.endsWith(".md") ? name : `${name}.md`;
  return join(vault, p);
}

async function gitSync(vault: string, message: string): Promise<void> {
  try {
    await execAsync(`cd "${vault}" && git add -A && git diff --cached --quiet || git commit -m "${message}" && git push`, { timeout: 15000 });
  } catch {
    // Silently ignore git errors — write already succeeded
  }
}

async function walkVault(dir: string, vault: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await walkVault(full, vault));
    } else if (extname(e.name) === ".md") {
      files.push(relative(vault, full));
    }
  }
  return files;
}

export function registerObsidianTools(server: McpServer) {
  server.tool(
    "obsidian_read",
    "Read a note from the Obsidian vault by path (e.g. 'School/Capstone/Notes.md' or just 'Notes').",
    {
      path: z.string().describe("Relative path to the note within the vault (with or without .md)"),
    },
    async ({ path }) => {
      try {
        const vault = vaultPath();
        const content = await readFile(notePath(vault, path), "utf-8");
        return { content: [{ type: "text" as const, text: content }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_write",
    "Create or overwrite a note in the Obsidian vault. Auto-commits and pushes to git.",
    {
      path: z.string().describe("Relative path to the note (e.g. 'School/Notes.md')"),
      content: z.string().describe("Full markdown content to write"),
    },
    async ({ path, content }) => {
      try {
        const vault = vaultPath();
        const full = notePath(vault, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, content, "utf-8");
        await gitSync(vault, `update: ${path}`);
        return { content: [{ type: "text" as const, text: `Written: ${path}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_append",
    "Append content to an existing note in the Obsidian vault. Creates the note if it doesn't exist. Auto-commits and pushes to git.",
    {
      path: z.string().describe("Relative path to the note"),
      content: z.string().describe("Markdown content to append"),
    },
    async ({ path, content }) => {
      try {
        const vault = vaultPath();
        const full = notePath(vault, path);
        await mkdir(dirname(full), { recursive: true });
        let existing = "";
        try { existing = await readFile(full, "utf-8"); } catch {}
        const separator = existing && !existing.endsWith("\n") ? "\n" : "";
        await writeFile(full, existing + separator + content, "utf-8");
        await gitSync(vault, `append: ${path}`);
        return { content: [{ type: "text" as const, text: `Appended to: ${path}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_list",
    "List all notes in the Obsidian vault, or in a specific subdirectory.",
    {
      dir: z.string().default("").describe("Subdirectory to list (empty for entire vault)"),
    },
    async ({ dir }) => {
      try {
        const vault = vaultPath();
        const base = dir ? join(vault, dir) : vault;
        const files = await walkVault(base, vault);
        if (files.length === 0) return { content: [{ type: "text" as const, text: "No notes found." }] };
        return { content: [{ type: "text" as const, text: files.join("\n") }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_search",
    "Search all notes in the Obsidian vault for a text string.",
    {
      query: z.string().describe("Text to search for (case-insensitive)"),
    },
    async ({ query }) => {
      try {
        const vault = vaultPath();
        const files = await walkVault(vault, vault);
        const lower = query.toLowerCase();
        const results: string[] = [];
        for (const file of files) {
          const text = await readFile(join(vault, file), "utf-8");
          if (text.toLowerCase().includes(lower)) {
            const lines = text.split("\n").filter(l => l.toLowerCase().includes(lower));
            results.push(`### ${file}\n${lines.slice(0, 3).map(l => `  ${l.trim()}`).join("\n")}`);
          }
        }
        if (results.length === 0) return { content: [{ type: "text" as const, text: `No results for "${query}".` }] };
        return { content: [{ type: "text" as const, text: results.join("\n\n") }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
