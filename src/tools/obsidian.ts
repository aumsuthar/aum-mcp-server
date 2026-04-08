/**
 * Obsidian vault tools — read, write, search, move, delete, frontmatter, links, git sync.
 * Env var: OBSIDIAN_VAULT_PATH (absolute path to the vault directory)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, readdir, unlink, rename } from "fs/promises";
import { join, dirname, relative, extname, basename } from "path";
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

async function gitSync(vault: string, message: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `cd "${vault}" && git add -A && git diff --cached --quiet && echo "nothing to commit" || (git commit -m "${message}" && git push && echo "pushed")`,
      { timeout: 15000 }
    );
    return stdout.trim();
  } catch (err: any) {
    return `git warning: ${err.message}`;
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

/** Parse YAML frontmatter from a note. Returns { frontmatter, body }. */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return { frontmatter: fm, body: match[2] };
}

/** Serialize frontmatter + body back to a string. */
function serializeFrontmatter(frontmatter: Record<string, string>, body: string): string {
  if (Object.keys(frontmatter).length === 0) return body;
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `---\n${fm}\n---\n${body}`;
}

/** Extract all [[wikilinks]] from a string. */
function extractWikilinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g);
  return [...new Set([...matches].map(m => m[1].trim()))];
}

export function registerObsidianTools(server: McpServer) {
  server.tool(
    "obsidian_read",
    "Read a note from the Obsidian vault by path (e.g. 'School/Capstone/Notes.md' or 'Notes').",
    {
      path: z.string().describe("Relative path to the note within the vault"),
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
        const git = await gitSync(vault, `update: ${path}`);
        return { content: [{ type: "text" as const, text: `Written: ${path}\n${git}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_append",
    "Append content to an existing note. Creates the note if it doesn't exist. Auto-commits and pushes to git.",
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
        const git = await gitSync(vault, `append: ${path}`);
        return { content: [{ type: "text" as const, text: `Appended to: ${path}\n${git}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_delete",
    "Delete a note from the Obsidian vault. Auto-commits and pushes to git.",
    {
      path: z.string().describe("Relative path to the note to delete"),
    },
    async ({ path }) => {
      try {
        const vault = vaultPath();
        const full = notePath(vault, path);
        await unlink(full);
        const git = await gitSync(vault, `delete: ${path}`);
        return { content: [{ type: "text" as const, text: `Deleted: ${path}\n${git}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_move",
    "Move or rename a note within the Obsidian vault. Auto-commits and pushes to git.",
    {
      from: z.string().describe("Current relative path of the note"),
      to: z.string().describe("New relative path for the note"),
    },
    async ({ from, to }) => {
      try {
        const vault = vaultPath();
        const src = notePath(vault, from);
        const dst = notePath(vault, to);
        await mkdir(dirname(dst), { recursive: true });
        await rename(src, dst);
        const git = await gitSync(vault, `move: ${from} → ${to}`);
        return { content: [{ type: "text" as const, text: `Moved: ${from} → ${to}\n${git}` }] };
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
    "Search all notes in the Obsidian vault for a text string. Returns matching file paths with surrounding context. Short notes are returned in full.",
    {
      query: z.string().describe("Text to search for (case-insensitive)"),
      context_lines: z.number().default(5).describe("Lines of context to show around each match (default 5)"),
    },
    async ({ query, context_lines }) => {
      try {
        const vault = vaultPath();
        const files = await walkVault(vault, vault);
        const lower = query.toLowerCase();
        const results: string[] = [];
        for (const file of files) {
          const text = await readFile(join(vault, file), "utf-8");
          if (!text.toLowerCase().includes(lower)) continue;
          const lines = text.split("\n");
          if (lines.length <= 20) {
            results.push(`### ${file}\n${text}`);
          } else {
            const excerpts: string[] = [];
            lines.forEach((line, i) => {
              if (line.toLowerCase().includes(lower)) {
                const start = Math.max(0, i - context_lines);
                const end = Math.min(lines.length - 1, i + context_lines);
                excerpts.push(lines.slice(start, end + 1).join("\n"));
              }
            });
            results.push(`### ${file}\n${excerpts.join("\n...\n")}`);
          }
        }
        if (results.length === 0) return { content: [{ type: "text" as const, text: `No results for "${query}".` }] };
        return { content: [{ type: "text" as const, text: results.join("\n\n---\n\n") }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_frontmatter",
    "Read or update the YAML frontmatter of a note (tags, date, status, etc.). Pass updates to merge new keys in.",
    {
      path: z.string().describe("Relative path to the note"),
      updates: z.record(z.string(), z.string()).optional().describe("Key-value pairs to set in frontmatter. Omit to just read."),
    },
    async ({ path, updates }) => {
      try {
        const vault = vaultPath();
        const full = notePath(vault, path);
        const raw = await readFile(full, "utf-8");
        const { frontmatter, body } = parseFrontmatter(raw);
        if (!updates) {
          const out = Object.keys(frontmatter).length === 0
            ? "No frontmatter found."
            : Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join("\n");
          return { content: [{ type: "text" as const, text: out }] };
        }
        const merged = { ...frontmatter, ...updates };
        await writeFile(full, serializeFrontmatter(merged, body), "utf-8");
        const git = await gitSync(vault, `frontmatter: ${path}`);
        return { content: [{ type: "text" as const, text: `Updated frontmatter in ${path}\n${git}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_links",
    "Get all [[wikilinks]] in a note (outgoing), and find all notes that link to it (incoming backlinks).",
    {
      path: z.string().describe("Relative path to the note"),
    },
    async ({ path }) => {
      try {
        const vault = vaultPath();
        const full = notePath(vault, path);
        const content = await readFile(full, "utf-8");
        const outgoing = extractWikilinks(content);

        const noteName = basename(path, ".md");
        const allFiles = await walkVault(vault, vault);
        const incoming: string[] = [];
        for (const file of allFiles) {
          if (file === path || file === `${path}.md`) continue;
          const text = await readFile(join(vault, file), "utf-8");
          const links = extractWikilinks(text);
          if (links.some(l => l.toLowerCase() === noteName.toLowerCase())) {
            incoming.push(file);
          }
        }

        const out = [
          `**Outgoing links (${outgoing.length}):**\n${outgoing.length ? outgoing.map(l => `  [[${l}]]`).join("\n") : "  none"}`,
          `**Incoming backlinks (${incoming.length}):**\n${incoming.length ? incoming.map(l => `  ${l}`).join("\n") : "  none"}`,
        ].join("\n\n");
        return { content: [{ type: "text" as const, text: out }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "obsidian_pull",
    "Pull the latest changes from git so the vault is up to date before reading. Use this when switching devices or after editing notes elsewhere.",
    {},
    async () => {
      try {
        const vault = vaultPath();
        const { stdout } = await execAsync(`cd "${vault}" && git pull`, { timeout: 15000 });
        return { content: [{ type: "text" as const, text: stdout.trim() || "Already up to date." }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
